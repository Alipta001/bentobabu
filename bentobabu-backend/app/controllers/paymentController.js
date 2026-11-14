const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const { Order, WebhookEvent } = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { validateEnv } = require('../config/env');
const { redisDelPattern } = require('../config/redis');

const env = validateEnv();

/**
 * Class-based Controller for Razorpay and COD Payment Processing
 */
class PaymentController {
  /**
   * Helper to instantiate Razorpay client
   */
  static getRazorpayClient() {
    return new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret,
    });
  }

  /**
   * CUSTOMER: Initialize a Razorpay payment order
   * POST /api/v1/payments/razorpay/create-order
   */
  static async createRazorpayOrder(req, res, next) {
    try {
      const { orderId } = req.body;

      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid order ID is required',
        });
      }

      const order = await Order.findOne({ _id: orderId, user: req.user.id });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or does not belong to you',
        });
      }

      if (order.paymentMethod !== 'RAZORPAY') {
        return res.status(400).json({
          success: false,
          message: `Order payment method is ${order.paymentMethod}, not RAZORPAY`,
        });
      }

      if (order.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'This order has already been paid',
        });
      }

      if (order.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot process payment for a cancelled order',
        });
      }

      const amountInPaise = Math.round(order.grandTotal * 100);

      // Idempotency: Reuse existing Razorpay order if already created
      if (order.paymentDetails && order.paymentDetails.razorpayOrderId) {
        return res.status(200).json({
          success: true,
          message: 'Existing Razorpay order retrieved',
          data: {
            razorpayOrderId: order.paymentDetails.razorpayOrderId,
            amount: amountInPaise,
            currency: 'INR',
            keyId: env.razorpayKeyId,
            orderNumber: order.orderNumber,
            customer: {
              name: order.deliveryAddress.fullName,
              phone: order.deliveryAddress.phone,
            },
          },
        });
      }

      // Call Razorpay SDK to create order (or mock in development when using placeholder credentials)
      let razorpayOrder;
      if (env.razorpayKeyId.startsWith('rzp_test_placeholder') || process.env.NODE_ENV === 'test') {
        razorpayOrder = {
          id: `order_test_${crypto.randomBytes(8).toString('hex')}`,
          amount: amountInPaise,
          currency: 'INR',
        };
      } else {
        const razorpay = PaymentController.getRazorpayClient();
        razorpayOrder = await razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: order.orderNumber,
          notes: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            customerPhone: order.deliveryAddress.phone,
          },
        });
      }

      order.paymentDetails.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.status(200).json({
        success: true,
        message: 'Razorpay order created successfully',
        data: {
          razorpayOrderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: env.razorpayKeyId,
          orderNumber: order.orderNumber,
          customer: {
            name: order.deliveryAddress.fullName,
            phone: order.deliveryAddress.phone,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER: Verify checkout payment cryptographic signature
   * POST /api/v1/payments/razorpay/verify
   */
  static async verifyRazorpayPayment(req, res, next) {
    try {
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          success: false,
          message:
            'orderId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required',
        });
      }

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      // 1. Cryptographic HMAC-SHA256 verification with timing-safe comparison
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(payload)
        .digest('hex');

      const isSignatureValid =
        expectedSignature.length === razorpaySignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'utf8'),
          Buffer.from(razorpaySignature, 'utf8')
        );

      if (!isSignatureValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment signature. Verification failed.',
        });
      }

      // 2. Fetch order and verify ownership & ID match
      const order = await Order.findOne({ _id: orderId, user: req.user.id });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or does not belong to you',
        });
      }

      if (order.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Order has expired or been cancelled. Payment cannot be verified for this order.',
        });
      }

      if (
        order.paymentDetails.razorpayOrderId &&
        order.paymentDetails.razorpayOrderId !== razorpayOrderId
      ) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay order ID mismatch with stored order',
        });
      }

      // 3. Idempotent success if already paid
      if (order.paymentStatus === 'PAID') {
        return res.status(200).json({
          success: true,
          message: 'Payment already verified previously',
          data: order,
        });
      }

      // 4. Update order & payment state
      order.paymentStatus = 'PAID';
      order.orderStatus = 'CONFIRMED';
      order.paymentDetails.razorpayOrderId = razorpayOrderId;
      order.paymentDetails.razorpayPaymentId = razorpayPaymentId;
      order.paymentDetails.razorpaySignature = razorpaySignature;

      order.statusHistory.push({
        status: 'CONFIRMED',
        changedBy: req.user.id,
        changedAt: new Date(),
        note: 'Payment verified successfully via Razorpay checkout signature',
      });

      await order.save();

      // Safely dispatch payment success and order confirmation notifications
      NotificationDispatcher.dispatch({
        userId: order.user,
        orderId: order._id,
        order,
        eventType: 'PAYMENT_SUCCESS',
      }).catch((e) => console.error('[Notification] PAYMENT_SUCCESS dispatch error:', e.message));

      NotificationDispatcher.dispatch({
        userId: order.user,
        orderId: order._id,
        order,
        eventType: 'ORDER_CONFIRMED',
      }).catch((e) => console.error('[Notification] ORDER_CONFIRMED dispatch error:', e.message));

      // Invalidate admin dashboard KPI and revenue caches
      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: 'Payment verified and order confirmed successfully',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUBLIC: Process Razorpay Webhook Events
   * POST /api/v1/payments/razorpay/webhook
   */
  static async handleRazorpayWebhook(req, res, next) {
    try {
      const webhookSignature = req.headers['x-razorpay-signature'];
      if (!webhookSignature) {
        return res.status(400).json({
          success: false,
          message: 'Missing x-razorpay-signature header',
        });
      }

      // Raw body verification
      const rawPayload = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', env.razorpayWebhookSecret)
        .update(rawPayload)
        .digest('hex');

      const isSignatureValid =
        expectedSignature.length === webhookSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'utf8'),
          Buffer.from(webhookSignature, 'utf8')
        );

      if (!isSignatureValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature',
        });
      }

      const event = req.body.event;
      const payload = req.body.payload;

      if (!event || !payload) {
        return res.status(400).json({
          success: false,
          message: 'Malformed webhook event payload',
        });
      }

      const eventId =
        req.headers['x-razorpay-event-id'] ||
        req.body.event_id ||
        (payload.payment?.entity?.id ? `${payload.payment.entity.id}_${event}` : null);

      if (eventId) {
        try {
          await WebhookEvent.create({
            eventId,
            event,
            razorpayOrderId: payload.payment?.entity?.order_id || null,
          });
        } catch (dupErr) {
          if (dupErr.code === 11000) {
            // Already processed this exact webhook event
            return res.status(200).json({
              success: true,
              message: 'Webhook event already processed (idempotent)',
            });
          }
          throw dupErr;
        }
      }

      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload.payment?.entity;
        const razorpayOrderId = paymentEntity?.order_id;
        const razorpayPaymentId = paymentEntity?.id;

        if (razorpayOrderId) {
          const order = await Order.findOne({
            'paymentDetails.razorpayOrderId': razorpayOrderId,
          });

          if (order) {
            // If order was cancelled/expired, DO NOT revive it into CONFIRMED
            if (order.orderStatus === 'CANCELLED') {
              order.statusHistory.push({
                status: 'CANCELLED',
                changedBy: null,
                changedAt: new Date(),
                note: `Late payment captured (${razorpayPaymentId}) for cancelled order. Flagged for refund review.`,
              });
              await order.save();
              return res.status(200).json({
                success: true,
                message: 'Late payment acknowledged for cancelled order; flagged for refund review',
              });
            }

            if (order.paymentStatus !== 'PAID') {
              order.paymentStatus = 'PAID';
              order.orderStatus = 'CONFIRMED';
              order.paymentDetails.razorpayPaymentId = razorpayPaymentId;

              order.statusHistory.push({
                status: 'CONFIRMED',
                changedBy: null,
                changedAt: new Date(),
                note: `Payment captured via Razorpay webhook event: ${event}`,
              });

              await order.save();

              NotificationDispatcher.dispatch({
                userId: order.user,
                orderId: order._id,
                order,
                eventType: 'PAYMENT_SUCCESS',
              }).catch((e) => console.error('[Notification] Webhook PAYMENT_SUCCESS dispatch error:', e.message));

              NotificationDispatcher.dispatch({
                userId: order.user,
                orderId: order._id,
                order,
                eventType: 'ORDER_CONFIRMED',
              }).catch((e) => console.error('[Notification] Webhook ORDER_CONFIRMED dispatch error:', e.message));
            }
          }
        }
      } else if (event === 'payment.failed') {
        const paymentEntity = payload.payment?.entity;
        const razorpayOrderId = paymentEntity?.order_id;

        if (razorpayOrderId) {
          const order = await Order.findOne({
            'paymentDetails.razorpayOrderId': razorpayOrderId,
          });

          // Only mark FAILED if order is still PENDING. NEVER overwrite an order that is already PAID or CONFIRMED!
          if (order && order.paymentStatus === 'PENDING' && order.orderStatus === 'PENDING') {
            order.paymentStatus = 'FAILED';
            order.statusHistory.push({
              status: order.orderStatus,
              changedBy: null,
              changedAt: new Date(),
              note: `Payment failed: ${paymentEntity.error_description || 'Transaction unsuccessful'}`,
            });
            await order.save();

            NotificationDispatcher.dispatch({
              userId: order.user,
              orderId: order._id,
              order,
              eventType: 'PAYMENT_FAILED',
              metadata: { reason: paymentEntity.error_description },
            }).catch((e) => console.error('[Notification] Webhook PAYMENT_FAILED dispatch error:', e.message));
          }
        }
      }

      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER: Confirm Cash on Delivery order
   * POST /api/v1/payments/cod/confirm
   */
  static async confirmCodOrder(req, res, next) {
    try {
      const { orderId } = req.body;

      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid order ID is required',
        });
      }

      const order = await Order.findOne({ _id: orderId, user: req.user.id });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or does not belong to you',
        });
      }

      if (order.paymentMethod !== 'COD') {
        return res.status(400).json({
          success: false,
          message: 'This order does not use Cash on Delivery',
        });
      }

      // Idempotency: If already confirmed as COD_PENDING
      if (order.paymentStatus === 'COD_PENDING' && order.orderStatus === 'CONFIRMED') {
        return res.status(200).json({
          success: true,
          message: 'COD order is already confirmed',
          data: order,
        });
      }

      order.orderStatus = 'CONFIRMED';
      order.paymentStatus = 'COD_PENDING';
      order.statusHistory.push({
        status: 'CONFIRMED',
        changedBy: req.user.id,
        changedAt: new Date(),
        note: 'Cash on Delivery order confirmed by customer',
      });

      await order.save();

      // Safely dispatch order confirmation notification
      NotificationDispatcher.dispatch({
        userId: order.user,
        orderId: order._id,
        order,
        eventType: 'ORDER_CONFIRMED',
      }).catch((e) => console.error('[Notification] ORDER_CONFIRMED dispatch error:', e.message));

      // Invalidate admin dashboard KPI and revenue caches
      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: 'Cash on Delivery order confirmed successfully',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER / ADMIN: Get payment details for an order
   * GET /api/v1/payments/:orderId
   */
  static async getPaymentInfo(req, res, next) {
    try {
      const { orderId } = req.params;

      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      const query = { _id: orderId };
      if (req.user.role === 'CUSTOMER') {
        query.user = req.user.id;
      }

      const order = await Order.findOne(query);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          grandTotal: order.grandTotal,
          amountInPaise: Math.round(order.grandTotal * 100),
          paymentDetails: order.paymentDetails,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentController;

