const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    date: { type: Date, required: true },
    session: { type: String, default: 'Class' },
    status: { type: String, enum: ['present', 'absent', 'excused'], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
attendanceSchema.index({ student: 1, batch: 1, date: 1, session: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', attendanceSchema);
