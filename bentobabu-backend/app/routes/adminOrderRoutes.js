const express = require('express');
const router = express.Router();
const AdminOrderController = require('../controllers/adminOrderController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', AdminOrderController.getOrders);
router.get('/:id', AdminOrderController.getOrderById);
router.get('/:id/history', AdminOrderController.getOrderHistory);
router.put('/:id/assign-delivery', AdminOrderController.assignDeliveryPartner);

module.exports = router;

