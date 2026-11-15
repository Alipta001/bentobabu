/**
 * BentoBabu Public Video Discovery Routes
 * Customer-facing endpoints for browsing published YouTube recipe & prep videos.
 */

const express = require('express');
const router = express.Router();
const VideoController = require('../controllers/videoController');

// Public endpoints
// Important: /featured must precede /:slug to prevent slug collision
router.get('/', VideoController.getVideos);
router.get('/featured', VideoController.getFeaturedVideos);
router.get('/:slug', VideoController.getVideoBySlug);

module.exports = router;
