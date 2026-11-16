const express = require('express');
const router = express.Router();
const AdminDeliveryOperationsController = require('../controllers/adminDeliveryOperationsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All delivery operations endpoints require an authenticated ADMIN
router.use(authenticate, authorize('ADMIN'));

router.get('/overview', AdminDeliveryOperationsController.getOverviewStats);
router.get('/partners', AdminDeliveryOperationsController.getPartnersList);
router.get('/partners/:id', AdminDeliveryOperationsController.getPartnerDetails);
router.patch('/partners/:id/status', AdminDeliveryOperationsController.updatePartnerStatus);

module.exports = router;
