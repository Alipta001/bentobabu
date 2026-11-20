const express = require('express');
const router = express.Router();
const SettingsController = require('../controllers/settingsController');

// Public read-only ordering availability status endpoint
router.get('/ordering-status', SettingsController.getOrderingStatus);

module.exports = router;
