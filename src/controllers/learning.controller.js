const learning = require('../services/learning.service');
const Certificate = require('../models/Certificate');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { ok } = require('../utils/respond');

const dashboard = async (req, res) => ok(res, await learning.dashboard(req.user));
const lectures = async (req, res) => ok(res, (await learning.listLectures(req.user)).items);
const lecture = async (req, res) => ok(res, await learning.getLecture(req.user, req.params.publicationId));
const playback = async (req, res) => ok(res, await learning.getPlayback(req.user, req.params.publicationId, req.params.order));
const quiz = async (req, res) => ok(res, await learning.getQuizForStudent(req.user, req.params.publicationId, req.params.order));
const submitQuiz = async (req, res) => ok(res, await learning.submitQuiz(req.user, req.params.publicationId, req.params.order, req.body.answers), 'Quiz submitted');
const saveProgress = async (req, res) => ok(res, await learning.saveProgress(req.user, req.body));
const continueLearning = async (req, res) => ok(res, await learning.continueLearning(req.user));
const results = async (req, res) => ok(res, await learning.results(req.user));

async function myCertificates(req, res) {
  const student = await Student.findOne({ user: req.user._id }).select('_id').lean();
  ok(res, await Certificate.find({ student: student._id }).populate('programme', 'name').sort('-issuedAt').lean());
}

async function myAttendance(req, res) {
  const student = await Student.findOne({ user: req.user._id }).select('_id').lean();
  const rows = await Attendance.find({ student: student._id }).sort('-date').limit(300).lean();
  const present = rows.filter((r) => r.status === 'present').length;
  ok(res, { rows, summary: { total: rows.length, present, percentage: rows.length ? Math.round((present / rows.length) * 100) : null } });
}

module.exports = { dashboard, lectures, lecture, playback, quiz, submitQuiz, saveProgress, continueLearning, results, myCertificates, myAttendance };
