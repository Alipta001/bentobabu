const mongoose = require('mongoose');
const { CancellationRequest, Order } = require('../models');
const CancellationService = require('../services/cancellationService');

class CancellationController {
  /**
   * CUSTOMER: Submit cancellation request for an eligible order
   * POST /api/v1/orders/:id/cancel-request
   */
  static async createRequest(req, res, next) {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;

      const cancellationRequest = await CancellationService.createCancellationRequest({
        orderId,
        customerId: req.user._id || req.user.id,
        reason,
      });

      return res.status(201).json({
        success: true,
        message: 'Cancellation request submitted successfully and is awaiting review.',
        data: { cancellationRequest },
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * CUSTOMER / ADMIN: Get cancellation request for an order
   * GET /api/v1/orders/:id/cancel-request
   */
  static async getOrderCancellationRequest(req, res, next) {
    try {
      const orderId = req.params.id;
      if (!orderId || !mongoose.isValidObjectId(orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order ID format' });
      }

      const query = { order: orderId };
      // If customer, ensure the order belongs to them
      if (req.user.role === 'CUSTOMER') {
        const order = await Order.findOne({ _id: orderId, user: req.user._id || req.user.id });
        if (!order) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
      }

      const cancellationRequest = await CancellationRequest.findOne(query)
        .sort({ createdAt: -1 })
        .populate('customer', 'name email phone')
        .populate('reviewedBy', 'name email')
        .lean();

      return res.status(200).json({
        success: true,
        data: { cancellationRequest: cancellationRequest || null },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: List cancellation requests with filters and pagination
   * GET /api/v1/admin/cancellation-requests
   */
  static async getAdminCancellationRequests(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        status = 'ALL',
        orderNumber,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};
      const statusUpper = String(status).toUpperCase();
      if (['PENDING', 'APPROVED', 'REJECTED'].includes(statusUpper)) {
        filter.status = statusUpper;
      }

      // If filtering by orderNumber, lookup order IDs first
      if (orderNumber && typeof orderNumber === 'string' && orderNumber.trim()) {
        const matchedOrders = await Order.find(
          { orderNumber: { $regex: orderNumber.trim(), $options: 'i' } },
          { _id: 1 }
        ).lean();
        const matchedIds = matchedOrders.map((o) => o._id);
        filter.order = { $in: matchedIds };
      }

      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [requests, total, pendingCount] = await Promise.all([
        CancellationRequest.find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .populate('order', 'orderNumber orderStatus paymentStatus paymentMethod grandTotal total items deliverySlot createdAt paymentDetails')
          .populate('customer', 'name email phone')
          .populate('reviewedBy', 'name email')
          .lean(),
        CancellationRequest.countDocuments(filter),
        CancellationRequest.countDocuments({ status: 'PENDING' }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          requests,
          cancellationRequests: requests,
          total,
          count: requests.length,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum) || 1,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1,
          },
          pendingCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get single cancellation request details
   * GET /api/v1/admin/cancellation-requests/:id
   */
  static async getAdminCancellationRequestById(req, res, next) {
    try {
      const { id } = req.params;
      if (!id || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({ success: false, message: 'Invalid cancellation request ID format' });
      }

      const cancellationRequest = await CancellationRequest.findById(id)
        .populate('order')
        .populate('customer', 'name email phone')
        .populate('reviewedBy', 'name email')
        .lean();

      if (!cancellationRequest) {
        return res.status(404).json({ success: false, message: 'Cancellation request not found' });
      }

      return res.status(200).json({
        success: true,
        data: { cancellationRequest },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Approve cancellation request
   * POST /api/v1/admin/cancellation-requests/:id/approve
   */
  static async approveCancellationRequest(req, res, next) {
    try {
      const { id } = req.params;

      const result = await CancellationService.approveCancellationRequest({
        requestId: id,
        adminUser: req.user,
      });

      return res.status(200).json({
        success: true,
        message: 'Cancellation request approved successfully and order cancelled.',
        data: result,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * ADMIN: Reject cancellation request
   * POST /api/v1/admin/cancellation-requests/:id/reject
   */
  static async rejectCancellationRequest(req, res, next) {
    try {
      const { id } = req.params;
      const { rejectionReason } = req.body;

      const cancellationRequest = await CancellationService.rejectCancellationRequest({
        requestId: id,
        adminUser: req.user,
        rejectionReason,
      });

      return res.status(200).json({
        success: true,
        message: 'Cancellation request rejected successfully.',
        data: { cancellationRequest },
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * ADMIN: Retry failed refund
   * POST /api/v1/admin/cancellation-requests/:id/retry-refund
   */
  static async retryRefund(req, res, next) {
    try {
      const { id } = req.params;

      const result = await CancellationService.retryRefund({
        requestId: id,
        adminUser: req.user,
      });

      return res.status(200).json({
        success: true,
        message: 'Refund retry executed successfully.',
        data: result,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }
}

module.exports = CancellationController;
