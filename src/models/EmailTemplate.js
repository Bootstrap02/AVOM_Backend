const mongoose = require('mongoose');

// Admin-editable overrides for the built-in email templates. Placeholders look like {{name}}.
const emailTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    bodyHtml: { type: String, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
