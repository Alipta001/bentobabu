/**
 * BentoBabu Admin Media Routes
 * Endpoints for Cloudinary image uploads and Cloudflare R2 video management.
 * All routes require authentication and ADMIN role.
 */

const express = require('express');
const router = express.Router();
const MediaController = require('../controllers/mediaController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { mediaUploadRateLimiter } = require('../middleware/rateLimiter');
const { upload } = require('../utils/imageOptimizer');

// Protect all media endpoints with Admin authorization
router.use(authenticate, authorize('ADMIN'));

// Image routes (Cloudinary)
router.post('/images/upload', mediaUploadRateLimiter, upload.single('file'), MediaController.uploadImage);
router.post('/images/bulk', mediaUploadRateLimiter, upload.array('files', 4), MediaController.uploadImagesBulk);
router.delete('/images/:id', MediaController.deleteImage);

// Video routes (Cloudflare R2 Direct Upload & Lifecycle)
router.post('/videos/initialize', mediaUploadRateLimiter, MediaController.initializeVideoUpload);
router.post('/videos/confirm', MediaController.confirmVideoUpload);
router.delete('/videos/:id', MediaController.deleteVideo);

// Media catalog, storage usage & maintenance
router.get('/', MediaController.listMedia);
router.get('/usage', MediaController.getMediaUsage);
router.post('/cleanup-abandoned', MediaController.cleanupAbandonedUploads);

module.exports = router;
