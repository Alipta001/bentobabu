const express = require('express');
const router = express.Router();
const AdminSettingsController = require('../controllers/adminSettingsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', AdminSettingsController.getSettings);
router.put('/', AdminSettingsController.updateSettings);

module.exports = router;

