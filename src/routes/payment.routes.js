// ============================================================
// src/routes/payment.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { paymentCtrl } = require('../controllers/extra.controllers');
const { protect, authorize } = require('../middleware/auth');

// Webhook is public — called by payment gateway (no JWT)
router.post('/webhook', paymentCtrl.webhook);

// Protected
router.use(protect);
router.post('/initiate',     authorize('STUDENT'), paymentCtrl.initiate);
router.get('/my',            authorize('STUDENT'), paymentCtrl.getMyPayments);

module.exports = router;
