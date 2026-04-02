// ============================================================
// src/utils/apiHelpers.js  —  Reusable Helper Functions
// ============================================================

/**
 * AppError — Custom error class
 * Why: When you throw this, the errorHandler middleware catches it
 * and formats it correctly. You can set the HTTP status code.
 *
 * Usage: throw new AppError('Listing not found', 404)
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);        // Call the parent Error class constructor
    this.statusCode = statusCode;
    this.isOperational = true;  // Marks this as a "planned" error (not a bug)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * asyncHandler — Wraps async route functions
 * Why: Without this, if an async function throws an error,
 * Express doesn't catch it. This wrapper does that for you.
 *
 * Usage: router.get('/listings', asyncHandler(async (req, res) => { ... }))
 * Instead of surrounding every function with try/catch
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Send a success response in consistent format
 */
const sendSuccess = (res, statusCode = 200, data = {}, message = 'Success') => {
  res.status(statusCode).json({ success: true, message, data });
};

/**
 * Pagination helper
 * Calculates skip (how many docs to skip) from page number and limit
 */
const getPagination = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(50, parseInt(query.limit) || 10);
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Create a push notification record in DB
 */
const createNotification = async (Notification, { userId, type, title, body, data }) => {
  try {
    await Notification.create({ user: userId, type, title, body, data: data || {} });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

module.exports = { AppError, asyncHandler, sendSuccess, getPagination, createNotification };
