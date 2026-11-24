const mongoose = require('mongoose');

// A lesson published to one batch. The access clock (expiresAt) starts at publishedAt, never at upload.
const publicationSchema = new mongoose.Schema(
  {
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    publishedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['scheduled', 'live', 'expired', 'withdrawn'], default: 'live', index: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notifiedAt: Date,
    warningSentAt: Date,
  },
  { timestamps: true },
);
publicationSchema.index({ lesson: 1, batch: 1, status: 1 });
module.exports = mongoose.model('LecturePublication', publicationSchema);
