// ============================================================
// src/routes/admin.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { adminCtrl } = require('../controllers/extra.controllers');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require ADMIN role
router.use(protect, authorize('ADMIN'));

router.get('/stats',                      adminCtrl.getPlatformStats);
router.get('/users',                      adminCtrl.getUsers);
router.patch('/users/:id/status',         adminCtrl.toggleUserStatus);
router.patch('/owners/:id/verify',        adminCtrl.verifyOwner);
router.get('/listings',                   adminCtrl.getListings);
router.patch('/listings/:id/status',      adminCtrl.toggleListingStatus);
router.get('/reviews',                    adminCtrl.getReviews);
router.patch('/reviews/:id/approve',      adminCtrl.approveReview);

module.exports = router;
