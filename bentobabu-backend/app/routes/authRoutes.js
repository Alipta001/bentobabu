const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { authRateLimiter, refreshRateLimiter } = require('../middleware/rateLimiter');
const { getCsrfTokenHandler } = require('../middleware/csrfMiddleware');

// CSRF Token generation
router.get('/csrf-token', getCsrfTokenHandler);

// Public authentication routes
router.post('/register', authRateLimiter, AuthController.register);
router.post('/login', authRateLimiter, AuthController.login);
router.post('/refresh', refreshRateLimiter, AuthController.refresh);
router.post('/logout', AuthController.logout);

// Protected routes (require valid JWT access token)
router.post('/logout-all', authenticate, AuthController.logoutAll);
router.get('/me', authenticate, AuthController.getMe);
router.patch('/profile', authenticate, AuthController.updateProfile);

// RBAC Role Verification Test Route
const { authorize } = require('../middleware/authMiddleware');
router.get('/admin-test', authenticate, authorize('ADMIN'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin access granted',
  });
});

module.exports = router;
