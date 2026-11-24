const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, index: true },
    template: { type: String, required: true },
    subject: String,
    status: { type: String, enum: ['sent', 'logged', 'failed'], required: true, index: true },
    error: String,
    providerId: String,
  },
  { timestamps: true },
);
module.exports = mongoose.model('EmailLog', emailLogSchema);
