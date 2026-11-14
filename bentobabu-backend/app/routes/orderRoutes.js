const express = require('express');
const OrderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Specific routes must precede dynamic /:id
router.post(
  '/checkout-summary',
  authenticate,
  authorize('CUSTOMER'),
  OrderController.getCheckoutSummary
);

router.post(
  '/expire-pending',
  authenticate,
  authorize('ADMIN'),
  OrderController.handleExpirePendingOrders
);

router.post(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  OrderController.placeOrder
);

router.get(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  OrderController.getOrders
);

router.get(
  '/:id',
  authenticate,
  OrderController.getOrderById
);

router.patch(
  '/:id/cancel',
  authenticate,
  authorize('CUSTOMER'),
  OrderController.cancelOrder
);

module.exports = router;

