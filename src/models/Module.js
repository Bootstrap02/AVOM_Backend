const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Module', moduleSchema);
