const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Student = require('../models/Student');
const User = require('../models/User');
const Batch = require('../models/Batch');
const LecturePublication = require('../models/LecturePublication');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants/roles');
const { getStorage, FOLDERS } = require('../integrations/storage');
const { computePublicationWindow } = require('./logic');
const { sendEmail } = require('./email.service');
const settings = require('./settings.service');
const { env } = require('../config/env');

/** Lecturers may only touch lessons in courses they are assigned to. Admins are unrestricted. */
async function assertCanEditCourse(user, courseId) {
  if (user.role !== ROLES.LECTURER) return;
  const course = await Course.findById(courseId).select('lecturers').lean();
  if (!course || !(course.lecturers || []).some((id) => String(id) === String(user._id))) {
    throw ApiError.forbidden('You are not assigned to this course');
  }
}

async function createLesson(user, { module: moduleId, title, description, order, partCount = 3 }) {
  const moduleDoc = await Module.findById(moduleId).lean();
  if (!moduleDoc) throw ApiError.badRequest('Module not found');
  const course = await Course.findById(moduleDoc.course).lean();
  await assertCanEditCourse(user, course._id);
  const count = Math.min(6, Math.max(1, Number(partCount) || 3));
  const lesson = await Lesson.create({
    programme: course.programme, course: course._id, module: moduleDoc._id, title, description, order,
    parts: Array.from({ length: count }, (_v, i) => ({ order: i + 1, title: `Video ${i + 1}` })),
    createdBy: user._id,
  });
  return lesson;
}

async function hasActivePublication(lessonId) {
  return LecturePublication.exists({ lesson: lessonId, status: { $in: ['scheduled', 'live'] } });
}

/** Register a video the admin app uploaded directly to storage. */
async function attachVideo(user, lessonId, order, asset) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertCanEditCourse(user, lesson.course);
  const part = lesson.parts.find((p) => p.order === Number(order));
  if (!part) throw ApiError.notFound('Part not found');
  if (await hasActivePublication(lesson._id)) {
    throw ApiError.conflict('This lesson is published. Withdraw it before replacing a video.');
  }
  if (!String(asset.publicId || '').startsWith(`${FOLDERS.lectureVideo}/`)) {
    throw ApiError.badRequest('Unexpected upload location');
  }
  const previous = part.video;
  part.video = {
    provider: getStorage().name, publicId: asset.publicId, secureUrl: asset.secureUrl, resourceType: 'video',
    format: asset.format, bytes: asset.bytes, duration: asset.duration, uploadedAt: new Date(), deletionStatus: 'none',
  };
  await lesson.save();
  // Replacing a video: remove the superseded file (best effort; the expiry sweep never sees it otherwise).
  if (previous?.publicId && previous.deletionStatus !== 'deleted' && previous.publicId !== asset.publicId) {
    getStorage().deleteAsset({ publicId: previous.publicId, resourceType: 'video', deliveryType: 'authenticated' }).catch(() => {});
  }
  return lesson;
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) throw ApiError.unprocessable('Add at least one question');
  questions.forEach((q, i) => {
    if (!q.prompt || !String(q.prompt).trim()) throw ApiError.unprocessable(`Question ${i + 1} needs text`);
    if (!Array.isArray(q.options) || q.options.length < 2) throw ApiError.unprocessable(`Question ${i + 1} needs at least two options`);
    if (q.options.some((o) => !String(o).trim())) throw ApiError.unprocessable(`Question ${i + 1} has an empty option`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      throw ApiError.unprocessable(`Question ${i + 1} needs a correct answer`);
    }
  });
}

