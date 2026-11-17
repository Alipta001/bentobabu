const express = require('express');
const router = express.Router();
const AdminDeliveryController = require('../controllers/adminDeliveryController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

// Delivery Zones
router.get('/zones', AdminDeliveryController.getZones);
router.post('/zones', AdminDeliveryController.createZone);
router.get('/zones/:id', AdminDeliveryController.getZoneById);
router.put('/zones/:id', AdminDeliveryController.updateZone);
router.put('/zones/:id/status', AdminDeliveryController.updateZoneStatus);
router.delete('/zones/:id', AdminDeliveryController.deleteZone);

// Delivery Slots
router.get('/slots', AdminDeliveryController.getSlots);
router.post('/slots', AdminDeliveryController.createSlot);
router.put('/slots/:id', AdminDeliveryController.updateSlot);
router.put('/slots/:id/status', AdminDeliveryController.updateSlotStatus);

module.exports = router;

