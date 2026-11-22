const mongoose = require('mongoose');
const {
  DeliverySlot,
  WeeklyDeliverySchedule,
  DateDeliverySchedule,
  Order,
} = require('../models');
const {
  getKolkataDateString,
  getKolkataTimeString,
  isValidDateString,
  getDayOfWeek,
  getDayName,
} = require('../utils/businessDate');
const { redisDelPattern } = require('../config/redis');

// Default initial 4 delivery periods as per business requirement
const DEFAULT_SLOTS = [
  {
    slotKey: 'morning',
    label: 'Morning',
    startTime: '08:00',
    endTime: '11:00',
    capacity: 20,
    isActive: true,
    orderCutoffMinutes: 0,
  },
  {
    slotKey: 'noon',
    label: 'Noon',
    startTime: '12:00',
    endTime: '15:00',
    capacity: 25,
    isActive: true,
    orderCutoffMinutes: 0,
  },
  {
    slotKey: 'evening',
    label: 'Evening',
    startTime: '16:00',
    endTime: '19:00',
    capacity: 20,
    isActive: true,
    orderCutoffMinutes: 0,
  },
  {
    slotKey: 'night',
    label: 'Night',
    startTime: '19:30',
    endTime: '22:30',
    capacity: 25,
    isActive: true,
    orderCutoffMinutes: 0,
  },
];

class DeliverySlotService {
  /**
   * Seeds default weekly recurring schedules for all 7 days if not present
   */
  static async seedDefaultWeeklySchedule() {
    const count = await WeeklyDeliverySchedule.countDocuments();
    if (count >= 7) return;

    for (let day = 0; day <= 6; day++) {
      const exists = await WeeklyDeliverySchedule.findOne({ dayOfWeek: day });
      if (!exists) {
        await WeeklyDeliverySchedule.create({
          dayOfWeek: day,
          dayName: getDayName(day),
          isDeliveryEnabled: true,
          slots: DEFAULT_SLOTS.map((s) => ({ ...s })),
        });
      }
    }
  }

  /**
   * Helper to slugify custom slot label into a stable slotKey
   */
  static generateSlotKey(label, startTime, endTime) {
    if (!label) return `slot-${startTime.replace(':', '')}-${endTime.replace(':', '')}`;
    const slug = label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || `slot-${startTime.replace(':', '')}`;
  }

