const Student = require('../models/Student');
const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Progress = require('../models/Progress');
const LecturePublication = require('../models/LecturePublication');
const ApiError = require('../utils/ApiError');
const { getStorage } = require('../integrations/storage');
const settings = require('./settings.service');
const {
  gradeQuiz, presentQuizForStudent, isPublicationAccessible, isPartUnlocked, isVideoCompleted, isLessonComplete, bestAttemptsByQuiz,
} = require('./logic');

async function getStudent(user) {
  const student = await Student.findOne({ user: user._id });
  if (!student) throw ApiError.notFound('Student record not found');
  return student;
}

/**
 * The single gate for every learning request: the publication must belong to the student's batch and be inside
 * its access window. Done on the server; hiding links in React is not access control.
 */
async function loadAccessiblePublication(student, publicationId, now = new Date()) {
  const pub = await LecturePublication.findById(publicationId);
  if (!pub || !student.batch || String(pub.batch) !== String(student.batch)) throw ApiError.notFound('Lecture not found');
  if (!isPublicationAccessible(pub, now)) throw ApiError.forbidden('This lecture is no longer available');
  return pub;
}

/** Any learning activity counts as attendance: it un-pauses the student. */
async function touchStudent(student) {
  student.lastActivityAt = new Date();
  if (student.state === 'paused') {
    student.state = 'active';
    student.pausedAt = undefined;
  }
  await student.save();
}

async function getProgress(student, lesson) {
  let progress = await Progress.findOne({ student: student._id, batch: student.batch, lesson: lesson._id });
  if (!progress) {
    progress = new Progress({
      student: student._id, batch: student.batch, lesson: lesson._id, course: lesson.course, programme: lesson.programme,
      parts: lesson.parts.map((p) => ({ order: p.order })),
    });
  }
  return progress;
}

async function attemptsFor(student, lessonId) {
  return QuizAttempt.find({ student: student._id, batch: student.batch, lesson: lessonId }).lean();
}

/** The student's list of live lectures with progress summaries. */
async function listLectures(user, now = new Date()) {
  const student = await getStudent(user);
  if (!student.batch) return { student, items: [] };
  const pubs = await LecturePublication.find({
    batch: student.batch, status: { $in: ['live', 'scheduled'] }, publishedAt: { $lte: now }, expiresAt: { $gt: now },
  }).populate({ path: 'lesson', select: 'title description parts.order parts.title course module order' }).sort('expiresAt').lean();

  const lessonIds = pubs.map((p) => p.lesson?._id).filter(Boolean);
  const [progress, attempts] = await Promise.all([
    Progress.find({ student: student._id, batch: student.batch, lesson: { $in: lessonIds } }).lean(),
    QuizAttempt.find({ student: student._id, batch: student.batch, lesson: { $in: lessonIds } }).lean(),
  ]);
  const items = pubs.filter((p) => p.lesson).map((p) => {
    const prog = progress.find((x) => String(x.lesson) === String(p.lesson._id));
    return {
      publicationId: p._id,
      lessonId: p.lesson._id,
      title: p.lesson.title,
      description: p.lesson.description,
      partCount: p.lesson.parts.length,
      publishedAt: p.publishedAt,
      expiresAt: p.expiresAt,
      completed: Boolean(prog?.lessonCompleted),
      completedVideos: (prog?.parts || []).filter((x) => x.videoCompleted).length,
      quizzesAttempted: new Set(attempts.filter((a) => String(a.lesson) === String(p.lesson._id)).map((a) => a.quiz.toString())).size,
    };
  });
  return { student, items };
}

/** Lecture detail: parts with lock state and attempts, never URLs and never answers. */
async function getLecture(user, publicationId, now = new Date()) {
  const student = await getStudent(user);
  const pub = await loadAccessiblePublication(student, publicationId, now);
  const lesson = await Lesson.findById(pub.lesson).lean();
  const quizzes = await Quiz.find({ lesson: lesson._id }).select('partOrder title passMark maxAttempts isFinal questions._id').lean();
  const progress = await getProgress(student, lesson);
  const attempts = await attemptsFor(student, lesson._id);
  const attemptedOrders = [...new Set(attempts.map((a) => quizzes.find((q) => String(q._id) === String(a.quiz))?.partOrder).filter(Boolean))];

  return {
    publicationId: pub._id,
    lesson: { id: lesson._id, title: lesson.title, description: lesson.description },
    expiresAt: pub.expiresAt,
    lastPartOrder: progress.lastPartOrder,
    lessonCompleted: progress.lessonCompleted,
    parts: lesson.parts.map((part) => {
      const quiz = quizzes.find((q) => q.partOrder === part.order);
      const prog = progress.parts.find((x) => x.order === part.order);
      const quizAttempts = quiz ? attempts.filter((a) => String(a.quiz) === String(quiz._id)) : [];
      const best = bestAttemptsByQuiz(quizAttempts)[0];
      return {
        order: part.order,
        title: part.title,
        duration: part.video?.duration || null,
        unlocked: isPartUnlocked(part.order, attemptedOrders),
        positionSeconds: prog?.positionSeconds || 0,
        videoCompleted: Boolean(prog?.videoCompleted),
        quiz: quiz ? {
          id: quiz._id, title: quiz.title, questionCount: quiz.questions.length, passMark: quiz.passMark, isFinal: quiz.isFinal,
          attemptsUsed: quizAttempts.length, maxAttempts: quiz.maxAttempts,
          bestPercentage: best ? best.percentage : null, passed: best ? best.passed : null,
        } : null,
      };
    }),
  };
}

