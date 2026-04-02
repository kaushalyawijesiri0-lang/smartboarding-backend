// ============================================================
// src/routes/auth.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// Public routes (no login needed)
router.post('/register',             ctrl.register);
router.post('/verify-email',         ctrl.verifyEmail);
router.post('/resend-verification',  ctrl.resendVerification);
router.post('/login',                ctrl.login);
router.post('/refresh',              ctrl.refreshToken);
router.post('/forgot-password',      ctrl.forgotPassword);
router.post('/reset-password',       ctrl.resetPassword);

// Protected routes (must be logged in)
router.post('/logout',           protect, ctrl.logout);
router.post('/change-password',  protect, ctrl.changePassword);

module.exports = router;
