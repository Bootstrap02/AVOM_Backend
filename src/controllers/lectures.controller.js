const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const LecturePublication = require('../models/LecturePublication');
const Progress = require('../models/Progress');
const service = require('../services/lectures.service');
const { getStorage, FOLDERS } = require('../integrations/storage');
const { hasPermission } = require('../utils/permissions');
const { PERMISSIONS, ROLES } = require('../constants/roles');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const { logActivity, fromRequest } = require('../services/audit.service');

const UPLOAD_KINDS = {
  'lecture-video': { folder: FOLDERS.lectureVideo, resourceType: 'video', deliveryType: 'authenticated', permission: PERMISSIONS.LECTURES_WRITE },
  'ngo-image': { folder: FOLDERS.ngoImage, resourceType: 'image', deliveryType: 'upload', permission: PERMISSIONS.CONTENT_NGO },
  'radio-audio': { folder: FOLDERS.radioAudio, resourceType: 'video', deliveryType: 'upload', permission: PERMISSIONS.CONTENT_RADIO },
  'radio-cover': { folder: FOLDERS.radioCover, resourceType: 'image', deliveryType: 'upload', permission: PERMISSIONS.CONTENT_RADIO },
};

// Direct-upload signature: the admin app uploads straight to storage, the file never passes through Express.
async function uploadSignature(req, res) {
  const kind = UPLOAD_KINDS[req.body.kind];
  if (!kind) throw ApiError.badRequest('Unknown upload type');
  if (!hasPermission(req.user, kind.permission)) throw ApiError.forbidden();
  ok(res, getStorage().getUploadParams(kind));
}

async function scopedLessonFilter(user, query) {
  const filter = {};
  ['course', 'module', 'programme'].forEach((k) => { if (query[k]) filter[k] = query[k]; });
  if (user.role === ROLES.LECTURER) {
    const mine = await Course.find({ lecturers: user._id }).select('_id').lean();
    filter.course = { $in: mine.map((c) => c._id) };
  }
  return filter;
}

async function list(req, res) {
  const lessons = await Lesson.find(await scopedLessonFilter(req.user, req.query)).sort('order title').lean();
  const pubs = await LecturePublication.find({ lesson: { $in: lessons.map((l) => l._id) }, status: { $in: ['scheduled', 'live'] } }).lean();
  ok(res, lessons.map((l) => ({
    ...l,
    ready: service.publishProblems(l).length === 0,
    activePublications: pubs.filter((p) => String(p.lesson) === String(l._id)).length,
  })));
}

async function getOne(req, res) {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await service.assertCanEditCourse(req.user, lesson.course);
  const [quizzes, publications] = await Promise.all([
    Quiz.find({ lesson: lesson._id }).sort('partOrder').lean(), // staff view includes the answer key
    LecturePublication.find({ lesson: lesson._id }).populate('batch', 'name').sort('-publishedAt').lean(),
  ]);
  ok(res, { lesson, quizzes, publications, problems: service.publishProblems(lesson) });
}

async function create(req, res) {
  const lesson = await service.createLesson(req.user, req.body);
  await logActivity({ ...fromRequest(req), action: 'lesson.created', entityType: 'Lesson', entityId: lesson._id, summary: `Created lesson "${lesson.title}"` });
  created(res, lesson);
}

async function update(req, res) {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await service.assertCanEditCourse(req.user, lesson.course);
  ['title', 'description', 'order'].forEach((f) => { if (req.body[f] !== undefined) lesson[f] = req.body[f]; });
  await lesson.save();
  ok(res, lesson);
}

async function remove(req, res) {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await service.assertCanEditCourse(req.user, lesson.course);
  if ((await LecturePublication.exists({ lesson: lesson._id })) || (await Progress.exists({ lesson: lesson._id }))) {
    throw ApiError.conflict('This lesson has been published or studied, so it cannot be deleted. Its records are kept.');
  }
  await Quiz.deleteMany({ lesson: lesson._id });
  await lesson.deleteOne();
  ok(res, null, 'Lesson deleted');
}

async function attachVideo(req, res) {
  const lesson = await service.attachVideo(req.user, req.params.id, req.params.order, req.body);
  ok(res, lesson, 'Video saved');
}

async function saveQuiz(req, res) {
  const quiz = await service.saveQuiz(req.user, req.params.id, req.params.order, req.body);
  ok(res, quiz, 'Quiz saved');
}

async function preview(req, res) {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await service.assertCanEditCourse(req.user, lesson.course);
  const part = lesson.parts.find((p) => p.order === Number(req.params.order));
  if (!part?.video?.publicId || part.video.deletionStatus === 'deleted') throw ApiError.notFound('No video uploaded for this part');
  ok(res, { url: getStorage().signedPlaybackUrl({ publicId: part.video.publicId, format: part.video.format || 'mp4' }) });
}

async function publish(req, res) {
  const pubs = await service.publish(req.user, req.params.id, req.body);
  await logActivity({ ...fromRequest(req), action: 'lecture.published', entityType: 'Lesson', entityId: req.params.id, summary: `Published lesson to ${pubs.length} batch(es)`, meta: { batches: req.body.batchIds } });
  created(res, pubs, pubs.length ? 'Lesson published. The access clock has started.' : 'Already published to those batches');
}

async function listPublications(req, res) {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.batch) filter.batch = req.query.batch;
  if (req.query.expiringInDays) filter.expiresAt = { $lte: new Date(Date.now() + Number(req.query.expiringInDays) * 86400000), $gt: new Date() };
  ok(res, await LecturePublication.find(filter).populate('lesson', 'title').populate('batch', 'name').sort('expiresAt').limit(300).lean());
}

async function extendPublication(req, res) {
  const pub = await service.extend(req.params.id, req.body.expiresAt);
  await logActivity({ ...fromRequest(req), action: 'lecture.extended', entityType: 'LecturePublication', entityId: pub._id, summary: 'Changed lecture expiry' });
  ok(res, pub);
}

async function withdrawPublication(req, res) {
  const pub = await service.withdraw(req.params.id);
  await logActivity({ ...fromRequest(req), action: 'lecture.withdrawn', entityType: 'LecturePublication', entityId: pub._id, summary: 'Withdrew a lecture' });
  ok(res, pub, 'Lecture withdrawn');
}

module.exports = { uploadSignature, list, getOne, create, update, remove, attachVideo, saveQuiz, preview, publish, listPublications, extendPublication, withdrawPublication };
