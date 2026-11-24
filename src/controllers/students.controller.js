const Student = require('../models/Student');
const User = require('../models/User');
const Progress = require('../models/Progress');
const QuizAttempt = require('../models/QuizAttempt');
const Certificate = require('../models/Certificate');
const Attendance = require('../models/Attendance');
const service = require('../services/students.service');
const auth = require('../services/auth.service');
const records = require('../services/records.service');
const { logActivity, fromRequest } = require('../services/audit.service');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated, parsePage, pageMeta } = require('../utils/respond');
const { toCsv } = require('../utils/csv');

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROFILE_FIELDS = [
  'fullName', 'gender', 'phone', 'country', 'city', 'church', 'denomination', 'pastorName', 'pastorContact',
  'ministryInvolvement', 'education', 'notes', 'studyMode',
];

function buildFilter(query) {
  const filter = {};
  ['programme', 'batch', 'studyMode', 'state'].forEach((k) => { if (query[k]) filter[k] = query[k]; });
  if (query.needsBatch === 'true') filter.needsBatch = true;
  if (query.q) {
    const rx = new RegExp(escapeRx(query.q), 'i');
    filter.$or = [{ fullName: rx }, { studentNumber: rx }, { phone: rx }];
  }
  return filter;
}

async function list(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const filter = buildFilter(req.query);
  const [items, total] = await Promise.all([
    Student.find(filter).populate('programme', 'name').populate('batch', 'name').populate('user', 'email status')
      .sort('-createdAt').skip(skip).limit(limit).lean(),
    Student.countDocuments(filter),
  ]);
  paginated(res, items, pageMeta(page, limit, total));
}

async function exportCsv(req, res) {
  const items = await Student.find(buildFilter(req.query)).populate('programme', 'name').populate('batch', 'name').populate('user', 'email status').lean();
  const rows = items.map((s) => ({
    studentNumber: s.studentNumber, fullName: s.fullName, email: s.user?.email, phone: s.phone, country: s.country,
    programme: s.programme?.name, batch: s.batch?.name, studyMode: s.studyMode, state: s.state, account: s.user?.status,
  }));
  const csv = toCsv(
    ['studentNumber', 'fullName', 'email', 'phone', 'country', 'programme', 'batch', 'studyMode', 'state', 'account'].map((key) => ({ key, label: key })),
    rows,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
  res.send(csv);
}

async function getOne(req, res) {
  const student = await Student.findById(req.params.id)
    .populate('programme', 'name requirements').populate('batch', 'name').populate('user', 'email status lastLoginAt').lean();
  if (!student) throw ApiError.notFound('Student not found');
  const [progress, attempts, certificates, attendance, completion] = await Promise.all([
    Progress.find({ student: student._id }).populate('lesson', 'title').populate('batch', 'name').sort('-lastWatchedAt').lean(),
    QuizAttempt.find({ student: student._id }).populate('lesson', 'title').sort('-submittedAt').limit(200).lean(),
    Certificate.find({ student: student._id }).lean(),
    Attendance.find({ student: student._id }).sort('-date').limit(200).lean(),
    records.programmeCompletion(student._id),
  ]);
  ok(res, { student, progress, attempts, certificates, attendance, completion });
}

// Offline registration: same Student model, no application.
async function createOffline(req, res) {
  const { student, emailStatus } = await service.createAndInvite(req.body, { source: 'offline' });
  await logActivity({ ...fromRequest(req), action: 'student.created_offline', entityType: 'Student', entityId: student._id, summary: `Added ${student.fullName} (${student.studentNumber})` });
  created(res, { student, emailStatus }, 'Student added. An activation email has been sent.');
}

// Bulk import from rows parsed in the admin app (CSV today; Excel parsing can be added there).
async function importRows(req, res) {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 500) : [];
  const results = [];
  for (const [index, row] of rows.entries()) {
    try {
      if (!row.fullName || !row.email) throw ApiError.badRequest('fullName and email are required');
      const { student } = await service.createAndInvite({ ...row, studyMode: row.studyMode || 'on_ground' }, { source: 'offline' });
      results.push({ row: index + 1, ok: true, studentNumber: student.studentNumber });
    } catch (error) {
      results.push({ row: index + 1, ok: false, error: error.message });
    }
  }
  await logActivity({ ...fromRequest(req), action: 'student.bulk_import', summary: `Imported ${results.filter((r) => r.ok).length} of ${rows.length} students` });
  ok(res, results, 'Import finished');
}

async function update(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw ApiError.notFound('Student not found');
  PROFILE_FIELDS.forEach((f) => { if (req.body[f] !== undefined) student[f] = req.body[f]; });
  await student.save();
  if (req.body.fullName || req.body.phone) {
    await User.updateOne({ _id: student.user }, { name: student.fullName, phone: student.phone });
  }
  await logActivity({ ...fromRequest(req), action: 'student.updated', entityType: 'Student', entityId: student._id, summary: `Updated ${student.fullName}` });
  ok(res, student, 'Student updated');
}

async function setStatus(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw ApiError.notFound('Student not found');
  const suspend = req.params.action === 'suspend';
  await service.setAccountStatus(student, suspend ? 'suspended' : 'active');
  await logActivity({ ...fromRequest(req), action: suspend ? 'student.suspended' : 'student.reactivated', entityType: 'Student', entityId: student._id, summary: `${suspend ? 'Suspended' : 'Reactivated'} ${student.fullName}` });
  ok(res, null, suspend ? 'Student suspended' : 'Student reactivated');
}

async function assignBatch(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw ApiError.notFound('Student not found');
  await service.moveToBatch(student, req.body.batch, req.body.reason || 'Assigned by staff');
  await logActivity({ ...fromRequest(req), action: 'student.batch_assigned', entityType: 'Student', entityId: student._id, summary: `Assigned ${student.fullName} to a batch`, meta: { batch: req.body.batch } });
  ok(res, student, 'Batch assigned. Learning progress for the new batch starts fresh.');
}

async function resendActivation(req, res) {
  const student = await Student.findById(req.params.id);
  if (!student) throw ApiError.notFound('Student not found');
  const user = await User.findById(student.user);
  if (user.status !== 'invited') throw ApiError.conflict('This account is already activated');
  const email = await auth.sendActivation(user, { studentNumber: student.studentNumber });
  ok(res, { emailStatus: email.status }, 'Activation email sent');
}

async function sendPasswordReset(req, res) {
  const student = await Student.findById(req.params.id).populate('user', 'email');
  if (!student) throw ApiError.notFound('Student not found');
  await auth.forgotPassword({ email: student.user.email, audience: 'student' });
  ok(res, null, 'Password reset email sent');
}

// Student self-service
async function myProfile(req, res) {
  const student = await Student.findOne({ user: req.user._id }).populate('programme', 'name').populate('batch', 'name').lean();
  if (!student) throw ApiError.notFound('Student record not found');
  ok(res, { ...student, email: req.user.email });
}

async function updateMyProfile(req, res) {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) throw ApiError.notFound('Student record not found');
  // Only whitelisted fields: number, programme, batch, results and certificates stay staff-controlled.
  Student.SELF_EDITABLE.forEach((f) => { if (req.body[f] !== undefined) student[f] = req.body[f]; });
  await student.save();
  if (req.body.phone !== undefined) await User.updateOne({ _id: req.user._id }, { phone: student.phone });
  ok(res, student, 'Profile updated');
}

module.exports = { list, exportCsv, getOne, createOffline, importRows, update, setStatus, assignBatch, resendActivation, sendPasswordReset, myProfile, updateMyProfile };
