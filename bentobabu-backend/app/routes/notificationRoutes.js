const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const PushNotificationController = require('../controllers/pushNotificationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { pushTestRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// Push Notification Device Registration & Management (Admin & Kitchen)
router.post(
  '/push/register',
  authorize('ADMIN', 'KITCHEN'),
  PushNotificationController.registerDevice
);
router.delete('/push/unregister', PushNotificationController.unregisterDevice);
router.get('/push/devices', PushNotificationController.getRegisteredDevices);
router.post(
  '/push/test',
  authorize('ADMIN', 'KITCHEN'),
  pushTestRateLimiter,
  PushNotificationController.sendTestNotification
);

// Standard Notifications & Preferences
router.get('/', NotificationController.getNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/read-all', NotificationController.markAllAsRead);
router.patch('/:id/read', NotificationController.markAsRead);
router.get('/preferences', NotificationController.getPreferences);
router.patch('/preferences', NotificationController.updatePreferences);
router.put('/preferences', NotificationController.updatePreferences);

module.exports = router;

