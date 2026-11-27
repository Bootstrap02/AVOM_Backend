const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    excerpt: { type: String, default: '' },
    isPublished: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Page', pageSchema);