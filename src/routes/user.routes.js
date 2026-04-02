// ============================================================
// src/routes/user.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadAvatar } = require('../config/cloudinary');

// All user routes require login
router.use(protect);

router.get('/me',                      ctrl.getMe);
router.put('/me',                      ctrl.updateMe);
router.put('/me/student-profile',      ctrl.updateStudentProfile);
router.put('/me/owner-profile',        ctrl.updateOwnerProfile);
router.post('/me/avatar', uploadAvatar.single('avatar'), ctrl.uploadAvatar);

// Owner dashboard stats
router.get('/owner/dashboard', authorize('OWNER'), ctrl.ownerDashboardStats);

module.exports = router;
