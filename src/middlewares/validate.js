const { validationResult } = require('express-validator');

// Run after express-validator chains: returns 422 with field errors.
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  const error = new Error('Please correct the highlighted fields');
  error.status = 422;
  error.errors = errors;
  return next(error);
}
module.exports = { validate };
