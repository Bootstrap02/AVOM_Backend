const SupportQuestion = require('../models/SupportQuestion');
const Student = require('../models/Student');
const Lesson = require('../models/Lesson');
const Course = require('../models/Course');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated, parsePage, pageMeta } = require('../utils/respond');
const { sendEmail } = require('../services/email.service');
const { ROLES } = require('../constants/roles');
const wa = require('../integrations/whatsapp');
const { env } = require('../config/env');

// ---- Student ----
async function create(req, res) {
  const student = await Student.findOne({ user: req.user._id });
  let course;
  if (req.body.lesson) course = (await Lesson.findById(req.body.lesson).select('course').lean())?.course;
  const q = await SupportQuestion.create({
    student: student._id, subject: req.body.subject, lesson: req.body.lesson || undefined, course,
    messages: [{ from: 'student', author: req.user._id, body: req.body.message }],
  });
  created(res, q, 'Your question has been sent. We will reply by email and here.');
}

async function mine(req, res) {
  const student = await Student.findOne({ user: req.user._id }).select('_id').lean();
  ok(res, await SupportQuestion.find({ student: student._id }).sort('-updatedAt').lean());
}

async function mineOne(req, res) {
  const student = await Student.findOne({ user: req.user._id }).select('_id').lean();
  const q = await SupportQuestion.findOne({ _id: req.params.id, student: student._id }).populate('messages.author', 'name').lean();
  if (!q) throw ApiError.notFound('Question not found');
  ok(res, q);
}

async function studentReply(req, res) {
  const student = await Student.findOne({ user: req.user._id }).select('_id').lean();
  const q = await SupportQuestion.findOne({ _id: req.params.id, student: student._id });
  if (!q) throw ApiError.notFound('Question not found');
  q.messages.push({ from: 'student', author: req.user._id, body: req.body.message });
  q.status = 'open';
  await q.save();
  ok(res, q, 'Sent');
}

// ---- Staff ----
async function scope(user) {
  if (user.role !== ROLES.LECTURER) return {};
  const mineCourses = await Course.find({ lecturers: user._id }).select('_id').lean(); // lecturers see only their own courses' questions
  return { course: { $in: mineCourses.map((c) => c._id) } };
}

async function staffList(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const filter = await scope(req.user);
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    SupportQuestion.find(filter).populate('student', 'fullName studentNumber').sort('-updatedAt').skip(skip).limit(limit).lean(),
    SupportQuestion.countDocuments(filter),
  ]);
  paginated(res, items.map((q) => ({ ...q, messages: undefined, lastMessage: q.messages[q.messages.length - 1] })), pageMeta(page, limit, total));
}

async function staffOne(req, res) {
  const q = await SupportQuestion.findOne({ _id: req.params.id, ...(await scope(req.user)) })
    .populate('student', 'fullName studentNumber phone programme batch').populate('lesson', 'title').populate('messages.author', 'name').lean();
  if (!q) throw ApiError.notFound('Question not found');
  ok(res, q);
}

async function staffReply(req, res) {
  const q = await SupportQuestion.findOne({ _id: req.params.id, ...(await scope(req.user)) });
  if (!q) throw ApiError.notFound('Question not found');
  q.messages.push({ from: 'staff', author: req.user._id, body: req.body.message });
  q.status = 'answered';
  await q.save();

  // WhatsApp conversations are answered on WhatsApp; portal questions by email.
  let delivery = { ok: true, channel: q.channel };
  if (q.channel === 'whatsapp') {
    const sent = await wa.sendText(q.contact, req.body.message);
    delivery = { ...sent, channel: 'whatsapp' };
  } else {
    const student = await Student.findById(q.student).select('user fullName').lean();
    const user = student && (await User.findById(student.user).select('email name').lean());
    if (user) {
      await sendEmail({ to: user.email, template: 'support_reply', data: { name: user.name, subject: q.subject, reply: req.body.message, url: `${env.clientUrl}/student/ask`, buttonLabel: 'View reply' } });
    }
  }
  ok(res, { question: q, delivery }, 'Reply saved');
}

async function resolve(req, res) {
  const q = await SupportQuestion.findOneAndUpdate({ _id: req.params.id, ...(await scope(req.user)) }, { status: 'resolved' }, { new: true });
  if (!q) throw ApiError.notFound('Question not found');
  ok(res, q, 'Marked resolved');
}

module.exports = { create, mine, mineOne, studentReply, staffList, staffOne, staffReply, resolve };
