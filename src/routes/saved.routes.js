// ============================================================
// src/routes/saved.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { savedCtrl } = require('../controllers/extra.controllers');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('STUDENT'));

router.get('/',                     savedCtrl.getSaved);
router.post('/:listingId',          savedCtrl.saveListing);
router.delete('/:listingId',        savedCtrl.unsaveListing);

module.exports = router;
