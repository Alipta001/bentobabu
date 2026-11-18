const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order } = require('../models');
const { isDeliveryOtpRequired } = require('../config/env');
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

      // If DELIVERY role: show orders assigned to them or ready for pickup if online
      if (req.user.role === 'DELIVERY') {
        const { DeliveryPartnerPresence } = require('../models');
        const presence = await DeliveryPartnerPresence.findOne({ user: req.user.id }).lean();
        const isPartnerOnlineAndActive =
          presence &&
          presence.accountStatus === 'ACTIVE' &&
          presence.availabilityStatus === 'ONLINE';

        if (isPartnerOnlineAndActive) {
          query.$or = [
            { assignedDeliveryPartner: req.user.id },
            { orderStatus: 'READY_FOR_PICKUP', assignedDeliveryPartner: null },
          ];
        } else {
          // If offline or suspended, partner is not offered new unassigned assignments
          query.assignedDeliveryPartner = req.user.id;
        }
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
          if (normalizedStatus === 'OUT_FOR_DELIVERY') {
            return res.status(409).json({
              success: false,
              message: 'This order has already been assigned to another delivery partner.',
            });
          }
          return res.status(403).json({
            success: false,
            message: 'This order is assigned to another delivery partner',
          });
        }
      }

      const current = order.orderStatus;

      // 1. Transition: READY_FOR_PICKUP -> OUT_FOR_DELIVERY (ATOMIC CLAIM)
      if (normalizedStatus === 'OUT_FOR_DELIVERY') {
        const { DeliveryPartnerPresence, User } = require('../models');

        // If DELIVERY role: verify partner eligibility
        if (req.user.role === 'DELIVERY') {
          // Check User account status
          const user = await User.findById(req.user.id).lean();
          if (!user || !user.isActive || user.role !== 'DELIVERY') {
            return res.status(403).json({
              success: false,
              message: 'Only active and approved delivery partners can accept delivery assignments.',
            });
          }

          // Check DeliveryPartnerPresence
          const presence = await DeliveryPartnerPresence.findOne({ user: req.user.id });
          if (!presence || presence.accountStatus !== 'ACTIVE') {
            return res.status(403).json({
              success: false,
              message: 'Suspended delivery partners cannot accept delivery assignments.',
            });
          }

          if (presence.availabilityStatus !== 'ONLINE') {
            return res.status(400).json({
              success: false,
              message: 'Delivery partner must be ONLINE and available to accept delivery assignments.',
            });
          }

          // Check if partner already has another active in-progress order
          const existingActiveOrder = await Order.findOne({
            assignedDeliveryPartner: req.user.id,
            orderStatus: 'OUT_FOR_DELIVERY',
          }).select('_id orderNumber');

          if (
            existingActiveOrder ||
            (presence.currentOrderId && presence.currentOrderId.toString() !== id)
          ) {
            return res.status(400).json({
              success: false,
              message:
                'You already have an active order in progress. Complete your current delivery before accepting another.',
            });
          }
        }

        // Check current order state before proceeding
        const existingOrder = await Order.findById(id).select('+deliveryOTP +deliveryOtpCode');
        if (!existingOrder) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
          });
        }

        if (
          existingOrder.assignedDeliveryPartner &&
          existingOrder.assignedDeliveryPartner.toString() !== req.user.id
        ) {
          return res.status(409).json({
            success: false,
            message: 'This order has already been assigned to another delivery partner.',
          });
        }

        if (existingOrder.orderStatus !== 'READY_FOR_PICKUP') {
          return res.status(400).json({
            success: false,
            message: `Cannot transition order to OUT_FOR_DELIVERY from "${existingOrder.orderStatus}". Order must be in READY_FOR_PICKUP status.`,
          });
        }

        // Generate cryptographically secure 6-digit Delivery OTP and hash it securely
        const plainOtp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
        const otpExpiryMinutes = parseInt(process.env.DELIVERY_OTP_EXPIRY_MINUTES, 10) || 60;
        const otpExpiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

        // Execute atomic assignment inside MongoDB transaction (with fallback for standalone DBs)
        const session = await mongoose.startSession();
        let updatedOrder = null;

        try {
          const executeAssignment = async (sess) => {
            // Task 1: Atomically lock delivery partner presence first to prevent multi-order claim race
            let lockedPresence = null;
            if (req.user.role === 'DELIVERY') {
              const presenceOptions = { returnDocument: 'after' };
              if (sess) presenceOptions.session = sess;

              lockedPresence = await DeliveryPartnerPresence.findOneAndUpdate(
                {
                  user: req.user.id,
                  accountStatus: 'ACTIVE',
                  availabilityStatus: 'ONLINE',
                  currentOrderId: null,
                },
                {
                  $set: {
                    availabilityStatus: 'BUSY',
                    currentOrderId: id,
                    lastHeartbeat: new Date(),
                  },
                },
                presenceOptions
              );

              if (!lockedPresence) {
                const err = new Error(
                  'You are not available to accept an order, or already have an active order in progress.'
                );
                err.statusCode = 409;
                throw err;
              }
            }

            const findQuery = {
              _id: id,
              orderStatus: 'READY_FOR_PICKUP',
              assignedDeliveryPartner: null,
            };

            const updateOps = {
              $set: {
                assignedDeliveryPartner: req.user.id,
                orderStatus: 'OUT_FOR_DELIVERY',
                deliveryOTP: otpHash,
                deliveryOtpCode: plainOtp,
                deliveryOtpExpiresAt: otpExpiresAt,
                failedOtpAttempts: 0,
              },
              $push: {
                statusHistory: {
                  status: 'OUT_FOR_DELIVERY',
                  changedBy: req.user.id,
                  changedAt: new Date(),
                  note: note || 'Order claimed and is out for delivery',
                },
              },
            };

            const orderOptions = { returnDocument: 'after' };
            if (sess) orderOptions.session = sess;

            updatedOrder = await Order.findOneAndUpdate(findQuery, updateOps, orderOptions);

            if (!updatedOrder) {
              // Rollback presence lock if running without session (standalone DB fallback)
              if (!sess && lockedPresence) {
                await DeliveryPartnerPresence.findOneAndUpdate(
                  { user: req.user.id, currentOrderId: id },
                  { $set: { availabilityStatus: 'ONLINE', currentOrderId: null } }
                );
              }

              const checkOrder = sess
                ? await Order.findById(id).session(sess)
                : await Order.findById(id);

              if (checkOrder && checkOrder.assignedDeliveryPartner) {
                const err = new Error('This order has already been assigned to another delivery partner.');
                err.statusCode = 409;
                throw err;
              }
              const err = new Error('Order is no longer available for pickup.');
              err.statusCode = 400;
              throw err;
            }
          };

          // Try transaction if supported by MongoDB deployment
          try {
            await session.withTransaction(async () => {
              await executeAssignment(session);
            });
          } catch (txErr) {
            if (
              txErr.message &&
              (txErr.message.includes('Transaction numbers are only allowed') ||
                txErr.message.includes('replica set member'))
            ) {
              // Standalone MongoDB fallback
              await executeAssignment(null);
            } else {
              throw txErr;
            }
          }
        } catch (assignErr) {
          if (assignErr.statusCode === 409) {
            return res.status(409).json({
              success: false,
              message: assignErr.message,
            });
          }
          if (assignErr.statusCode === 400) {
            return res.status(400).json({
              success: false,
              message: assignErr.message,
            });
          }
          throw assignErr;
        } finally {
          await session.endSession();
        }

        await redisDelPattern('cache:admin:dashboard:*');

        NotificationDispatcher.dispatch({
          userId: updatedOrder.user,
          orderId: updatedOrder._id,
          order: updatedOrder,
          eventType: 'OUT_FOR_DELIVERY',
        }).catch((e) => console.error('[Notification] OUT_FOR_DELIVERY dispatch error:', e.message));

        const responseOrder = updatedOrder.toJSON();
        return res.status(200).json({
          success: true,
          message: 'Order is out for delivery and delivery OTP has been generated',
          data: responseOrder,
        });
      }

      // 2. Transition: OUT_FOR_DELIVERY -> DELIVERED
      if (normalizedStatus === 'DELIVERED') {
        const order = await Order.findById(id).select('+deliveryOTP +deliveryOtpCode +failedOtpAttempts +deliveryOtpExpiresAt');
        if (!order) {
          return res.status(404).json({
            success: false,
            message: 'Order not found',
          });
        }

        // Ownership check
        if (req.user.role === 'DELIVERY') {
          if (
            !order.assignedDeliveryPartner ||
            order.assignedDeliveryPartner.toString() !== req.user.id
          ) {
            return res.status(403).json({
              success: false,
              message: 'This order is assigned to another delivery partner',
            });
          }
        }

        if (order.orderStatus !== 'OUT_FOR_DELIVERY') {
          return res.status(400).json({
            success: false,
            message: `Cannot mark order as DELIVERED from "${order.orderStatus}". Order must be OUT_FOR_DELIVERY.`,
          });
        }

        const otpRequired = isDeliveryOtpRequired();

        if (otpRequired) {
          // Verify Delivery OTP
          if (!otp || (typeof otp !== 'string' && typeof otp !== 'number')) {
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

          // Verify OTP Expiry
          if (order.deliveryOtpExpiresAt && new Date() > new Date(order.deliveryOtpExpiresAt)) {
            return res.status(400).json({
              success: false,
              message: 'Delivery OTP has expired. Contact support or admin to refresh verification.',
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
        }

        // OTP verified successfully or OTP verification skipped: mark DELIVERED and clear OTP
        order.orderStatus = 'DELIVERED';
        order.deliveryOTP = null;
        order.deliveryOtpCode = null;
        order.deliveryOtpExpiresAt = null;
        order.failedOtpAttempts = 0;

        // NOTE: Delivery OTP confirms physical delivery ONLY.
        // For COD orders, paymentStatus is NOT marked as PAID automatically.
        // It remains in its existing state (e.g. 'COD_PENDING' or 'COLLECTED_BY_RIDER')
        // until cash collection is explicitly recorded.
        // For prepaid orders (RAZORPAY), paymentStatus was already 'PAID' and remains 'PAID'.

        order.statusHistory.push({
          status: 'DELIVERED',
          changedBy: req.user.id,
          changedAt: new Date(),
          note: otpRequired
            ? (note || 'Order successfully delivered and verified with OTP')
            : (note || 'Order successfully delivered (OTP verification disabled)'),
        });

        await order.save();
        await redisDelPattern('cache:admin:dashboard:*');

        // Recalculate partner availability according to explicit preference
        if (req.user.role === 'DELIVERY') {
          const { DeliveryPartnerPresence } = require('../models');
          const presence = await DeliveryPartnerPresence.findOne({ user: req.user.id });
          if (presence) {
            presence.currentOrderId = null;
            presence.availabilityStatus =
              presence.intendedAvailability === 'ONLINE' && presence.accountStatus === 'ACTIVE'
                ? 'ONLINE'
                : 'OFFLINE';
            presence.lastHeartbeat = new Date();
            await presence.save().catch((e) => console.warn('[Presence] Update DELIVERED error:', e.message));
          }
        }

        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_DELIVERED',
        }).catch((e) => console.error('[Notification] ORDER_DELIVERED dispatch error:', e.message));

        const responseOrder = order.toJSON();
        return res.status(200).json({
          success: true,
          message: otpRequired
            ? 'Order successfully delivered and OTP invalidated'
            : 'Order successfully delivered',
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

  /**
   * DELIVERY / ADMIN: Record cash collection for COD orders
   * POST /api/v1/operations/delivery/orders/:id/collect-cash
   */
  static async collectCash(req, res, next) {
    try {
      const { id } = req.params;
      const { note } = req.body || {};

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
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

      // Authorization: Only the assigned delivery partner (or ADMIN) may confirm collection
      if (req.user.role === 'DELIVERY') {
        if (
          !order.assignedDeliveryPartner ||
          order.assignedDeliveryPartner.toString() !== req.user.id
        ) {
          return res.status(403).json({
            success: false,
            message: 'Only the assigned delivery partner may confirm cash collection.',
          });
        }
      }

      // COD payment method check
      if (order.paymentMethod !== 'COD') {
        return res.status(400).json({
          success: false,
          message: `Payment method is ${order.paymentMethod}. Cash collection is only applicable for Cash on Delivery (COD) orders.`,
        });
      }

      // Task 5: Order status check: strictly DELIVERED before cash collection can be confirmed
      if (order.orderStatus !== 'DELIVERED') {
        return res.status(400).json({
          success: false,
          message: `Cannot record cash collection when order is in "${order.orderStatus}" status. Order must be DELIVERED before cash collection can be confirmed.`,
        });
      }

      // Idempotency: Prevent duplicate cash collection records
      if (
        order.paymentStatus === 'COLLECTED_BY_RIDER' ||
        order.paymentDetails?.cashCollection?.status === 'COLLECTED_BY_RIDER'
      ) {
        return res.status(200).json({
          success: true,
          message: 'Cash collection has already been recorded for this order.',
          data: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            paymentStatus: order.paymentStatus,
            cashCollection: order.paymentDetails?.cashCollection || null,
          },
        });
      }

      // Amount calculated from persisted order, NEVER from frontend input
      const collectedAmount = order.grandTotal;

      const cashRecord = {
        orderId: order._id,
        partnerId: req.user.id,
        amount: collectedAmount,
        method: 'CASH',
        collectedAt: new Date(),
        status: 'COLLECTED_BY_RIDER',
        note: (note || 'Cash payment collected from customer at doorstep').trim(),
      };

      // Atomic conditional update to prevent concurrent double-collection
      const findQuery = {
        _id: id,
        orderStatus: 'DELIVERED',
        paymentMethod: 'COD',
        paymentStatus: { $ne: 'COLLECTED_BY_RIDER' },
      };
      if (req.user.role === 'DELIVERY') {
        findQuery.assignedDeliveryPartner = req.user.id;
      }

      const updateOps = {
        $set: {
          paymentStatus: 'COLLECTED_BY_RIDER',
          'paymentDetails.collectedBy': req.user.id,
          'paymentDetails.collectedAt': cashRecord.collectedAt,
          'paymentDetails.method': 'CASH',
          'paymentDetails.cashCollection': cashRecord,
        },
        $push: {
          statusHistory: {
            status: 'CASH_COLLECTED',
            changedBy: req.user.id,
            changedAt: new Date(),
            note: `Cash amount of ₹${collectedAmount} collected by delivery partner`,
          },
        },
      };

      const updatedOrder = await Order.findOneAndUpdate(findQuery, updateOps, {
        returnDocument: 'after',
      });

      if (!updatedOrder) {
        // Check if concurrent request already completed collection
        const latestOrder = await Order.findById(id);
        if (
          latestOrder &&
          (latestOrder.paymentStatus === 'COLLECTED_BY_RIDER' ||
            latestOrder.paymentDetails?.cashCollection?.status === 'COLLECTED_BY_RIDER')
        ) {
          return res.status(200).json({
            success: true,
            message: 'Cash collection has already been recorded for this order.',
            data: {
              orderId: latestOrder._id,
              orderNumber: latestOrder.orderNumber,
              paymentStatus: latestOrder.paymentStatus,
              cashCollection: latestOrder.paymentDetails?.cashCollection || null,
            },
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Unable to record cash collection. Order state or authorization check failed.',
        });
      }

      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: `Cash collection of ₹${collectedAmount} recorded successfully.`,
        data: {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          paymentStatus: updatedOrder.paymentStatus,
          cashCollection: cashRecord,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OrderOperationsController;

