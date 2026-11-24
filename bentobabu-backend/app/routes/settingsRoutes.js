const express = require('express');
const router = express.Router();
const SettingsController = require('../controllers/settingsController');

// Public read-only ordering availability status endpoint
router.get('/ordering-status', SettingsController.getOrderingStatus);

// Public read-only brand & business settings endpoint
router.get('/public', SettingsController.getPublicSettings);
router.get('/brand', SettingsController.getPublicSettings);

module.exports = router;
