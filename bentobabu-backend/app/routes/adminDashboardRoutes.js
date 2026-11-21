const express = require('express');
const router = express.Router();
const AdminDashboardController = require('../controllers/adminDashboardController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// All admin dashboard analytics endpoints require ADMIN authentication and role
router.use(authenticate, authorize('ADMIN'));

router.get('/overview', AdminDashboardController.getOverview);
router.get('/revenue', AdminDashboardController.getRevenue);
router.get('/orders', AdminDashboardController.getOrders);
router.get('/products', AdminDashboardController.getProducts);
router.get('/customers', AdminDashboardController.getCustomers);
router.get('/locations', AdminDashboardController.getLocations);
router.get('/payments', AdminDashboardController.getPayments);
router.get('/delivery', AdminDashboardController.getDelivery);
router.get('/peak-hours', AdminDashboardController.getPeakHours);

module.exports = router;
