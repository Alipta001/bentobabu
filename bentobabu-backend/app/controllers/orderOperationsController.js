const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order } = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { redisDelPattern } = require('../config/redis');

/**
 * Class-based Controller for Kitchen & Delivery Operations
 */
class OrderOperationsController {
  // ==========================================
  // KITCHEN OPERATIONS
  // ==========================================

  /**
   * KITCHEN / ADMIN: View kitchen queue
   * GET /api/v1/operations/kitchen/orders
   */
  static async getKitchenOrders(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
      const skip = (page - 1) * limit;

      const allowedStatuses = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'];
      const query = {};

      if (req.query.status) {
        const requestedStatus = req.query.status.toUpperCase();
        if (allowedStatuses.includes(requestedStatus)) {
          query.orderStatus = requestedStatus;
        } else {
          query.orderStatus = { $in: allowedStatuses };
        }
      } else {
        query.orderStatus = { $in: allowedStatuses };
      }

      const [orders, total] = await Promise.all([
        Order.find(query)
          .sort({ createdAt: 1 }) // FIFO for kitchen queue
          .skip(skip)
          .limit(limit)
          .populate('deliverySlot', 'label startTime endTime date')
          .populate('deliveryZone', 'name estimatedDeliveryMinutes'),
        Order.countDocuments(query),
      ]);

      return res.status(200).json({
        success: true,
        count: orders.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * KITCHEN / ADMIN: Update preparation status
   * PATCH /api/v1/operations/kitchen/orders/:id/status
   */
  static async updateKitchenStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, note } = req.body;

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Target status is required',
        });
      }

      const normalizedStatus = status.toUpperCase();

      // Kitchen role constraints
      if (req.user.role === 'KITCHEN') {
        if (!['PREPARING', 'READY_FOR_PICKUP'].includes(normalizedStatus)) {
          return res.status(403).json({
            success: false,
            message:
              'Kitchen personnel are only authorized to transition orders to PREPARING or READY_FOR_PICKUP',
          });
        }
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Valid state transition check
      const current = order.orderStatus;
      let isValidTransition = false;

      if (current === 'CONFIRMED' && normalizedStatus === 'PREPARING') {
        isValidTransition = true;
      } else if (current === 'PREPARING' && normalizedStatus === 'READY_FOR_PICKUP') {
        isValidTransition = true;
      } else if (req.user.role === 'ADMIN') {
        // Admins can override to valid kitchen states
        isValidTransition = ['PREPARING', 'READY_FOR_PICKUP'].includes(normalizedStatus);
      }

      if (!isValidTransition) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order status from ${current} to ${normalizedStatus}`,
        });
      }

      order.orderStatus = normalizedStatus;
      order.statusHistory.push({
        status: normalizedStatus,
        changedBy: req.user.id,
        changedAt: new Date(),
        note: note || `Kitchen status updated to ${normalizedStatus}`,
      });

      await order.save();
      await redisDelPattern('cache:admin:dashboard:*');

      if (normalizedStatus === 'PREPARING') {
        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_PREPARING',
        }).catch((e) => console.error('[Notification] ORDER_PREPARING dispatch error:', e.message));
      } else if (normalizedStatus === 'READY_FOR_PICKUP') {
        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_READY',
        }).catch((e) => console.error('[Notification] ORDER_READY dispatch error:', e.message));
      }

      return res.status(200).json({
        success: true,
        message: `Order status updated to ${normalizedStatus}`,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DELIVERY OPERATIONS
  // ==========================================

  /**
   * DELIVERY / ADMIN: View delivery queue
   * GET /api/v1/operations/delivery/orders
   */
  static async getDeliveryOrders(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
      const skip = (page - 1) * limit;

      const allowedStatuses = ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
      const query = {};

      if (req.query.status) {
        const requestedStatus = req.query.status.toUpperCase();
        if (allowedStatuses.includes(requestedStatus)) {
          query.orderStatus = requestedStatus;
        } else {
          query.orderStatus = { $in: allowedStatuses };
        }
      } else {
        query.orderStatus = { $in: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'] };
      }

      // If DELIVERY role: show orders assigned to them or ready for pickup
      if (req.user.role === 'DELIVERY') {
        query.$or = [
          { assignedDeliveryPartner: req.user.id },
          { orderStatus: 'READY_FOR_PICKUP', assignedDeliveryPartner: null },
        ];
      }

      const [orders, total] = await Promise.all([
        Order.find(query)
          .sort({ createdAt: 1 })
          .skip(skip)
          .limit(limit)
          .populate('deliverySlot', 'label startTime endTime date')
          .populate('deliveryZone', 'name estimatedDeliveryMinutes'),
        Order.countDocuments(query),
      ]);

      return res.status(200).json({
        success: true,
        count: orders.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELIVERY / ADMIN: Update delivery status
   * PATCH /api/v1/operations/delivery/orders/:id/status
   */
  static async updateDeliveryStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, otp, note } = req.body;

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Target status is required',
        });
      }

      const normalizedStatus = status.toUpperCase();

      // Delivery role constraints
      if (req.user.role === 'DELIVERY') {
        if (!['OUT_FOR_DELIVERY', 'DELIVERED'].includes(normalizedStatus)) {
          return res.status(403).json({
            success: false,
            message:
              'Delivery personnel are only authorized to transition orders to OUT_FOR_DELIVERY or DELIVERED',
          });
        }
      }

      // Query order with deliveryOTP, deliveryOtpCode and failedOtpAttempts
      const order = await Order.findById(id).select('+deliveryOTP +deliveryOtpCode +failedOtpAttempts');
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Delivery partner ownership check
      if (req.user.role === 'DELIVERY') {
        if (
          order.assignedDeliveryPartner &&
          order.assignedDeliveryPartner.toString() !== req.user.id
        ) {
          return res.status(403).json({
            success: false,
            message: 'This order is assigned to another delivery partner',
          });
        }
      }

      const current = order.orderStatus;

      // 1. Transition: READY_FOR_PICKUP -> OUT_FOR_DELIVERY
      if (normalizedStatus === 'OUT_FOR_DELIVERY') {
        if (current !== 'READY_FOR_PICKUP') {
          return res.status(400).json({
            success: false,
            message: `Cannot transition order to OUT_FOR_DELIVERY from "${current}". Order must be in READY_FOR_PICKUP status.`,
          });
        }

        // Assign delivery partner
        order.assignedDeliveryPartner = req.user.id;

        // Generate 6-digit Delivery OTP and hash it securely
        const plainOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');

        order.deliveryOTP = otpHash;
        order.deliveryOtpCode = plainOtp;
        order.orderStatus = 'OUT_FOR_DELIVERY';

        order.statusHistory.push({
          status: 'OUT_FOR_DELIVERY',
          changedBy: req.user.id,
          changedAt: new Date(),
          note: note || 'Order picked up and is out for delivery',
        });

        await order.save();
        await redisDelPattern('cache:admin:dashboard:*');

        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'OUT_FOR_DELIVERY',
        }).catch((e) => console.error('[Notification] OUT_FOR_DELIVERY dispatch error:', e.message));

        const responseOrder = order.toJSON();
        return res.status(200).json({
          success: true,
          message: 'Order is out for delivery and delivery OTP has been generated',
          data: responseOrder,
        });
      }

      // 2. Transition: OUT_FOR_DELIVERY -> DELIVERED
      if (normalizedStatus === 'DELIVERED') {
        if (current !== 'OUT_FOR_DELIVERY') {
          return res.status(400).json({
            success: false,
            message: `Cannot mark order as DELIVERED from "${current}". Order must be OUT_FOR_DELIVERY.`,
          });
        }

        // Verify Delivery OTP
        if (!otp || typeof otp !== 'string' && typeof otp !== 'number') {
          return res.status(400).json({
            success: false,
            message: 'Delivery OTP is required to complete delivery',
          });
        }

        if (!order.deliveryOTP) {
          return res.status(400).json({
            success: false,
            message: 'No active delivery OTP found for this order',
          });
        }

        if ((order.failedOtpAttempts || 0) >= 5) {
          return res.status(429).json({
            success: false,
            message:
              'Maximum delivery OTP verification attempts exceeded (5/5). Order delivery verification locked. Contact support.',
          });
        }

        const providedOtpString = otp.toString().trim();
        const calculatedOtpHash = crypto
          .createHash('sha256')
          .update(providedOtpString)
          .digest('hex');

        if (calculatedOtpHash !== order.deliveryOTP) {
          order.failedOtpAttempts = (order.failedOtpAttempts || 0) + 1;
          await order.save();
          return res.status(400).json({
            success: false,
            message: `Invalid delivery OTP. Verification failed. (${5 - order.failedOtpAttempts} attempts remaining)`,
          });
        }

        // OTP verified successfully: mark DELIVERED and invalidate OTP
        order.orderStatus = 'DELIVERED';
        order.deliveryOTP = null;
        order.deliveryOtpCode = null;
        order.failedOtpAttempts = 0;

        // If Cash on Delivery, mark as PAID upon physical delivery
        if (order.paymentMethod === 'COD') {
          order.paymentStatus = 'PAID';
        }

        order.statusHistory.push({
          status: 'DELIVERED',
          changedBy: req.user.id,
          changedAt: new Date(),
          note: note || 'Order successfully delivered and verified with OTP',
        });

        await order.save();
        await redisDelPattern('cache:admin:dashboard:*');

        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_DELIVERED',
        }).catch((e) => console.error('[Notification] ORDER_DELIVERED dispatch error:', e.message));

        const responseOrder = order.toJSON();
        return res.status(200).json({
          success: true,
          message: 'Order successfully delivered and OTP invalidated',
          data: responseOrder,
        });
      }

      return res.status(400).json({
        success: false,
        message: `Invalid delivery status: ${normalizedStatus}`,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OrderOperationsController;

