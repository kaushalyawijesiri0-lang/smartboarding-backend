// ============================================================
// src/routes/booking.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/booking.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);   // All booking routes require login

router.post('/',                    authorize('STUDENT'),       ctrl.createBooking);
router.get('/my',                   authorize('STUDENT'),       ctrl.getMyBookings);
router.get('/owner',                authorize('OWNER'),         ctrl.getOwnerBookings);
router.get('/:id',                                              ctrl.getBookingById);
router.patch('/:id/confirm',        authorize('OWNER'),         ctrl.confirmBooking);
router.patch('/:id/cancel',                                     ctrl.cancelBooking);

module.exports = router;
