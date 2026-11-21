const express = require('express');
const router = express.Router();
const InventoryController = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

// Daily Capacity and Restocking Management
router.get('/daily', InventoryController.getDailyInventory);
router.post('/daily/set-capacity', InventoryController.setDailyCapacity);
router.post('/daily/restock', InventoryController.restockDailyItem);
router.post('/daily/toggle-availability', InventoryController.toggleDailyAvailability);
router.get('/daily/:productId/history', InventoryController.getDailyRestockHistory);

router.get('/', InventoryController.getInventory);
router.get('/low-stock', InventoryController.getLowStock);
router.get('/out-of-stock', InventoryController.getOutOfStock);
router.get('/:productId', InventoryController.getProductStockDetails);
router.post('/:productId/adjust', InventoryController.adjustStock);
router.get('/:productId/history', InventoryController.getInventoryHistory);

module.exports = router;

