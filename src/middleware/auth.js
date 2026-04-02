// ============================================================
// src/middleware/auth.js  —  JWT Authentication Middleware
//
// What is middleware?
//   Middleware is code that runs BETWEEN receiving a request
//   and sending a response. Like a checkpoint at a gate.
//
// What does this middleware do?
//   1. Reads the "Authorization" header from the request
//   2. Extracts the JWT token
//   3. Verifies the token is valid and not expired
//   4. Attaches the user info to req.user so routes can use it
//   5. If token is invalid → returns 401 Unauthorized error
// ============================================================

const jwt  = require('jsonwebtoken');
const { User } = require('../models');

/**
 * Protect routes — user must be logged in (valid JWT)
 */
const protect = async (req, res, next) => {
  try {
    // Get token from header: "Authorization: Bearer eyJhbGci..."
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { message: 'Not authenticated. Please log in.', status: 401 }
      });
    }

    // Extract just the token part (after "Bearer ")
    const token = authHeader.split(' ')[1];

    // Verify the token — throws an error if expired or tampered
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user in DB (makes sure account still exists & is active)
    const user = await User.findById(decoded.id).select('-passwordHash -refreshToken');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { message: 'User no longer exists or account is disabled.', status: 401 }
      });
    }

    // Attach user to request — now any route can access req.user
    req.user = user;
    next();  // Move to the next middleware or route handler

  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token. Please log in again.';

    return res.status(401).json({ success: false, error: { message, status: 401 } });
  }
};

/**
 * Authorize specific roles — user must have the right role
 * Usage: authorize('ADMIN', 'OWNER')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: `Access denied. Required role: ${roles.join(' or ')}`, status: 403 }
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
