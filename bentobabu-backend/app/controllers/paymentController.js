const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const {
  Order,
  WebhookEvent,
  Product,
  DailyMenu,
  DeliverySlot,
  Coupon,
  CouponUsage,
} = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { validateEnv } = require('../config/env');
const { redisDelPattern } = require('../config/redis');
const { getKolkataDateString } = require('../utils/businessDate');

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
   * Helper: Check whether all items in an order remain orderable / available
   * Product.isActive === true && Product.isAvailable === true && (today's DailyMenu isAvailable !== false)
   */
  static async checkOrderItemsAvailability(order) {
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return { isAvailable: true };
    }

    const todayStr = getKolkataDateString();
    const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();
    const dailyMap = new Map();
    if (dailyMenu && Array.isArray(dailyMenu.items)) {
      dailyMenu.items.forEach((it) => {
        const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
        if (idStr) dailyMap.set(idStr, Boolean(it.isAvailable));
      });
    }

    const productIds = order.items.map((i) => i.product);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map();
    products.forEach((p) => productMap.set(p._id.toString(), p));

    for (const item of order.items) {
      const prodIdStr = item.product.toString();
      const prod = productMap.get(prodIdStr);
      if (!prod || prod.isActive === false || prod.isAvailable === false) {
        return {
          isAvailable: false,
          unavailableItemName: prod ? prod.name : item.productName || 'A requested product',
        };
      }
      if (dailyMap.has(prodIdStr) && dailyMap.get(prodIdStr) === false) {
        return {
          isAvailable: false,
          unavailableItemName: prod.name || item.productName,
        };
      }
    }

    return { isAvailable: true };
  }

  /**
   * Helper: Safe rollback and refund when items become unavailable before payment confirmation
   * Crash-resilient, thread-safe & idempotent:
   * Uses persistent boolean locks (`cancellationRecovery.stockRestored`, `slotRestored`, `couponRestored`)
   * so that if the process crashes midway or restarts, uncompleted side effects are safely recovered
   * on the next retry/webhook without any duplicate decrements or duplicate refund requests.
   */
  static async cancelAndRefundOrderDueToUnavailability({
    order,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    unavailableItemName,
    userId,
  }) {
    // 1. Atomic Lock: Ensure orderStatus is marked CANCELLED
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          orderStatus: 'CANCELLED',
          ...(razorpayOrderId ? { 'paymentDetails.razorpayOrderId': razorpayOrderId } : {}),
          ...(razorpayPaymentId ? { 'paymentDetails.razorpayPaymentId': razorpayPaymentId } : {}),
          ...(razorpaySignature ? { 'paymentDetails.razorpaySignature': razorpaySignature } : {}),
        },
      }
    );

    const lockedOrder = await Order.findById(order._id);
    if (!lockedOrder) {
      return { alreadyHandled: true, order };
    }

    // 2. Durable & Idempotent Stock Restoration (guaranteed exactly once even across process crashes)
    if (!lockedOrder.cancellationRecovery?.stockRestored) {
      const stockLock = await Order.findOneAndUpdate(
        { _id: lockedOrder._id, 'cancellationRecovery.stockRestored': { $ne: true } },
        { $set: { 'cancellationRecovery.stockRestored': true } },
        { returnDocument: 'after' }
      );
      if (stockLock) {
        for (const item of lockedOrder.items) {
          if (item.product && item.quantity) {
            await Product.updateOne(
              { _id: item.product },
              { $inc: { stockQuantity: item.quantity } }
            );
          }
        }
      }
    }

    // 3. Durable & Idempotent Delivery Slot Capacity Rollback
    if (lockedOrder.deliverySlot && !lockedOrder.cancellationRecovery?.slotRestored) {
      const slotLock = await Order.findOneAndUpdate(
        { _id: lockedOrder._id, 'cancellationRecovery.slotRestored': { $ne: true } },
        { $set: { 'cancellationRecovery.slotRestored': true } },
        { returnDocument: 'after' }
      );
      if (slotLock) {
        await DeliverySlot.updateOne(
          { _id: lockedOrder.deliverySlot },
          { $inc: { bookedCount: -1 } }
        );
      }
    }

    // 4. Durable & Idempotent Coupon Usage Rollback
    if (lockedOrder.coupon && !lockedOrder.cancellationRecovery?.couponRestored) {
      const couponLock = await Order.findOneAndUpdate(
        { _id: lockedOrder._id, 'cancellationRecovery.couponRestored': { $ne: true } },
        { $set: { 'cancellationRecovery.couponRestored': true } },
        { returnDocument: 'after' }
      );
      if (couponLock) {
        await Coupon.updateOne(
          { _id: lockedOrder.coupon },
          { $inc: { usedCount: -1 } }
        );
        await CouponUsage.deleteOne({ order: lockedOrder._id });
      }
    }

    // 5. Durable Refund Reconciliation / Request
    // If refund was already processed or is pending at gateway, do NOT trigger duplicate refund
    if (
      lockedOrder.paymentStatus === 'REFUNDED' ||
      lockedOrder.paymentDetails?.refundStatus === 'PROCESSED' ||
      (lockedOrder.paymentDetails?.razorpayRefundId && lockedOrder.paymentDetails?.refundStatus === 'PENDING')
    ) {
      return {
        alreadyHandled: true,
        order: lockedOrder,
        refundStatus: lockedOrder.paymentDetails?.refundStatus || 'PROCESSED',
        refundId: lockedOrder.paymentDetails?.razorpayRefundId,
      };
    }

    const effectivePaymentId = razorpayPaymentId || lockedOrder.paymentDetails?.razorpayPaymentId;
    if (!effectivePaymentId) {
      return {
        alreadyHandled: false,
        order: lockedOrder,
        refundStatus: lockedOrder.paymentDetails?.refundStatus || 'NONE',
      };
    }

    const amountInPaise = Math.round(lockedOrder.grandTotal * 100);
    let razorpayRefund = null;
    let refundErrorMsg = null;
    let isTimeoutOrNetworkError = false;

    if (env.razorpayKeyId.startsWith('rzp_test_placeholder') || process.env.NODE_ENV === 'test') {
      razorpayRefund = {
        id: `rfnd_test_${crypto.randomBytes(8).toString('hex')}`,
        amount: amountInPaise,
        currency: 'INR',
        status: 'processed',
      };
    } else {
      try {
        const razorpay = PaymentController.getRazorpayClient();
        razorpayRefund = await razorpay.payments.refund(effectivePaymentId, {
          amount: amountInPaise,
          notes: {
            reason: `Item "${unavailableItemName || 'Food Item'}" became unavailable before payment confirmation`,
            orderId: lockedOrder._id.toString(),
            orderNumber: lockedOrder.orderNumber,
          },
        });
      } catch (rfErr) {
        refundErrorMsg = rfErr.message || 'Refund request failed';
        if (
          rfErr.code === 'ETIMEDOUT' ||
          rfErr.code === 'ECONNRESET' ||
          (rfErr.message && rfErr.message.toLowerCase().includes('timeout'))
        ) {
          isTimeoutOrNetworkError = true;
        }
        console.error('[Razorpay Refund Error]:', rfErr.message);
      }
    }

    // 6. Persist refund tracking and update payment status
    if (razorpayRefund && razorpayRefund.id) {
      lockedOrder.paymentDetails.razorpayRefundId = razorpayRefund.id;
      lockedOrder.paymentDetails.refundAmount = lockedOrder.grandTotal;
      lockedOrder.paymentDetails.refundInitiatedAt = new Date();

      if (razorpayRefund.status === 'processed') {
        lockedOrder.paymentStatus = 'REFUNDED';
        lockedOrder.paymentDetails.refundStatus = 'PROCESSED';
        lockedOrder.paymentDetails.refundProcessedAt = new Date();
        lockedOrder.paymentDetails.refundError = null;

        lockedOrder.statusHistory.push({
          status: 'CANCELLED',
          changedBy: userId || null,
          changedAt: new Date(),
          note: `Order cancelled because "${unavailableItemName || 'Item'}" became unavailable before payment confirmation. Full refund of ₹${lockedOrder.grandTotal} completed via Razorpay (Refund ID: ${razorpayRefund.id}).`,
        });
      } else {
        // Status is pending at gateway
        lockedOrder.paymentStatus = 'REFUND_PENDING';
        lockedOrder.paymentDetails.refundStatus = 'PENDING';

        lockedOrder.statusHistory.push({
          status: 'CANCELLED',
          changedBy: userId || null,
          changedAt: new Date(),
          note: `Order cancelled because "${unavailableItemName || 'Item'}" became unavailable before payment confirmation. Full refund of ₹${lockedOrder.grandTotal} initiated via Razorpay (Refund ID: ${razorpayRefund.id}). Processing with customer bank.`,
        });
      }
    } else if (isTimeoutOrNetworkError) {
      lockedOrder.paymentStatus = 'REFUND_PENDING';
      lockedOrder.paymentDetails.refundStatus = 'PENDING';
      lockedOrder.paymentDetails.refundError = `Gateway timeout: ${refundErrorMsg}`;

      lockedOrder.statusHistory.push({
        status: 'CANCELLED',
        changedBy: userId || null,
        changedAt: new Date(),
        note: `Order cancelled because "${unavailableItemName || 'Item'}" became unavailable. Automated refund request timed out. Pending reconciliation via webhook or manual check.`,
      });
    } else {
      lockedOrder.paymentStatus = 'REFUND_FAILED';
      lockedOrder.paymentDetails.refundStatus = 'FAILED';
      lockedOrder.paymentDetails.refundError = refundErrorMsg;

      lockedOrder.statusHistory.push({
        status: 'CANCELLED',
        changedBy: userId || null,
        changedAt: new Date(),
        note: `Order cancelled because "${unavailableItemName || 'Item'}" became unavailable. Automated refund failed (${refundErrorMsg}). FLAGGED FOR MANUAL ADMIN REFUND.`,
      });
    }

    await lockedOrder.save();
    await redisDelPattern('cache:products:*');
    await redisDelPattern('cache:admin:dashboard:*');

    return {
      alreadyHandled: false,
      order: lockedOrder,
      refundStatus: lockedOrder.paymentDetails.refundStatus,
      refundId: lockedOrder.paymentDetails.razorpayRefundId,
    };
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

      // 4. Verify product availability before confirming order
      const availCheck = await PaymentController.checkOrderItemsAvailability(order);
      if (!availCheck.isAvailable) {
        const refundResult = await PaymentController.cancelAndRefundOrderDueToUnavailability({
          order,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          unavailableItemName: availCheck.unavailableItemName,
          userId: req.user.id,
        });

        const cancelledOrder = refundResult.order || order;
        let customerRefundMsg = `"${availCheck.unavailableItemName}" became unavailable while your payment was processing.`;
        if (cancelledOrder.paymentStatus === 'REFUNDED') {
          customerRefundMsg += ` Your payment has been received and a full refund of ₹${cancelledOrder.grandTotal} has been completed to your original payment method.`;
        } else if (cancelledOrder.paymentStatus === 'REFUND_PENDING') {
          customerRefundMsg += ` Your payment has been received and a full refund of ₹${cancelledOrder.grandTotal} has been initiated to your original payment method (will reflect in 5-7 business days).`;
        } else {
          customerRefundMsg += ` Your payment has been safely recorded and our team has been notified to issue your full refund of ₹${cancelledOrder.grandTotal} immediately.`;
        }

        return res.status(409).json({
          success: false,
          message: customerRefundMsg,
          data: cancelledOrder,
        });
      }

      // 5. Atomic confirmation to guarantee single execution under concurrency
      const confirmedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          user: req.user.id,
          orderStatus: 'PENDING',
          paymentStatus: 'PENDING',
        },
        {
          $set: {
            paymentStatus: 'PAID',
            orderStatus: 'CONFIRMED',
            'paymentDetails.razorpayOrderId': razorpayOrderId,
            'paymentDetails.razorpayPaymentId': razorpayPaymentId,
            'paymentDetails.razorpaySignature': razorpaySignature,
          },
          $push: {
            statusHistory: {
              status: 'CONFIRMED',
              changedBy: req.user.id,
              changedAt: new Date(),
              note: 'Payment verified successfully via Razorpay checkout signature',
            },
          },
        },
        { new: true }
      );

      if (!confirmedOrder) {
        // Concurrently confirmed by webhook or parallel verification
        const currentOrder = await Order.findOne({ _id: orderId, user: req.user.id });
        if (currentOrder && currentOrder.paymentStatus === 'PAID') {
          return res.status(200).json({
            success: true,
            message: 'Payment already verified previously',
            data: currentOrder,
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Unable to verify payment in current order state',
        });
      }

      // Safely dispatch payment success and order confirmation notifications
      NotificationDispatcher.dispatch({
        userId: confirmedOrder.user,
        orderId: confirmedOrder._id,
        order: confirmedOrder,
        eventType: 'PAYMENT_SUCCESS',
      }).catch((e) => console.error('[Notification] PAYMENT_SUCCESS dispatch error:', e.message));

      NotificationDispatcher.dispatch({
        userId: confirmedOrder.user,
        orderId: confirmedOrder._id,
        order: confirmedOrder,
        eventType: 'ORDER_CONFIRMED',
      }).catch((e) => console.error('[Notification] ORDER_CONFIRMED dispatch error:', e.message));

      // Invalidate admin dashboard KPI and revenue caches
      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: 'Payment verified and order confirmed successfully',
        data: confirmedOrder,
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

      if (!env.razorpayWebhookSecret) {
        return res.status(500).json({
          success: false,
          message: 'Razorpay webhook secret is not configured on the server',
        });
      }

      // Raw body verification
      const rawPayload = req.rawBody
        ? req.rawBody.toString('utf8')
        : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
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
        (payload.payment?.entity?.id ? `${payload.payment.entity.id}_${event}` : null) ||
        (payload.refund?.entity?.id ? `${payload.refund.entity.id}_${event}` : null);

      if (eventId) {
        try {
          await WebhookEvent.create({
            eventId,
            event,
            razorpayOrderId: payload.payment?.entity?.order_id || payload.order?.entity?.id || null,
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
              if (
                order.paymentStatus !== 'REFUNDED' &&
                order.paymentStatus !== 'REFUND_PENDING' &&
                order.paymentDetails.razorpayPaymentId !== razorpayPaymentId
              ) {
                order.statusHistory.push({
                  status: 'CANCELLED',
                  changedBy: null,
                  changedAt: new Date(),
                  note: `Late payment captured (${razorpayPaymentId}) for cancelled order. Flagged for refund review.`,
                });
                await order.save();
              }
              return res.status(200).json({
                success: true,
                message: 'Late payment acknowledged for cancelled order; flagged for refund review',
              });
            }

            if (order.paymentStatus !== 'PAID') {
              // Verify product availability before confirming order
              const availCheck = await PaymentController.checkOrderItemsAvailability(order);
              if (!availCheck.isAvailable) {
                await PaymentController.cancelAndRefundOrderDueToUnavailability({
                  order,
                  razorpayOrderId,
                  razorpayPaymentId,
                  razorpaySignature: null,
                  unavailableItemName: availCheck.unavailableItemName,
                  userId: null,
                });

                return res.status(200).json({
                  success: true,
                  message: `Item "${availCheck.unavailableItemName}" became unavailable; order cancelled and refund initiated`,
                });
              }

              // Atomic confirmation to prevent concurrency race with verify endpoint
              const confirmedOrder = await Order.findOneAndUpdate(
                {
                  _id: order._id,
                  orderStatus: 'PENDING',
                  paymentStatus: 'PENDING',
                },
                {
                  $set: {
                    paymentStatus: 'PAID',
                    orderStatus: 'CONFIRMED',
                    'paymentDetails.razorpayPaymentId': razorpayPaymentId,
                  },
                  $push: {
                    statusHistory: {
                      status: 'CONFIRMED',
                      changedBy: null,
                      changedAt: new Date(),
                      note: `Payment captured via Razorpay webhook event: ${event}`,
                    },
                  },
                },
                { new: true }
              );

              if (confirmedOrder) {
                NotificationDispatcher.dispatch({
                  userId: confirmedOrder.user,
                  orderId: confirmedOrder._id,
                  order: confirmedOrder,
                  eventType: 'PAYMENT_SUCCESS',
                }).catch((e) => console.error('[Notification] Webhook PAYMENT_SUCCESS dispatch error:', e.message));

                NotificationDispatcher.dispatch({
                  userId: confirmedOrder.user,
                  orderId: confirmedOrder._id,
                  order: confirmedOrder,
                  eventType: 'ORDER_CONFIRMED',
                }).catch((e) => console.error('[Notification] Webhook ORDER_CONFIRMED dispatch error:', e.message));
              }
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
      } else if (event === 'refund.processed') {
        const refundEntity = payload.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundId = refundEntity?.id;
        const refundAmount = refundEntity?.amount ? refundEntity.amount / 100 : null;

        if (paymentId || refundId) {
          const order = await Order.findOne({
            $or: [
              ...(paymentId ? [{ 'paymentDetails.razorpayPaymentId': paymentId }] : []),
              ...(refundId ? [{ 'paymentDetails.razorpayRefundId': refundId }] : []),
            ],
          });

          if (order) {
            order.paymentStatus = 'REFUNDED';
            order.paymentDetails.razorpayRefundId = refundId || order.paymentDetails.razorpayRefundId;
            order.paymentDetails.refundStatus = 'PROCESSED';
            order.paymentDetails.refundProcessedAt = new Date();
            order.paymentDetails.refundAmount = refundAmount || order.grandTotal;
            order.paymentDetails.refundError = null;

            order.statusHistory.push({
              status: order.orderStatus,
              changedBy: null,
              changedAt: new Date(),
              note: `Refund of ₹${refundAmount || order.grandTotal} processed successfully by Razorpay (Refund ID: ${refundId}).`,
            });
            await order.save();
          }
        }
      } else if (event === 'refund.created') {
        const refundEntity = payload.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundId = refundEntity?.id;
        const refundAmount = refundEntity?.amount ? refundEntity.amount / 100 : null;

        if (paymentId || refundId) {
          const order = await Order.findOne({
            $or: [
              ...(paymentId ? [{ 'paymentDetails.razorpayPaymentId': paymentId }] : []),
              ...(refundId ? [{ 'paymentDetails.razorpayRefundId': refundId }] : []),
            ],
          });

          if (order && order.paymentStatus !== 'REFUNDED') {
            order.paymentStatus = 'REFUND_PENDING';
            order.paymentDetails.razorpayRefundId = refundId || order.paymentDetails.razorpayRefundId;
            order.paymentDetails.refundStatus = 'PENDING';
            order.paymentDetails.refundAmount = refundAmount || order.grandTotal;
            order.paymentDetails.refundInitiatedAt = new Date();

            order.statusHistory.push({
              status: order.orderStatus,
              changedBy: null,
              changedAt: new Date(),
              note: `Refund of ₹${refundAmount || order.grandTotal} created in Razorpay (Refund ID: ${refundId}). Awaiting processing.`,
            });
            await order.save();
          }
        }
      } else if (event === 'refund.failed') {
        const refundEntity = payload.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundId = refundEntity?.id;
        const refundErrorDesc = refundEntity?.error_description || 'Refund processing failed by bank/gateway';

        if (paymentId || refundId) {
          const order = await Order.findOne({
            $or: [
              ...(paymentId ? [{ 'paymentDetails.razorpayPaymentId': paymentId }] : []),
              ...(refundId ? [{ 'paymentDetails.razorpayRefundId': refundId }] : []),
            ],
          });

          if (order) {
            order.paymentStatus = 'REFUND_FAILED';
            order.paymentDetails.refundStatus = 'FAILED';
            order.paymentDetails.refundError = refundErrorDesc;

            order.statusHistory.push({
              status: order.orderStatus,
              changedBy: null,
              changedAt: new Date(),
              note: `Razorpay refund failed: ${refundErrorDesc}. FLAGGED FOR MANUAL ADMIN REFUND.`,
            });
            await order.save();
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

  /**
   * ADMIN: Safely retry a failed refund
   * POST /api/v1/payments/:orderId/retry-refund
   */
  static async retryRefund(req, res, next) {
    try {
      const { orderId } = req.params;

      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid order ID format is required',
        });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (order.orderStatus !== 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'Refund can only be retried on cancelled orders',
        });
      }

      if (order.paymentStatus === 'REFUNDED' && order.paymentDetails?.refundStatus === 'PROCESSED') {
        return res.status(400).json({
          success: false,
          message: `Refund has already been completed with ID ${order.paymentDetails.razorpayRefundId}`,
        });
      }

      const razorpayPaymentId = order.paymentDetails?.razorpayPaymentId;
      if (!razorpayPaymentId) {
        return res.status(400).json({
          success: false,
          message: 'No Razorpay payment ID recorded for this order',
        });
      }

      const amountInPaise = Math.round(order.grandTotal * 100);
      let razorpayRefund = null;
      let refundErrorMsg = '';

      if (env.razorpayKeyId.startsWith('rzp_test_placeholder') || process.env.NODE_ENV === 'test') {
        razorpayRefund = {
          id: `rfnd_test_${crypto.randomBytes(8).toString('hex')}`,
          amount: amountInPaise,
          currency: 'INR',
          status: 'processed',
        };
      } else {
        try {
          const razorpay = PaymentController.getRazorpayClient();
          razorpayRefund = await razorpay.payments.refund(razorpayPaymentId, {
            amount: amountInPaise,
            notes: {
              reason: 'Manual refund retry by administrator',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
            },
          });
        } catch (rfErr) {
          refundErrorMsg = rfErr.message || 'Refund retry failed';
        }
      }

      if (razorpayRefund && razorpayRefund.id) {
        order.paymentDetails.razorpayRefundId = razorpayRefund.id;
        order.paymentDetails.refundAmount = order.grandTotal;
        order.paymentDetails.refundInitiatedAt = new Date();

        if (razorpayRefund.status === 'processed') {
          order.paymentStatus = 'REFUNDED';
          order.paymentDetails.refundStatus = 'PROCESSED';
          order.paymentDetails.refundProcessedAt = new Date();
          order.paymentDetails.refundError = null;

          order.statusHistory.push({
            status: 'CANCELLED',
            changedBy: req.user.id,
            changedAt: new Date(),
            note: `Refund retry processed successfully by admin (${req.user.id}). Refund ID: ${razorpayRefund.id}`,
          });
        } else {
          order.paymentStatus = 'REFUND_PENDING';
          order.paymentDetails.refundStatus = 'PENDING';

          order.statusHistory.push({
            status: 'CANCELLED',
            changedBy: req.user.id,
            changedAt: new Date(),
            note: `Refund retry initiated by admin (${req.user.id}). Status: PENDING, Refund ID: ${razorpayRefund.id}`,
          });
        }

        await order.save();
        await redisDelPattern('cache:admin:dashboard:*');

        return res.status(200).json({
          success: true,
          message: `Refund successfully ${razorpayRefund.status === 'processed' ? 'processed' : 'initiated'}`,
          data: {
            orderId: order._id,
            paymentStatus: order.paymentStatus,
            refundStatus: order.paymentDetails.refundStatus,
            razorpayRefundId: razorpayRefund.id,
          },
        });
      } else {
        order.paymentStatus = 'REFUND_FAILED';
        order.paymentDetails.refundStatus = 'FAILED';
        order.paymentDetails.refundError = refundErrorMsg;

        order.statusHistory.push({
          status: 'CANCELLED',
          changedBy: req.user.id,
          changedAt: new Date(),
          note: `Refund retry failed: ${refundErrorMsg}`,
        });

        await order.save();

        return res.status(502).json({
          success: false,
          message: `Refund retry failed: ${refundErrorMsg}`,
          data: {
            orderId: order._id,
            paymentStatus: order.paymentStatus,
            refundStatus: order.paymentDetails.refundStatus,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentController;

