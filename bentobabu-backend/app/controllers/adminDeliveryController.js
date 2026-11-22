const mongoose = require('mongoose');
const {
  DeliveryZone,
  DeliverySlot,
  Order,
  WeeklyDeliverySchedule,
  DateDeliverySchedule,
} = require('../models');
const { normalizePincode } = require('../utils/pincode');
const DeliverySlotService = require('../services/deliverySlotService');
const {
  isValidDateString,
  getDayOfWeek,
  getDayName,
} = require('../utils/businessDate');

/**
 * Class-based Controller for Admin Delivery Configuration & Slot Management
 */
class AdminDeliveryController {
  // ==========================================
  // DELIVERY ZONES
  // ==========================================

  /**
   * GET /api/v1/admin/delivery/zones
   * List all delivery zones
   */
  static async getZones(req, res, next) {
    try {
      const { isActive } = req.query;
      const filter = { isDeleted: { $ne: true } };

      if (isActive !== undefined && isActive !== '') {
        filter.isActive = isActive === 'true' || isActive === true;
      }

      const zones = await DeliveryZone.find(filter).sort({ createdAt: -1 }).lean();

      return res.status(200).json({
        success: true,
        data: {
          count: zones.length,
          zones,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/delivery/zones
   * Create a new delivery zone
   */
  static async createZone(req, res, next) {
    try {
      const {
        name,
        pincodes,
        deliveryCharge = 30,
        minimumOrderAmount = 0,
        estimatedDeliveryMinutes = 35,
        isActive = true,
      } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Zone name is required.',
        });
      }

      if (!Array.isArray(pincodes) || pincodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one PIN code is required.',
        });
      }

      const cleanPincodes = [];
      for (const rawPin of pincodes) {
        const pin = normalizePincode(rawPin);
        if (!pin) {
          return res.status(400).json({
            success: false,
            message: `Invalid PIN code: "${rawPin}". Must be a 6-digit Indian PIN code.`,
          });
        }
        if (!cleanPincodes.includes(pin)) {
          cleanPincodes.push(pin);
        }
      }

      // Check PIN code conflicts across active zones
      if (isActive !== false) {
        const conflictZone = await DeliveryZone.findOne({
          isActive: true,
          isDeleted: { $ne: true },
          pincodes: { $in: cleanPincodes },
        });

        if (conflictZone) {
          const conflictingPins = cleanPincodes.filter((p) => conflictZone.pincodes.includes(p));
          return res.status(409).json({
            success: false,
            message: `PIN code(s) [${conflictingPins.join(', ')}] already belong to active zone: "${conflictZone.name}". A PIN code can belong to only one active delivery zone.`,
          });
        }
      }

      const zone = await DeliveryZone.create({
        name: name.trim(),
        pincodes: cleanPincodes,
        deliveryCharge: Math.max(0, Number(deliveryCharge) || 0),
        minimumOrderAmount: Math.max(0, Number(minimumOrderAmount) || 0),
        estimatedDeliveryMinutes: Math.max(1, Number(estimatedDeliveryMinutes) || 35),
        isActive: Boolean(isActive),
      });

      return res.status(201).json({
        success: true,
        message: 'Delivery zone created successfully.',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/delivery/zones/:id
   * Get delivery zone by ID
   */
  static async getZoneById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery zone ID format.',
        });
      }

      const zone = await DeliveryZone.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Delivery zone not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/zones/:id
   * Update delivery zone
   */
  static async updateZone(req, res, next) {
    try {
      const { id } = req.params;
      const {
        name,
        pincodes,
        deliveryCharge,
        minimumOrderAmount,
        estimatedDeliveryMinutes,
        isActive,
      } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery zone ID format.',
        });
      }

