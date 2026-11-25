const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  Order,
  CancellationRequest,
  Product,
  DeliverySlot,
  Coupon,
  CouponUsage,
} = require('../models');
const DailyInventoryService = require('./dailyInventoryService');
const DeliverySlotService = require('./deliverySlotService');
const PaymentController = require('../controllers/paymentController');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { getKolkataDateString } = require('../utils/businessDate');
const { redisDelPattern } = require('../config/redis');
const { validateEnv } = require('../config/env');

const env = validateEnv();

const ELIGIBLE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING'];
const PACKED_AND_BEYOND_STATUSES = [
  'READY_FOR_PICKUP',
  'READY_FOR_DISPATCH',
  'RIDER_ACCEPTED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

class CancellationService {
  /**
   * Check if an order is currently eligible for customer cancellation request
   */
  static isOrderEligibleForCancellation(orderStatus) {
    if (!orderStatus) return false;
    const upper = String(orderStatus).toUpperCase();
    return ELIGIBLE_STATUSES.includes(upper);
  }

  /**
   * Customer submits a cancellation request for an eligible order
   */
  static async createCancellationRequest({ orderId, customerId, reason }) {
    if (!orderId || !mongoose.isValidObjectId(orderId)) {
      const err = new Error('Invalid order ID format');
      err.statusCode = 400;
      throw err;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      const err = new Error('Please provide a meaningful cancellation reason (minimum 5 characters)');
      err.statusCode = 400;
      throw err;
    }

    if (reason.trim().length > 500) {
      const err = new Error('Cancellation reason cannot exceed 500 characters');
      err.statusCode = 400;
      throw err;
    }

    // Verify order exists and belongs to the customer
    const order = await Order.findOne({ _id: orderId, user: customerId });
    if (!order) {
      const err = new Error('Order not found or does not belong to your account');
      err.statusCode = 404;
      throw err;
    }

    if (order.orderStatus === 'CANCELLED') {
      const err = new Error('This order is already cancelled');
      err.statusCode = 400;
      throw err;
    }

    // Check packed and beyond stages
    if (PACKED_AND_BEYOND_STATUSES.includes(order.orderStatus)) {
      const err = new Error(
        `Cannot request cancellation: Order has already entered the "${order.orderStatus.replace(/_/g, ' ')}" stage. Cancellation requests are only allowed before preparation is complete and order is packed.`
      );
      err.statusCode = 400;
      throw err;
    }

    if (!ELIGIBLE_STATUSES.includes(order.orderStatus)) {
      const err = new Error(`Order in "${order.orderStatus}" status is not eligible for cancellation request.`);
      err.statusCode = 400;
      throw err;
    }

    // Prevent duplicate pending requests
    const existingPending = await CancellationRequest.findOne({
      order: order._id,
      status: 'PENDING',
    });
    if (existingPending) {
      const err = new Error('A cancellation request for this order is already submitted and pending admin review.');
      err.statusCode = 409;
      throw err;
    }

    const isPaid = order.paymentStatus === 'PAID';
    const cancellationRequest = await CancellationRequest.create({
      order: order._id,
      customer: customerId,
      reason: reason.trim(),
      status: 'PENDING',
      refundStatus: isPaid ? 'PENDING' : 'NOT_REQUIRED',
      refundAmount: isPaid ? order.grandTotal : 0,
    });

    // Link cancellation request to order
    order.cancellationRequest = cancellationRequest._id;
    await order.save();

    // Invalidate admin dashboard cache so pending count updates in real-time
    await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

    // Dispatch notification to customer
    NotificationDispatcher.dispatch({
      userId: customerId,
      orderId: order._id,
      order,
      eventType: 'CANCELLATION_REQUESTED',
      metadata: { reason: reason.trim(), requestId: cancellationRequest._id },
    }).catch(() => {});

    return cancellationRequest;
  }

  /**
   * Admin approves a cancellation request: cancels order and initiates refund
   */
  static async approveCancellationRequest({ requestId, adminUser }) {
    if (!requestId || !mongoose.isValidObjectId(requestId)) {
      const err = new Error('Invalid cancellation request ID format');
      err.statusCode = 400;
      throw err;
    }

    const cancellationRequest = await CancellationRequest.findById(requestId);
    if (!cancellationRequest) {
      const err = new Error('Cancellation request not found');
      err.statusCode = 404;
      throw err;
    }

    if (cancellationRequest.status !== 'PENDING') {
      const err = new Error(`Cancellation request is already ${cancellationRequest.status.toLowerCase()} and cannot be approved again.`);
      err.statusCode = 400;
      throw err;
    }

    const order = await Order.findById(cancellationRequest.order);
    if (!order) {
      const err = new Error('Associated order for this cancellation request no longer exists');
      err.statusCode = 404;
      throw err;
    }

    // CRITICAL: Revalidate order status at approval time
    if (order.orderStatus === 'CANCELLED') {
      cancellationRequest.status = 'APPROVED';
      cancellationRequest.reviewedBy = adminUser?._id || adminUser?.id;
      cancellationRequest.reviewedAt = new Date();
      await cancellationRequest.save();
      return { cancellationRequest, order };
    }

    if (PACKED_AND_BEYOND_STATUSES.includes(order.orderStatus)) {
      const err = new Error(
        `Cannot approve cancellation: Order has progressed to "${order.orderStatus.replace(/_/g, ' ')}" stage after request was submitted.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Atomic CAS lock: only ONE concurrent approval succeeds
    const lockedRequest = await CancellationRequest.findOneAndUpdate(
      { _id: requestId, status: 'PENDING' },
      {
        $set: {
          status: 'APPROVED',
          reviewedBy: adminUser?._id || adminUser?.id,
          reviewedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!lockedRequest) {
      const err = new Error('Cancellation request was already approved or rejected by another administrator.');
      err.statusCode = 409;
      throw err;
    }

    // Perform atomic order cancellation, cleanup and refund
    await this.executeOrderCancellationAndRefund({
      order,
      cancellationRequest: lockedRequest,
      adminUser,
      reason: lockedRequest.reason,
    });

    await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

    // Dispatch notification
    NotificationDispatcher.dispatch({
      userId: order.user,
      orderId: order._id,
      order,
      eventType: 'CANCELLATION_APPROVED',
      metadata: {
        reason: lockedRequest.reason,
        refundStatus: lockedRequest.refundStatus,
        refundAmount: lockedRequest.refundAmount,
      },
    }).catch(() => {});

    return { cancellationRequest: lockedRequest, order };
  }

  /**
   * Admin rejects a cancellation request with mandatory rejection reason
   */
  static async rejectCancellationRequest({ requestId, adminUser, rejectionReason }) {
    if (!requestId || !mongoose.isValidObjectId(requestId)) {
      const err = new Error('Invalid cancellation request ID format');
      err.statusCode = 400;
      throw err;
    }

    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 3) {
      const err = new Error('Please provide an administrative rejection reason (minimum 3 characters)');
      err.statusCode = 400;
      throw err;
    }

    if (rejectionReason.trim().length > 500) {
      const err = new Error('Rejection reason cannot exceed 500 characters');
      err.statusCode = 400;
      throw err;
    }

    // Atomic CAS lock: only transition if currently PENDING
    const lockedRequest = await CancellationRequest.findOneAndUpdate(
      { _id: requestId, status: 'PENDING' },
      {
        $set: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          reviewedBy: adminUser?._id || adminUser?.id,
          reviewedAt: new Date(),
          refundStatus: 'NOT_REQUIRED',
        },
      },
      { returnDocument: 'after' }
    );

    if (!lockedRequest) {
      const existing = await CancellationRequest.findById(requestId);
      if (!existing) {
        const err = new Error('Cancellation request not found');
        err.statusCode = 404;
        throw err;
      }
      const err = new Error(`Cancellation request is already ${existing.status.toLowerCase()} and cannot be rejected.`);
      err.statusCode = 409;
      throw err;
    }

    const order = await Order.findById(lockedRequest.order);

    await redisDelPattern('cache:admin:dashboard:*').catch(() => {});

    // Dispatch notification
    if (order) {
      NotificationDispatcher.dispatch({
        userId: order.user,
        orderId: order._id,
        order,
        eventType: 'CANCELLATION_REJECTED',
        metadata: { rejectionReason: rejectionReason.trim() },
      }).catch(() => {});
    }

    return lockedRequest;
  }

  /**
   * Admin safely retries a failed refund
   */
  static async retryRefund({ requestId, adminUser }) {
    if (!requestId || !mongoose.isValidObjectId(requestId)) {
      const err = new Error('Invalid cancellation request ID format');
      err.statusCode = 400;
      throw err;
    }

    // Atomic CAS lock: lock to PROCESSING to prevent concurrent duplicate retries
    const lockedRequest = await CancellationRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: 'APPROVED',
        refundStatus: { $in: ['FAILED', 'PENDING'] },
      },
      {
        $set: {
          refundStatus: 'PROCESSING',
        },
      },
      { returnDocument: 'after' }
    );

    if (!lockedRequest) {
      const existing = await CancellationRequest.findById(requestId);
      if (!existing) {
        const err = new Error('Cancellation request not found');
        err.statusCode = 404;
        throw err;
      }
      if (existing.status !== 'APPROVED') {
        const err = new Error('Refund retry is only permitted on approved cancellation requests');
        err.statusCode = 400;
        throw err;
      }
      if (existing.refundStatus === 'SUCCESS') {
        const err = new Error(`Refund has already been completed with ID ${existing.razorpayRefundId}`);
        err.statusCode = 400;
        throw err;
      }
      const err = new Error('Refund is currently being processed or has already been initiated.');
      err.statusCode = 409;
      throw err;
    }

    const order = await Order.findById(lockedRequest.order);
    if (!order) {
      lockedRequest.refundStatus = 'FAILED';
      await lockedRequest.save();
      const err = new Error('Associated order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.orderStatus !== 'CANCELLED') {
      lockedRequest.refundStatus = 'FAILED';
      await lockedRequest.save();
      const err = new Error('Order must be cancelled before retrying refund');
      err.statusCode = 400;
      throw err;
    }

    const razorpayPaymentId = order.paymentDetails?.razorpayPaymentId;
    if (!razorpayPaymentId) {
      lockedRequest.refundStatus = 'FAILED';
      await lockedRequest.save();
      const err = new Error('No Razorpay payment ID recorded for this order');
      err.statusCode = 400;
      throw err;
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

        // Gateway Reconciliation Check: Query Razorpay before issuing refund
        try {
          const existingRefunds = await razorpay.payments.refunds(razorpayPaymentId);
          const found = (existingRefunds?.items || []).find(
            (rf) =>
              rf.receipt === lockedRequest._id.toString() ||
              rf.notes?.cancellationRequestId === lockedRequest._id.toString() ||
              rf.notes?.orderId === order._id.toString()
          );
          if (found) {
            razorpayRefund = found;
          }
        } catch (reconErr) {
          console.warn('[Razorpay Reconciliation] Pre-check warning:', reconErr.message);
        }

        if (!razorpayRefund) {
          razorpayRefund = await razorpay.payments.refund(razorpayPaymentId, {
            amount: amountInPaise,
            receipt: lockedRequest._id.toString(),
            notes: {
              reason: 'Cancellation refund retry by administrator',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              cancellationRequestId: lockedRequest._id.toString(),
            },
          });
        }
      } catch (rfErr) {
        refundErrorMsg = rfErr.message || 'Refund retry failed at payment gateway';
      }
    }

    if (razorpayRefund && razorpayRefund.id) {
      const isProcessed = razorpayRefund.status === 'processed';
      lockedRequest.razorpayRefundId = razorpayRefund.id;
      lockedRequest.refundAmount = order.grandTotal;
      lockedRequest.refundStatus = isProcessed ? 'SUCCESS' : 'INITIATED';
      lockedRequest.failureReason = '';
      await lockedRequest.save();

      order.paymentDetails.razorpayRefundId = razorpayRefund.id;
      order.paymentDetails.refundAmount = order.grandTotal;
      order.paymentDetails.refundStatus = isProcessed ? 'PROCESSED' : 'PENDING';
      order.paymentStatus = isProcessed ? 'REFUNDED' : 'REFUND_PENDING';
      order.paymentDetails.refundError = null;
      if (isProcessed) order.paymentDetails.refundProcessedAt = new Date();
      else order.paymentDetails.refundInitiatedAt = new Date();

      order.statusHistory.push({
        status: 'CANCELLED',
        changedBy: adminUser?._id || adminUser?.id,
        changedAt: new Date(),
        note: `Refund retry ${isProcessed ? 'processed successfully' : 'initiated'} by admin. Refund ID: ${razorpayRefund.id}`,
      });
      await order.save();

      return { success: true, cancellationRequest: lockedRequest, order };
    } else {
      lockedRequest.refundStatus = 'FAILED';
      lockedRequest.failureReason = refundErrorMsg;
      await lockedRequest.save();

      order.paymentStatus = 'REFUND_FAILED';
      order.paymentDetails.refundStatus = 'FAILED';
      order.paymentDetails.refundError = refundErrorMsg;
      await order.save();

      const err = new Error(refundErrorMsg || 'Refund retry failed at payment gateway');
      err.statusCode = 502;
      throw err;
    }
  }

  /**
   * Canonical helper to execute order cancellation, stock restoration, slot capacity release and refund
   */
  static async executeOrderCancellationAndRefund({ order, cancellationRequest, adminUser, reason }) {
    const adminId = adminUser?._id || adminUser?.id || null;
    const finalReason = reason || 'Cancelled by administrator';

    // 1. Release Inventory & Stock exactly once
    if (!order.cancellationRecovery?.stockRestored) {
      const orderDateStr = getKolkataDateString(order.createdAt);
      const itemsToRelease = (order.items || [])
        .filter((it) => it.product && it.quantity)
        .map((it) => ({ productId: it.product, quantity: it.quantity }));

      try {
        await DailyInventoryService.releaseStockAtomic(itemsToRelease, orderDateStr);
      } catch (_) {}

      for (const item of order.items || []) {
        if (item.product && item.quantity) {
          await Product.updateOne(
            { _id: item.product },
            { $inc: { stockQuantity: item.quantity } }
          ).catch(() => {});
        }
      }
    }

    // 2. Release Delivery Slot capacity exactly once
    if (order.deliverySlot && !order.cancellationRecovery?.slotRestored) {
      await DeliverySlot.updateOne(
        { _id: order.deliverySlot, bookedCount: { $gt: 0 } },
        { $inc: { bookedCount: -1 } }
      ).catch(() => {});
      DeliverySlotService.invalidateCache().catch(() => {});
    }

    // 3. Release Coupon usage exactly once
    if (order.coupon && !order.cancellationRecovery?.couponRestored) {
      await CouponUsage.deleteMany({ order: order._id }).catch(() => {});
      await Coupon.updateOne(
        { _id: order.coupon },
        { $inc: { usedCount: -1 } }
      ).catch(() => {});
    }

    order.cancellationRecovery = {
      stockRestored: true,
      slotRestored: true,
      couponRestored: true,
    };

    // 4. Automatic Razorpay Refund for Captured Payment
    const isPaid = order.paymentStatus === 'PAID';
    const razorpayPaymentId = order.paymentDetails?.razorpayPaymentId;

    if (isPaid && razorpayPaymentId) {
      // Prevent duplicate refund if already has an active refund ID
      const existingRefundId = order.paymentDetails?.razorpayRefundId || cancellationRequest?.razorpayRefundId;
      if (existingRefundId && order.paymentDetails?.refundStatus === 'PROCESSED') {
        if (cancellationRequest) {
          cancellationRequest.refundStatus = 'SUCCESS';
          cancellationRequest.razorpayRefundId = existingRefundId;
          cancellationRequest.refundAmount = order.grandTotal;
        }
      } else {
        const amountInPaise = Math.round(order.grandTotal * 100);
        let refundResult = null;
        let refundErrorMsg = '';

        if (env.razorpayKeyId.startsWith('rzp_test_placeholder') || process.env.NODE_ENV === 'test') {
          refundResult = {
            id: `rfnd_test_${crypto.randomBytes(8).toString('hex')}`,
            amount: amountInPaise,
            currency: 'INR',
            status: 'processed',
          };
        } else {
          try {
            const razorpay = PaymentController.getRazorpayClient();

            // Pre-refund gateway reconciliation: verify if Razorpay already has a refund for this payment or cancellation
            try {
              const existingRefunds = await razorpay.payments.refunds(razorpayPaymentId);
              const found = (existingRefunds?.items || []).find(
                (rf) =>
                  rf.receipt === (cancellationRequest?._id?.toString() || ('ord_' + order._id.toString())) ||
                  rf.notes?.cancellationRequestId === cancellationRequest?._id?.toString() ||
                  rf.notes?.orderId === order._id.toString()
              );
              if (found) {
                refundResult = found;
              }
            } catch (reconErr) {
              console.warn('[Razorpay Reconciliation] Pre-check warning:', reconErr.message);
            }

            if (!refundResult) {
              refundResult = await razorpay.payments.refund(razorpayPaymentId, {
                amount: amountInPaise,
                receipt: cancellationRequest ? cancellationRequest._id.toString() : ('ord_' + order._id.toString()),
                notes: {
                  reason: finalReason,
                  orderId: order._id.toString(),
                  orderNumber: order.orderNumber,
                  ...(cancellationRequest ? { cancellationRequestId: cancellationRequest._id.toString() } : {}),
                },
              });
            }
          } catch (rfErr) {
            refundErrorMsg = rfErr.message || 'Razorpay refund processing failed';
          }
        }

        if (refundResult && refundResult.id) {
          const isProcessed = refundResult.status === 'processed';
          order.paymentDetails.razorpayRefundId = refundResult.id;
          order.paymentDetails.refundAmount = order.grandTotal;
          order.paymentDetails.refundStatus = isProcessed ? 'PROCESSED' : 'PENDING';
          order.paymentStatus = isProcessed ? 'REFUNDED' : 'REFUND_PENDING';
          order.paymentDetails.refundError = null;
          if (isProcessed) order.paymentDetails.refundProcessedAt = new Date();
          else order.paymentDetails.refundInitiatedAt = new Date();

          if (cancellationRequest) {
            cancellationRequest.razorpayRefundId = refundResult.id;
            cancellationRequest.refundAmount = order.grandTotal;
            cancellationRequest.refundStatus = isProcessed ? 'SUCCESS' : 'INITIATED';
            cancellationRequest.failureReason = '';
          }
        } else {
          // Do not revert order cancellation if refund fails; record failure for retry
          order.paymentStatus = 'REFUND_FAILED';
          order.paymentDetails.refundStatus = 'FAILED';
          order.paymentDetails.refundError = refundErrorMsg;

          if (cancellationRequest) {
            cancellationRequest.refundStatus = 'FAILED';
            cancellationRequest.failureReason = refundErrorMsg;
          }
        }
      }
    } else {
      // Payment was COD or not captured
      if (order.paymentStatus === 'COD_PENDING') {
        order.paymentStatus = 'FAILED';
      }
      if (cancellationRequest) {
        cancellationRequest.refundStatus = 'NOT_REQUIRED';
      }
    }

    // 5. Update Order Status
    order.orderStatus = 'CANCELLED';
    order.cancellationReason = finalReason;
    if (!order.preparationReminder) order.preparationReminder = {};
    order.preparationReminder.status = 'CANCELLED';
    order.preparationReminder.lockToken = null;
    order.preparationReminder.lockExpiresAt = null;
    order.statusHistory.push({
      status: 'CANCELLED',
      changedBy: adminId,
      changedAt: new Date(),
      note: finalReason,
    });

    await order.save();
    return order;
  }
}

module.exports = CancellationService;
