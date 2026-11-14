const express = require('express');
const router = express.Router();
const AdminUserController = require('../controllers/adminUserController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', AdminUserController.getUsers);
router.post('/', AdminUserController.createUser);
router.get('/:id', AdminUserController.getUserById);
router.put('/:id/status', AdminUserController.updateUserStatus);
router.put('/:id/role', AdminUserController.updateUserRole);

module.exports = router;

