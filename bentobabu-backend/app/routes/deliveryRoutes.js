const express = require('express');
const router = express.Router();

const DeliveryController = require('../controllers/deliveryController');

// Public delivery serviceability routes
router.get('/config', DeliveryController.getDeliveryConfig);
router.get('/serviceability', DeliveryController.checkServiceability);
router.get('/slots', DeliveryController.getAvailableSlots);

module.exports = router;

