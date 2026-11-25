const crypto = require('crypto');
const mongoose = require('mongoose');
const { Order, DeliverySlot, SystemSetting } = require('../models');
const { getKolkataDateString, isValidDateString } = require('../utils/businessDate');
const NotificationDispatcher = require('../utils/notificationDispatcher');

const DEFAULT_REMINDER_MINUTES = {
  morning: 120,
  noon: 120,
  evening: 60,
  night: 60,
};

/**
 * Formats a Date in Asia/Kolkata timezone (e.g. "26 Nov, 06:30 PM IST")
 */
function formatKolkataDateTime(date) {
  if (!date || isNaN(new Date(date).getTime())) return '';
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date)) + ' IST'
  );
}

/**
 * Resolves the configured reminder lead minutes for a delivery slot.
 * Checks slotKey first, then time window "HH:mm-HH:mm", then sensible defaults.
 */
function resolveReminderMinutes(slot, settingsMap = DEFAULT_REMINDER_MINUTES) {
  const map = settingsMap && typeof settingsMap === 'object' ? settingsMap : DEFAULT_REMINDER_MINUTES;
  const slotKey = String(slot?.slotKey || '').trim().toLowerCase();
  const timeKey =
    slot?.startTime && slot?.endTime ? `${slot.startTime}-${slot.endTime}`.toLowerCase() : '';
  const labelKey = String(slot?.label || '').trim().toLowerCase();

  if (slotKey && typeof map[slotKey] === 'number' && Number.isInteger(map[slotKey])) {
    return Math.max(0, Math.min(1440, map[slotKey]));
  }
  if (timeKey && typeof map[timeKey] === 'number' && Number.isInteger(map[timeKey])) {
    return Math.max(0, Math.min(1440, map[timeKey]));
  }
  if (labelKey && typeof map[labelKey] === 'number' && Number.isInteger(map[labelKey])) {
    return Math.max(0, Math.min(1440, map[labelKey]));
  }

  // Fallback by slot start time / key
  if (slotKey === 'morning' || slotKey === 'noon' || slotKey === 'afternoon') return 120;
  if (slotKey === 'evening' || slotKey === 'night') return 60;
  if (slot?.startTime && slot.startTime < '15:00') return 120;
  return 60;
}

/**
 * Computes reminderAt = (deliveryDateStr + startTime in Asia/Kolkata) - leadMinutes
 */
function calculateReminderAt({ deliveryDateStr, startTime, leadMinutes }) {
  if (!isValidDateString(deliveryDateStr) || !startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
    return null;
  }
  const mins = Number.isInteger(Number(leadMinutes)) ? Math.max(0, Number(leadMinutes)) : 60;
  const slotStartUtc = new Date(`${deliveryDateStr}T${startTime}:00+05:30`);
  if (isNaN(slotStartUtc.getTime())) return null;
  return new Date(slotStartUtc.getTime() - mins * 60 * 1000);
}

/**
 * Checks whether an order is eligible to receive preparation reminders.
 */
function isOrderEligibleForReminder(order) {
  if (!order) return false;
  const status = String(order.orderStatus || '').toUpperCase();
  if (status === 'CANCELLED' || status === 'DELIVERED') {
    return false;
  }
  // Online Razorpay orders that haven't been paid yet wait until payment confirmation
  if (
    String(order.paymentMethod || '').toUpperCase() === 'RAZORPAY' &&
    String(order.paymentStatus || '').toUpperCase() === 'PENDING' &&
    status === 'PENDING'
  ) {
    return false;
  }
  return true;
}

/**
 * Loads PREPARATION_REMINDER_MINUTES from SystemSetting merged with defaults.
 */
async function getReminderSettingsMap() {
  try {
    const setting = await SystemSetting.findOne({ key: 'PREPARATION_REMINDER_MINUTES' }).lean();
    if (setting && setting.value && typeof setting.value === 'object') {
      return { ...DEFAULT_REMINDER_MINUTES, ...setting.value };
    }
  } catch {
    // Fallback to defaults
  }
  return { ...DEFAULT_REMINDER_MINUTES };
}

/**
 * Extracts normalized slot metadata from a DeliverySlot doc or denormalized order fields.
 */
function extractSlotMeta(order, slotDoc) {
  const s = slotDoc || (order?.deliverySlot && typeof order.deliverySlot === 'object' ? order.deliverySlot : null);
  const deliveryDateStr =
    (s?.dateStr && isValidDateString(s.dateStr) ? s.dateStr : null) ||
    (s?.date ? getKolkataDateString(s.date) : null) ||
    (order?.deliveryDateStr && isValidDateString(order.deliveryDateStr) ? order.deliveryDateStr : null) ||
    (order?.createdAt ? getKolkataDateString(order.createdAt) : getKolkataDateString());

  const startTime = s?.startTime || order?.deliverySlotStartTime || null;
  const endTime = s?.endTime || order?.deliverySlotEndTime || null;
  const label = s?.label || order?.deliverySlotLabel || '';
  const slotKey =
    (s?.slotKey && String(s.slotKey).trim().toLowerCase()) ||
    (order?.deliverySlotKey && String(order.deliverySlotKey).trim().toLowerCase()) ||
    (label ? label.trim().toLowerCase().replace(/\s+/g, '_') : null) ||
    (startTime && endTime ? `${startTime}-${endTime}` : null);

  return {
    deliveryDateStr,
    slotKey,
    label,
    startTime,
    endTime,
  };
}

