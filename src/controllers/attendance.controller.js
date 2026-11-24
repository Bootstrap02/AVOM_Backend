const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/respond');
const { logActivity, fromRequest } = require('../services/audit.service');

// Staff mark attendance for a batch session. Idempotent per (student, batch, date, session).
async function mark(req, res) {
  const { batch, date, session = 'Class', entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) throw ApiError.unprocessable('No attendance entries');
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  const members = new Set((await Student.find({ batch }).select('_id').lean()).map((s) => String(s._id)));
  const ops = entries.filter((e) => members.has(String(e.student))).map((e) => ({
    updateOne: {
      filter: { student: e.student, batch, date: day, session },
      update: { $set: { status: e.status, markedBy: req.user._id } },
      upsert: true,
    },
  }));
  if (ops.length) await Attendance.bulkWrite(ops);
  await logActivity({ ...fromRequest(req), action: 'attendance.marked', entityType: 'Batch', entityId: batch, summary: `Marked attendance for ${ops.length} students (${session})` });
  ok(res, { saved: ops.length }, 'Attendance saved');
}

async function list(req, res) {
  const filter = {};
  if (req.query.batch) filter.batch = req.query.batch;
  if (req.query.student) filter.student = req.query.student;
  if (req.query.date) { const d = new Date(req.query.date); d.setUTCHours(0, 0, 0, 0); filter.date = d; }
  ok(res, await Attendance.find(filter).populate('student', 'fullName studentNumber').sort('-date').limit(1000).lean());
}

module.exports = { mark, list };