async function saveQuiz(user, lessonId, order, data) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertCanEditCourse(user, lesson.course);
  const part = lesson.parts.find((p) => p.order === Number(order));
  if (!part) throw ApiError.notFound('Part not found');
  validateQuestions(data.questions);

  const defaults = await settings.getMany(['quiz.defaultPassMark', 'quiz.defaultMaxAttempts']);
  const lastOrder = Math.max(...lesson.parts.map((p) => p.order));
  const quiz = await Quiz.findOneAndUpdate(
    { lesson: lesson._id, partOrder: part.order },
    {
      lesson: lesson._id, partOrder: part.order, title: data.title || `Quiz ${part.order}`, isFinal: part.order === lastOrder,
      passMark: data.passMark ?? defaults['quiz.defaultPassMark'], maxAttempts: data.maxAttempts ?? defaults['quiz.defaultMaxAttempts'],
      questions: data.questions.map((q) => ({ prompt: q.prompt, options: q.options, correctIndex: q.correctIndex })),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  part.quiz = quiz._id;
  await lesson.save();
  return quiz;
}

/** What is missing before a lesson can be published. */
function publishProblems(lesson) {
  const problems = [];
  lesson.parts.forEach((p) => {
    if (!p.video?.publicId || p.video.deletionStatus === 'deleted') problems.push(`Video ${p.order} has not been uploaded`);
    if (!p.quiz) problems.push(`Quiz ${p.order} has not been created`);
  });
  return problems;
}

async function publish(user, lessonId, { batchIds, publishAt, accessDays }) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const problems = publishProblems(lesson);
  if (problems.length) throw ApiError.unprocessable('This lesson is not ready to publish', problems.map((message) => ({ field: 'lesson', message })));
  if (!Array.isArray(batchIds) || batchIds.length === 0) throw ApiError.unprocessable('Choose at least one batch');

  const batches = await Batch.find({ _id: { $in: batchIds } }).lean();
  if (batches.length !== new Set(batchIds.map(String)).size) throw ApiError.badRequest('One or more batches were not found');
  if (batches.some((b) => String(b.programme) !== String(lesson.programme))) {
    throw ApiError.badRequest('Every batch must belong to this lesson\'s programme');
  }

  const days = accessDays ?? (await settings.get('expiry.lectureAccessDays'));
  const created = [];
  for (const batch of batches) {
    if (await LecturePublication.exists({ lesson: lesson._id, batch: batch._id, status: { $in: ['scheduled', 'live'] } })) continue;
    const win = computePublicationWindow({ publishAt, accessDays: days });
    const pub = await LecturePublication.create({ lesson: lesson._id, batch: batch._id, ...win, publishedBy: user._id });
    created.push(pub);
    if (win.status === 'live') notifyBatch(pub, lesson).catch((e) => console.error('Lecture notification failed:', e.message));
  }
  return created;
}

/** Email the batch when a lecture goes live. Runs in the background; failures are logged, not fatal. */
async function notifyBatch(publication, lesson) {
  const students = await Student.find({ batch: publication.batch }).select('user fullName').lean();
  const users = await User.find({ _id: { $in: students.map((s) => s.user) }, status: 'active' }).select('email name').lean();
  const url = `${env.clientUrl}/student/courses`;
  for (const u of users) {
    await sendEmail({
      to: u.email, template: 'lecture_published',
      data: { name: u.name, lesson: lesson.title, expiresAt: publication.expiresAt.toDateString(), url, buttonLabel: 'Open my lessons' },
    });
  }
  await LecturePublication.updateOne({ _id: publication._id }, { notifiedAt: new Date() });
}

async function extend(publicationId, expiresAt) {
  const pub = await LecturePublication.findById(publicationId);
  if (!pub) throw ApiError.notFound('Publication not found');
  if (!['live', 'scheduled'].includes(pub.status)) throw ApiError.conflict('Expired or withdrawn lectures cannot be extended');
  const next = new Date(expiresAt);
  if (Number.isNaN(next.getTime()) || next <= pub.publishedAt) throw ApiError.badRequest('Choose an expiry date after the publish date');
  pub.expiresAt = next;
  pub.warningSentAt = undefined;
  await pub.save();
  return pub;
}

async function withdraw(publicationId) {
  const pub = await LecturePublication.findById(publicationId);
  if (!pub) throw ApiError.notFound('Publication not found');
  if (!['live', 'scheduled'].includes(pub.status)) throw ApiError.conflict('This lecture is already closed');
  pub.status = 'withdrawn';
  await pub.save();
  return pub;
}

module.exports = {
  assertCanEditCourse, createLesson, attachVideo, saveQuiz, publish, extend, withdraw, publishProblems, validateQuestions,
};
