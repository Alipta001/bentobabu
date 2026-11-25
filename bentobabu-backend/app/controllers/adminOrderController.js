const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order, User, DeliveryPartnerPresence, CancellationRequest, DeliverySlot } = require('../models');
const CancellationService = require('../services/cancellationService');
const { redisDelPattern } = require('../config/redis');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const {
  getKolkataDateString,
  getTomorrow,
  isValidDateString,
} = require('../utils/businessDate');

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
        deliveryDateFilter,
        deliveryDate,
        deliverySlotKey,
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

      // Date-wise delivery filtering using Asia/Kolkata boundaries
      const todayKolkata = getKolkataDateString();
      const tomorrowKolkata = getTomorrow(todayKolkata);
      const normalizedDateFilter = String(deliveryDateFilter || '').trim().toLowerCase();

      if (normalizedDateFilter === 'today') {
        filter.deliveryDateStr = todayKolkata;
      } else if (normalizedDateFilter === 'tomorrow') {
        filter.deliveryDateStr = tomorrowKolkata;
      } else if (normalizedDateFilter === 'upcoming') {
        filter.deliveryDateStr = { $gte: todayKolkata };
      } else if (deliveryDate && isValidDateString(String(deliveryDate).trim())) {
        filter.deliveryDateStr = String(deliveryDate).trim();
      } else if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }

      const summaryMatchFilter = { ...filter };

      if (deliverySlotKey && typeof deliverySlotKey === 'string' && deliverySlotKey.trim() && deliverySlotKey !== 'all') {
        filter.deliverySlotKey = deliverySlotKey.trim().toLowerCase();
      }

      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [orders, totalOrders, slotAggregation] = await Promise.all([
        Order.find(filter)
          .populate('user', 'name email phone')
          .populate('deliverySlot', 'date dateStr slotKey label startTime endTime')
          .populate('assignedDeliveryPartner', 'name phone')
          .populate('preparationReminder.acknowledgedBy', 'name email role')
          .populate('items.product', 'name images imagesData price isAvailable')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Order.countDocuments(filter),
        Order.aggregate([
          { $match: summaryMatchFilter },
          {
            $addFields: {
              resolvedSlotKey: { $ifNull: ['$deliverySlotKey', 'unscheduled'] },
              resolvedSlotLabel: { $ifNull: ['$deliverySlotLabel', 'Unscheduled'] },
              resolvedStartTime: { $ifNull: ['$deliverySlotStartTime', '99:99'] },
              orderItemQty: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$items', []] },
                    as: 'it',
                    in: { $ifNull: ['$$it.quantity', 0] },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: '$resolvedSlotKey',
              slotKey: { $first: '$resolvedSlotKey' },
              label: { $first: '$resolvedSlotLabel' },
              startTime: { $first: '$resolvedStartTime' },
              orderCount: { $sum: 1 },
              totalItems: { $sum: '$orderItemQty' },
            },
          },
          { $sort: { startTime: 1, slotKey: 1 } },
        ]),
      ]);

      const normalizedOrders = orders.map((ord) => {
        if (Array.isArray(ord.items)) {
          ord.items = ord.items.map((it) => {
            const prod = typeof it.product === 'object' && it.product !== null ? it.product : null;
            const fallbackImg =
              (prod?.images && prod.images.length > 0 ? prod.images[0] : null) ||
              (prod?.imagesData && prod.imagesData.length > 0 ? prod.imagesData[0]?.secureUrl : null) ||
              '';
            const resolvedImg = it.image || it.productImage || fallbackImg || '';
            return {
              ...it,
              image: resolvedImg,
              productImage: resolvedImg,
            };
          });
        }
        const slotObj = typeof ord.deliverySlot === 'object' && ord.deliverySlot !== null ? ord.deliverySlot : null;
        return {
          ...ord,
          deliveryDateStr: ord.deliveryDateStr || slotObj?.dateStr || (slotObj?.date ? getKolkataDateString(slotObj.date) : null),
          deliverySlotKey: ord.deliverySlotKey || slotObj?.slotKey || null,
          deliverySlotLabel: ord.deliverySlotLabel || slotObj?.label || '',
          deliverySlotStartTime: ord.deliverySlotStartTime || slotObj?.startTime || null,
          deliverySlotEndTime: ord.deliverySlotEndTime || slotObj?.endTime || null,
          preparationReminder: ord.preparationReminder || { status: 'NOT_APPLICABLE' },
        };
      });

      const dateSummary = {
        totalOrders: slotAggregation.reduce((acc, s) => acc + (s.orderCount || 0), 0),
        totalItems: slotAggregation.reduce((acc, s) => acc + (s.totalItems || 0), 0),
        slots: slotAggregation.map((s) => ({
          slotKey: s.slotKey,
          label: s.label,
          startTime: s.startTime === '99:99' ? null : s.startTime,
          orderCount: s.orderCount,
          totalItems: s.totalItems,
        })),
      };

      return res.status(200).json({
        success: true,
        data: {
          orders: normalizedOrders,
          dateSummary,
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
        .populate('items.product', 'name images imagesData price isAvailable')
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }

      if (Array.isArray(order.items)) {
        order.items = order.items.map((it) => {
          const prod = typeof it.product === 'object' && it.product !== null ? it.product : null;
          const fallbackImg =
            (prod?.images && prod.images.length > 0 ? prod.images[0] : null) ||
            (prod?.imagesData && prod.imagesData.length > 0 ? prod.imagesData[0]?.secureUrl : null) ||
            '';
          const resolvedImg = it.image || it.productImage || fallbackImg || '';
          return {
            ...it,
            image: resolvedImg,
            productImage: resolvedImg,
          };
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

  /**
   * POST /api/v1/admin/orders/:id/acknowledge-preparation
   * Record kitchen preparation acknowledgement timestamp and admin user
   */
  static async acknowledgePreparation(req, res, next) {
    try {
      const { id } = req.params;
      const { PreparationReminderService } = require('../services/preparationReminderService');
      const order = await PreparationReminderService.acknowledgePreparation(
        id,
        req.user?._id || req.user?.id || null
      );

      await order.populate('preparationReminder.acknowledgedBy', 'name email role');
      await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Kitchen preparation acknowledged.',
        data: { order },
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
   * PATCH /api/v1/admin/orders/:id/schedule
   * Update an order's delivery slot/date and automatically recalculate its preparation reminder
   */
  static async updateOrderSchedule(req, res, next) {
    try {
      const { id } = req.params;
      const { deliverySlotId } = req.body;

      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(deliverySlotId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid order ID and deliverySlotId are required.',
        });
      }

      const [order, newSlot] = await Promise.all([
        Order.findById(id),
        DeliverySlot.findById(deliverySlotId),
      ]);

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }
      if (!newSlot) {
        return res.status(404).json({ success: false, message: 'Target delivery slot not found.' });
      }
      if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'DELIVERED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot reschedule a cancelled or delivered order.',
        });
      }

      const oldSlotId = order.deliverySlot ? order.deliverySlot.toString() : null;
      if (oldSlotId !== newSlot._id.toString()) {
        if (oldSlotId) {
          await DeliverySlot.updateOne({ _id: oldSlotId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } });
        }
        await DeliverySlot.updateOne({ _id: newSlot._id }, { $inc: { bookedCount: 1 } });
      }

      order.deliverySlot = newSlot._id;
      const { PreparationReminderService } = require('../services/preparationReminderService');
      await PreparationReminderService.scheduleOrRecalculateReminder(order, {
        slotDoc: newSlot,
        forceRecalculate: true,
      });

      await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Order delivery schedule updated and preparation reminder recalculated.',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminOrderController;
