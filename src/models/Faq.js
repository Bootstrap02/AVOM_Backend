const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    category: { type: String, default: 'General', index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
faqSchema.index({ question: 'text', answer: 'text' });
module.exports = mongoose.model('Faq', faqSchema);
