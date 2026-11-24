const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    lecturers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);
module.exports = mongoose.model('Course', courseSchema);
