const express = require('express');
const OrderOperationsController = require('../controllers/orderOperationsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Kitchen Operations
router.get(
  '/kitchen/orders',
  authenticate,
  authorize('KITCHEN', 'ADMIN'),
  OrderOperationsController.getKitchenOrders
);

router.patch(
  '/kitchen/orders/:id/status',
  authenticate,
  authorize('KITCHEN', 'ADMIN'),
  OrderOperationsController.updateKitchenStatus
);

// Delivery Operations
router.get(
  '/delivery/orders',
  authenticate,
  authorize('DELIVERY', 'ADMIN'),
  OrderOperationsController.getDeliveryOrders
);

router.patch(
  '/delivery/orders/:id/status',
  authenticate,
  authorize('DELIVERY', 'ADMIN'),
  OrderOperationsController.updateDeliveryStatus
);

router.post(
  '/delivery/orders/:id/collect-cash',
  authenticate,
  authorize('DELIVERY', 'ADMIN'),
  OrderOperationsController.collectCash
);

module.exports = router;

