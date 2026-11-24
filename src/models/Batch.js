const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema(
  {
    programme: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: Date,
    status: { type: String, enum: ['open', 'running', 'closed'], default: 'open', index: true },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Batch', batchSchema);
