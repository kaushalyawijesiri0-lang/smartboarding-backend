// ============================================================
// src/routes/notification.routes.js
// ============================================================
const express = require('express');
const router  = express.Router();
const { notifCtrl } = require('../controllers/extra.controllers');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/',                 notifCtrl.getAll);
router.get('/unread-count',     notifCtrl.getUnreadCount);
router.patch('/:id/read',       notifCtrl.markRead);
router.patch('/read-all',       notifCtrl.markAllRead);
router.delete('/:id',           notifCtrl.deleteNotification);

module.exports = router;
