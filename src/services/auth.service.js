const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { env } = require('../config/env');
const User = require('../models/User');
const Token = require('../models/Token');
const RefreshToken = require('../models/RefreshToken');
const Student = require('../models/Student');
const ApiError = require('../utils/ApiError');
const { randomToken, sha256 } = require('../utils/tokens');
const { addDays } = require('../utils/dates');
const { ROLES, STAFF_ROLES } = require('../constants/roles');
const { effectivePermissions } = require('../utils/permissions');
const { sendEmail } = require('./email.service');
const settings = require('./settings.service');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const audienceFits = (user, audience) =>
  audience === 'student' ? user.role === ROLES.STUDENT : STAFF_ROLES.includes(user.role);

const refreshDays = (audience) => (audience === 'student' ? env.jwt.studentRefreshDays : env.jwt.staffRefreshDays);
const appUrl = (audience) => (audience === 'student' ? `${env.clientUrl}/student` : env.adminUrl);

function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw ApiError.unprocessable('Password must be at least 8 characters', [
      { field: 'password', message: 'Use at least 8 characters' },
    ]);
  }
}

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, { expiresIn: env.jwt.accessTtl });
}

async function issueRefreshToken(user, audience, { family = uuid(), userAgent } = {}) {
  const raw = randomToken(40);
  await RefreshToken.create({
    user: user._id, family, tokenHash: sha256(raw), audience,
    expiresAt: addDays(new Date(), refreshDays(audience)), userAgent,
  });
  return { raw, family, maxAgeMs: refreshDays(audience) * 86400000 };
}

async function presentUser(user) {
  const base = { ...user.toSafeJSON(), permissions: effectivePermissions(user) };
  if (user.role === ROLES.STUDENT) {
    const student = await Student.findOne({ user: user._id }).select('studentNumber studyMode state programme batch fullName').lean();
    base.student = student || null;
  }
  return base;
}

async function login({ email, password, audience, userAgent }) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const valid = await bcrypt.compare(String(password || ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !valid || !audienceFits(user, audience)) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status === 'invited') throw ApiError.forbidden('Please activate your account using the link we emailed you');
  if (user.status === 'suspended') throw ApiError.forbidden('This account has been suspended. Please contact AVOM.');

  user.lastLoginAt = new Date();
  await user.save();
  const refresh = await issueRefreshToken(user, audience, { userAgent });
  return { accessToken: signAccessToken(user), refresh, user: await presentUser(user) };
}

async function refresh({ rawToken, audience, userAgent }) {
  if (!rawToken) throw ApiError.unauthorized();
  const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (!record || record.audience !== audience) throw ApiError.unauthorized();
  if (record.revokedAt) {
    // A rotated token was replayed: assume theft and kill the whole family.
    await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { revokedAt: new Date() });
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }
  if (record.expiresAt <= new Date()) throw ApiError.unauthorized('Session expired. Please sign in again.');

  const user = await User.findById(record.user);
  if (!user || user.status !== 'active' || !audienceFits(user, audience)) throw ApiError.unauthorized();

  const next = await issueRefreshToken(user, audience, { family: record.family, userAgent });
  record.revokedAt = new Date();
  record.replacedBy = sha256(next.raw);
  await record.save();
  return { accessToken: signAccessToken(user), refresh: next, user: await presentUser(user) };
}

async function logout(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: sha256(rawToken), revokedAt: null }, { revokedAt: new Date() });
}

async function createOneTimeToken(user, type, days) {
  await Token.deleteMany({ user: user._id, type, usedAt: null });
  const raw = randomToken(32);
  await Token.create({ user: user._id, type, tokenHash: sha256(raw), expiresAt: addDays(new Date(), days) });
  return raw;
}

async function consumeToken(raw, type) {
  const record = await Token.findOne({ tokenHash: sha256(String(raw || '')), type });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw ApiError.badRequest('This link is invalid or has expired. Please request a new one.');
  }
  return record;
}

/** Email an activation link to a newly created student or staff user. */
async function sendActivation(user, { studentNumber } = {}) {
  const days = await settings.get('auth.activationDays');
  const raw = await createOneTimeToken(user, 'activation', days);
  const audience = user.role === ROLES.STUDENT ? 'student' : 'staff';
  const url = `${appUrl(audience)}/activate?token=${raw}`;
  const template = audience === 'student' ? 'account_activation' : 'staff_invitation';
  return sendEmail({
    to: user.email, template,
    data: { name: user.name, studentNumber, role: user.role.replace('_', ' '), url, buttonLabel: 'Activate account', expiresInDays: days },
  });
}

async function activate({ token, password }) {
  assertPasswordStrength(password);
  const record = await consumeToken(token, 'activation');
  const user = await User.findById(record.user);
  if (!user) throw ApiError.badRequest('Account not found');
  if (user.status === 'suspended') throw ApiError.forbidden('This account has been suspended');
  user.passwordHash = await bcrypt.hash(password, 12);
  user.status = 'active';
  user.passwordChangedAt = new Date();
  await user.save();
  record.usedAt = new Date();
  await record.save();
  return user;
}

async function forgotPassword({ email, audience }) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  // Same response whether or not the account exists.
  if (!user || user.status !== 'active' || !audienceFits(user, audience)) return;
  const raw = await createOneTimeToken(user, 'password_reset', 1 / 24);
  await sendEmail({
    to: user.email, template: 'password_reset',
    data: { name: user.name, url: `${appUrl(audience)}/reset-password?token=${raw}`, buttonLabel: 'Choose a new password' },
  });
}

async function resetPassword({ token, password }) {
  assertPasswordStrength(password);
  const record = await consumeToken(token, 'password_reset');
  const user = await User.findById(record.user);
  if (!user) throw ApiError.badRequest('Account not found');
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  record.usedAt = new Date();
  await record.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
}

async function changePassword(user, { currentPassword, newPassword }) {
  assertPasswordStrength(newPassword);
  const full = await User.findById(user._id).select('+passwordHash');
  if (!(await bcrypt.compare(String(currentPassword || ''), full.passwordHash || DUMMY_HASH))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  full.passwordHash = await bcrypt.hash(newPassword, 12);
  full.passwordChangedAt = new Date();
  await full.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
}

async function revokeAllSessions(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

module.exports = {
  login, refresh, logout, sendActivation, activate, forgotPassword, resetPassword, changePassword,
  revokeAllSessions, presentUser, signAccessToken,
};
