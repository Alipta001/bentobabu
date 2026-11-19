const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order } = require('../models');
const { isDeliveryOtpRequired } = require('../config/env');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { emitOrderEvent } = require('../utils/socketService');
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
      const canonicalStatus = normalizedStatus === 'READY_FOR_DISPATCH' ? 'READY_FOR_PICKUP' : normalizedStatus;

      // Kitchen role constraints
      if (req.user.role === 'KITCHEN') {
        if (!['PREPARING', 'READY_FOR_PICKUP', 'READY_FOR_DISPATCH'].includes(normalizedStatus)) {
          return res.status(403).json({
            success: false,
            message:
              'Kitchen personnel are only authorized to transition orders to PREPARING, READY_FOR_PICKUP or READY_FOR_DISPATCH',
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

      if (current === 'CONFIRMED' && canonicalStatus === 'PREPARING') {
        isValidTransition = true;
      } else if (current === 'PREPARING' && canonicalStatus === 'READY_FOR_PICKUP') {
        isValidTransition = true;
      } else if (req.user.role === 'ADMIN') {
        // Admins can override to valid kitchen states
        isValidTransition = ['PREPARING', 'READY_FOR_PICKUP'].includes(canonicalStatus);
      }

      if (!isValidTransition) {
        return res.status(400).json({
          success: false,
          message: `Cannot transition order status from ${current} to ${normalizedStatus}`,
        });
      }

      order.orderStatus = canonicalStatus;
      order.statusHistory.push({
        status: canonicalStatus,
        changedBy: req.user.id,
        changedAt: new Date(),
        note: note || `Kitchen status updated to ${canonicalStatus}`,
      });

      await order.save();
      await redisDelPattern('cache:admin:dashboard:*');

      if (canonicalStatus === 'PREPARING') {
        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_PREPARING',
        }).catch((e) => console.error('[Notification] ORDER_PREPARING dispatch error:', e.message));

        emitOrderEvent(req, 'order:preparing', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'PREPARING',
          userId: order.user,
        });
      } else if (canonicalStatus === 'READY_FOR_PICKUP') {
        // 1. Notify customer that order is packed & ready
        NotificationDispatcher.dispatch({
          userId: order.user,
          orderId: order._id,
          order,
          eventType: 'ORDER_READY',
        }).catch((e) => console.error('[Notification] ORDER_READY dispatch error:', e.message));

        // 2. Notify available riders that a new order is ready for dispatch/pickup
        const { DeliveryPartnerPresence } = require('../models');
        DeliveryPartnerPresence.find({
          accountStatus: 'ACTIVE',
          availabilityStatus: 'ONLINE',
          currentOrderId: null,
        })
          .lean()
          .then((availableRiders) => {
            if (availableRiders && availableRiders.length > 0) {
              for (const rider of availableRiders) {
                NotificationDispatcher.dispatch({
                  userId: rider.user,
                  orderId: order._id,
                  order,
                  eventType: 'DELIVERY_REQUEST_AVAILABLE',
                  metadata: {
                    orderNumber: order.orderNumber,
                    grandTotal: order.grandTotal,
                  },
                }).catch((e) => console.error('[Notification] DELIVERY_REQUEST_AVAILABLE dispatch error:', e.message));
              }
            }
          })
          .catch((e) => console.error('[Presence] Error querying available riders:', e.message));

        emitOrderEvent(req, 'delivery:request_available', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: 'READY_FOR_PICKUP',
          userId: order.user,
        });
      }

      emitOrderEvent(req, 'order:status_updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: canonicalStatus,
        userId: order.user,
      });

      return res.status(200).json({
        success: true,
        message: `Order status updated to ${canonicalStatus}`,
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

      const allowedStatuses = ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'ACTIVE'];
      const query = {};

      if (req.query.status) {
        const requestedStatus = req.query.status.toUpperCase();
        if (requestedStatus === 'ACTIVE') {
          query.orderStatus = { $in: ['RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] };
        } else if (requestedStatus === 'OUT_FOR_DELIVERY') {
          query.orderStatus = { $in: ['RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] };
        } else if (['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'].includes(requestedStatus)) {
          query.orderStatus = { $in: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'] };
        } else if (allowedStatuses.includes(requestedStatus)) {
          query.orderStatus = requestedStatus;
        } else {
          query.orderStatus = { $in: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'] };
        }
      } else {
        query.orderStatus = { $in: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH', 'RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] };
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
            { orderStatus: { $in: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'] }, assignedDeliveryPartner: null },
          ];
        } else {
          // If offline, busy or suspended, partner is offered their assigned orders
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
        if (!['RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(normalizedStatus)) {
          return res.status(403).json({
            success: false,
            message:
              'Delivery personnel are only authorized to transition orders to RIDER_ACCEPTED, PICKED_UP, or DELIVERED',
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
          if (['RIDER_ACCEPTED', 'OUT_FOR_DELIVERY'].includes(normalizedStatus)) {
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

      // ==============================================================
      // 1. TRANSITION: READY_FOR_PICKUP -> RIDER_ACCEPTED (RIDER ACCEPTS REQUEST)
      // ==============================================================
      if (
        normalizedStatus === 'RIDER_ACCEPTED' ||
        (normalizedStatus === 'OUT_FOR_DELIVERY' && ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'].includes(current))
      ) {
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
            orderStatus: { $in: ['RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
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

        if (!['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'].includes(existingOrder.orderStatus)) {
          return res.status(400).json({
            success: false,
            message: `Cannot transition order to RIDER_ACCEPTED from "${existingOrder.orderStatus}". Order must be in READY_FOR_PICKUP status.`,
          });
        }

        // Generate cryptographically secure 6-digit Delivery OTP and hash it securely
        const plainOtp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');
        const otpExpiryMinutes = parseInt(process.env.DELIVERY_OTP_EXPIRY_MINUTES, 10) || 60;
        const otpExpiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

        // Execute atomic assignment inside MongoDB transaction (with fallback for standalone DBs or offline environments)
        let session = null;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          try {
            session = await mongoose.startSession();
          } catch (sessionErr) {
            session = null;
          }
        }
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
              orderStatus: { $in: ['READY_FOR_PICKUP', 'READY_FOR_DISPATCH'] },
              assignedDeliveryPartner: null,
            };

            const updateOps = {
              $set: {
                assignedDeliveryPartner: req.user.id,
                orderStatus: 'RIDER_ACCEPTED',
                deliveryOTP: otpHash,
                deliveryOtpCode: plainOtp,
                deliveryOtpExpiresAt: otpExpiresAt,
                failedOtpAttempts: 0,
              },
              $push: {
                statusHistory: {
                  status: 'RIDER_ACCEPTED',
                  changedBy: req.user.id,
                  changedAt: new Date(),
                  note: note || 'Delivery request accepted by rider. Heading to kitchen for pickup.',
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
          if (session) {
            try {
              await session.withTransaction(async () => {
                await executeAssignment(session);
              });
            } catch (txErr) {
              if (
                txErr.message &&
                (txErr.message.includes('Transaction numbers are only allowed') ||
                  txErr.message.includes('replica set member') ||
                  txErr.message.includes('This MongoDB deployment does not support transactions'))
              ) {
                // Standalone MongoDB fallback
                await executeAssignment(null);
              } else {
                throw txErr;
              }
            }
          } else {
            await executeAssignment(null);
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
          if (session) {
            await session.endSession();
          }
        }

        await redisDelPattern('cache:admin:dashboard:*');

        // Notify customer: "A rider has accepted your order and will pick it up shortly."
        NotificationDispatcher.dispatch({
          userId: updatedOrder.user,
          orderId: updatedOrder._id,
          order: updatedOrder,
          eventType: 'RIDER_ACCEPTED',
          metadata: {
            orderNumber: updatedOrder.orderNumber,
            partnerName: req.user.name,
          },
        }).catch((e) => console.error('[Notification] RIDER_ACCEPTED dispatch error:', e.message));

        emitOrderEvent(req, 'order:rider_accepted', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'RIDER_ACCEPTED',
          userId: updatedOrder.user,
          assignedDeliveryPartner: req.user.id,
        });
        emitOrderEvent(req, 'order:status_updated', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'RIDER_ACCEPTED',
          userId: updatedOrder.user,
          assignedDeliveryPartner: req.user.id,
        });

        const responseOrder = updatedOrder.toJSON();
        return res.status(200).json({
          success: true,
          message: 'Delivery request accepted. Order status updated to RIDER_ACCEPTED.',
          data: responseOrder,
        });
      }

      // ==============================================================
      // 2. TRANSITION: RIDER_ACCEPTED -> PICKED_UP (RIDER CONFIRMS PICKUP)
      // ==============================================================
      if (
        normalizedStatus === 'PICKED_UP' ||
        (normalizedStatus === 'OUT_FOR_DELIVERY' && current === 'RIDER_ACCEPTED')
      ) {
        // Ownership check: only assigned delivery partner (or ADMIN) can confirm pickup
        if (req.user.role === 'DELIVERY') {
          if (
            !order.assignedDeliveryPartner ||
            order.assignedDeliveryPartner.toString() !== req.user.id
          ) {
            return res.status(403).json({
              success: false,
              message: 'Only the assigned delivery partner may confirm order pickup.',
            });
          }
        }

        // Prevent duplicate pickup confirmations
        if (['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.orderStatus)) {
          return res.status(400).json({
            success: false,
            message: 'Order pickup has already been confirmed.',
          });
        }

        if (order.orderStatus !== 'RIDER_ACCEPTED') {
          return res.status(400).json({
            success: false,
            message: `Cannot confirm pickup for order in status "${order.orderStatus}". Order must be in RIDER_ACCEPTED status.`,
          });
        }

        const updatedOrder = await Order.findOneAndUpdate(
          {
            _id: id,
            orderStatus: 'RIDER_ACCEPTED',
            ...(req.user.role === 'DELIVERY' ? { assignedDeliveryPartner: req.user.id } : {}),
          },
          {
            $set: {
              orderStatus: 'PICKED_UP',
            },
            $push: {
              statusHistory: {
                status: 'PICKED_UP',
                changedBy: req.user.id,
                changedAt: new Date(),
                note: note || 'Order physically collected from kitchen. In transit to customer.',
              },
            },
          },
          { returnDocument: 'after' }
        );

        if (!updatedOrder) {
          return res.status(409).json({
            success: false,
            message: 'Could not confirm pickup. Order may have already been updated.',
          });
        }

        await redisDelPattern('cache:admin:dashboard:*');

        // Trigger OUT_FOR_DELIVERY notification to customer upon physical pickup
        NotificationDispatcher.dispatch({
          userId: updatedOrder.user,
          orderId: updatedOrder._id,
          order: updatedOrder,
          eventType: 'OUT_FOR_DELIVERY',
          metadata: {
            orderNumber: updatedOrder.orderNumber,
            deliveryOtp: updatedOrder.deliveryOtpCode,
          },
        }).catch((e) => console.error('[Notification] OUT_FOR_DELIVERY dispatch error:', e.message));

        emitOrderEvent(req, 'order:picked_up', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'PICKED_UP',
          userId: updatedOrder.user,
          assignedDeliveryPartner: updatedOrder.assignedDeliveryPartner,
        });
        emitOrderEvent(req, 'order:out_for_delivery', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'PICKED_UP',
          userId: updatedOrder.user,
          assignedDeliveryPartner: updatedOrder.assignedDeliveryPartner,
        });
        emitOrderEvent(req, 'order:status_updated', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'PICKED_UP',
          userId: updatedOrder.user,
          assignedDeliveryPartner: updatedOrder.assignedDeliveryPartner,
        });

        const responseOrder = updatedOrder.toJSON();
        return res.status(200).json({
          success: true,
          message: 'Order pickup confirmed. Order is now out for delivery.',
          data: responseOrder,
        });
      }

      // ==============================================================
      // 3. TRANSITION: PICKED_UP / OUT_FOR_DELIVERY -> DELIVERED
      // ==============================================================
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

        if (order.orderStatus === 'RIDER_ACCEPTED') {
          return res.status(400).json({
            success: false,
            message: 'Cannot mark order as DELIVERED before pickup is confirmed. Order is still in RIDER_ACCEPTED status.',
          });
        }

        if (!['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.orderStatus)) {
          if (order.orderStatus === 'DELIVERED') {
            return res.status(409).json({
              success: false,
              message: 'Order has already been marked as DELIVERED.',
            });
          }
          return res.status(400).json({
            success: false,
            message: `Cannot mark order as DELIVERED from "${order.orderStatus}". Order must be PICKED_UP or OUT_FOR_DELIVERY.`,
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
            const updatedFailed = await Order.findByIdAndUpdate(
              id,
              { $inc: { failedOtpAttempts: 1 } },
              { returnDocument: 'after', select: '+failedOtpAttempts' }
            );
            const remainingAttempts = Math.max(0, 5 - (updatedFailed?.failedOtpAttempts || (order.failedOtpAttempts || 0) + 1));
            return res.status(400).json({
              success: false,
              message: `Invalid delivery OTP. Verification failed. (${remainingAttempts} attempts remaining)`,
            });
          }
        }

        // OTP verified successfully or OTP verification skipped: atomically mark DELIVERED and clear OTP
        const updatedOrder = await Order.findOneAndUpdate(
          {
            _id: id,
            orderStatus: { $in: ['PICKED_UP', 'OUT_FOR_DELIVERY'] },
            ...(req.user.role === 'DELIVERY' ? { assignedDeliveryPartner: req.user.id } : {}),
          },
          {
            $set: {
              orderStatus: 'DELIVERED',
              deliveryOTP: null,
              deliveryOtpCode: null,
              deliveryOtpExpiresAt: null,
              failedOtpAttempts: 0,
            },
            $push: {
              statusHistory: {
                status: 'DELIVERED',
                changedBy: req.user.id,
                changedAt: new Date(),
                note: otpRequired
                  ? (note || 'Order successfully delivered and verified with OTP')
                  : (note || 'Order successfully delivered (OTP verification disabled)'),
              },
            },
          },
          { returnDocument: 'after' }
        );

        if (!updatedOrder) {
          return res.status(409).json({
            success: false,
            message: 'Order has already been marked as DELIVERED or is no longer in a deliverable state.',
          });
        }

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
          userId: updatedOrder.user,
          orderId: updatedOrder._id,
          order: updatedOrder,
          eventType: 'ORDER_DELIVERED',
        }).catch((e) => console.error('[Notification] ORDER_DELIVERED dispatch error:', e.message));

        emitOrderEvent(req, 'order:delivered', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'DELIVERED',
          userId: updatedOrder.user,
          assignedDeliveryPartner: updatedOrder.assignedDeliveryPartner,
        });
        emitOrderEvent(req, 'order:status_updated', {
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: 'DELIVERED',
          userId: updatedOrder.user,
          assignedDeliveryPartner: updatedOrder.assignedDeliveryPartner,
        });

        const responseOrder = updatedOrder.toJSON();
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

