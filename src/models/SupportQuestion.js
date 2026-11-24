const mongoose = require('mongoose');

const supportQuestionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    channel: { type: String, enum: ['portal', 'whatsapp'], default: 'portal' },
    contact: String,
    subject: { type: String, required: true },
    status: { type: String, enum: ['open', 'answered', 'resolved'], default: 'open', index: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', index: true },
    messages: [
      {
        from: { type: String, enum: ['student', 'staff'], required: true },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        body: { type: String, required: true },
        at: { type: Date, default: Date.now },
        externalId: { type: String, index: true, sparse: true }, // WhatsApp message id, used to ignore retries
        _id: false,
      },
    ],
  },
  { timestamps: true },
);
module.exports = mongoose.model('SupportQuestion', supportQuestionSchema);
