const mongoose = require('mongoose');
const { ROLES } = require('../constants/roles');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'invited', index: true },
    permissions: {
      granted: { type: [String], default: [] },
      revoked: { type: [String], default: [] },
    },
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const { _id, email, role, name, phone, status, permissions, lastLoginAt, createdAt } = this;
  return { id: _id, email, role, name, phone, status, permissions, lastLoginAt, createdAt };
};

module.exports = mongoose.model('User', userSchema);
