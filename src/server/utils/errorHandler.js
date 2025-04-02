/**
 * Central error handling utilities
 * Provides consistent error handling across the application
 */

/**
 * Async handler wrapper for route handlers
 * Automatically catches promise rejections and passes them to next()
 * @param {Function} fn - Express route handler function
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a custom error with status code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @returns {Error} Custom error object
 */
function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Format error response for API
 * @param {Error} err - Error object
 * @param {boolean} includeStack - Whether to include stack trace
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(err, includeStack = process.env.NODE_ENV === 'development') {
  return {
    error: true,
    message: err.message || 'An unexpected error occurred',
    code: err.code,
    statusCode: err.statusCode || 500,
    type: err.type,
    stack: includeStack ? err.stack : undefined
  };
}

module.exports = {
  asyncHandler,
  createError,
  formatErrorResponse
};