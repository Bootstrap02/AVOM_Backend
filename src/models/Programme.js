const mongoose = require('mongoose');

const programmeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: String,
    active: { type: Boolean, default: true },
    studyModes: { type: [String], default: ['online', 'modular', 'on_ground'] },
    // Certificate requirements are configuration, not code.
    requirements: {
      minCompletionPercent: { type: Number, default: 100, min: 0, max: 100 },
      minAverageScore: { type: Number, default: 0, min: 0, max: 100 },
    },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Programme', programmeSchema);
