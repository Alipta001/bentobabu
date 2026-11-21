const express = require('express');
const router = express.Router();
const ServiceExpansionController = require('../controllers/serviceExpansionController');
const { optionalAuthenticate } = require('../middleware/authMiddleware');

// Customer: Submit a vote for expanding BentoBabu to their location
// optionalAuthenticate allows both logged in users and guests to vote
router.post('/vote', optionalAuthenticate, ServiceExpansionController.vote);

module.exports = router;
