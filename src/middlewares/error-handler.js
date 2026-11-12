function errorHandler(error, _request, response, _next) {
  const status = Number(error.status || error.statusCode) || 500;
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message || 'An unexpected error occurred';

  if (status >= 500) console.error(error);
  response.status(status).json({
    success: false,
    message,
    errors: error.errors || [],
  });
}

module.exports = { errorHandler };
