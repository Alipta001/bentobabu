const express = require('express');
const router = express.Router();
const DeliveryPresenceController = require('../controllers/deliveryPresenceController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All presence endpoints require an authenticated DELIVERY partner
router.use(authenticate, authorize('DELIVERY'));

router.get('/me', DeliveryPresenceController.getMyPresence);
router.patch('/availability', DeliveryPresenceController.updateAvailability);
router.post('/heartbeat', DeliveryPresenceController.heartbeat);
router.post('/location', DeliveryPresenceController.updateLocation);

module.exports = router;
