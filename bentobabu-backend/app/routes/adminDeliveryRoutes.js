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

// Delivery Schedules (Weekly Recurring & Date-Specific)
router.get('/schedules/weekly', AdminDeliveryController.getWeeklySchedule);
router.put('/schedules/weekly/:dayOfWeek', AdminDeliveryController.updateWeeklySchedule);
router.post('/schedules/weekly/copy', AdminDeliveryController.copyWeeklySchedule);
router.get('/schedules/dates/:date', AdminDeliveryController.getDateSchedule);
router.put('/schedules/dates/:date', AdminDeliveryController.updateDateSchedule);
router.delete('/schedules/dates/:date', AdminDeliveryController.restoreWeeklySchedule);

// Delivery Slots (Materialized)
router.get('/slots', AdminDeliveryController.getSlots);
router.post('/slots', AdminDeliveryController.createSlot);
router.put('/slots/:id', AdminDeliveryController.updateSlot);
router.put('/slots/:id/status', AdminDeliveryController.updateSlotStatus);
router.delete('/slots/:id', AdminDeliveryController.deleteSlot);

module.exports = router;

