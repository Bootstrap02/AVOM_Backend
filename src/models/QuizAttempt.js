const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    attemptNumber: { type: Number, required: true },
    answers: [Number],
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percentage: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
quizAttemptSchema.index({ student: 1, quiz: 1, batch: 1, attemptNumber: 1 }, { unique: true });
module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
