const { DeliveryZone, DeliverySlot, SystemSetting } = require('../models');
const { isDeliveryOtpRequired } = require('../config/env');

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

      // Query only currently active and non-deleted delivery zones
      const zone = await DeliveryZone.findOne({
        pincodes: cleanPin,
        isActive: true,
        isDeleted: { $ne: true },
      });

      if (!zone) {
        return res.status(200).json({
          success: true,
          serviceable: false,
          code: 'UNSERVICEABLE_LOCATION',
          message: `Delivery is currently not available for PIN code ${cleanPin}`,
        });
      }

      // Check admin-configured delivery charge and minimum order settings
      const [chargeEnabledSetting, chargeAmountSetting, minOrderSetting] = await Promise.all([
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_ENABLED' }).lean(),
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_AMOUNT' }).lean(),
        SystemSetting.findOne({ key: { $in: ['MINIMUM_ORDER_VALUE', 'MINIMUM_ORDER_AMOUNT'] } }).lean(),
      ]);

      let finalDeliveryCharge = 0;
      const isChargeEnabled = chargeEnabledSetting ? chargeEnabledSetting.value !== false : true;

      if (isChargeEnabled) {
        if (typeof zone.deliveryCharge === 'number' && zone.deliveryCharge >= 0) {
          finalDeliveryCharge = zone.deliveryCharge;
        } else if (chargeAmountSetting && typeof chargeAmountSetting.value === 'number') {
          finalDeliveryCharge = chargeAmountSetting.value;
        }
        // If neither zone nor system setting specifies a charge, default to 0 (free delivery)
        // so the admin remains the authoritative source — no silent hardcoded ₹30.
      }

      // Determine authoritative minimum order amount
      let effectiveMinOrder = (zone && typeof zone.minimumOrderAmount === 'number') ? zone.minimumOrderAmount : 0;
      if (minOrderSetting && typeof minOrderSetting.value === 'number') {
        effectiveMinOrder = minOrderSetting.value;
      }

      res.status(200).json({
        success: true,
        serviceable: true,
        data: {
          zoneName: zone.name,
          deliveryCharge: finalDeliveryCharge,
          deliveryFee: finalDeliveryCharge,
          minimumOrderAmount: effectiveMinOrder,
          minimumOrderValue: effectiveMinOrder,
          estimatedDeliveryMinutes: zone.estimatedDeliveryMinutes,
          zone: {
            id: zone._id.toString(),
            name: zone.name,
            deliveryCharge: finalDeliveryCharge,
            deliveryFee: finalDeliveryCharge,
            minimumOrderAmount: effectiveMinOrder,
            minimumOrderValue: effectiveMinOrder,
            estimatedDeliveryMinutes: zone.estimatedDeliveryMinutes,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/delivery/config
   * Public: returns global delivery settings (minimum order value, delivery charge config)
   */
  static async getDeliveryConfig(req, res, next) {
    try {
      const [
        minOrderSetting,
        chargeEnabledSetting,
        chargeAmountSetting,
        kitchenNameSetting,
        kitchenLandmarkSetting,
        kitchenAddressSetting,
        kitchenPinSetting,
        kitchenLatSetting,
        kitchenLngSetting,
      ] = await Promise.all([
        SystemSetting.findOne({ key: { $in: ['MINIMUM_ORDER_VALUE', 'MINIMUM_ORDER_AMOUNT'] } }).lean(),
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_ENABLED' }).lean(),
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_AMOUNT' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_NAME' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_LANDMARK' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_ADDRESS' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_PINCODE' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_LATITUDE' }).lean(),
        SystemSetting.findOne({ key: 'KITCHEN_LONGITUDE' }).lean(),
      ]);

      const minimumOrderValue = (minOrderSetting && typeof minOrderSetting.value === 'number')
        ? minOrderSetting.value
        : 99;

      const deliveryChargeEnabled = chargeEnabledSetting ? chargeEnabledSetting.value !== false : true;
      const deliveryChargeAmount = (chargeAmountSetting && typeof chargeAmountSetting.value === 'number')
        ? chargeAmountSetting.value
        : 30;

      const kitchenLat = typeof kitchenLatSetting?.value === 'number' ? kitchenLatSetting.value : 22.7666909;
      const kitchenLng = typeof kitchenLngSetting?.value === 'number' ? kitchenLngSetting.value : 88.3788318;

      return res.status(200).json({
        success: true,
        data: {
          minimumOrderValue,
          minimumOrderAmount: minimumOrderValue,
          deliveryChargeEnabled,
          deliveryChargeAmount,
          otpRequired: isDeliveryOtpRequired(),
          centralKitchen: {
            name: kitchenNameSetting?.value || 'BentoBabu Central Kitchen',
            landmark: kitchenLandmarkSetting?.value || 'Apollo Pharmacy / Apollo 24|7',
            address: kitchenAddressSetting?.value || 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India',
            pincode: kitchenPinSetting?.value || '700122',
            latitude: kitchenLat,
            longitude: kitchenLng,
            googleMapsUrl: `https://www.google.com/maps?q=${kitchenLat},${kitchenLng}`,
            googleMapsDirectionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${kitchenLat},${kitchenLng}`)}`,
          },
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
        isDeleted: { $ne: true },
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

