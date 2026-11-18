const express = require('express');
const router = express.Router();
const SupportController = require('../controllers/supportController');
const { authenticate } = require('../middleware/authMiddleware');
const { supportTicketRateLimiter } = require('../middleware/rateLimiter');
const { documentUploadMiddleware } = require('../utils/documentUploader');

// 1. Public Configuration & FAQs
router.get('/config', SupportController.getSupportConfig);
router.get('/faqs', SupportController.getFaqs);

// 2. Authenticated Customer Ticket Operations
router.post(
  '/upload',
  authenticate,
  supportTicketRateLimiter,
  documentUploadMiddleware.single('file'),
  SupportController.uploadAttachment
);

router.post(
  '/tickets',
  authenticate,
  supportTicketRateLimiter,
  SupportController.createTicket
);

router.get(
  '/tickets',
  authenticate,
  SupportController.getMyTickets
);

router.get(
  '/tickets/:id',
  authenticate,
  SupportController.getTicketById
);

router.post(
  '/tickets/:id/messages',
  authenticate,
  supportTicketRateLimiter,
  SupportController.replyToTicket
);

module.exports = router;
