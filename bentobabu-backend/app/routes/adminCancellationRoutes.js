const express = require('express');
const router = express.Router();
const CancellationController = require('../controllers/cancellationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

router.use(authenticate, authorize('ADMIN'));

router.get('/', CancellationController.getAdminCancellationRequests);
router.get('/:id', CancellationController.getAdminCancellationRequestById);
router.post('/:id/approve', CancellationController.approveCancellationRequest);
router.post('/:id/reject', CancellationController.rejectCancellationRequest);
router.post('/:id/retry-refund', CancellationController.retryRefund);

module.exports = router;
