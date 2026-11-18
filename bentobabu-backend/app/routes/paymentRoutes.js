const express = require('express');
const PaymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Razorpay checkout endpoints
router.post(
  '/razorpay/create-order',
  authenticate,
  authorize('CUSTOMER'),
  PaymentController.createRazorpayOrder
);

router.post(
  '/razorpay/verify',
  authenticate,
  authorize('CUSTOMER'),
  PaymentController.verifyRazorpayPayment
);

// Public Razorpay Webhook
router.post(
  '/razorpay/webhook',
  PaymentController.handleRazorpayWebhook
);

// Cash on Delivery confirmation
router.post(
  '/cod/confirm',
  authenticate,
  authorize('CUSTOMER'),
  PaymentController.confirmCodOrder
);

// Payment information query
router.get(
  '/:orderId',
  authenticate,
  PaymentController.getPaymentInfo
);

// Admin: Retry failed refund
router.post(
  '/:orderId/retry-refund',
  authenticate,
  authorize('ADMIN'),
  PaymentController.retryRefund
);

module.exports = router;

