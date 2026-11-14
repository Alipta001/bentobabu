const express = require('express');
const CouponController = require('../controllers/couponController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Customer coupon validation (must precede dynamic /:id parameter)
router.post(
  '/validate',
  authenticate,
  authorize('CUSTOMER'),
  CouponController.validateCoupon
);

// Admin coupon management
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  CouponController.createCoupon
);

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  CouponController.getCoupons
);

router.get(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  CouponController.getCouponById
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  CouponController.updateCoupon
);

router.patch(
  '/:id/status',
  authenticate,
  authorize('ADMIN'),
  CouponController.updateCouponStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  CouponController.deleteCoupon
);

module.exports = router;

