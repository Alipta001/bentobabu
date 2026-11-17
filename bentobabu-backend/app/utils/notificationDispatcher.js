const { Notification, User, Order } = require('../models');
const { getEmailTemplate, sendEmail } = require('./email');
const { sendWhatsApp, WHATSAPP_TEMPLATE_MAP } = require('./whatsapp');

/**
 * Human-readable in-app notification messages by event type
 */
const getInAppMessage = (
  eventType,
  { orderNumber = '', grandTotal = 0, reason = '', partnerName = '', isOutForDelivery = false } = {}
) => {
  switch (eventType) {
    case 'ORDER_PLACED':
      return {
        subject: `Order Placed (#${orderNumber})`,
        message: `Your order #${orderNumber} has been placed successfully and sent to our kitchen.`,
      };
    case 'PAYMENT_SUCCESS':
      return {
        subject: `Payment Successful (#${orderNumber})`,
        message: `Payment of ₹${grandTotal} for order #${orderNumber} was verified successfully.`,
      };
    case 'PAYMENT_FAILED':
      return {
        subject: `Payment Failed (#${orderNumber})`,
        message: `Payment attempt failed for order #${orderNumber}. Please retry payment before timeout.`,
      };
    case 'ORDER_CONFIRMED':
      return {
        subject: `Order Confirmed (#${orderNumber})`,
        message: `Your order #${orderNumber} is confirmed and queued for preparation.`,
      };
    case 'ORDER_PREPARING':
      return {
        subject: `Kitchen Preparing Bento (#${orderNumber})`,
        message: `Our kitchen has begun preparing your nutritious meal for order #${orderNumber}.`,
      };
    case 'ORDER_READY':
      return {
        subject: `Order Ready for Pickup (#${orderNumber})`,
        message: `Order #${orderNumber} is freshly packed and waiting for delivery partner pickup.`,
      };
    case 'OUT_FOR_DELIVERY':
      return {
        subject: `Out for Delivery (#${orderNumber})`,
        message: `Your bento box for order #${orderNumber} is on the way! Please share your delivery OTP upon arrival.`,
      };
    case 'ORDER_DELIVERED':
      return {
        subject: `Order Delivered (#${orderNumber})`,
        message: `Order #${orderNumber} has been delivered successfully. Enjoy your healthy bento!`,
      };
    case 'ORDER_CANCELLED':
      return {
        subject: `Order Cancelled (#${orderNumber})`,
        message: `Order #${orderNumber} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
      };
    case 'ORDER_EXPIRED':
      return {
        subject: `Order Expired (#${orderNumber})`,
        message: `Order #${orderNumber} expired due to payment timeout. Reserved items have been released.`,
      };
    case 'DELIVERY_APPLICATION_SUBMITTED':
      return {
        subject: `Delivery Partner Application Received (#${orderNumber})`,
        message: `Your application #${orderNumber} to join the BentoBabu delivery fleet has been received and is under review.`,
      };
    case 'DELIVERY_APPLICATION_APPROVED':
      return {
        subject: `Welcome to the BentoBabu Fleet! (#${orderNumber})`,
        message: `Congratulations! Your delivery partner application #${orderNumber} has been approved. You can now log in and start delivering.`,
      };
    case 'DELIVERY_APPLICATION_REJECTED':
      return {
        subject: `Delivery Partner Application Update (#${orderNumber})`,
        message: `Your application #${orderNumber} was not approved.${reason ? ` Reason: ${reason}` : ''}`,
      };
    case 'DELIVERY_APPLICATION_CORRECTIONS_REQUESTED':
      return {
        subject: `Corrections Requested for Application (#${orderNumber})`,
        message: `Please review your application #${orderNumber}: ${reason || 'Additional information or clearer documents are requested.'}`,
      };
    case 'ORDER_REASSIGNED':
      return {
        subject: `Delivery Partner Updated (#${orderNumber})`,
        message: `A new delivery partner (${partnerName || 'our fleet rider'}) has been assigned to your order #${orderNumber}.${isOutForDelivery ? ' A fresh delivery OTP has been issued for your security.' : ''}`,
      };
    case 'DELIVERY_ASSIGNMENT':
      return {
        subject: `New Delivery Assignment (#${orderNumber})`,
        message: `You have been assigned order #${orderNumber}. Please open your partner dashboard to view details and proceed.`,
      };
    default:
      return {
        subject: `Order Update (#${orderNumber})`,
        message: `There is a new update on your order #${orderNumber}.`,
      };
  }
};

/**
 * Core notification dispatch engine
 * Dispatches notifications across EMAIL, WHATSAPP, and IN_APP based on user preferences.
 */
class NotificationDispatcher {
  /**
   * Helper to resolve user and order documents
   */
  static async resolveRecipientData(userId, orderId, providedOrder = null) {
    let order = providedOrder;
    if (!order && orderId) {
      order = await Order.findById(orderId).lean();
    }

    let user = null;
    const targetUserId = userId || order?.user;
    if (targetUserId) {
      user = await User.findById(targetUserId).lean();
    }

    return { user, order };
  }

  /**
   * Dispatches notifications safely without interrupting business operations
   */
  static async dispatch({ userId, orderId, order = null, eventType, metadata = {} }) {
    try {
      const { user, order: resolvedOrder } = await NotificationDispatcher.resolveRecipientData(
        userId,
        orderId,
        order
      );

      if (!user) {
        console.warn(`[Notification] Recipient user not found for event: ${eventType}`);
        return { success: false, reason: 'Recipient user not found' };
      }

      const orderRef = resolvedOrder?._id || null;
      const orderNumber = resolvedOrder?.orderNumber || metadata.orderNumber || '';
      const grandTotal = resolvedOrder?.grandTotal ?? metadata.grandTotal;
      const items = resolvedOrder?.items || metadata.items || [];
      const deliveryAddress = resolvedOrder?.deliveryAddress || metadata.deliveryAddress || null;
      const reason = metadata.reason || resolvedOrder?.cancellationReason || '';

      const preferences = user.notificationPreferences || {
        email: true,
        whatsapp: false,
        inApp: true,
      };

      const templateData = {
        orderNumber,
        grandTotal,
        customerName: user.name,
        items,
        deliveryAddress,
        reason,
        partnerName: metadata.partnerName || '',
        isOutForDelivery: metadata.isOutForDelivery || false,
      };

      const createdNotifications = [];

      // 1. ================= IN_APP NOTIFICATION =================
      if (preferences.inApp !== false) {
        const inAppIdempotencyKey = `inapp_${orderRef || user._id}_${eventType}${metadata.idempotencySuffix || ''}`;
        const { subject, message } = getInAppMessage(eventType, templateData);

        try {
          const inAppNotif = await Notification.findOneAndUpdate(
            { idempotencyKey: inAppIdempotencyKey },
            {
              $setOnInsert: {
                user: user._id,
                order: orderRef,
                channel: 'IN_APP',
                eventType,
                recipient: user._id.toString(),
                subject,
                message,
                status: 'SENT',
                isRead: false,
                sentAt: new Date(),
                metadata: { orderNumber, grandTotal },
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
          createdNotifications.push(inAppNotif);
        } catch (inAppErr) {
          console.error('[Notification] Error creating IN_APP notification:', inAppErr.message);
        }
      }

      // 2. ================= EMAIL NOTIFICATION =================
      if (preferences.email !== false && user.email) {
        const emailIdempotencyKey = `email_${orderRef || user._id}_${eventType}${metadata.idempotencySuffix || ''}`;
        const { subject, html, text } = getEmailTemplate(eventType, templateData);

        let emailRecord = null;
        try {
          // Check if already created or create PENDING record
          emailRecord = await Notification.findOne({ idempotencyKey: emailIdempotencyKey });
          if (!emailRecord) {
            emailRecord = await Notification.create({
              user: user._id,
              order: orderRef,
              channel: 'EMAIL',
              eventType,
              recipient: user.email,
              subject,
              message: text,
              templateName: eventType,
              status: 'PENDING',
              idempotencyKey: emailIdempotencyKey,
              attempts: 0,
              maxAttempts: 3,
              metadata: { orderNumber, grandTotal },
            });
          }
        } catch (dbErr) {
          if (dbErr.code === 11000) {
            emailRecord = await Notification.findOne({ idempotencyKey: emailIdempotencyKey });
          } else {
            console.error('[Notification] DB error inserting email notification:', dbErr.message);
          }
        }

        if (emailRecord && emailRecord.status === 'PENDING') {
          const sendResult = await sendEmail({
            to: user.email,
            subject,
            html,
            text,
          });

          if (sendResult.success) {
            emailRecord.status = 'SENT';
            emailRecord.sentAt = new Date();
            emailRecord.providerMessageId = sendResult.messageId || null;
            emailRecord.attempts = (emailRecord.attempts || 0) + 1;
            await emailRecord.save();
          } else if (sendResult.skipped) {
            emailRecord.status = 'SKIPPED';
            emailRecord.lastError = sendResult.error;
            await emailRecord.save();
          } else {
            emailRecord.attempts = (emailRecord.attempts || 0) + 1;
            emailRecord.status = emailRecord.attempts >= emailRecord.maxAttempts ? 'FAILED' : 'FAILED';
            emailRecord.lastError = sendResult.error?.substring(0, 500) || 'Email delivery failed';
            emailRecord.nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
            await emailRecord.save();
          }
          createdNotifications.push(emailRecord);
        }
      }

      // 3. ================= WHATSAPP NOTIFICATION =================
      // WhatsApp requires explicit customer consent: preferences.whatsapp === true
      const waIdempotencyKey = `wa_${orderRef || user._id}_${eventType}`;

      if (!preferences.whatsapp) {
        // Customer has NOT consented to WhatsApp notifications -> SKIPPED
        try {
          const skippedNotif = await Notification.findOneAndUpdate(
            { idempotencyKey: waIdempotencyKey },
            {
              $setOnInsert: {
                user: user._id,
                order: orderRef,
                channel: 'WHATSAPP',
                eventType,
                recipient: user.phone,
                subject: `WhatsApp: ${eventType}`,
                message: `WhatsApp notification skipped: customer did not opt in.`,
                templateName: WHATSAPP_TEMPLATE_MAP[eventType] || null,
                status: 'SKIPPED',
                lastError: 'WhatsApp communication skipped: Customer has not consented to WhatsApp updates.',
                metadata: { orderNumber },
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
          createdNotifications.push(skippedNotif);
        } catch (waSkipErr) {
          // ignore duplicate key
        }
      } else if (user.phone) {
        let waRecord = null;
        try {
          waRecord = await Notification.findOne({ idempotencyKey: waIdempotencyKey });
          if (!waRecord) {
            waRecord = await Notification.create({
              user: user._id,
              order: orderRef,
              channel: 'WHATSAPP',
              eventType,
              recipient: user.phone,
              subject: `WhatsApp: ${eventType}`,
              message: `Order #${orderNumber} update`,
              templateName: WHATSAPP_TEMPLATE_MAP[eventType] || null,
              status: 'PENDING',
              idempotencyKey: waIdempotencyKey,
              attempts: 0,
              maxAttempts: 3,
              metadata: { orderNumber, grandTotal },
            });
          }
        } catch (dbErr) {
          if (dbErr.code === 11000) {
            waRecord = await Notification.findOne({ idempotencyKey: waIdempotencyKey });
          } else {
            console.error('[Notification] DB error inserting WhatsApp notification:', dbErr.message);
          }
        }

        if (waRecord && waRecord.status === 'PENDING') {
          const waResult = await sendWhatsApp({
            toPhone: user.phone,
            eventType,
            parameters: [orderNumber, grandTotal ? `₹${grandTotal}` : 'BentoBabu'],
          });

          if (waResult.success) {
            waRecord.status = 'SENT';
            waRecord.sentAt = new Date();
            waRecord.providerMessageId = waResult.messageId || null;
            waRecord.attempts = (waRecord.attempts || 0) + 1;
            await waRecord.save();
          } else if (waResult.skipped) {
            waRecord.status = 'SKIPPED';
            waRecord.lastError = waResult.error;
            await waRecord.save();
          } else {
            waRecord.attempts = (waRecord.attempts || 0) + 1;
            waRecord.status = 'FAILED';
            waRecord.lastError = waResult.error?.substring(0, 500) || 'WhatsApp delivery failed';
            waRecord.nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
            await waRecord.save();
          }
          createdNotifications.push(waRecord);
        }
      }

      return {
        success: true,
        notifications: createdNotifications,
      };
    } catch (error) {
      // Guaranteed safety: notifications must never crash business logic
      console.error(`[NotificationDispatcher] Unexpected failure in dispatch:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Concurrency-safe retry for failed notifications
   */
  static async retry(notificationId) {
    // Atomically claim the notification to prevent concurrent duplicate retries
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        status: 'FAILED',
      },
      {
        $set: { status: 'PROCESSING' },
      },
      { returnDocument: 'after' }
    );

    if (!notification) {
      throw new Error(
        'Notification is not eligible for retry (must be in FAILED status and not currently processing).'
      );
    }

    if (notification.attempts >= notification.maxAttempts) {
      notification.status = 'FAILED';
      notification.lastError = 'Maximum retry limit reached.';
      await notification.save();
      throw new Error('Maximum retry limit reached for this notification.');
    }

    try {
      if (notification.channel === 'EMAIL') {
        const sendResult = await sendEmail({
          to: notification.recipient,
          subject: notification.subject,
          html: notification.message,
          text: notification.message,
        });

        if (sendResult.success) {
          notification.status = 'SENT';
          notification.sentAt = new Date();
          notification.providerMessageId = sendResult.messageId || null;
          notification.lastError = null;
          notification.attempts += 1;
        } else {
          notification.status = 'FAILED';
          notification.attempts += 1;
          notification.lastError = sendResult.error || 'Retry attempt failed';
          notification.nextRetryAt = new Date(Date.now() + 10 * 60 * 1000);
        }
      } else if (notification.channel === 'WHATSAPP') {
        const waResult = await sendWhatsApp({
          toPhone: notification.recipient,
          eventType: notification.eventType,
          parameters: [notification.metadata?.orderNumber || 'BentoBabu'],
        });

        if (waResult.success) {
          notification.status = 'SENT';
          notification.sentAt = new Date();
          notification.providerMessageId = waResult.messageId || null;
          notification.lastError = null;
          notification.attempts += 1;
        } else {
          notification.status = 'FAILED';
          notification.attempts += 1;
          notification.lastError = waResult.error || 'Retry attempt failed';
          notification.nextRetryAt = new Date(Date.now() + 10 * 60 * 1000);
        }
      } else {
        notification.status = 'SENT';
        notification.sentAt = new Date();
      }

      await notification.save();
      return notification;
    } catch (err) {
      notification.status = 'FAILED';
      notification.attempts += 1;
      notification.lastError = err.message || 'Retry failed with unhandled exception';
      await notification.save();
      throw err;
    }
  }
}

module.exports = NotificationDispatcher;

