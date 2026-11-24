const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { ROLES, STAFF_ROLES } = require('../constants/roles');
const { hasPermission, effectivePermissions } = require('../utils/permissions');

/**
 * Verifies the Bearer access token, loads the user and rejects suspended accounts.
 * `audience` keeps the two apps separate: 'student' only admits students, 'staff' only staff roles.
 */
function authenticate(audience) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) throw ApiError.unauthorized();

      let payload;
      try {
        payload = jwt.verify(token, env.jwt.accessSecret);
      } catch (_) {
        throw ApiError.unauthorized('Session expired. Please sign in again.');
      }

      const user = await User.findById(payload.sub);
      if (!user || user.status !== 'active') throw ApiError.unauthorized('Account is not active');
      if (audience === 'student' && user.role !== ROLES.STUDENT) throw ApiError.forbidden('Student account required');
      if (audience === 'staff' && !STAFF_ROLES.includes(user.role)) throw ApiError.forbidden('Staff account required');

      req.user = user;
      req.permissions = effectivePermissions(user);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/** Allow if the user holds ANY of the listed permissions. Enforced here, never only in the UI. */
function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (permissions.some((p) => hasPermission(req.user, p))) return next();
    return next(ApiError.forbidden());
  };
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    return roles.includes(req.user.role) ? next() : next(ApiError.forbidden());
  };
}

module.exports = { authenticate, requirePermission, requireRole };
