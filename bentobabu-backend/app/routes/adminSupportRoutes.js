const express = require('express');
const router = express.Router();
const AdminSupportController = require('../controllers/adminSupportController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Protect all admin support routes
router.use(authenticate, authorize('ADMIN'));

// Stats
router.get('/stats', AdminSupportController.getStats);

// Ticket Management
router.get('/tickets', AdminSupportController.getAllTickets);
router.get('/tickets/:id', AdminSupportController.getTicketById);
router.post('/tickets/:id/messages', AdminSupportController.addMessage);
router.patch('/tickets/:id/status', AdminSupportController.updateStatus);
router.patch('/tickets/:id/assign', AdminSupportController.assignTicket);

// FAQ Management
router.get('/faqs', AdminSupportController.getAllFaqs);
router.post('/faqs', AdminSupportController.createFaq);
router.patch('/faqs/:id', AdminSupportController.updateFaq);
router.delete('/faqs/:id', AdminSupportController.deleteFaq);

module.exports = router;
