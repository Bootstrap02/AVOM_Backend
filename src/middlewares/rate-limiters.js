const { rateLimit } = require('express-rate-limit');

const make = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message, errors: [] },
  });

module.exports = {
  authLimiter: make(15, 20, 'Too many attempts. Please try again later.'),
  publicFormLimiter: make(60, 20, 'Too many submissions. Please try again later.'),
};
