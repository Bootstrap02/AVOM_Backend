const mongoose = require('mongoose');

const audioEpisodeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    audio: {
      provider: { type: String, default: 'cloudinary' },
      publicId: String,
      secureUrl: String,
      resourceType: { type: String, default: 'video' }, // Cloudinary stores audio under the "video" resource type
      format: String,
      bytes: Number,
      duration: Number,
      deletionStatus: { type: String, default: 'none' },
    },
    cover: { provider: String, publicId: String, secureUrl: String, deletionStatus: { type: String, default: 'none' } },
    spotifyUrl: String,
    externalLinks: [{ label: String, url: String, _id: false }],
    status: { type: String, enum: ['draft', 'published', 'unpublished', 'expired'], default: 'draft', index: true },
    publishedAt: Date,
    expiresAt: Date,
    pinned: { type: Boolean, default: false },
    warningSentAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('AudioEpisode', audioEpisodeSchema);
