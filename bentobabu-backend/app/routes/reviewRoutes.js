const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/authMiddleware');
const { documentUploadMiddleware } = require('../utils/documentUploader');

// 1. Public Review Browsing
router.get('/product/:productId', ReviewController.getProductReviews);

// 2. Authenticated Customer Review Operations
router.get('/eligibility/:productId', authenticate, ReviewController.checkEligibility);
router.get('/my', authenticate, ReviewController.getMyReviews);

router.post(
  '/upload-image',
  authenticate,
  documentUploadMiddleware.single('image'),
  ReviewController.uploadReviewImage
);

router.post('/', authenticate, ReviewController.createReview);
router.put('/:id', authenticate, ReviewController.updateReview);

module.exports = router;
