// ============================================================
// src/routes/listing.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/listing.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadListingPhoto } = require('../config/cloudinary');

// ── Public routes ──────────────────────────────────────
router.get('/',          ctrl.searchListings);
router.get('/featured',  ctrl.getFeatured);
router.get('/stats',     ctrl.getStats);
router.get('/:id',       ctrl.getListingById);

// ── Protected: Owner only ──────────────────────────────
router.use(protect);

router.get('/my/listings',                 authorize('OWNER'), ctrl.getMyListings);
router.post('/',                           authorize('OWNER'), ctrl.createListing);
router.put('/:id',                         authorize('OWNER'), ctrl.updateListing);
router.delete('/:id',                      authorize('OWNER'), ctrl.deleteListing);
router.patch('/:id/availability',          authorize('OWNER'), ctrl.toggleAvailability);

// Photo routes
router.post('/:id/photos',
  authorize('OWNER'),
  uploadListingPhoto.single('photo'),   // 'photo' = the form field name
  ctrl.uploadPhoto
);
router.delete('/:listingId/photos/:photoId', authorize('OWNER'), ctrl.deletePhoto);

module.exports = router;
