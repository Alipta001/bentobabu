const express = require('express');
const router = express.Router();
const AdminOrderController = require('../controllers/adminOrderController');
const OrderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', AdminOrderController.getOrders);
router.get('/:id', AdminOrderController.getOrderById);
router.get('/:id/history', AdminOrderController.getOrderHistory);
router.patch('/:id/cancel', AdminOrderController.cancelOrder);
router.put('/:id/assign-delivery', AdminOrderController.assignDeliveryPartner);
router.post('/:id/acknowledge-preparation', AdminOrderController.acknowledgePreparation);
router.patch('/:id/schedule', AdminOrderController.updateOrderSchedule);
router.post('/:id/receipt/regenerate', OrderController.regenerateReceipt);

module.exports = router;

