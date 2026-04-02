// ============================================================
// src/routes/university.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { uniCtrl } = require('../controllers/extra.controllers');
const { protect, authorize } = require('../middleware/auth');

router.get('/',        uniCtrl.getAll);
router.get('/:id',     uniCtrl.getById);
router.post('/',       protect, authorize('ADMIN'), uniCtrl.create);
router.put('/:id',     protect, authorize('ADMIN'), uniCtrl.update);

module.exports = router;
