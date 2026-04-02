// ============================================================
// src/controllers/user.controller.js
// ============================================================

const { User } = require('../models');
const { AppError, asyncHandler, sendSuccess } = require('../utils/apiHelpers');

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('studentProfile.university', 'name shortName city');
  sendSuccess(res, 200, user);
});

exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  sendSuccess(res, 200, user, 'Profile updated.');
});

exports.updateStudentProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new AppError('Only students can update student profiles.', 403);

  const { universityId, studentIdNo, faculty, yearOfStudy, gender } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: {
      'studentProfile.university':  universityId  || req.user.studentProfile?.university,
      'studentProfile.studentIdNo': studentIdNo   || req.user.studentProfile?.studentIdNo,
      'studentProfile.faculty':     faculty        || req.user.studentProfile?.faculty,
      'studentProfile.yearOfStudy': yearOfStudy    || req.user.studentProfile?.yearOfStudy,
      'studentProfile.gender':      gender         || req.user.studentProfile?.gender,
    }},
    { new: true }
  ).populate('studentProfile.university', 'name shortName');

  sendSuccess(res, 200, user, 'Student profile updated.');
});

exports.updateOwnerProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== 'OWNER') throw new AppError('Only owners can update owner profiles.', 403);

  const { nicNumber, businessName } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: {
      'ownerProfile.nicNumber':    nicNumber    || req.user.ownerProfile?.nicNumber,
      'ownerProfile.businessName': businessName || req.user.ownerProfile?.businessName,
    }},
    { new: true }
  );
  sendSuccess(res, 200, user, 'Owner profile updated.');
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded.', 400);
  const user = await User.findByIdAndUpdate(
    req.user._id, { avatarUrl: req.file.path }, { new: true }
  );
  sendSuccess(res, 200, { avatarUrl: user.avatarUrl }, 'Avatar updated.');
});

exports.ownerDashboardStats = asyncHandler(async (req, res) => {
  const { Listing, Booking } = require('../models');

  const [activeListings, bookings] = await Promise.all([
    Listing.countDocuments({ owner: req.user._id, isActive: true }),
    Booking.find({ owner: req.user._id, status: { $in: ['CONFIRMED', 'COMPLETED'] } })
  ]);

  const currentBookings   = bookings.filter(b => b.status === 'CONFIRMED' && b.type === 'IMMEDIATE').length;
  const upcomingRes       = bookings.filter(b => b.status === 'CONFIRMED' && b.type === 'FUTURE').length;
  const monthlyRevenue    = bookings
    .filter(b => b.status === 'CONFIRMED')
    .reduce((sum, b) => sum + b.monthlyRent, 0);

  const recentBookings = await Booking.find({ owner: req.user._id })
    .populate('student', 'firstName lastName avatarUrl')
    .populate('listing', 'title')
    .sort({ createdAt: -1 })
    .limit(5);

  sendSuccess(res, 200, {
    stats: { activeListings, currentBookings, upcomingReservations: upcomingRes, monthlyRevenue },
    recentBookings
  });
});