async function getPlayback(user, publicationId, partOrder, now = new Date()) {
  const student = await getStudent(user);
  const pub = await loadAccessiblePublication(student, publicationId, now);
  const lesson = await Lesson.findById(pub.lesson).lean();
  const part = lesson.parts.find((p) => p.order === Number(partOrder));
  if (!part?.video?.publicId || part.video.deletionStatus === 'deleted') throw ApiError.notFound('This video is not available');

  const quizzes = await Quiz.find({ lesson: lesson._id }).select('partOrder').lean();
  const attempts = await attemptsFor(student, lesson._id);
  const attemptedOrders = attempts.map((a) => quizzes.find((q) => String(q._id) === String(a.quiz))?.partOrder).filter(Boolean);
  if (!isPartUnlocked(part.order, attemptedOrders)) throw ApiError.forbidden('Complete the previous quiz to unlock this video');

  const progress = await getProgress(student, lesson);
  return {
    url: getStorage().signedPlaybackUrl({ publicId: part.video.publicId, format: part.video.format || 'mp4' }),
    positionSeconds: progress.parts.find((x) => x.order === part.order)?.positionSeconds || 0,
    duration: part.video.duration || null,
  };
}

async function getQuizForStudent(user, publicationId, partOrder, now = new Date()) {
  const student = await getStudent(user);
  const pub = await loadAccessiblePublication(student, publicationId, now);
  const quiz = await Quiz.findOne({ lesson: pub.lesson, partOrder: Number(partOrder) }).lean();
  if (!quiz) throw ApiError.notFound('Quiz not found');
  return presentQuizForStudent(quiz);
}

/** Grade on the server, enforce attempt limits (only while the lecture is live), and save every attempt. */
async function submitQuiz(user, publicationId, partOrder, answers, now = new Date()) {
  const student = await getStudent(user);
  const pub = await loadAccessiblePublication(student, publicationId, now);
  const quiz = await Quiz.findOne({ lesson: pub.lesson, partOrder: Number(partOrder) }).lean();
  if (!quiz) throw ApiError.notFound('Quiz not found');
  if (!Array.isArray(answers) || answers.length > quiz.questions.length) throw ApiError.badRequest('Invalid answers');

  const lesson = await Lesson.findById(pub.lesson).lean();
  const previous = await QuizAttempt.countDocuments({ student: student._id, quiz: quiz._id, batch: student.batch });
  if (previous >= quiz.maxAttempts) throw ApiError.forbidden('You have used all attempts for this quiz');

  const result = gradeQuiz(quiz.questions, answers, quiz.passMark);
  const attempt = await QuizAttempt.create({
    student: student._id, quiz: quiz._id, lesson: lesson._id, course: lesson.course, batch: student.batch,
    attemptNumber: previous + 1, answers, ...result, submittedAt: now,
  });

  await touchStudent(student);
  await refreshLessonCompletion(student, lesson);
  return { ...result, attemptNumber: attempt.attemptNumber, attemptsRemaining: quiz.maxAttempts - attempt.attemptNumber, passMark: quiz.passMark };
}

async function refreshLessonCompletion(student, lesson) {
  const progress = await getProgress(student, lesson);
  const quizzes = await Quiz.find({ lesson: lesson._id }).select('partOrder').lean();
  const attempts = await attemptsFor(student, lesson._id);
  const attemptedOrders = [...new Set(attempts.map((a) => quizzes.find((q) => String(q._id) === String(a.quiz))?.partOrder).filter(Boolean))];
  const watched = progress.parts.filter((p) => p.videoCompleted).map((p) => p.order);
  const complete = isLessonComplete(lesson.parts.length, watched, attemptedOrders);
  if (complete && !progress.lessonCompleted) progress.completedAt = new Date();
  progress.lessonCompleted = complete;
  await progress.save();
  return progress;
}

