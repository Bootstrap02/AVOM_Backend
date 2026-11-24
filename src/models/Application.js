const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female', ''], default: '' },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    church: String,
    denomination: String,
    pastorName: String,
    pastorContact: String,
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme' },
    studyMode: { type: String, enum: ['online', 'modular', 'on_ground'], default: 'online' },
    testimony: String,
    reason: String,
    ministryInvolvement: String,
    education: String,
    // Exactly three statuses.
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
    rejectionReason: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Application', applicationSchema);