class PreparationReminderService {
  /**
   * Schedules or recalculates an order's preparation reminder and denormalized slot fields.
   * Safe to call on order creation, payment confirmation, slot/date change, or settings change.
   */
  static async scheduleOrRecalculateReminder(orderOrId, options = {}) {
    const { now = new Date(), settingsMap: providedMap = null, slotDoc = null } = options;

    let order =
      typeof orderOrId === 'string' || mongoose.Types.ObjectId.isValid(orderOrId)
        ? await Order.findById(orderOrId)
        : orderOrId;

    if (!order) return null;

    let resolvedSlot = slotDoc;
    if (!resolvedSlot && order.deliverySlot) {
      if (typeof order.deliverySlot === 'object' && order.deliverySlot.startTime) {
        resolvedSlot = order.deliverySlot;
      } else {
        resolvedSlot = await DeliverySlot.findById(order.deliverySlot).lean();
      }
    }

    const meta = extractSlotMeta(order, resolvedSlot);
    order.deliveryDateStr = meta.deliveryDateStr;
    order.deliverySlotKey = meta.slotKey;
    order.deliverySlotLabel = meta.label;
    order.deliverySlotStartTime = meta.startTime;
    order.deliverySlotEndTime = meta.endTime;

    if (!order.preparationReminder) {
      order.preparationReminder = {};
    }

    const orderStatus = String(order.orderStatus || '').toUpperCase();
    if (orderStatus === 'CANCELLED') {
      order.preparationReminder.status = 'CANCELLED';
      await order.save();
      return order;
    }

    if (orderStatus === 'DELIVERED') {
      if (order.preparationReminder.status !== 'ACKNOWLEDGED') {
        order.preparationReminder.status = 'COMPLETED';
      }
      await order.save();
      return order;
    }

    // If already acknowledged and slot/date didn't change, preserve ACKNOWLEDGED
    if (order.preparationReminder.status === 'ACKNOWLEDGED' && !options.forceRecalculate) {
      await order.save();
      return order;
    }

    if (!meta.deliveryDateStr || !meta.startTime) {
      order.preparationReminder.status = 'NOT_APPLICABLE';
      order.preparationReminder.reminderAt = null;
      await order.save();
      return order;
    }

    const settingsMap = providedMap || (await getReminderSettingsMap());
    const leadMinutes = resolveReminderMinutes(
      { slotKey: meta.slotKey, startTime: meta.startTime, endTime: meta.endTime, label: meta.label },
      settingsMap
    );
    const reminderAt = calculateReminderAt({
      deliveryDateStr: meta.deliveryDateStr,
      startTime: meta.startTime,
      leadMinutes,
    });

    order.preparationReminder.leadMinutes = leadMinutes;
    order.preparationReminder.reminderAt = reminderAt;

    if (!isOrderEligibleForReminder(order) || !reminderAt) {
      order.preparationReminder.status = 'NOT_APPLICABLE';
      await order.save();
      return order;
    }

    const isPastReminderTime = now.getTime() >= reminderAt.getTime();
    if (isPastReminderTime) {
      order.preparationReminder.isLatePrep = true;
      order.preparationReminder.status = 'LATE_PREP';
      const shouldDispatchNow = !order.preparationReminder.sentAt;
      if (shouldDispatchNow) {
        order.preparationReminder.sentAt = now;
        order.preparationReminder.attempts = (order.preparationReminder.attempts || 0) + 1;
      }
      await order.save();

      if (shouldDispatchNow) {
        NotificationDispatcher.dispatchPreparationReminder(order).catch((err) => {
          console.error('[PreparationReminder] Late prep notification error:', err.message);
        });
      }
    } else {
      order.preparationReminder.isLatePrep = false;
      order.preparationReminder.status = 'UPCOMING';
      await order.save();
    }

    return order;
  }

