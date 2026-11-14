const express = require('express');
const router = express.Router();
const AdminNotificationController = require('../controllers/adminNotificationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', AdminNotificationController.getNotifications);
router.get('/stats', AdminNotificationController.getNotificationStats);
router.get('/:id', AdminNotificationController.getNotificationById);
router.post('/:id/retry', AdminNotificationController.retryNotification);

module.exports = router;

