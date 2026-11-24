const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    studentNumber: { type: String, required: true, unique: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
    source: { type: String, enum: ['online', 'offline'], default: 'online' },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female', ''], default: '' },
    phone: String,
    phoneDigits: { type: String, index: true }, // digits only, for matching WhatsApp numbers
    country: String,
    city: String,
    church: String,
    denomination: String,
    pastorName: String,
    pastorContact: String,
    ministryInvolvement: String,
    education: String,
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', index: true },
    studyMode: { type: String, enum: ['online', 'modular', 'on_ground'], default: 'online', index: true },
    // active = learning; paused = inactive (not failed). Account suspension lives on User.status.
    state: { type: String, enum: ['active', 'paused'], default: 'active', index: true },
    pausedAt: Date,
    lastActivityAt: Date,
    needsBatch: { type: Boolean, default: false },
    batchHistory: [
      {
        batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
        from: Date,
        to: Date,
        reason: String,
      },
    ],
    notes: String,
  },
  { timestamps: true },
);
studentSchema.index({ fullName: 'text', studentNumber: 'text' });
studentSchema.pre('save', function setPhoneDigits(next) {
  if (this.isModified('phone')) this.phoneDigits = String(this.phone || '').replace(/\D/g, '');
  next();
});

// Fields a student may edit about themselves. Everything else is staff-controlled.
studentSchema.statics.SELF_EDITABLE = [
  'phone', 'country', 'city', 'church', 'denomination', 'pastorName', 'pastorContact', 'ministryInvolvement', 'education',
];

module.exports = mongoose.model('Student', studentSchema);