  /**
   * Atomically claims and processes all due UPCOMING reminders whose reminderAt <= now.
   * Safe across multiple backend instances and server restarts.
   */
  static async processDueReminders(now = new Date(), batchLimit = 25) {
    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batchLimit; i++) {
      const lockToken = crypto.randomUUID();
      const lockExpiresAt = new Date(now.getTime() + 60 * 1000);

      const claimedOrder = await Order.findOneAndUpdate(
        {
          'preparationReminder.status': 'UPCOMING',
          'preparationReminder.reminderAt': { $lte: now },
          orderStatus: { $nin: ['CANCELLED', 'DELIVERED'] },
          $or: [
            { 'preparationReminder.lockExpiresAt': null },
            { 'preparationReminder.lockExpiresAt': { $lt: now } },
          ],
        },
        {
          $set: {
            'preparationReminder.lockToken': lockToken,
            'preparationReminder.lockExpiresAt': lockExpiresAt,
          },
          $inc: { 'preparationReminder.attempts': 1 },
        },
        {
          sort: { 'preparationReminder.reminderAt': 1 },
          returnDocument: 'after',
        }
      );

      if (!claimedOrder) {
        break; // No more due reminders
      }

      try {
        // Double-check eligibility after claim
        if (!isOrderEligibleForReminder(claimedOrder)) {
          const nextStatus =
            claimedOrder.orderStatus === 'CANCELLED'
              ? 'CANCELLED'
              : claimedOrder.orderStatus === 'DELIVERED'
              ? 'COMPLETED'
              : 'NOT_APPLICABLE';

          await Order.updateOne(
            { _id: claimedOrder._id, 'preparationReminder.lockToken': lockToken },
            {
              $set: {
                'preparationReminder.status': nextStatus,
                'preparationReminder.lockToken': null,
                'preparationReminder.lockExpiresAt': null,
              },
            }
          );
          continue;
        }

        // Transition status to DUE and record sentAt atomically
        const updated = await Order.findOneAndUpdate(
          {
            _id: claimedOrder._id,
            'preparationReminder.lockToken': lockToken,
            'preparationReminder.status': 'UPCOMING',
          },
          {
            $set: {
              'preparationReminder.status': 'DUE',
              'preparationReminder.sentAt': now,
              'preparationReminder.lockToken': null,
              'preparationReminder.lockExpiresAt': null,
              'preparationReminder.lastError': null,
            },
          },
          { returnDocument: 'after' }
        );

        if (updated) {
          await NotificationDispatcher.dispatchPreparationReminder(updated);
          processedCount++;
        }
      } catch (err) {
        failedCount++;
        await Order.updateOne(
          { _id: claimedOrder._id, 'preparationReminder.lockToken': lockToken },
          {
            $set: {
              'preparationReminder.lockToken': null,
              'preparationReminder.lockExpiresAt': null,
              'preparationReminder.lastError': err.message || 'Unknown dispatch error',
            },
          }
        ).catch(() => {});
      }
    }

    return { processedCount, failedCount };
  }

  /**
   * Acknowledge kitchen preparation for an order.
   */
  static async acknowledgePreparation(orderId, adminUserId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      const err = new Error('Invalid order ID format.');
      err.statusCode = 400;
      throw err;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      const err = new Error('Order not found.');
      err.statusCode = 404;
      throw err;
    }

    if (order.orderStatus === 'CANCELLED') {
      const err = new Error('Cannot acknowledge preparation for a cancelled order.');
      err.statusCode = 400;
      throw err;
    }

    if (!order.preparationReminder) {
      order.preparationReminder = {};
    }

    if (order.preparationReminder.status === 'ACKNOWLEDGED') {
      return order; // Idempotent
    }

    order.preparationReminder.status = 'ACKNOWLEDGED';
    order.preparationReminder.acknowledgedAt = new Date();
    order.preparationReminder.acknowledgedBy = adminUserId || null;
    order.preparationReminder.lockToken = null;
    order.preparationReminder.lockExpiresAt = null;
    await order.save();

    return order;
  }

  /**
   * Cancels pending reminder when an order is cancelled.
   */
  static async cancelReminderForOrder(orderId) {
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return null;
    return Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          'preparationReminder.status': 'CANCELLED',
          'preparationReminder.lockToken': null,
          'preparationReminder.lockExpiresAt': null,
        },
      },
      { returnDocument: 'after' }
    );
  }

  /**
   * Marks reminder completed when an order is delivered (unless already acknowledged).
   */
  static async completeReminderForOrder(orderId) {
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) return null;
    return Order.findOneAndUpdate(
      {
        _id: orderId,
        'preparationReminder.status': { $in: ['UPCOMING', 'DUE', 'LATE_PREP'] },
      },
      {
        $set: {
          'preparationReminder.status': 'COMPLETED',
          'preparationReminder.lockToken': null,
          'preparationReminder.lockExpiresAt': null,
        },
      },
      { returnDocument: 'after' }
    );
  }

  /**
   * Recalculates reminderAt for all active UPCOMING / LATE_PREP orders when settings change.
   */
  static async recalculateAllUpcomingReminders(settingsMap = null) {
    const resolvedMap = settingsMap || (await getReminderSettingsMap());
    const orders = await Order.find({
      orderStatus: { $nin: ['CANCELLED', 'DELIVERED'] },
      'preparationReminder.status': { $in: ['UPCOMING', 'LATE_PREP', 'DUE'] },
    }).populate('deliverySlot');

    let updatedCount = 0;
    for (const order of orders) {
      await PreparationReminderService.scheduleOrRecalculateReminder(order, {
        settingsMap: resolvedMap,
        forceRecalculate: true,
      });
      updatedCount++;
    }
    return updatedCount;
  }
}

module.exports = {
  PreparationReminderService,
  DEFAULT_REMINDER_MINUTES,
  resolveReminderMinutes,
  calculateReminderAt,
  isOrderEligibleForReminder,
  getReminderSettingsMap,
  formatKolkataDateTime,
};
