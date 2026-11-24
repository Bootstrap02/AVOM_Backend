const { env } = require('../config/env');
const auth = require('../services/auth.service');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');

// Separate cookie names keep the two apps apart (cookies are not isolated by port on localhost).
const cookieName = (audience) => (audience === 'student' ? 'avom_student_rt' : 'avom_staff_rt');
const cookieOptions = (maxAge) => ({
  httpOnly: true, secure: env.cookie.secure, sameSite: env.cookie.sameSite, domain: env.cookie.domain,
  path: '/api/v1/auth', maxAge,
});

// Cookie-only endpoints (refresh, logout) require a custom header. Browsers will not send it cross-site
// without a CORS pre-flight, which our allow-list rejects, so a forged form post from another site fails.
function requireAjaxHeader(req) {
  if (req.get('x-requested-with') !== 'avom') throw ApiError.forbidden('Invalid request');
}

function audienceOf(req) {
  const { audience } = req.params;
  if (audience !== 'student' && audience !== 'staff') throw ApiError.notFound();
  return audience;
}

async function login(req, res) {
  const audience = audienceOf(req);
  const result = await auth.login({ ...req.body, audience, userAgent: req.get('user-agent') });
  res.cookie(cookieName(audience), result.refresh.raw, cookieOptions(result.refresh.maxAgeMs));
  ok(res, { accessToken: result.accessToken, user: result.user }, 'Signed in');
}

async function refresh(req, res) {
  requireAjaxHeader(req);
  const audience = audienceOf(req);
  const result = await auth.refresh({
    rawToken: req.cookies?.[cookieName(audience)], audience, userAgent: req.get('user-agent'),
  });
  res.cookie(cookieName(audience), result.refresh.raw, cookieOptions(result.refresh.maxAgeMs));
  ok(res, { accessToken: result.accessToken, user: result.user });
}

async function logout(req, res) {
  requireAjaxHeader(req);
  const audience = audienceOf(req);
  await auth.logout(req.cookies?.[cookieName(audience)]);
  res.clearCookie(cookieName(audience), { ...cookieOptions(0), maxAge: undefined });
  ok(res, null, 'Signed out');
}

async function me(req, res) {
  ok(res, await auth.presentUser(req.user));
}

async function activate(req, res) {
  await auth.activate(req.body);
  ok(res, null, 'Account activated. You can now sign in.');
}

async function forgotPassword(req, res) {
  await auth.forgotPassword({ email: req.body.email, audience: req.body.audience === 'staff' ? 'staff' : 'student' });
  ok(res, null, 'If that email is registered, a reset link has been sent.');
}

async function resetPassword(req, res) {
  await auth.resetPassword(req.body);
  ok(res, null, 'Password updated. You can now sign in.');
}

async function changePassword(req, res) {
  await auth.changePassword(req.user, req.body);
  ok(res, null, 'Password changed. Please sign in again on your other devices.');
}

module.exports = { login, refresh, logout, me, activate, forgotPassword, resetPassword, changePassword };
