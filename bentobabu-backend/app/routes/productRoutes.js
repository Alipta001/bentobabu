const express = require('express');
const router = express.Router();

const ProductController = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Public product routes (Note: /featured must precede /:slug to prevent routing collision)
router.get('/', ProductController.getProducts);
router.get('/featured', ProductController.getFeaturedProducts);
router.get('/:slug', ProductController.getProductBySlug);

// Admin-protected product routes
router.post('/', authenticate, authorize('ADMIN'), ProductController.createProduct);
router.patch('/:id', authenticate, authorize('ADMIN'), ProductController.updateProduct);
router.patch('/:id/status', authenticate, authorize('ADMIN'), ProductController.updateProductStatus);
router.patch('/:id/availability', authenticate, authorize('ADMIN'), ProductController.updateProductAvailability);
router.patch('/:id/stock', authenticate, authorize('ADMIN'), ProductController.updateProductStock);
router.delete('/:id', authenticate, authorize('ADMIN'), ProductController.deleteProduct);

module.exports = router;

