/**
 * BentoBabu Admin Video Content Management Routes
 * Protected endpoints for creating, editing, and curating YouTube video content.
 * All routes require authentication and ADMIN role.
 */

const express = require('express');
const router = express.Router();
const VideoController = require('../controllers/videoController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Enforce authentication & ADMIN role across all admin video routes
router.use(authenticate, authorize('ADMIN'));

router.post('/', VideoController.createVideo);
router.get('/', VideoController.getAdminVideos);
router.get('/:id', VideoController.getAdminVideoById);
router.patch('/:id', VideoController.updateVideo);
router.delete('/:id', VideoController.deleteVideo);
router.patch('/:id/status', VideoController.updateVideoStatus);

module.exports = router;
