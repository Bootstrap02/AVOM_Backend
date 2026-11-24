const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  { provider: { type: String, default: 'cloudinary' }, publicId: String, secureUrl: String, deletionStatus: { type: String, default: 'none' } },
  { _id: false },
);

const ngoPostSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['story', 'event', 'gallery'], default: 'story', index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, index: true },
    excerpt: String,
    body: String,
    eventDate: Date,
    cover: imageSchema,
    gallery: [imageSchema],
    status: { type: String, enum: ['draft', 'published', 'unpublished', 'expired'], default: 'draft', index: true },
    publishedAt: Date,
    expiresAt: Date,
    pinned: { type: Boolean, default: false },
    warningSentAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('NgoPost', ngoPostSchema);
