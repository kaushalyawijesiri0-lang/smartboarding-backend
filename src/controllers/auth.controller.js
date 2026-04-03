// ============================================================
// src/controllers/auth.controller.js  —  Auth Logic
//
// What is a controller?
//   A controller is the function that handles a specific request.
//   Route → Controller → Database → Response
//
// This file handles:
//   - Register (Student or Owner)
//   - Email OTP verification
//   - Login
//   - Token refresh
//   - Logout
//   - Forgot/Reset password
// ============================================================

const jwt     = require('jsonwebtoken');
const { User, generateOTP } = require('../models');
const { sendEmail, emailTemplates } = require('../config/mailer');
const { AppError, asyncHandler, sendSuccess } = require('../utils/apiHelpers');

// ── Helper: generate JWT access token ──────────────────
// The token is signed with your JWT_SECRET and expires in 15 min
const signAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' });

// ── Helper: generate refresh token ─────────────────────
// Longer-lived token used to get a new access token without re-login
const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' });

// ── Helper: send both tokens in response ───────────────
const sendTokens = async (user, res, statusCode = 200, message = 'Success') => {
  const accessToken  = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Save refresh token hash to DB so we can invalidate it on logout
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  sendSuccess(res, statusCode, {
    accessToken,
    refreshToken,
    user: {
      id:        user._id,
      email:     user.email,
      role:      user.role,
      firstName: user.firstName,
      lastName:  user.lastName,
      isVerified:user.isVerified,
      avatarUrl: user.avatarUrl,
    }
  }, message);
};

// ============================================================
// POST /api/v1/auth/register
// ============================================================
exports.register = asyncHandler(async (req, res) => {
  const { role, firstName, lastName, email, phone, password,
          universityId, studentIdNo, faculty, nicNumber, businessName } = req.body;

  // Check if email is already taken
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) throw new AppError('An account with this email already exists.', 409);

  // Generate OTP (6-digit number) for email verification
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);  // 10 minutes from now

  // Build user data object
  const userData = {
    role, firstName, lastName, email, phone,
    passwordHash: password,    // Pre-save hook will hash this
    verifyOTP:       otp,
    verifyOTPExpiry: otpExpiry,
    isVerified: false,
  };

  // Add role-specific profile data
  if (role === 'STUDENT') {
    userData.studentProfile = { university: universityId, studentIdNo, faculty };
  }
  if (role === 'OWNER') {
    userData.ownerProfile = { nicNumber, businessName };
  }

  const user = await User.create(userData);

  // Send verification email with OTP
  try {
    const { subject, html } = emailTemplates.verifyEmail(firstName, otp);
    await sendEmail({ to: email, subject, html });
  } catch (emailErr) {
    // If email fails, still let the user register — they can resend later
    console.error('Verification email failed:', emailErr.message);
  }

  sendSuccess(res, 201, {
    userId: user._id,
    email:  user.email,
    role:   user.role,
    message: 'Check your email for the 6-digit OTP to verify your account.'
  }, 'Registration successful. Please verify your email.');
});

// ============================================================
// POST /api/v1/auth/verify-email
// ============================================================
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new AppError('User not found.', 404);
  if (user.isVerified) throw new AppError('Email already verified.', 400);

  // Check OTP matches and hasn't expired
  if (user.verifyOTP !== otp || new Date() > user.verifyOTPExpiry) {
    throw new AppError('Invalid or expired OTP. Please request a new one.', 400);
  }

  // Mark as verified and clear OTP fields
  user.isVerified      = true;
  user.verifyOTP       = undefined;
  user.verifyOTPExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  // Send both tokens — user is now fully logged in
  await sendTokens(user, res, 200, 'Email verified successfully! You are now logged in.');
});

// ============================================================
// POST /api/v1/auth/resend-verification
// ============================================================
exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) throw new AppError('User not found.', 404);
  if (user.isVerified) throw new AppError('Email already verified.', 400);

  const otp = generateOTP();
  user.verifyOTP       = otp;
  user.verifyOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const { subject, html } = emailTemplates.verifyEmail(user.firstName, otp);
  await sendEmail({ to: email, subject, html });

  sendSuccess(res, 200, {}, 'New OTP sent to your email.');
});

// ============================================================
// POST /api/v1/auth/login
// ============================================================
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user — include passwordHash (normally excluded from queries)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw new AppError('Invalid email or password.', 401);

  // Check account is active
  if (!user.isActive) throw new AppError('Account is disabled. Please contact support.', 401);

  // Compare entered password with stored hash
  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new AppError('Invalid email or password.', 401);

  // Update last login time
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  await sendTokens(user, res, 200, 'Login successful.');
});

// ============================================================
// POST /api/v1/auth/refresh
// Body: { refreshToken: "..." }
// ============================================================
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('Refresh token required.', 400);

  // Verify the refresh token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
  }

  // Find user and verify the token matches what's stored
  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError('Refresh token is invalid. Please log in again.', 401);
  }

  // Issue new access token (token rotation)
  const newAccessToken  = signAccessToken(user._id);
  const newRefreshToken = signRefreshToken(user._id);

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  sendSuccess(res, 200, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed.');
});

// ============================================================
// POST /api/v1/auth/logout
// ============================================================
exports.logout = asyncHandler(async (req, res) => {
  // Invalidate refresh token in DB — this logs them out on all devices
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
  sendSuccess(res, 200, {}, 'Logged out successfully.');
});

// ============================================================
// POST /api/v1/auth/forgot-password
// ============================================================
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Security tip: always say "if the email exists..." — don't reveal if email exists or not
  if (!user) {
    return sendSuccess(res, 200, {}, 'If this email is registered, a reset OTP has been sent.');
  }

  const otp = generateOTP();
  user.resetOTP       = otp;
  user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  try {
    const { subject, html } = emailTemplates.passwordReset(user.firstName, otp);
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    await user.save({ validateBeforeSave: false });
    throw new AppError('Failed to send reset email. Please try again.', 500);
  }

  sendSuccess(res, 200, {}, 'If this email is registered, a reset OTP has been sent.');
});

// ============================================================
// POST /api/v1/auth/reset-password
// Body: { email, otp, newPassword }
// ============================================================
exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase(),
    resetOTP: otp,
    resetOTPExpiry: { $gt: new Date() }   // $gt = greater than — OTP not expired
  });

  if (!user) throw new AppError('Invalid or expired OTP.', 400);

  user.passwordHash   = newPassword;   // Pre-save hook hashes this
  user.resetOTP       = undefined;
  user.resetOTPExpiry = undefined;
  user.refreshToken   = undefined;    // Invalidate all existing sessions
  await user.save();

  sendSuccess(res, 200, {}, 'Password reset successful. Please log in with your new password.');
});

// ============================================================
// POST /api/v1/auth/change-password  (Protected)
// ============================================================
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect.', 400);
  }

  user.passwordHash = newPassword;
  await user.save();

  sendSuccess(res, 200, {}, 'Password changed successfully.');
});
