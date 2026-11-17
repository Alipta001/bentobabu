const express = require('express');
const router = express.Router();
const AdminDeliveryApplicationController = require('../controllers/adminDeliveryApplicationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Secure all admin delivery application routes with ADMIN role check
router.use(authenticate, authorize('ADMIN'));

// List applications with stats, filters, and pagination
router.get('/', AdminDeliveryApplicationController.listApplications);

// Get single application
router.get('/:id', AdminDeliveryApplicationController.getApplicationById);

// Get short-lived signed URL for KYC document
router.get('/:id/documents/:documentKey', AdminDeliveryApplicationController.getDocumentSignedUrl);

// Approve application
router.post('/:id/approve', AdminDeliveryApplicationController.approveApplication);

// Reject application with mandatory reason
router.post('/:id/reject', AdminDeliveryApplicationController.rejectApplication);

// Request corrections from applicant
router.post('/:id/request-corrections', AdminDeliveryApplicationController.requestCorrections);

// Suspend partner
router.post('/:id/suspend', AdminDeliveryApplicationController.suspendPartner);

module.exports = router;
