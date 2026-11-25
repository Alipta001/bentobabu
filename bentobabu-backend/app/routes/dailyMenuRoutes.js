const express = require('express');
const DailyMenuController = require('../controllers/dailyMenuController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Public / Customer endpoint: fetch daily menu availability for a date (defaults to today)
router.get('/daily', DailyMenuController.getDailyMenu);

// Admin-only Daily Menu endpoints
router.post('/daily', authenticate, authorize('ADMIN'), DailyMenuController.saveDailyMenu);
router.patch('/daily/item', authenticate, authorize('ADMIN'), DailyMenuController.toggleDailyMenuItem);
router.post('/daily/continue-yesterday', authenticate, authorize('ADMIN'), DailyMenuController.continueYesterday);

// Admin-only Weekly Menu endpoints
router.get('/weekly', authenticate, authorize('ADMIN'), DailyMenuController.getWeeklyMenu);
router.post('/weekly', authenticate, authorize('ADMIN'), DailyMenuController.saveWeeklyMenu);
router.post('/weekly/apply-all', authenticate, authorize('ADMIN'), DailyMenuController.applyWeekAll);

module.exports = router;
