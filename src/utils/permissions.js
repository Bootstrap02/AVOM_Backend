const { ROLE_PERMISSIONS } = require('../constants/roles');

// Effective permissions = role defaults + per-person grants - per-person revocations.
function effectivePermissions(user) {
  const base = new Set(ROLE_PERMISSIONS[user.role] || []);
  const granted = (user.permissions && user.permissions.granted) || [];
  const revoked = (user.permissions && user.permissions.revoked) || [];
  granted.forEach((p) => base.add(p));
  revoked.forEach((p) => base.delete(p));
  return [...base];
}

function hasPermission(user, permission) {
  return effectivePermissions(user).includes(permission);
}

module.exports = { effectivePermissions, hasPermission };
