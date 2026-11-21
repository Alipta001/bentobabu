const express = require('express');
const router = express.Router();
const ServiceExpansionController = require('../controllers/serviceExpansionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All admin service expansion routes require ADMIN authentication and role
router.use(authenticate, authorize('ADMIN'));

router.get('/summary', ServiceExpansionController.getSummary);
router.get('/locations', ServiceExpansionController.getLocations);
router.get('/export', ServiceExpansionController.exportLocations);
router.get('/locations/:id', ServiceExpansionController.getLocationById);
router.patch('/locations/:id/status', ServiceExpansionController.updateLocationStatus);

module.exports = router;
