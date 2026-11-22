const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order, User, DeliveryPartnerPresence, CancellationRequest } = require('../models');
const CancellationService = require('../services/cancellationService');
const { redisDelPattern } = require('../config/redis');
const NotificationDispatcher = require('../utils/notificationDispatcher');

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
      const { deliveryPartnerId, reassign, forceReassign } = req.body || {};

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

      // Check if target partner is already assigned to this exact order
      if (
        order.assignedDeliveryPartner &&
        order.assignedDeliveryPartner.toString() === partner._id.toString()
      ) {
        return res.status(200).json({
          success: true,
          message: 'Delivery partner is already assigned to this order.',
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
      }

      const oldPartnerId = order.assignedDeliveryPartner;
      const isReassignment = Boolean(oldPartnerId);

      // Guard reassignment without explicit permission
      if (isReassignment && !reassign && !forceReassign) {
        return res.status(409).json({
          success: false,
          message: 'This order is already assigned to another delivery partner. Set reassign: true to force reassignment.',
        });
      }

      // Pre-check target partner presence and availability
      const targetPresence = await DeliveryPartnerPresence.findOne({ user: partner._id });
      if (!targetPresence || targetPresence.accountStatus !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: 'Delivery partner account is suspended or inactive.',
        });
      }

      if (targetPresence.availabilityStatus !== 'ONLINE' || targetPresence.currentOrderId) {
        return res.status(409).json({
          success: false,
          message: 'Delivery partner is currently offline or busy with another delivery.',
        });
      }

      // Check if order is OUT_FOR_DELIVERY / PICKED_UP and prepare fresh secure delivery OTP
      const isOutForDelivery = ['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.orderStatus);
      let newPlainOtp = null;
      let newOtpHash = null;
      let newOtpExpiresAt = null;

      if (isOutForDelivery) {
        newPlainOtp = crypto.randomInt(100000, 1000000).toString();
        newOtpHash = crypto.createHash('sha256').update(newPlainOtp).digest('hex');
        const otpExpiryMinutes = parseInt(process.env.DELIVERY_OTP_EXPIRY_MINUTES, 10) || 60;
        newOtpExpiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
      }

      // Execute assignment atomically inside transaction with standalone fallback
      const session = await mongoose.startSession();
      let updatedOrder = null;

      try {
        const executeAdminAssignment = async (sess) => {
          // 1. Release previous partner's presence if reassignment
          if (isReassignment && oldPartnerId) {
            const oldPresence = sess
              ? await DeliveryPartnerPresence.findOne({ user: oldPartnerId }).session(sess)
              : await DeliveryPartnerPresence.findOne({ user: oldPartnerId });

            if (oldPresence) {
              oldPresence.currentOrderId = null;
              oldPresence.availabilityStatus =
                oldPresence.intendedAvailability === 'ONLINE' && oldPresence.accountStatus === 'ACTIVE'
                  ? 'ONLINE'
                  : 'OFFLINE';
              oldPresence.lastHeartbeat = new Date();
              if (sess) {
                await oldPresence.save({ session: sess });
              } else {
                await oldPresence.save();
              }
            }
          }

          // 2. Lock target partner's presence atomically
          const lockOptions = { returnDocument: 'after' };
          if (sess) lockOptions.session = sess;

          const lockedPresence = await DeliveryPartnerPresence.findOneAndUpdate(
            {
              user: partner._id,
              accountStatus: 'ACTIVE',
              availabilityStatus: 'ONLINE',
              currentOrderId: null,
            },
            {
              $set: {
                availabilityStatus: 'BUSY',
                currentOrderId: order._id,
                lastHeartbeat: new Date(),
              },
            },
            lockOptions
          );

          if (!lockedPresence) {
            const err = new Error('Delivery partner is no longer available or already handling another order.');
            err.statusCode = 409;
            throw err;
          }

          // 3. Atomically update order assignment and refresh OTP if OUT_FOR_DELIVERY
          const orderFindQuery = {
            _id: id,
            orderStatus: { $in: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
            ...(isReassignment ? { assignedDeliveryPartner: oldPartnerId } : { assignedDeliveryPartner: null }),
          };

          const updateOps = {
            $set: {
              assignedDeliveryPartner: partner._id,
              ...(isOutForDelivery
                ? {
                    deliveryOTP: newOtpHash,
                    deliveryOtpCode: newPlainOtp,
                    deliveryOtpExpiresAt: newOtpExpiresAt,
                    failedOtpAttempts: 0,
                  }
                : {}),
            },
            $push: {
              statusHistory: {
                status: order.orderStatus,
                changedBy: req.user._id || req.user.id,
                note: isReassignment
                  ? `Delivery partner reassigned by admin to: ${partner.name} (${partner.phone})${isOutForDelivery ? '. Fresh delivery OTP generated for security.' : ''}`
                  : `Delivery partner assigned by admin: ${partner.name} (${partner.phone})`,
                changedAt: new Date(),
              },
            },
          };

          const orderOptions = { returnDocument: 'after' };
          if (sess) orderOptions.session = sess;

          updatedOrder = await Order.findOneAndUpdate(orderFindQuery, updateOps, orderOptions);

          if (!updatedOrder) {
            // Standalone fallback: rollback locked target presence
            if (!sess && lockedPresence) {
              await DeliveryPartnerPresence.findOneAndUpdate(
                { user: partner._id, currentOrderId: order._id },
                { $set: { availabilityStatus: 'ONLINE', currentOrderId: null } }
              );
            }
            const err = new Error('Failed to assign order. Order status or assignment state changed concurrently.');
            err.statusCode = 409;
            throw err;
          }
        };

        try {
          await session.withTransaction(async () => {
            await executeAdminAssignment(session);
          });
        } catch (txErr) {
          if (
            txErr.message &&
            (txErr.message.includes('Transaction numbers are only allowed') ||
              txErr.message.includes('replica set member'))
          ) {
            await executeAdminAssignment(null);
          } else {
            throw txErr;
          }
        }
      } catch (assignErr) {
        if (assignErr.statusCode) {
          return res.status(assignErr.statusCode).json({
            success: false,
            message: assignErr.message,
          });
        }
        throw assignErr;
      } finally {
        await session.endSession();
      }

      await redisDelPattern('cache:admin:dashboard:*');

      // Dispatch non-blocking notifications safely (failures do not corrupt the committed assignment)
      const eventTimestamp = Date.now();

      NotificationDispatcher.dispatch({
        userId: updatedOrder.user,
        orderId: updatedOrder._id,
        order: updatedOrder,
        eventType: 'ORDER_REASSIGNED',
        metadata: {
          partnerName: partner.name,
          partnerPhone: partner.phone,
          isOutForDelivery,
          orderNumber: updatedOrder.orderNumber,
          idempotencySuffix: `_${eventTimestamp}`,
        },
      }).catch((e) => console.error('[Notification] ORDER_REASSIGNED dispatch error:', e.message));

      NotificationDispatcher.dispatch({
        userId: partner._id,
        orderId: updatedOrder._id,
        order: updatedOrder,
        eventType: 'DELIVERY_ASSIGNMENT',
        metadata: {
          orderNumber: updatedOrder.orderNumber,
          grandTotal: updatedOrder.grandTotal,
          isReassignment,
          idempotencySuffix: `_${eventTimestamp}`,
        },
      }).catch((e) => console.error('[Notification] DELIVERY_ASSIGNMENT dispatch error:', e.message));

      return res.status(200).json({
        success: true,
        message: isReassignment
          ? 'Delivery partner reassigned successfully.'
          : 'Delivery partner assigned successfully.',
        data: {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
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

  /**
   * ADMIN: Directly cancel an order and process automatic refund if paid
   * PATCH /api/v1/admin/orders/:id/cancel
   */
  static async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;
      const reason = req.body.reason || req.body.note || 'Cancelled via admin operations';

      if (!id || !mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (order.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'This order is already cancelled',
        });
      }

      // Check if there is a pending cancellation request for this order and link it
      const pendingRequest = await CancellationRequest.findOne({
        order: order._id,
        status: 'PENDING',
      });

      await CancellationService.executeOrderCancellationAndRefund({
        order,
        cancellationRequest: pendingRequest,
        adminUser: req.user,
        reason,
      });

      if (pendingRequest) {
        pendingRequest.status = 'APPROVED';
        pendingRequest.reviewedBy = req.user._id || req.user.id;
        pendingRequest.reviewedAt = new Date();
        await pendingRequest.save();
      }

      await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully by administrator.',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminOrderController;
