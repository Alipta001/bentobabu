const express = require('express');
const router = express.Router();
const AdminDashboardController = require('../controllers/adminDashboardController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/overview', AdminDashboardController.getOverview);
router.get('/revenue', AdminDashboardController.getRevenue);
router.get('/orders', AdminDashboardController.getOrders);
router.get('/products', AdminDashboardController.getProducts);
router.get('/customers', AdminDashboardController.getCustomers);

module.exports = router;

