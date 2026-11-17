const mongoose = require('mongoose');
const { DeliveryZone, DeliverySlot, Order } = require('../models');

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

      const cleanPincodes = [
        ...new Set(pincodes.map((pin) => (typeof pin === 'string' ? pin.trim() : String(pin)))),
      ];

      for (const pin of cleanPincodes) {
        if (!/^[1-9][0-9]{5}$/.test(pin)) {
          return res.status(400).json({
            success: false,
            message: `Invalid PIN code: "${pin}". Must be a 6-digit Indian PIN code.`,
          });
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
            message: `PIN code(s) [${conflictingPins.join(', ')}] already belong to active zone: "${conflictZone.name}".`,
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
        cleanPincodes = [
          ...new Set(pincodes.map((pin) => (typeof pin === 'string' ? pin.trim() : String(pin)))),
        ];
        for (const pin of cleanPincodes) {
          if (!/^[1-9][0-9]{5}$/.test(pin)) {
            return res.status(400).json({
              success: false,
              message: `Invalid PIN code: "${pin}". Must be a 6-digit Indian PIN code.`,
            });
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
            message: `PIN code(s) [${conflictingPins.join(', ')}] already belong to active zone: "${conflictZone.name}".`,
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
            message: `Cannot activate zone. PIN code(s) [${conflictingPins.join(', ')}] already active in zone: "${conflictZone.name}".`,
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
        orderStatus: { $in: ['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY'] },
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
  // DELIVERY SLOTS
  // ==========================================

  /**
   * GET /api/v1/admin/delivery/slots
   * List delivery slots with optional date/status filters
   */
  static async getSlots(req, res, next) {
    try {
      const { date, startDate, endDate, isActive } = req.query;
      const filter = {};

      if (date) {
        const slotDate = new Date(date);
        slotDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(slotDate);
        nextDay.setDate(nextDay.getDate() + 1);
        filter.date = { $gte: slotDate, $lt: nextDay };
      } else if (startDate && endDate) {
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
   * Create a new delivery slot
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

      const slotDate = new Date(date);
      if (isNaN(slotDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid slot date format.',
        });
      }

      slotDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (slotDate < today) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create delivery slots for past dates.',
        });
      }

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

      // Check for duplicate slot on the same date and time interval
      const existingSlot = await DeliverySlot.findOne({
        date: slotDate,
        startTime,
        endTime,
      });

      if (existingSlot) {
        return res.status(409).json({
          success: false,
          message: 'A delivery slot already exists for this date and time interval.',
        });
      }

      const slot = await DeliverySlot.create({
        date: slotDate,
        label: label.trim(),
        startTime,
        endTime,
        capacity: numCapacity,
        bookedCount: 0,
        isActive: Boolean(isActive),
      });

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

      return res.status(200).json({
        success: true,
        message: `Delivery slot ${isActive ? 'activated' : 'deactivated'} successfully.`,
        data: { slot },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminDeliveryController;

