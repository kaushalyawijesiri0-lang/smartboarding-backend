// ============================================================
// src/routes/review.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/review.controller');
const { protect, authorize } = require('../middleware/auth');

// Public
router.get('/listing/:listingId',         ctrl.getListingReviews);
router.get('/listing/:listingId/summary', ctrl.getReviewSummary);

// Protected
router.use(protect);
router.post('/',                authorize('STUDENT'), ctrl.createReview);
router.post('/:id/helpful',     authorize('STUDENT'), ctrl.markHelpful);
router.delete('/:id',                                 ctrl.deleteReview);

module.exports = router;
