// ============================================================
// src/controllers/review.controller.js
// ============================================================

const { Review, Listing, Booking } = require('../models');
const { AppError, asyncHandler, sendSuccess, getPagination } = require('../utils/apiHelpers');

// ── Helper: recalculate avg rating for a listing ────────
const recalcRating = async (listingId) => {
  const stats = await Review.aggregate([
    { $match: { listing: listingId, isApproved: true } },
    { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const data = stats[0] || { avgRating: 0, count: 0 };
  await Listing.findByIdAndUpdate(listingId, {
    avgRating:    Math.round(data.avgRating * 10) / 10,
    totalReviews: data.count
  });
};

// ============================================================
// GET /api/v1/reviews/listing/:listingId
// ============================================================
exports.getListingReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { listing: req.params.listingId, isApproved: true };

  const [total, reviews] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter)
      .populate('student', 'firstName lastName avatarUrl studentProfile')
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
  ]);

  sendSuccess(res, 200, { total, page, limit, reviews });
});

// ============================================================
// GET /api/v1/reviews/listing/:listingId/summary
// ============================================================
exports.getReviewSummary = asyncHandler(async (req, res) => {
  const listingId = new (require('mongoose').Types.ObjectId)(req.params.listingId);

  const stats = await Review.aggregate([
    { $match: { listing: listingId, isApproved: true } },
    { $group: {
      _id:          null,
      avgRating:    { $avg: '$rating' },
      avgClean:     { $avg: '$ratingClean' },
      avgLocation:  { $avg: '$ratingLocation' },
      avgValue:     { $avg: '$ratingValue' },
      avgOwner:     { $avg: '$ratingOwner' },
      total:        { $sum: 1 },
      // Count per star rating
      five:   { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      four:   { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
      three:  { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
      two:    { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
      one:    { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
    }}
  ]);

  sendSuccess(res, 200, stats[0] || {});
});

// ============================================================
// POST /api/v1/reviews  (Student — must have COMPLETED booking)
// ============================================================
exports.createReview = asyncHandler(async (req, res) => {
  const { listingId, bookingId, rating, ratingClean, ratingLocation,
          ratingValue, ratingOwner, comment, roomType, stayDuration } = req.body;

  // 1. Verify the booking exists, belongs to this student, and is completed
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found.', 404);
  if (booking.student.toString() !== req.user._id.toString()) throw new AppError('Forbidden.', 403);
  if (booking.status !== 'COMPLETED') throw new AppError('You can only review after your stay is completed.', 400);
  if (booking.listing.toString() !== listingId) throw new AppError('Booking does not match listing.', 400);

  // 2. Check if they already reviewed this booking
  const existing = await Review.findOne({ booking: bookingId });
  if (existing) throw new AppError('You have already submitted a review for this booking.', 409);

  // 3. Create review
  const review = await Review.create({
    listing:  listingId,
    booking:  bookingId,
    student:  req.user._id,
    rating:   parseInt(rating),
    ratingClean, ratingLocation, ratingValue, ratingOwner,
    comment, roomType, stayDuration
  });

  // 4. Recalculate listing avg rating
  await recalcRating(new (require('mongoose').Types.ObjectId)(listingId));

  sendSuccess(res, 201, review, 'Review submitted. Thank you!');
});

// ============================================================
// POST /api/v1/reviews/:id/helpful  (Student)
// ============================================================
exports.markHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { $inc: { helpfulCount: 1 } },
    { new: true }
  );
  if (!review) throw new AppError('Review not found.', 404);
  sendSuccess(res, 200, { helpfulCount: review.helpfulCount });
});

// ============================================================
// DELETE /api/v1/reviews/:id  (Student — own review)
// ============================================================
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new AppError('Review not found.', 404);
  if (review.student.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
    throw new AppError('Forbidden.', 403);
  }

  const listingId = review.listing;
  await review.deleteOne();
  await recalcRating(listingId);

  sendSuccess(res, 200, {}, 'Review deleted.');
});