/** Save playback position (called about every 15 seconds). The video only counts as done near the end. */
async function saveProgress(user, { publicationId, partOrder, positionSeconds, ended }, now = new Date()) {
  const student = await getStudent(user);
  const pub = await loadAccessiblePublication(student, publicationId, now);
  const lesson = await Lesson.findById(pub.lesson).lean();
  const part = lesson.parts.find((p) => p.order === Number(partOrder));
  if (!part) throw ApiError.notFound('Part not found');

  const progress = await getProgress(student, lesson);
  let entry = progress.parts.find((p) => p.order === part.order);
  if (!entry) { progress.parts.push({ order: part.order }); entry = progress.parts[progress.parts.length - 1]; }

  const position = Math.max(0, Number(positionSeconds) || 0);
  const cap = part.video?.duration ? part.video.duration + 5 : position;
  entry.positionSeconds = Math.min(position, cap);
  entry.lastWatchedAt = now;
  const threshold = await settings.get('video.completionThreshold');
  if (!entry.videoCompleted && ended && isVideoCompleted(entry.positionSeconds, part.video?.duration, threshold)) {
    entry.videoCompleted = true;
  }
  progress.lastPartOrder = part.order;
  progress.lastWatchedAt = now;
  await progress.save();

  await touchStudent(student);
  if (entry.videoCompleted) await refreshLessonCompletion(student, lesson);
  return { positionSeconds: entry.positionSeconds, videoCompleted: entry.videoCompleted };
}

/** "Continue Learning": most recently watched live lecture, else the first unfinished live lecture. */
async function continueLearning(user, now = new Date()) {
  const { student, items } = await listLectures(user, now);
  if (!items.length) return null;
  const progress = await Progress.find({ student: student._id, batch: student.batch, lesson: { $in: items.map((i) => i.lessonId) } }).sort('-lastWatchedAt').lean();
  const recent = progress.find((p) => !p.lessonCompleted && p.lastWatchedAt);
  const target = recent ? items.find((i) => String(i.lessonId) === String(recent.lesson)) : items.find((i) => !i.completed) || items[0];
  if (!target) return null;
  const prog = recent && String(recent.lesson) === String(target.lessonId) ? recent : null;
  const order = prog?.lastPartOrder || 1;
  return {
    publicationId: target.publicationId, lessonId: target.lessonId, title: target.title, partOrder: order,
    positionSeconds: prog?.parts?.find((p) => p.order === order)?.positionSeconds || 0, expiresAt: target.expiresAt,
  };
}

async function dashboard(user, now = new Date()) {
  const student = await Student.findOne({ user: user._id }).populate('programme', 'name').populate('batch', 'name').lean();
  if (!student) throw ApiError.notFound('Student record not found');
  const [{ items }, attempts, completedCount] = await Promise.all([
    listLectures(user, now),
    QuizAttempt.find({ student: student._id }).sort('-submittedAt').limit(1).populate('lesson', 'title').lean(),
    Progress.countDocuments({ student: student._id, batch: student.batch, lessonCompleted: true }),
  ]);
  const available = items.length;
  return {
    name: student.fullName, studentNumber: student.studentNumber, programme: student.programme?.name || null,
    batch: student.batch?.name || null, studyMode: student.studyMode, state: student.state,
    overallProgress: { completedLessons: completedCount, liveLessons: available },
    latestScore: attempts[0] ? { lesson: attempts[0].lesson?.title, percentage: attempts[0].percentage, passed: attempts[0].passed, at: attempts[0].submittedAt } : null,
    continue: await continueLearning(user, now),
  };
}

/** Results: official score per quiz is the highest attempt; every attempt is also listed. */
async function results(user) {
  const student = await getStudent(user);
  const attempts = await QuizAttempt.find({ student: student._id }).populate('lesson', 'title').populate('quiz', 'title partOrder').sort('-submittedAt').lean();
  const official = bestAttemptsByQuiz(attempts).map((a) => ({
    lesson: a.lesson?.title, quiz: a.quiz?.title, percentage: a.percentage, passed: a.passed, score: a.score, total: a.total,
  }));
  return { official, attempts: attempts.map((a) => ({ lesson: a.lesson?.title, quiz: a.quiz?.title, attemptNumber: a.attemptNumber, percentage: a.percentage, passed: a.passed, submittedAt: a.submittedAt })) };
}

module.exports = { listLectures, getLecture, getPlayback, getQuizForStudent, submitQuiz, saveProgress, continueLearning, dashboard, results };
