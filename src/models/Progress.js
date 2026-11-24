const mongoose = require('mongoose');

// Per student, per batch, per lesson. Moving batch creates a fresh record; the old one stays as history.
const progressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme' },
    parts: [
      {
        order: Number,
        positionSeconds: { type: Number, default: 0 },
        videoCompleted: { type: Boolean, default: false },
        lastWatchedAt: Date,
        _id: false,
      },
    ],
    lastPartOrder: { type: Number, default: 1 },
    lessonCompleted: { type: Boolean, default: false },
    completedAt: Date,
    lastWatchedAt: Date,
  },
  { timestamps: true },
);
progressSchema.index({ student: 1, batch: 1, lesson: 1 }, { unique: true });
module.exports = mongoose.model('Progress', progressSchema);
