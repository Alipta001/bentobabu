const express = require('express');
const router = express.Router();

const AddressController = require('../controllers/addressController');
const { authenticate } = require('../middleware/authMiddleware');

// All address routes are customer-protected
router.use(authenticate);

router.post('/', AddressController.createAddress);
router.get('/', AddressController.getAddresses);
router.get('/:id', AddressController.getAddressById);
router.patch('/:id', AddressController.updateAddress);
router.patch('/:id/default', AddressController.setDefaultAddress);
router.delete('/:id', AddressController.deleteAddress);

module.exports = router;

