// ============================================================
// src/controllers/booking.controller.js  —  Booking Logic
//
// Handles the full booking lifecycle:
//   Student creates booking → Owner confirms → Student moves in → Completed
// ============================================================

const { Booking, Listing, Notification } = require('../models');
const { AppError, asyncHandler, sendSuccess, getPagination, createNotification } = require('../utils/apiHelpers');
const { sendEmail, emailTemplates } = require('../config/mailer');

// ============================================================
// POST /api/v1/bookings  (Student)
// ============================================================
exports.createBooking = asyncHandler(async (req, res) => {
  const {
    listingId, roomTypeId, type, moveInDate,
    durationMonths, paymentMethod, notes
  } = req.body;

  // 1. Fetch the listing with the room type
  const listing = await Listing.findById(listingId).populate('owner', 'firstName email');
  if (!listing || !listing.isActive) throw new AppError('Listing not found or is unavailable.', 404);

  // 2. Find the specific room type
  const roomType = listing.roomTypes.id(roomTypeId);
  if (!roomType || !roomType.isActive) throw new AppError('Room type not found.', 404);

  // 3. Check availability
  if (type === 'IMMEDIATE' && roomType.availableNow < 1) {
    throw new AppError('No slots available right now for this room type.', 409);
  }
  if (type === 'FUTURE' && roomType.upcomingSlots < 1) {
    throw new AppError('No upcoming slots available for this room type.', 409);
  }
  if (type === 'FUTURE' && !listing.acceptsFutureRes) {
    throw new AppError('This listing does not accept future reservations.', 400);
  }

  // 4. Calculate amounts
  const monthlyRent   = roomType.pricePerMonth;
  const advanceAmount = 5000;       // Fixed advance
  const depositAmount = monthlyRent; // 1 month deposit
  const discountAmount = 0;
  const totalDue      = advanceAmount + depositAmount + monthlyRent - discountAmount;

  // 5. Create booking
  const booking = await Booking.create({
    listing:      listingId,
    roomTypeId,
    student:      req.user._id,
    owner:        listing.owner._id,
    type,
    status:       'PENDING',
    moveInDate:   new Date(moveInDate),
    durationMonths: parseInt(durationMonths),
    monthlyRent,
    advanceAmount,
    depositAmount,
    discountAmount,
    totalDue,
    paymentMethod,
    notes
  });

  // 6. Notify the owner (in-app + email)
  await createNotification(Notification, {
    userId: listing.owner._id,
    type:   'BOOKING_PENDING',
    title:  'New Booking Request',
    body:   `${req.user.firstName} ${req.user.lastName} has requested to book "${listing.title}"`,
    data:   { bookingId: booking._id, listingId }
  });

  try {
    const { subject, html } = emailTemplates.newBookingOwner(
      listing.owner.firstName,
      req.user.fullName,
      listing.title,
      new Date(moveInDate).toLocaleDateString('en-LK')
    );
    await sendEmail({ to: listing.owner.email, subject, html });
  } catch (e) { console.error('Owner notify email failed:', e.message); }

  sendSuccess(res, 201, booking, 'Booking created. Please complete payment to confirm.');
});

// ============================================================
// GET /api/v1/bookings/my  (Student)
// ============================================================
exports.getMyBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status } = req.query;

  const filter = { student: req.user._id };
  if (status) filter.status = status.toUpperCase();

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .populate('listing', 'title address photos city')
      .populate('owner', 'firstName lastName phone')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
  ]);

  sendSuccess(res, 200, { total, page, limit, bookings });
});

// ============================================================
// GET /api/v1/bookings/owner  (Owner)
// ============================================================
exports.getOwnerBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { status } = req.query;

  const filter = { owner: req.user._id };
  if (status) filter.status = status.toUpperCase();

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .populate('listing', 'title address')
      .populate('student', 'firstName lastName email phone avatarUrl studentProfile')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
  ]);

  sendSuccess(res, 200, { total, page, limit, bookings });
});

// ============================================================
// GET /api/v1/bookings/:id
// ============================================================
exports.getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('listing', 'title address photos city university')
    .populate('student', 'firstName lastName email phone avatarUrl')
    .populate('owner', 'firstName lastName email phone');

  if (!booking) throw new AppError('Booking not found.', 404);

  // Only the student or owner of this booking can view it
  const isStudent = booking.student._id.toString() === req.user._id.toString();
  const isOwner   = booking.owner._id.toString()   === req.user._id.toString();
  if (!isStudent && !isOwner && req.user.role !== 'ADMIN') throw new AppError('Forbidden.', 403);

  sendSuccess(res, 200, booking);
});

// ============================================================
// PATCH /api/v1/bookings/:id/confirm  (Owner)
// ============================================================
exports.confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('student', 'firstName email')
    .populate('listing', 'title');

  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.owner.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);
  if (booking.status !== 'PENDING') throw new AppError(`Cannot confirm a booking with status: ${booking.status}`, 400);

  // Update booking status
  booking.status      = 'CONFIRMED';
  booking.confirmedAt = new Date();
  await booking.save();

  // Decrement available slot count on the listing
  await Listing.updateOne(
    { _id: booking.listing._id, 'roomTypes._id': booking.roomTypeId },
    { $inc: { 'roomTypes.$.availableNow': -1 } }
  );

  // Notify student
  await createNotification(Notification, {
    userId: booking.student._id,
    type:   'BOOKING_CONFIRMED',
    title:  'Booking Confirmed! 🎉',
    body:   `Your booking for "${booking.listing.title}" has been confirmed!`,
    data:   { bookingId: booking._id }
  });

  try {
    const { subject, html } = emailTemplates.bookingConfirmed(
      booking.student.firstName,
      booking.listing.title,
      booking.moveInDate.toLocaleDateString('en-LK'),
      booking.advanceAmount
    );
    await sendEmail({ to: booking.student.email, subject, html });
  } catch (e) { console.error('Confirmation email failed:', e.message); }

  sendSuccess(res, 200, booking, 'Booking confirmed.');
});

// ============================================================
// PATCH /api/v1/bookings/:id/cancel  (Student or Owner)
// ============================================================
exports.cancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) throw new AppError('Booking not found.', 404);

  const isStudent = booking.student.toString() === req.user._id.toString();
  const isOwner   = booking.owner.toString()   === req.user._id.toString();
  if (!isStudent && !isOwner) throw new AppError('Forbidden.', 403);

  if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
    throw new AppError(`Booking is already ${booking.status.toLowerCase()}.`, 400);
  }

  // If we're cancelling a confirmed booking, give the slot back
  if (booking.status === 'CONFIRMED') {
    await Listing.updateOne(
      { _id: booking.listing, 'roomTypes._id': booking.roomTypeId },
      { $inc: { 'roomTypes.$.availableNow': 1 } }
    );
  }

  booking.status      = 'CANCELLED';
  booking.cancelledAt = new Date();
  booking.cancelReason = reason || 'No reason provided.';
  await booking.save();

  // Notify the other party
  const notifyUserId = isStudent ? booking.owner : booking.student;
  await createNotification(Notification, {
    userId: notifyUserId,
    type:   'BOOKING_CANCELLED',
    title:  'Booking Cancelled',
    body:   `A booking has been cancelled. Reason: ${booking.cancelReason}`,
    data:   { bookingId: booking._id }
  });

  sendSuccess(res, 200, booking, 'Booking cancelled.');
});
