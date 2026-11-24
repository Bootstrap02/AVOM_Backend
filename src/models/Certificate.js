const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true },
    verificationNumber: { type: String, required: true, unique: true },
    title: String,
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    issuingAuthority: { type: String, default: 'AVOM Believers Bible School' },
    status: { type: String, enum: ['valid', 'revoked'], default: 'valid', index: true },
    revokedReason: String,
    overrideReason: String, // set when a Super Admin issues without meeting requirements
  },
  { timestamps: true },
);
module.exports = mongoose.model('Certificate', certificateSchema);
