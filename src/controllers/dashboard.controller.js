const Application = require('../models/Application');
const Student = require('../models/Student');
const LecturePublication = require('../models/LecturePublication');
const SupportQuestion = require('../models/SupportQuestion');
const NgoPost = require('../models/NgoPost');
const AudioEpisode = require('../models/AudioEpisode');
const ActivityLog = require('../models/ActivityLog');
const Progress = require('../models/Progress');
const QuizAttempt = require('../models/QuizAttempt');
const Batch = require('../models/Batch');
const settings = require('../services/settings.service');
const { getStorage } = require('../integrations/storage');
const { hasPermission } = require('../utils/permissions');
const { PERMISSIONS } = require('../constants/roles');
const { addDays } = require('../utils/dates');
const { ok } = require('../utils/respond');
const { toCsv } = require('../utils/csv');
const ApiError = require('../utils/ApiError');

// Every number comes from real data. Sections the staff member cannot use are left out.
async function dashboard(req, res) {
  const now = new Date();
  const can = (p) => hasPermission(req.user, p);
  const warnDays = await settings.get('expiry.warningDays');
  const horizon = addDays(now, warnDays);
  const data = {};

  if (can(PERMISSIONS.APPLICATIONS_READ)) data.pendingApplications = await Application.countDocuments({ status: 'pending' });
  if (can(PERMISSIONS.STUDENTS_READ)) {
    const [total, paused, needsBatch] = await Promise.all([Student.countDocuments(), Student.countDocuments({ state: 'paused' }), Student.countDocuments({ needsBatch: true })]);
    data.students = { total, paused, needsBatch };
  }
  if (can(PERMISSIONS.LECTURES_WRITE)) {
    const [live, expiring] = await Promise.all([
      LecturePublication.countDocuments({ status: 'live', expiresAt: { $gt: now } }),
      LecturePublication.countDocuments({ status: 'live', expiresAt: { $gt: now, $lte: horizon } }),
    ]);
    data.lectures = { live, expiringSoon: expiring };
  }
  if (can(PERMISSIONS.CONTENT_NGO) || can(PERMISSIONS.CONTENT_RADIO)) {
    const soon = { status: 'published', pinned: false, expiresAt: { $gt: now, $lte: horizon } };
    data.content = { ngoExpiringSoon: await NgoPost.countDocuments(soon), radioExpiringSoon: await AudioEpisode.countDocuments(soon) };
  }
  if (can(PERMISSIONS.SUPPORT_READ)) data.openQuestions = await SupportQuestion.countDocuments({ status: { $in: ['open'] } });
  if (can(PERMISSIONS.RECORDS_READ_ALL)) {
    const batches = await Batch.find({ status: { $in: ['open', 'running'] } }).select('name').lean();
    data.batchProgress = await Promise.all(batches.map(async (b) => {
      const [members, completed] = await Promise.all([Student.countDocuments({ batch: b._id }), Progress.countDocuments({ batch: b._id, lessonCompleted: true })]);
      return { batch: b.name, students: members, lessonsCompleted: completed };
    }));
  }
  if (can(PERMISSIONS.LOGS_VIEW)) data.recentActivity = await ActivityLog.find().sort('-createdAt').limit(10).lean();
  ok(res, data);
}

async function storageUsage(_req, res) {
  try { ok(res, await getStorage().usage()); } catch (_error) { ok(res, { error: 'Could not read storage usage' }); }
}

// Results by batch (staff with full records access) - JSON or CSV.
async function batchResults(req, res) {
  const batch = await Batch.findById(req.params.batchId).lean();
  if (!batch) throw ApiError.notFound('Batch not found');
  const students = await Student.find({ batch: batch._id }).select('fullName studentNumber').lean();
  const [attempts, progress] = await Promise.all([
    QuizAttempt.find({ batch: batch._id }).lean(), Progress.find({ batch: batch._id }).lean(),
  ]);
  const { bestAttemptsByQuiz } = require('../services/logic');
  const rows = students.map((s) => {
    const mine = attempts.filter((a) => String(a.student) === String(s._id));
    const best = bestAttemptsByQuiz(mine);
    const avg = best.length ? Math.round((best.reduce((t, a) => t + a.percentage, 0) / best.length) * 10) / 10 : null;
    return {
      studentNumber: s.studentNumber, fullName: s.fullName,
      lessonsCompleted: progress.filter((p) => String(p.student) === String(s._id) && p.lessonCompleted).length,
      quizzesAttempted: best.length, averageScore: avg, quizzesPassed: best.filter((a) => a.passed).length,
    };
  });
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="batch-results.csv"`);
    return res.send(toCsv(['studentNumber', 'fullName', 'lessonsCompleted', 'quizzesAttempted', 'averageScore', 'quizzesPassed'].map((key) => ({ key, label: key })), rows));
  }
  return ok(res, { batch: batch.name, rows });
}

// Results per course. Lecturers see only their own courses and only name, number and scores
// (no contact details); staff with full records access can see every course.
async function courseResults(req, res) {
  const Course = require('../models/Course');
  const { bestAttemptsByQuiz } = require('../services/logic');
  const all = hasPermission(req.user, PERMISSIONS.RECORDS_READ_ALL);
  const courses = await Course.find(all ? {} : { lecturers: req.user._id }).select('name programme').populate('programme', 'name').sort('name').lean();
  if (!req.query.course) return ok(res, { courses });

  if (!courses.some((c) => String(c._id) === String(req.query.course))) throw ApiError.forbidden('You do not teach this course');
  const attempts = await QuizAttempt.find({ course: req.query.course }).lean();
  const students = await Student.find({ _id: { $in: [...new Set(attempts.map((a) => String(a.student)))] } }).select('fullName studentNumber').lean();
  const rows = students.map((s) => {
    const best = bestAttemptsByQuiz(attempts.filter((a) => String(a.student) === String(s._id)));
    return {
      studentNumber: s.studentNumber, fullName: s.fullName, quizzesAttempted: best.length, quizzesPassed: best.filter((a) => a.passed).length,
      averageScore: best.length ? Math.round((best.reduce((t, a) => t + a.percentage, 0) / best.length) * 10) / 10 : null,
    };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName));
  return ok(res, { courses, rows });
}

module.exports = { dashboard, storageUsage, batchResults, courseResults };
