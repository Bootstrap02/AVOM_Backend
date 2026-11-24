// Turns known failure types into clean API responses. Unknown errors become a generic 500.
function normalise(error) {
  if (error.name === 'CastError') return { status: 400, message: 'Invalid identifier', errors: [] };
  if (error.name === 'ValidationError' && error.errors) {
    return {
      status: 422, message: 'Please correct the highlighted fields',
      errors: Object.values(error.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'value';
    return { status: 409, message: `That ${field} is already in use`, errors: [] };
  }
  if (error.type === 'entity.parse.failed') return { status: 400, message: 'Malformed request body', errors: [] };
  return null;
}

function errorHandler(error, _request, response, _next) {
  const known = normalise(error);
  const status = known?.status || Number(error.status || error.statusCode) || 500;
  const message =
    known?.message ||
    (status >= 500 && process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message || 'An unexpected error occurred');

  if (status >= 500) console.error(error);
  response.status(status).json({ success: false, message, errors: known?.errors || error.errors || [] });
}

module.exports = { errorHandler };
