const mongoose = require('mongoose');
const { Order, User } = require('../models');

/**
 * Class-based Controller for Admin Order Management
 */
class AdminOrderController {
  /**
   * GET /api/v1/admin/orders
   * List all orders with comprehensive operational filtering and pagination
   */
  static async getOrders(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        orderNumber,
        customerId,
        orderStatus,
        paymentStatus,
        paymentMethod,
        slotId,
        assignedDeliveryPartner,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};

      if (orderNumber && typeof orderNumber === 'string' && orderNumber.trim()) {
        filter.orderNumber = { $regex: orderNumber.trim(), $options: 'i' };
      }

      if (customerId && mongoose.isValidObjectId(customerId)) {
        filter.user = customerId;
      }

      if (orderStatus && typeof orderStatus === 'string') {
        filter.orderStatus = orderStatus.toUpperCase();
      }

      if (paymentStatus && typeof paymentStatus === 'string') {
        filter.paymentStatus = paymentStatus.toUpperCase();
      }

      if (paymentMethod && typeof paymentMethod === 'string') {
        filter.paymentMethod = paymentMethod.toUpperCase();
      }

      if (slotId && mongoose.isValidObjectId(slotId)) {
        filter.deliverySlot = slotId;
      }

      if (assignedDeliveryPartner && mongoose.isValidObjectId(assignedDeliveryPartner)) {
        filter.assignedDeliveryPartner = assignedDeliveryPartner;
      }

      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }

      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [orders, totalOrders] = await Promise.all([
        Order.find(filter)
          .populate('user', 'name email phone')
          .populate('deliverySlot', 'date label startTime endTime')
          .populate('assignedDeliveryPartner', 'name phone')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Order.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          orders,
          pagination: {
            totalOrders,
            totalPages: Math.ceil(totalOrders / limitNum) || 1,
            currentPage: pageNum,
            limit: limitNum,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/orders/:id
   * Get single order details with snapshots and assignments
   */
  static async getOrderById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format.',
        });
      }

      const order = await Order.findById(id)
        .populate('user', 'name email phone')
        .populate('deliverySlot', 'date label startTime endTime')
        .populate('assignedDeliveryPartner', 'name email phone')
        .populate('statusHistory.changedBy', 'name role')
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/orders/:id/history
   * Get order status transition timeline
   */
  static async getOrderHistory(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format.',
        });
      }

      const order = await Order.findById(id)
        .select('orderNumber statusHistory orderStatus')
        .populate('statusHistory.changedBy', 'name role')
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          currentStatus: order.orderStatus,
          statusHistory: order.statusHistory,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/orders/:id/assign-delivery
   * Assign or reassign a delivery partner to an order
   */
  static async assignDeliveryPartner(req, res, next) {
    try {
      const { id } = req.params;
      const { deliveryPartnerId } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format.',
        });
      }

      if (!mongoose.isValidObjectId(deliveryPartnerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery partner ID format.',
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }

      if (['DELIVERED', 'CANCELLED'].includes(order.orderStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot assign delivery partner to an order that is already ${order.orderStatus}.`,
        });
      }

      const partner = await User.findById(deliveryPartnerId);
      if (!partner || partner.role !== 'DELIVERY' || !partner.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery partner. User must exist, be active, and have the DELIVERY role.',
        });
      }

      order.assignedDeliveryPartner = partner._id;
      order.statusHistory.push({
        status: order.orderStatus,
        changedBy: req.user._id,
        note: `Delivery partner assigned: ${partner.name} (${partner.phone})`,
        changedAt: new Date(),
      });

      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Delivery partner assigned successfully.',
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          assignedDeliveryPartner: {
            id: partner._id,
            name: partner.name,
            phone: partner.phone,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminOrderController;
