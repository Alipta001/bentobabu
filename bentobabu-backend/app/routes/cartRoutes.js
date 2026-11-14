const express = require('express');
const router = express.Router();

const CartController = require('../controllers/cartController');
const { authenticate } = require('../middleware/authMiddleware');

// All cart endpoints require customer authentication
router.use(authenticate);

router.get('/', CartController.getCart);
router.post('/merge', CartController.mergeCart);
router.post('/items', CartController.addItem);
router.patch('/items/:productId', CartController.updateItemQuantity);
router.delete('/items/:productId', CartController.removeItem);
router.delete('/', CartController.clearCart);

module.exports = router;

