// ============================================================
// src/middleware/errorHandler.js  —  Global Error Handler
//
// What this does:
//   - Catches ANY error thrown in any route/controller
//   - Formats it into a consistent JSON response
//   - Logs the error to console
//   - Prevents the server from crashing on unhandled errors
//
// This MUST be the LAST middleware in app.js (after all routes)
// ============================================================

const errorHandler = (err, req, res, next) => {
  console.error(`\n❌ Error: ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Default error shape
  let statusCode = err.statusCode || 500;
  let message    = err.message || 'Internal Server Error';

  // Mongoose "CastError" — e.g. invalid MongoDB ObjectId in URL
  // e.g. GET /listings/not-a-valid-id
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose duplicate key error (code 11000)
  // e.g. trying to register with an email that already exists
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
  }

  // Mongoose validation error
  // e.g. a required field is missing
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')  { statusCode = 401; message = 'Invalid token.'; }
  if (err.name === 'TokenExpiredError')  { statusCode = 401; message = 'Token expired. Please log in again.'; }

  res.status(statusCode).json({
    success: false,
    error: { message, status: statusCode }
  });
};

module.exports = errorHandler;
