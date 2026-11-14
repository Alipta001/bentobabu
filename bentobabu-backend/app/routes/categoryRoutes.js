const express = require('express');
const router = express.Router();

const CategoryController = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Public category routes
router.get('/', CategoryController.getCategories);
router.get('/:slug', CategoryController.getCategoryBySlug);

// Admin-protected category routes
router.post('/', authenticate, authorize('ADMIN'), CategoryController.createCategory);
router.patch('/:id', authenticate, authorize('ADMIN'), CategoryController.updateCategory);
router.patch('/:id/status', authenticate, authorize('ADMIN'), CategoryController.updateCategoryStatus);

module.exports = router;

