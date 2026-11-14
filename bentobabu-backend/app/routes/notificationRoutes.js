const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', NotificationController.getNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/read-all', NotificationController.markAllAsRead);
router.patch('/:id/read', NotificationController.markAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.patch('/preferences', NotificationController.updatePreferences);

module.exports = router;

