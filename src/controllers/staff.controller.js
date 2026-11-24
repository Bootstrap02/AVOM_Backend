const User = require('../models/User');
const auth = require('../services/auth.service');
const { logActivity, fromRequest } = require('../services/audit.service');
const { STAFF_ROLES, ROLES, PERMISSIONS, ROLE_PERMISSIONS } = require('../constants/roles');
const { effectivePermissions } = require('../utils/permissions');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');

const present = (u) => ({ ...u.toSafeJSON(), effectivePermissions: effectivePermissions(u) });
const validPerms = (list = []) => list.filter((p) => Object.values(PERMISSIONS).includes(p));

async function list(_req, res) {
  const users = await User.find({ role: { $in: STAFF_ROLES } }).sort('name');
  ok(res, users.map(present));
}

async function meta(_req, res) {
  ok(res, { roles: STAFF_ROLES, permissions: Object.values(PERMISSIONS), defaults: ROLE_PERMISSIONS });
}

async function create(req, res) {
  const { name, email, role, phone } = req.body;
  if (!STAFF_ROLES.includes(role)) throw ApiError.unprocessable('Choose a staff role');
  if (await User.exists({ email: String(email).toLowerCase() })) throw ApiError.conflict('A user with this email already exists');
  const user = await User.create({ name, email, role, phone, status: 'invited', permissions: { granted: validPerms(req.body.granted), revoked: validPerms(req.body.revoked) } });
  const mail = await auth.sendActivation(user);
  await logActivity({ ...fromRequest(req), action: 'staff.invited', entityType: 'User', entityId: user._id, summary: `Invited ${name} as ${role}` });
  created(res, { ...present(user), emailStatus: mail.status }, 'Invitation sent');
}

async function superAdminCount() {
  return User.countDocuments({ role: ROLES.SUPER_ADMIN, status: { $ne: 'suspended' } });
}

async function update(req, res) {
  const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } });
  if (!user) throw ApiError.notFound('Staff member not found');
  const isSelf = String(user._id) === String(req.user._id);

  if (req.body.role && req.body.role !== user.role) {
    if (isSelf) throw ApiError.badRequest('You cannot change your own role');
    if (!STAFF_ROLES.includes(req.body.role)) throw ApiError.unprocessable('Choose a staff role');
    if (user.role === ROLES.SUPER_ADMIN && (await superAdminCount()) <= 1) throw ApiError.conflict('There must always be at least one Super Admin');
    user.role = req.body.role;
  }
  if (req.body.status && req.body.status !== user.status && ['active', 'suspended'].includes(req.body.status)) {
    if (isSelf) throw ApiError.badRequest('You cannot suspend yourself');
    if (user.role === ROLES.SUPER_ADMIN && req.body.status === 'suspended' && (await superAdminCount()) <= 1) throw ApiError.conflict('There must always be at least one Super Admin');
    user.status = req.body.status;
    if (user.status === 'suspended') await auth.revokeAllSessions(user._id);
  }
  if (req.body.name) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.granted || req.body.revoked) {
    user.permissions = { granted: validPerms(req.body.granted ?? user.permissions.granted), revoked: validPerms(req.body.revoked ?? user.permissions.revoked) };
  }
  await user.save();
  await logActivity({ ...fromRequest(req), action: 'staff.updated', entityType: 'User', entityId: user._id, summary: `Updated ${user.name}`, meta: { role: user.role, permissions: user.permissions, status: user.status } });
  ok(res, present(user), 'Staff member updated');
}

async function resendInvite(req, res) {
  const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } });
  if (!user) throw ApiError.notFound('Staff member not found');
  if (user.status !== 'invited') throw ApiError.conflict('This account is already activated');
  ok(res, { emailStatus: (await auth.sendActivation(user)).status }, 'Invitation sent');
}

// Lecturer names for assigning to courses (needs academics.manage, not full staff management).
async function lecturers(_req, res) {
  ok(res, await User.find({ role: ROLES.LECTURER, status: { $ne: 'suspended' } }).select('name email').sort('name').lean());
}

module.exports = { lecturers, list, meta, create, update, resendInvite };
