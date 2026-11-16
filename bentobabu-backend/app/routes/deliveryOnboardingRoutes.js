const express = require('express');
const router = express.Router();
const DeliveryOnboardingController = require('../controllers/deliveryOnboardingController');
const { documentUploadMiddleware } = require('../utils/documentUploader');

// 1. Send OTP to applicant email address
router.post('/otp/send', DeliveryOnboardingController.sendOtp);

// 2. Verify email OTP
router.post('/otp/verify', DeliveryOnboardingController.verifyOtp);

// 3. Upload document (JPG/PNG/PDF up to 10MB)
router.post(
  '/upload-document',
  documentUploadMiddleware.single('document'),
  DeliveryOnboardingController.uploadDocument
);

// 4. Submit application
router.post('/submit', DeliveryOnboardingController.submitApplication);

// 5. Check application status
router.get('/status', DeliveryOnboardingController.getApplicationStatus);

module.exports = router;
