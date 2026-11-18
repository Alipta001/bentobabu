const express = require('express');
const router = express.Router();
const AdminReviewController = require('../controllers/adminReviewController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Protect all admin review routes
router.use(authenticate, authorize('ADMIN'));

// Stats
router.get('/stats', AdminReviewController.getStats);

// Review Management
router.get('/', AdminReviewController.getAllReviews);
router.patch('/:id/status', AdminReviewController.updateStatus);
router.delete('/:id', AdminReviewController.deleteReview);

module.exports = router;
