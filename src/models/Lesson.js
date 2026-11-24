const mongoose = require('mongoose');

// A stored media asset (Cloudinary today; provider is recorded so storage can be swapped).
const assetSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'cloudinary' },
    publicId: String,
    secureUrl: String,
    resourceType: { type: String, default: 'video' },
    format: String,
    bytes: Number,
    duration: Number, // seconds
    uploadedAt: Date,
    deletionStatus: { type: String, enum: ['none', 'deleted', 'failed'], default: 'none' },
    deletionAttempts: { type: Number, default: 0 },
    deletedAt: Date,
    lastError: String,
  },
  { _id: false },
);

const partSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    title: String,
    video: assetSchema,
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
  },
  { _id: false },
);

const lessonSchema = new mongoose.Schema(
  {
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    module: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    order: { type: Number, default: 0 },
    // Three parts (video + quiz) by default; the count is data, not schema.
    parts: { type: [partSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Lesson', lessonSchema);