      const zone = await DeliveryZone.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Delivery zone not found.',
        });
      }

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Zone name cannot be empty.',
          });
        }
      }

      let cleanPincodes = zone.pincodes;
      if (pincodes !== undefined) {
        if (!Array.isArray(pincodes) || pincodes.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one PIN code is required.',
          });
        }
        cleanPincodes = [];
        for (const rawPin of pincodes) {
          const pin = normalizePincode(rawPin);
          if (!pin) {
            return res.status(400).json({
              success: false,
              message: `Invalid PIN code: "${rawPin}". Must be a 6-digit Indian PIN code.`,
            });
          }
          if (!cleanPincodes.includes(pin)) {
            cleanPincodes.push(pin);
          }
        }
      }

      if (deliveryCharge !== undefined) {
        const numCharge = Number(deliveryCharge);
        if (isNaN(numCharge) || numCharge < 0) {
          return res.status(400).json({
            success: false,
            message: 'Delivery charge must be a non-negative number.',
          });
        }
      }

      if (minimumOrderAmount !== undefined) {
        const numMin = Number(minimumOrderAmount);
        if (isNaN(numMin) || numMin < 0) {
          return res.status(400).json({
            success: false,
            message: 'Minimum order amount must be a non-negative number.',
          });
        }
      }

      if (estimatedDeliveryMinutes !== undefined) {
        const numEst = Number(estimatedDeliveryMinutes);
        if (isNaN(numEst) || numEst < 1) {
          return res.status(400).json({
            success: false,
            message: 'Estimated delivery time must be at least 1 minute.',
          });
        }
      }

      const activeState = isActive !== undefined ? Boolean(isActive) : zone.isActive;

      // Check conflict if zone is or will be active
      if (activeState) {
        const conflictZone = await DeliveryZone.findOne({
          _id: { $ne: zone._id },
          isActive: true,
          isDeleted: { $ne: true },
          pincodes: { $in: cleanPincodes },
        });

        if (conflictZone) {
          const conflictingPins = cleanPincodes.filter((p) => conflictZone.pincodes.includes(p));
          return res.status(409).json({
            success: false,
            message: `PIN code(s) [${conflictingPins.join(', ')}] already belong to active zone: "${conflictZone.name}". A PIN code can belong to only one active delivery zone.`,
          });
        }
      }

      if (name !== undefined) zone.name = name.trim();
      if (pincodes !== undefined) zone.pincodes = cleanPincodes;
      if (deliveryCharge !== undefined) zone.deliveryCharge = Math.max(0, Number(deliveryCharge) || 0);
      if (minimumOrderAmount !== undefined) zone.minimumOrderAmount = Math.max(0, Number(minimumOrderAmount) || 0);
      if (estimatedDeliveryMinutes !== undefined)
        zone.estimatedDeliveryMinutes = Math.max(1, Number(estimatedDeliveryMinutes) || 35);
      if (isActive !== undefined) zone.isActive = Boolean(isActive);

      await zone.save();

      return res.status(200).json({
        success: true,
        message: 'Delivery zone updated successfully.',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/zones/:id/status
   * Activate or deactivate delivery zone
   */
  static async updateZoneStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery zone ID format.',
        });
      }

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive field must be a boolean.',
        });
      }

      const zone = await DeliveryZone.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Delivery zone not found.',
        });
      }

      if (isActive) {
        // Check for conflicts with existing active zones
        const conflictZone = await DeliveryZone.findOne({
          _id: { $ne: zone._id },
          isActive: true,
          isDeleted: { $ne: true },
          pincodes: { $in: zone.pincodes },
        });

        if (conflictZone) {
          const conflictingPins = zone.pincodes.filter((p) => conflictZone.pincodes.includes(p));
          return res.status(409).json({
            success: false,
            message: `Cannot activate zone "${zone.name}". PIN code(s) [${conflictingPins.join(', ')}] already belong to active zone: "${conflictZone.name}". A PIN code can belong to only one active delivery zone.`,
          });
        }
      }

      zone.isActive = isActive;
      await zone.save();

      return res.status(200).json({
        success: true,
        message: `Delivery zone ${isActive ? 'activated' : 'deactivated'} successfully.`,
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/delivery/zones/:id
   * Soft-delete a delivery zone if no active operational orders exist
   */
  static async deleteZone(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery zone ID format.',
        });
      }

      const zone = await DeliveryZone.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!zone) {
        return res.status(404).json({
          success: false,
          message: 'Delivery zone not found or already deleted.',
        });
      }

      // Prevent accidental deletion if zone is actively tied to live in-progress orders
      const activeOrdersCount = await Order.countDocuments({
        deliveryZone: zone._id,
        orderStatus: { $in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'RIDER_ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
      });

      if (activeOrdersCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete delivery zone "${zone.name}". It is associated with ${activeOrdersCount} active in-flight order(s). Please complete or reassign those orders first.`,
        });
      }

      // Soft-delete to preserve historical order records and references
      zone.isDeleted = true;
      zone.isActive = false;
      zone.deletedAt = new Date();
      await zone.save();

      return res.status(200).json({
        success: true,
        message: `Delivery zone "${zone.name}" has been deleted successfully.`,
        data: { id: zone._id, name: zone.name },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // WEEKLY RECURRING SCHEDULES
  // ==========================================

  /**
   * GET /api/v1/admin/delivery/schedules/weekly
   * Retrieve weekly recurring schedules for all 7 days
   */
  static async getWeeklySchedule(req, res, next) {
    try {
      await DeliverySlotService.seedDefaultWeeklySchedule();
      const schedules = await WeeklyDeliverySchedule.find().sort({ dayOfWeek: 1 }).lean();
      return res.status(200).json({
        success: true,
        data: {
          schedules,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/schedules/weekly/:dayOfWeek
   * Update weekly schedule for a specific day of week (0=Sunday ... 6=Saturday)
   */
  static async updateWeeklySchedule(req, res, next) {
    try {
      const { dayOfWeek } = req.params;
      const { isDeliveryEnabled, slots } = req.body;
      const dayNum = Number(dayOfWeek);

      if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) {
        return res.status(400).json({
          success: false,
          message: 'Invalid day of week. Must be an integer between 0 (Sunday) and 6 (Saturday).',
        });
      }

      const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
      const cleanedSlots = [];

      if (Array.isArray(slots)) {
        for (const s of slots) {
          if (!s.label || typeof s.label !== 'string' || !s.label.trim()) {
            return res.status(400).json({ success: false, message: 'Each slot must have a non-empty label.' });
          }
          if (!s.startTime || !timeFormat.test(s.startTime)) {
            return res.status(400).json({ success: false, message: `Invalid start time "${s.startTime}". Must be in HH:mm format.` });
          }
          if (!s.endTime || !timeFormat.test(s.endTime)) {
            return res.status(400).json({ success: false, message: `Invalid end time "${s.endTime}". Must be in HH:mm format.` });
          }
          if (s.endTime <= s.startTime) {
            return res.status(400).json({ success: false, message: `End time "${s.endTime}" must be after start time "${s.startTime}".` });
          }
          const cap = Number(s.capacity);
          if (!Number.isInteger(cap) || cap < 1) {
            return res.status(400).json({ success: false, message: 'Capacity must be an integer >= 1.' });
          }

          cleanedSlots.push({
            slotKey: s.slotKey || DeliverySlotService.generateSlotKey(s.label, s.startTime, s.endTime),
            label: s.label.trim(),
            startTime: s.startTime,
            endTime: s.endTime,
            capacity: cap,
            isActive: s.isActive !== false,
            orderCutoffMinutes: Math.max(0, Number(s.orderCutoffMinutes) || 0),
          });
        }
      }

      const schedule = await WeeklyDeliverySchedule.findOneAndUpdate(
        { dayOfWeek: dayNum },
        {
          $set: {
            dayName: getDayName(dayNum),
            isDeliveryEnabled: isDeliveryEnabled !== undefined ? Boolean(isDeliveryEnabled) : true,
            slots: cleanedSlots,
          },
        },
        { new: true, upsert: true, returnDocument: 'after' }
      );

      await DeliverySlotService.invalidateCache();

      return res.status(200).json({
        success: true,
        message: `Weekly schedule for ${getDayName(dayNum)} updated successfully.`,
        data: { schedule },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/delivery/schedules/weekly/copy
   * Copy one day's schedule to other target days
   */
  static async copyWeeklySchedule(req, res, next) {
    try {
      const { fromDay, toDays } = req.body;
      const fromNum = Number(fromDay);

      if (isNaN(fromNum) || fromNum < 0 || fromNum > 6) {
        return res.status(400).json({ success: false, message: 'Invalid fromDay. Must be 0-6.' });
      }

      if (!Array.isArray(toDays) || toDays.length === 0) {
        return res.status(400).json({ success: false, message: 'toDays must be a non-empty array of day numbers.' });
      }

      const sourceSchedule = await WeeklyDeliverySchedule.findOne({ dayOfWeek: fromNum }).lean();
      if (!sourceSchedule) {
        return res.status(404).json({ success: false, message: 'Source day schedule not found.' });
      }

      for (const targetDay of toDays) {
        const targetNum = Number(targetDay);
        if (isNaN(targetNum) || targetNum < 0 || targetNum > 6) continue;
        if (targetNum === fromNum) continue;

        await WeeklyDeliverySchedule.findOneAndUpdate(
          { dayOfWeek: targetNum },
          {
            $set: {
              dayName: getDayName(targetNum),
              isDeliveryEnabled: sourceSchedule.isDeliveryEnabled,
              slots: sourceSchedule.slots.map((s) => ({
                slotKey: s.slotKey,
                label: s.label,
                startTime: s.startTime,
                endTime: s.endTime,
                capacity: s.capacity,
                isActive: s.isActive,
                orderCutoffMinutes: s.orderCutoffMinutes || 0,
              })),
            },
          },
          { upsert: true }
        );
      }

      await DeliverySlotService.invalidateCache();
      const updatedSchedules = await WeeklyDeliverySchedule.find().sort({ dayOfWeek: 1 }).lean();

      return res.status(200).json({
        success: true,
        message: `Schedule successfully copied from ${getDayName(fromNum)} to target days.`,
        data: { schedules: updatedSchedules },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DATE-SPECIFIC SCHEDULES
  // ==========================================

  /**
   * GET /api/v1/admin/delivery/schedules/dates/:date
   * Get effective schedule and date-specific overrides for a specific calendar date (YYYY-MM-DD)
   */
  static async getDateSchedule(req, res, next) {
    try {
      const { date } = req.params;
      if (!isValidDateString(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Expected YYYY-MM-DD.' });
      }

      const cleanDate = date.trim();
      const dayOfWeek = getDayOfWeek(cleanDate);
      const dayName = getDayName(dayOfWeek);

      const [scheduleResult, dateConfig, weeklyConfig] = await Promise.all([
        DeliverySlotService.getEffectiveScheduleForDate(cleanDate, true),
        DateDeliverySchedule.findOne({ date: cleanDate }).lean(),
        WeeklyDeliverySchedule.findOne({ dayOfWeek }).lean(),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          date: cleanDate,
          dayOfWeek,
          dayName,
          isClosed: scheduleResult.isClosed,
          closureReason: scheduleResult.closureReason,
          overrideMode: scheduleResult.overrideMode,
          effectiveSlots: scheduleResult.slots,
          dateConfig,
          weeklyConfig,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/schedules/dates/:date
   * Set or update date-specific schedule overrides
   */
  static async updateDateSchedule(req, res, next) {
    try {
      const { date } = req.params;
      if (!isValidDateString(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Expected YYYY-MM-DD.' });
      }

      const cleanDate = date.trim();
      const {
        isClosed,
        closureReason,
        overrideMode = 'INHERIT',
        disabledSlotKeys = [],
        slotOverrides = [],
        customSlots = [],
      } = req.body;

      if (!['INHERIT', 'REPLACE', 'ADDITIVE'].includes(overrideMode)) {
        return res.status(400).json({ success: false, message: 'Invalid overrideMode. Expected INHERIT, REPLACE, or ADDITIVE.' });
      }

      const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
      const cleanedCustomSlots = [];
      if (Array.isArray(customSlots)) {
        for (const cs of customSlots) {
          if (!cs.label || !cs.label.trim()) continue;
          if (!cs.startTime || !timeFormat.test(cs.startTime)) continue;
          if (!cs.endTime || !timeFormat.test(cs.endTime) || cs.endTime <= cs.startTime) continue;
          cleanedCustomSlots.push({
            slotKey: cs.slotKey || DeliverySlotService.generateSlotKey(cs.label, cs.startTime, cs.endTime),
            label: cs.label.trim(),
            startTime: cs.startTime,
            endTime: cs.endTime,
            capacity: Math.max(1, Number(cs.capacity) || 20),
            isActive: cs.isActive !== false,
          });
        }
      }

      const dateSchedule = await DateDeliverySchedule.findOneAndUpdate(
        { date: cleanDate },
        {
          $set: {
            date: cleanDate,
            isClosed: Boolean(isClosed),
            closureReason: typeof closureReason === 'string' ? closureReason.trim() : '',
            overrideMode,
            disabledSlotKeys: Array.isArray(disabledSlotKeys) ? disabledSlotKeys : [],
            slotOverrides: Array.isArray(slotOverrides) ? slotOverrides : [],
            customSlots: cleanedCustomSlots,
          },
        },
        { new: true, upsert: true, returnDocument: 'after' }
      );

      // Re-materialize effective slots and invalidate cache
      const effective = await DeliverySlotService.getEffectiveScheduleForDate(cleanDate, true);
      await DeliverySlotService.invalidateCache(cleanDate);

      return res.status(200).json({
        success: true,
        message: `Date schedule for ${cleanDate} updated successfully.`,
        data: {
          dateSchedule,
          effectiveSlots: effective.slots,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/delivery/schedules/dates/:date
   * Restore weekly recurring schedule for a specific date
   */
  static async restoreWeeklySchedule(req, res, next) {
    try {
      const { date } = req.params;
      if (!isValidDateString(date)) {
        return res.status(400).json({ success: false, message: 'Invalid date format. Expected YYYY-MM-DD.' });
      }

      const cleanDate = date.trim();
      await DateDeliverySchedule.deleteOne({ date: cleanDate });

      // Re-materialize effective schedule following weekly template
      const effective = await DeliverySlotService.getEffectiveScheduleForDate(cleanDate, true);
      await DeliverySlotService.invalidateCache(cleanDate);

      return res.status(200).json({
        success: true,
        message: `Restored recurring weekly schedule for ${cleanDate}.`,
        data: {
          effectiveSlots: effective.slots,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DELIVERY SLOTS (MATERIALIZED)
  // ==========================================

  /**
   * GET /api/v1/admin/delivery/slots
   * List delivery slots with optional date/status filters
   */
  static async getSlots(req, res, next) {
    try {
      const { date, startDate, endDate, isActive } = req.query;

      if (date && typeof date === 'string' && isValidDateString(date.trim())) {
        const cleanDate = date.trim();
        const scheduleResult = await DeliverySlotService.getEffectiveScheduleForDate(cleanDate, true);
        let slots = scheduleResult.slots || [];
        if (isActive !== undefined && isActive !== '') {
          const activeFilter = isActive === 'true' || isActive === true;
          slots = slots.filter((s) => s.isActive === activeFilter);
        }
        return res.status(200).json({
          success: true,
          data: {
            count: slots.length,
            slots,
            state: scheduleResult.state,
            isClosed: scheduleResult.isClosed,
            closureReason: scheduleResult.closureReason,
            overrideMode: scheduleResult.overrideMode,
          },
        });
      }

      const filter = {};
      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date = { $gte: start, $lte: end };
      }

      if (isActive !== undefined && isActive !== '') {
        filter.isActive = isActive === 'true' || isActive === true;
      }

      const slots = await DeliverySlot.find(filter)
        .sort({ date: 1, startTime: 1 })
        .lean();

      return res.status(200).json({
        success: true,
        data: {
          count: slots.length,
          slots,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/delivery/slots
   * Create a new custom delivery slot for a specific date
   */
  static async createSlot(req, res, next) {
    try {
      const {
        date,
        label,
        startTime,
        endTime,
        capacity = 20,
        isActive = true,
      } = req.body;

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Slot date is required.',
        });
      }

      const cleanDate = typeof date === 'string' && isValidDateString(date.trim())
        ? date.trim()
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(date));

      const slotDate = new Date(cleanDate + 'T00:00:00.000Z');

      if (!label || typeof label !== 'string' || !label.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Slot label is required.',
        });
      }

      const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!startTime || !timeFormat.test(startTime)) {
        return res.status(400).json({
          success: false,
          message: 'Start time must be in HH:mm 24-hour format.',
        });
      }

      if (!endTime || !timeFormat.test(endTime)) {
        return res.status(400).json({
          success: false,
          message: 'End time must be in HH:mm 24-hour format.',
        });
      }

      if (endTime <= startTime) {
        return res.status(400).json({
          success: false,
          message: 'End time must be strictly after start time.',
        });
      }

      const numCapacity = Number(capacity);
      if (!Number.isInteger(numCapacity) || numCapacity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Capacity must be an integer greater than or equal to 1.',
        });
      }

      const slotKey = DeliverySlotService.generateSlotKey(label, startTime, endTime);

      const existingSlot = await DeliverySlot.findOne({
        dateStr: cleanDate,
        $or: [{ slotKey }, { startTime, endTime }],
      });

      if (existingSlot) {
        return res.status(409).json({
          success: false,
          message: 'A delivery slot already exists for this date and time interval.',
        });
      }

      const slot = await DeliverySlot.create({
        date: slotDate,
        dateStr: cleanDate,
        slotKey,
        label: label.trim(),
        startTime,
        endTime,
        capacity: numCapacity,
        bookedCount: 0,
        isActive: Boolean(isActive),
        scheduleSource: 'CUSTOM',
      });

      await DeliverySlotService.invalidateCache(cleanDate);

      return res.status(201).json({
        success: true,
        message: 'Delivery slot created successfully.',
        data: { slot },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/slots/:id
   * Update delivery slot
   */
  static async updateSlot(req, res, next) {
    try {
      const { id } = req.params;
      const { label, startTime, endTime, capacity, isActive } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery slot ID format.',
        });
      }

      const slot = await DeliverySlot.findById(id);
      if (!slot) {
        return res.status(404).json({
          success: false,
          message: 'Delivery slot not found.',
        });
      }

      const newStart = startTime || slot.startTime;
      const newEnd = endTime || slot.endTime;

      const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (startTime && !timeFormat.test(startTime)) {
        return res.status(400).json({
          success: false,
          message: 'Start time must be in HH:mm 24-hour format.',
        });
      }

      if (endTime && !timeFormat.test(endTime)) {
        return res.status(400).json({
          success: false,
          message: 'End time must be in HH:mm 24-hour format.',
        });
      }

      if (newEnd <= newStart) {
        return res.status(400).json({
          success: false,
          message: 'End time must be strictly after start time.',
        });
      }

      // If slot already has orders, prevent modifying timings destructively
      if (slot.bookedCount > 0 && (startTime !== undefined || endTime !== undefined)) {
        if (startTime !== slot.startTime || endTime !== slot.endTime) {
          return res.status(400).json({
            success: false,
            message: `Cannot change timing on slot with ${slot.bookedCount} active booking(s). Disable this slot and create a new one instead.`,
          });
        }
      }

      if (capacity !== undefined) {
        const numCapacity = Number(capacity);
        if (!Number.isInteger(numCapacity) || numCapacity < 1) {
          return res.status(400).json({
            success: false,
            message: 'Capacity must be an integer greater than or equal to 1.',
          });
        }

        if (numCapacity < slot.bookedCount) {
          return res.status(400).json({
            success: false,
            message: `Capacity (${numCapacity}) cannot be lower than current booked orders count (${slot.bookedCount}).`,
          });
        }
        slot.capacity = numCapacity;
      }

      if (label !== undefined && label.trim()) slot.label = label.trim();
      if (startTime !== undefined) slot.startTime = startTime;
      if (endTime !== undefined) slot.endTime = endTime;
      if (isActive !== undefined) slot.isActive = Boolean(isActive);

      await slot.save();
      await DeliverySlotService.invalidateCache(slot.dateStr);

      return res.status(200).json({
        success: true,
        message: 'Delivery slot updated successfully.',
        data: { slot },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/delivery/slots/:id/status
   * Activate or deactivate delivery slot
   */
  static async updateSlotStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery slot ID format.',
        });
      }

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive field must be a boolean.',
        });
      }

      const slot = await DeliverySlot.findById(id);
      if (!slot) {
        return res.status(404).json({
          success: false,
          message: 'Delivery slot not found.',
        });
      }

      slot.isActive = isActive;
      await slot.save();
      await DeliverySlotService.invalidateCache(slot.dateStr);

      return res.status(200).json({
        success: true,
        message: `Delivery slot ${isActive ? 'activated' : 'deactivated'} successfully.`,
        data: { slot },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/delivery/slots/:id
   * Delete delivery slot (only if no booked orders)
   */
  static async deleteSlot(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid delivery slot ID format.',
        });
      }

      const slot = await DeliverySlot.findById(id);
      if (!slot) {
        return res.status(404).json({
          success: false,
          message: 'Delivery slot not found.',
        });
      }

      if (slot.bookedCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete delivery slot with ${slot.bookedCount} active order(s). Please disable the slot instead to prevent new bookings.`,
        });
      }

      await DeliverySlot.deleteOne({ _id: id });
      await DeliverySlotService.invalidateCache(slot.dateStr);

      return res.status(200).json({
        success: true,
        message: 'Delivery slot deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminDeliveryController;