  /**
   * Resolves the effective schedule for a specific date (YYYY-MM-DD in Asia/Kolkata).
   * Combines recurring weekly schedule with date-specific overrides (INHERIT, REPLACE, ADDITIVE),
   * materializes/synchronizes atomic DeliverySlot documents (preserving existing booked counts),
   * and computes accurate state-specific statuses.
   *
   * @param {string} dateStr - 'YYYY-MM-DD'
   * @param {boolean} [forAdmin=false] - If true, returns all configured slots including past/inactive
   * @returns {Promise<{ state: string, message: string, slots: Array, date: string, isClosed: boolean }>}
   */
  static async getEffectiveScheduleForDate(dateStr, forAdmin = false) {
    if (!isValidDateString(dateStr)) {
      throw new Error(`Invalid date string: ${dateStr}. Expected YYYY-MM-DD.`);
    }

    // Ensure weekly schedule defaults exist
    await this.seedDefaultWeeklySchedule();

    const todayStr = getKolkataDateString();
    const currentTimeStr = getKolkataTimeString();
    const isPastDate = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    const dayOfWeek = getDayOfWeek(dateStr);

    if (isPastDate && !forAdmin) {
      return {
        state: 'PAST_DATE',
        message: 'Delivery cannot be scheduled for past dates.',
        date: dateStr,
        dayOfWeek,
        isClosed: false,
        closureReason: '',
        overrideMode: 'INHERIT',
        slots: [],
      };
    }

    // 1. Fetch Weekly Schedule for this day of week
    const weeklyConfig = await WeeklyDeliverySchedule.findOne({ dayOfWeek }).lean();

    // 2. Fetch Date-Specific Overrides for this date
    const dateConfig = await DateDeliverySchedule.findOne({ date: dateStr }).lean();

    // 3. Check Date Closure
    if (dateConfig && dateConfig.isClosed) {
      return {
        state: 'DELIVERY_CLOSED',
        message: dateConfig.closureReason || 'Delivery is unavailable on this date.',
        date: dateStr,
        dayOfWeek,
        isClosed: true,
        closureReason: dateConfig.closureReason || '',
        overrideMode: dateConfig.overrideMode || 'INHERIT',
        slots: [],
      };
    }

    // 4. Check Weekly Delivery Toggle
    if (weeklyConfig && !weeklyConfig.isDeliveryEnabled) {
      return {
        state: 'DELIVERY_CLOSED',
        message: `Delivery is unavailable on ${getDayName(dayOfWeek)}s.`,
        date: dateStr,
        dayOfWeek,
        isClosed: true,
        closureReason: `Delivery disabled on ${getDayName(dayOfWeek)}s`,
        overrideMode: dateConfig?.overrideMode || 'INHERIT',
        slots: [],
      };
    }

    // 5. Build Planned Slots array based on overrideMode
    const overrideMode = dateConfig?.overrideMode || 'INHERIT';
    const disabledKeys = new Set(dateConfig?.disabledSlotKeys || []);
    const slotOverridesMap = new Map();
    if (Array.isArray(dateConfig?.slotOverrides)) {
      dateConfig.slotOverrides.forEach((o) => {
        if (o.slotKey) slotOverridesMap.set(o.slotKey, o);
      });
    }

    let plannedSlots = [];

    if (overrideMode === 'REPLACE') {
      // Entirely replace with customSlots
      if (Array.isArray(dateConfig?.customSlots)) {
        dateConfig.customSlots.forEach((cs) => {
          plannedSlots.push({
            slotKey: cs.slotKey || this.generateSlotKey(cs.label, cs.startTime, cs.endTime),
            label: cs.label,
            startTime: cs.startTime,
            endTime: cs.endTime,
            capacity: cs.capacity || 20,
            isActive: cs.isActive !== false,
            scheduleSource: 'DATE_OVERRIDE',
          });
        });
      }
    } else {
      // INHERIT or ADDITIVE: Start from weekly schedule
      if (weeklyConfig && Array.isArray(weeklyConfig.slots)) {
        weeklyConfig.slots.forEach((ws) => {
          if (disabledKeys.has(ws.slotKey)) {
            // Explicitly disabled on this date
            plannedSlots.push({
              slotKey: ws.slotKey,
              label: ws.label,
              startTime: ws.startTime,
              endTime: ws.endTime,
              capacity: ws.capacity,
              isActive: false, // Disabled for this date
              scheduleSource: 'DATE_OVERRIDE',
            });
            return;
          }

          const override = slotOverridesMap.get(ws.slotKey);
          if (override) {
            plannedSlots.push({
              slotKey: ws.slotKey,
              label: override.label !== undefined ? override.label : ws.label,
              startTime: override.startTime !== undefined ? override.startTime : ws.startTime,
              endTime: override.endTime !== undefined ? override.endTime : ws.endTime,
              capacity: override.capacity !== undefined ? override.capacity : ws.capacity,
              isActive: override.isActive !== undefined ? override.isActive : ws.isActive,
              scheduleSource: 'DATE_OVERRIDE',
            });
          } else {
            plannedSlots.push({
              slotKey: ws.slotKey,
              label: ws.label,
              startTime: ws.startTime,
              endTime: ws.endTime,
              capacity: ws.capacity,
              isActive: ws.isActive !== false,
              scheduleSource: 'WEEKLY',
            });
          }
        });
      }

      // If ADDITIVE, append custom date-specific slots
      if (overrideMode === 'ADDITIVE' && Array.isArray(dateConfig?.customSlots)) {
        dateConfig.customSlots.forEach((cs) => {
          const sKey = cs.slotKey || this.generateSlotKey(cs.label, cs.startTime, cs.endTime);
          // Avoid duplicate keys if custom slot has same key as weekly
          const existingIdx = plannedSlots.findIndex((p) => p.slotKey === sKey);
          const customSlotObj = {
            slotKey: sKey,
            label: cs.label,
            startTime: cs.startTime,
            endTime: cs.endTime,
            capacity: cs.capacity || 20,
            isActive: cs.isActive !== false,
            scheduleSource: 'DATE_ADDITION',
          };
          if (existingIdx >= 0) {
            plannedSlots[existingIdx] = customSlotObj;
          } else {
            plannedSlots.push(customSlotObj);
          }
        });
      }
    }

    if (plannedSlots.length === 0) {
      return {
        state: 'NO_SCHEDULE',
        message: 'No delivery slots have been scheduled for this date.',
        date: dateStr,
        dayOfWeek,
        isClosed: false,
        closureReason: '',
        overrideMode,
        slots: [],
      };
    }

    // 6. Materialize / Sync to DeliverySlot collection idempotently
    // Preserves existing bookedCount from live customer orders
    const targetDateObj = new Date(Date.UTC(
      ...dateStr.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))
    ));

    const synchronizedSlots = [];

    for (const planned of plannedSlots) {
      const updateDoc = {
        $setOnInsert: {
          date: targetDateObj,
          dateStr,
          slotKey: planned.slotKey,
          bookedCount: 0,
        },
        $set: {
          label: planned.label,
          startTime: planned.startTime,
          endTime: planned.endTime,
          capacity: planned.capacity,
          isActive: planned.isActive,
          scheduleSource: planned.scheduleSource || 'WEEKLY',
        },
      };

      const slotDoc = await DeliverySlot.findOneAndUpdate(
        { dateStr, slotKey: planned.slotKey },
        updateDoc,
        { upsert: true, returnDocument: 'after' }
      );

      synchronizedSlots.push(slotDoc);
    }

    // Sort by startTime ascending
    synchronizedSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // 7. Calculate availability and accurate state
    const formattedSlots = synchronizedSlots.map((s) => {
      const remainingCapacity = Math.max(0, s.capacity - (s.bookedCount || 0));
      const isPastWindow = isToday && s.endTime <= currentTimeStr;
      const isAvailable = s.isActive && remainingCapacity > 0 && !isPastWindow;

      return {
        id: s._id.toString(),
        _id: s._id.toString(),
        date: dateStr,
        dateStr: s.dateStr || dateStr,
        slotKey: s.slotKey,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        bookedCount: s.bookedCount || 0,
        remainingCapacity,
        isActive: s.isActive,
        isAvailable,
        isPastWindow,
        scheduleSource: s.scheduleSource || 'WEEKLY',
      };
    });

    // Compute state
    let state = 'AVAILABLE';
    let message = 'Available slots ready for delivery.';

    const activeSlots = formattedSlots.filter((s) => s.isActive);
    if (activeSlots.length === 0) {
      state = 'DELIVERY_CLOSED';
      message = 'Delivery is unavailable on this date.';
    } else {
      const slotsWithCapacity = activeSlots.filter((s) => s.remainingCapacity > 0);
      if (slotsWithCapacity.length === 0) {
        state = 'ALL_FULL';
        message = 'All delivery slots are fully booked. Please select another delivery date.';
      } else if (isToday && slotsWithCapacity.every((s) => s.isPastWindow)) {
        state = 'BOOKING_CLOSED';
        message = "Booking for today's delivery windows has closed.";
      } else {
        state = 'AVAILABLE';
        message = 'Delivery slots are available for booking.';
      }
    }

    return {
      state,
      message,
      date: dateStr,
      dayOfWeek,
      isClosed: false,
      closureReason: '',
      overrideMode,
      slots: formattedSlots,
    };
  }

  /**
   * Selectively invalidates Redis delivery slot caches
   */
  static async invalidateCache(dateStr = null) {
    try {
      if (dateStr) {
        await redisDelPattern(`*delivery*slots*${dateStr}*`);
      }
      await redisDelPattern('*delivery*slots*');
    } catch (err) {
      console.warn('[DeliverySlotService] Cache invalidation warning:', err.message);
    }
  }
}

module.exports = DeliverySlotService;
