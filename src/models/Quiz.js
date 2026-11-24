const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    options: { type: [String], validate: (v) => v.length >= 2 && v.length <= 8 },
    // Never sent to students. Stripped by the quiz presenter.
    correctIndex: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const quizSchema = new mongoose.Schema(
  {
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    partOrder: { type: Number, required: true },
    title: String,
    isFinal: { type: Boolean, default: false },
    passMark: { type: Number, default: 50, min: 0, max: 100 }, // percent, admin-configurable
    maxAttempts: { type: Number, default: 3, min: 1 },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true },
);
quizSchema.index({ lesson: 1, partOrder: 1 }, { unique: true });
module.exports = mongoose.model('Quiz', quizSchema);
