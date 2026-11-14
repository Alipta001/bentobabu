const { DeliveryZone, DeliverySlot } = require('../models');

class DeliveryController {
  /**
   * GET /api/v1/delivery/serviceability
   * Checks whether a 6-digit Indian PIN code is currently serviceable
   */
  static async checkServiceability(req, res, next) {
    try {
      const { pincode } = req.query;

      if (!pincode || typeof pincode !== 'string' || !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 6-digit Indian postal PIN code',
        });
      }

      const cleanPin = pincode.trim();

      // Query only currently active delivery zones
      const zone = await DeliveryZone.findOne({
        pincodes: cleanPin,
        isActive: true,
      });

      if (!zone) {
        return res.status(200).json({
          success: true,
          serviceable: false,
          message: `Delivery is currently not available for PIN code ${cleanPin}`,
        });
      }

      res.status(200).json({
        success: true,
        serviceable: true,
        data: {
          zoneName: zone.name,
          deliveryCharge: zone.deliveryCharge,
          minimumOrderAmount: zone.minimumOrderAmount,
          estimatedDeliveryMinutes: zone.estimatedDeliveryMinutes,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/delivery/slots
   * Retrieve available delivery slots for a serviceable PIN code on a specific date
   */
  static async getAvailableSlots(req, res, next) {
    try {
      const { pincode, date } = req.query;

      // 1. PIN code validation
      if (!pincode || typeof pincode !== 'string' || !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 6-digit Indian postal PIN code',
        });
      }

      const cleanPin = pincode.trim();

      // 2. Validate zone serviceability
      const zone = await DeliveryZone.findOne({
        pincodes: cleanPin,
        isActive: true,
      });

      if (!zone) {
        return res.status(400).json({
          success: false,
          message: `Delivery is not serviceable for PIN code ${cleanPin}`,
        });
      }

      // 3. Date format validation (YYYY-MM-DD)
      if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Expected YYYY-MM-DD (e.g. 2026-11-11)',
        });
      }

      const cleanDate = date.trim();
      const [year, month, day] = cleanDate.split('-').map(Number);
      const targetStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const targetEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      if (isNaN(targetStart.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid calendar date provided',
        });
      }

      // Current server date and time comparison
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const isPastDate = cleanDate < todayStr;
      const isToday = cleanDate === todayStr;

      if (isPastDate) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

      // Query active slots scheduled for this calendar date
      const slots = await DeliverySlot.find({
        date: { $gte: targetStart, $lte: targetEnd },
        isActive: true,
      }).sort({ startTime: 1 });

      // Exclude full slots and past time windows for today
      const availableSlots = slots
        .filter((slot) => {
          const hasCapacity = slot.bookedCount < slot.capacity;
          const notPast = !isToday || slot.endTime > currentTimeStr;
          return hasCapacity && notPast;
        })
        .map((slot) => ({
          id: slot._id.toString(),
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          remainingCapacity: slot.capacity - slot.bookedCount,
        }));

      res.status(200).json({
        success: true,
        data: availableSlots,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DeliveryController;

