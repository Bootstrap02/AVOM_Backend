const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['donation', 'partner', 'certificate', 'other'], default: 'donation' },
    email: { type: String, required: true },
    name: String,
    amount: { type: Number, required: true }, // major units (e.g. naira)
    currency: { type: String, default: 'NGN' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'abandoned'], default: 'pending', index: true },
    paidAt: Date,
    gatewayResponse: mongoose.Schema.Types.Mixed,
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  },
  { timestamps: true },
);
module.exports = mongoose.model('Payment', paymentSchema);
