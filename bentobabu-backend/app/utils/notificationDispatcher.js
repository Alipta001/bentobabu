const { Notification, User, Order, DeviceToken } = require('../models');
const { getEmailTemplate, sendEmail } = require('./email');
const { sendWhatsApp, WHATSAPP_TEMPLATE_MAP } = require('./whatsapp');
const { getMessaging, isFirebaseConfigured } = require('../config/firebase');

/**
 * Human-readable in-app notification messages by event type
 */
const getInAppMessage = (
  eventType,
  {
    orderNumber = '',
    grandTotal = 0,
    reason = '',
    partnerName = '',
    isOutForDelivery = false,
    ticketNumber = '',
    subject = '',
    replyAuthor = '',
    messagePreview = '',
    status = '',
    resolutionNote = '',
  } = {}
) => {
  switch (eventType) {
    case 'SUPPORT_TICKET_CREATED':
      return {
        subject: `Support Ticket Received (#${ticketNumber || orderNumber})`,
        message: `Your support ticket #${ticketNumber || orderNumber} (${subject || 'Support Request'}) has been received. Our team will review and reply shortly.`,
      };
    case 'SUPPORT_TICKET_REPLIED':
      return {
        subject: `New Reply on Ticket (#${ticketNumber || orderNumber})`,
        message: replyAuthor === 'ADMIN'
          ? `BentoBabu Support replied to your ticket #${ticketNumber || orderNumber}: "${(messagePreview || '').slice(0, 80)}..."`
          : `Customer has replied to support ticket #${ticketNumber || orderNumber}.`,
      };
    case 'SUPPORT_TICKET_STATUS_UPDATED':
      return {
        subject: `Ticket #${ticketNumber || orderNumber} Status: ${status || 'Updated'}`,
        message: `Your support ticket #${ticketNumber || orderNumber} status has been updated to ${status || 'Updated'}.${resolutionNote ? ` Note: ${resolutionNote}` : ''}`,
      };
    case 'ORDER_CREATED':
      return {
        subject: `New Order Received (#${orderNumber})`,
        message: `New order #${orderNumber} has been placed. Total: ₹${grandTotal}.`,
      };
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
        ticketNumber: metadata.ticketNumber || '',
        subject: metadata.subject || '',
        replyAuthor: metadata.replyAuthor || '',
        messagePreview: metadata.messagePreview || '',
        status: metadata.status || '',
        resolutionNote: metadata.resolutionNote || '',
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

  /**
   * Retrieves all active device tokens belonging to active ADMIN and KITCHEN staff
   */
  static async getStaffDeviceTokens({ eventType = 'ORDER_CREATED' } = {}) {
    const staffUsers = await User.find({
      role: { $in: ['ADMIN', 'KITCHEN'] },
      isActive: true,
    }).select('_id name email role notificationPreferences');

    const eligibleUsers = staffUsers.filter((u) => {
      const prefs = u.notificationPreferences;
      if (!prefs) return true;
      if (prefs.push === false) return false;
      if (eventType === 'ORDER_CREATED' && prefs.newOrderPushEnabled === false) return false;
      if (eventType !== 'ORDER_CREATED' && prefs.orderUpdatePushEnabled === false) return false;
      return true;
    });

    if (eligibleUsers.length === 0) return [];

    const eligibleUserIds = eligibleUsers.map((u) => u._id);
    const devices = await DeviceToken.find({
      user: { $in: eligibleUserIds },
      isActive: true,
    }).populate({
      path: 'user',
      select: '_id role name email notificationPreferences',
    });

    return devices;
  }

  /**
   * Dispatches push and in-app notifications for staff (ADMIN and KITCHEN) upon order creation
   * Durable, idempotent, and resilient against payment retries and worker restarts.
   */
  static async dispatchStaffOrderPush(options = {}) {
    try {
      let resolvedOrder = null;
      let eventType = 'ORDER_CREATED';

      if (options && (options._id || options.orderNumber)) {
        resolvedOrder = options;
        if (options.eventType) eventType = options.eventType;
      } else if (options && typeof options === 'object') {
        resolvedOrder = options.order || null;
        if (options.eventType) eventType = options.eventType;
        if (!resolvedOrder && options.orderId) {
          resolvedOrder = await Order.findById(options.orderId).lean();
        }
      }

      if (!resolvedOrder) {
        console.warn(`[NotificationDispatcher] Order not found for staff push`);
        return { success: false, reason: 'Order not found' };
      }

      // Accurate payment description without false claims
      const isCod = resolvedOrder.paymentMethod === 'COD' || resolvedOrder.payment?.method === 'COD';
      const isPaid = resolvedOrder.paymentStatus === 'PAID' || resolvedOrder.payment?.status === 'PAID' || resolvedOrder.payment?.status === 'COMPLETED';
      const paymentLabel = isCod ? 'COD' : (isPaid ? 'Paid' : 'Payment Pending');
      const grandTotal = resolvedOrder.grandTotal || resolvedOrder.pricing?.finalPayable || 0;

      // 1. Resolve active ADMIN and KITCHEN users
      const staffUsers = await User.find({
        role: { $in: ['ADMIN', 'KITCHEN'] },
        isActive: true,
      }).select('_id name email role notificationPreferences');

      // 2. Filter by notification preferences (default true for eligible staff)
      const eligibleUsers = staffUsers.filter((u) => {
        const prefs = u.notificationPreferences;
        if (!prefs) return true;
        if (prefs.push === false) return false;
        if (prefs.newOrderPushEnabled === false) return false;
        return true;
      });

      if (eligibleUsers.length === 0) {
        console.log(`[NotificationDispatcher] No eligible active staff users to notify for order ${resolvedOrder.orderNumber}`);
        return { success: true, count: 0, targetedStaffCount: 0 };
      }

      // 3. Create in-app notifications for eligible staff users
      for (const user of eligibleUsers) {
        const inAppKey = `inapp_staff_${user._id}_${resolvedOrder._id}_${eventType}`;
        try {
          await Notification.findOneAndUpdate(
            { idempotencyKey: inAppKey },
            {
              $setOnInsert: {
                user: user._id,
                order: resolvedOrder._id,
                channel: 'IN_APP',
                eventType,
                recipient: user._id.toString(),
                subject: `New Order Received (#${resolvedOrder.orderNumber})`,
                message: `Order #${resolvedOrder.orderNumber} placed (${paymentLabel}). Total: ₹${grandTotal}.`,
                status: 'SENT',
                isRead: false,
                sentAt: new Date(),
                metadata: {
                  orderNumber: resolvedOrder.orderNumber,
                  grandTotal,
                  paymentMethod: resolvedOrder.paymentMethod || resolvedOrder.payment?.method || 'COD',
                  paymentStatus: resolvedOrder.paymentStatus || resolvedOrder.payment?.status || 'PENDING',
                },
              },
            },
            { upsert: true, returnDocument: 'after' }
          );
        } catch (inAppErr) {
          // ignore duplicate key
        }
      }

      // 4. Find all active registered devices for eligible staff users
      const eligibleUserIds = eligibleUsers.map((u) => u._id);
      const devices = await DeviceToken.find({
        user: { $in: eligibleUserIds },
        isActive: true,
      });

      if (!devices || devices.length === 0) {
        console.log(`[NotificationDispatcher] No active device tokens found for ${eligibleUsers.length} staff members.`);
        return { success: true, inAppCount: eligibleUsers.length, pushCount: 0, targetedStaffCount: eligibleUsers.length };
      }

      const messaging = getMessaging();
      const isConfigured = isFirebaseConfigured();

      const pushTitle = 'BentoBabu — New Order Received!';
      const pushBody = `Order #${resolvedOrder.orderNumber} has been placed (${paymentLabel}). Total: ₹${grandTotal}.`;
      const pushData = {
        type: eventType,
        eventType,
        orderId: resolvedOrder._id.toString(),
        orderNumber: resolvedOrder.orderNumber,
        grandTotal: grandTotal.toString(),
        paymentMethod: resolvedOrder.paymentMethod || resolvedOrder.payment?.method || 'COD',
        paymentStatus: resolvedOrder.paymentStatus || resolvedOrder.payment?.status || 'PENDING',
        clickAction: '/orders',
      };

      let successCount = 0;
      let failureCount = 0;
      let skippedCount = 0;

      for (const device of devices) {
        const pushIdempotencyKey = `push_${device._id}_${resolvedOrder._id}_${eventType}`;

        let notifRecord = null;
        try {
          notifRecord = await Notification.findOne({ idempotencyKey: pushIdempotencyKey });
          if (notifRecord && (notifRecord.status === 'SENT' || notifRecord.status === 'PROCESSING')) {
            // Already dispatched / delivered to this device
            skippedCount++;
            continue;
          }

          if (!notifRecord) {
            notifRecord = await Notification.create({
              user: device.user,
              order: resolvedOrder._id,
              channel: 'PUSH',
              eventType,
              recipient: device.token.length > 20 ? `${device.token.substring(0, 10)}...` : device.token,
              subject: pushTitle,
              message: pushBody,
              status: 'PROCESSING',
              idempotencyKey: pushIdempotencyKey,
              attempts: 0,
              maxAttempts: 3,
              metadata: pushData,
            });
          }
        } catch (dbErr) {
          if (dbErr.code === 11000) {
            skippedCount++;
            continue;
          }
          console.error('[NotificationDispatcher] DB error on push notification creation:', dbErr.message);
        }

        if (!isConfigured || !messaging) {
          // Dry-run mode for local development/testing without live Firebase credentials
          console.log(`[NotificationDispatcher:DryRun] Simulated push for order #${resolvedOrder.orderNumber} to device ${device._id}`);
          if (notifRecord) {
            notifRecord.status = 'SENT';
            notifRecord.sentAt = new Date();
            notifRecord.providerMessageId = 'dry-run-simulated-msg-id';
            await notifRecord.save();
          }
          successCount++;
          continue;
        }

        try {
          const response = await messaging.send({
            token: device.token,
            notification: {
              title: pushTitle,
              body: pushBody,
            },
            data: pushData,
            webpush: {
              fcmOptions: {
                link: '/orders',
              },
              notification: {
                icon: '/bentobabu_logo.png',
                badge: '/bentobabu_logo.png',
              },
            },
          });

          device.lastSeenAt = new Date();
          await device.save();

          if (notifRecord) {
            notifRecord.status = 'SENT';
            notifRecord.sentAt = new Date();
            notifRecord.providerMessageId = response;
            await notifRecord.save();
          }
          successCount++;
        } catch (fcmErr) {
          failureCount++;
          const errCode = fcmErr.code || '';
          console.error(`[NotificationDispatcher] FCM send failure to device ${device._id}:`, fcmErr.message);

          // Permanent error handling: Deactivate dead/unregistered tokens
          if (
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/invalid-registration-token'
          ) {
            device.isActive = false;
            device.deactivationReason = 'UNREGISTERED';
            await device.save();
            console.log(`[NotificationDispatcher] Deactivated invalid device token: ${device._id}`);
          }

          if (notifRecord) {
            notifRecord.status = 'FAILED';
            notifRecord.lastError = fcmErr.message?.substring(0, 500) || 'FCM send failed';
            notifRecord.attempts = (notifRecord.attempts || 0) + 1;
            await notifRecord.save();
          }
        }
      }

      console.log(`[NotificationDispatcher] Staff push dispatch complete for order #${resolvedOrder.orderNumber}: ${successCount} sent, ${failureCount} failed out of ${devices.length} devices.`);

      return {
        success: true,
        devicesCount: devices.length,
        targetedStaffCount: eligibleUsers.length,
        successCount,
        failureCount,
        skippedCount,
        alreadyProcessed: skippedCount === devices.length && devices.length > 0,
      };
    } catch (err) {
      console.error('[NotificationDispatcher] Unexpected error in dispatchStaffOrderPush:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = NotificationDispatcher;

