const { SystemSetting } = require('../models');

const DEFAULT_SETTINGS = {
  BUSINESS_NAME: 'Bento Babu',
  SUPPORT_EMAIL: 'support@bentobabu.in',
  SUPPORT_PHONE: '9876543210',
  MINIMUM_ORDER_AMOUNT: 99,
  MINIMUM_ORDER_VALUE: 99,
  DEFAULT_DELIVERY_FEE: 30,
  DELIVERY_CHARGE_ENABLED: true,
  DELIVERY_CHARGE_AMOUNT: 30,
  DEFAULT_PREPARATION_TIME: 25,
  OPERATING_DAYS: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ],
  OPENING_TIME: '10:00',
  CLOSING_TIME: '22:00',
  ORDER_ACCEPTANCE_ENABLED: true,
  MAINTENANCE_MODE: false,
  KITCHEN_NAME: 'BentoBabu Central Kitchen',
  KITCHEN_LANDMARK: 'Apollo Pharmacy / Apollo 24|7',
  KITCHEN_ADDRESS: 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India',
  KITCHEN_PINCODE: '700120',
  KITCHEN_LATITUDE: 22.7666909,
  KITCHEN_LONGITUDE: 88.3788318,
  FSSAI_STATUS: 'APPLICATION_SUBMITTED',
  FSSAI_NUMBER: '',
  FSSAI_CERTIFICATE_URL: '',
  GSTIN: '',
  GST_CERTIFICATE_URL: '',
  WEBSITE_URL: 'https://bentobabu.in',
  BUSINESS_ADDRESS: 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700120, India',
};

const ALLOWED_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

/**
 * Class-based Controller for Admin Business & Operational Settings
 */
class AdminSettingsController {
  /**
   * Helper to retrieve all settings merged with default fallbacks
   */
  static async getAllMergedSettings() {
    const storedSettings = await SystemSetting.find().lean();
    const settingsMap = { ...DEFAULT_SETTINGS };

    storedSettings.forEach((item) => {
      if (ALLOWED_SETTING_KEYS.includes(item.key)) {
        settingsMap[item.key] = item.value;
      }
    });

    return settingsMap;
  }

  /**
   * GET /api/v1/admin/settings
   * Retrieve all business and operational settings
   */
  static async getSettings(req, res, next) {
    try {
      const settings = await AdminSettingsController.getAllMergedSettings();

      return res.status(200).json({
        success: true,
        data: { settings },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/settings
   * Update one or more business settings with validation
   */
  static async updateSettings(req, res, next) {
    try {
      const payload = req.body.settings || req.body;

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({
          success: false,
          message: 'Settings payload must be a key-value object.',
        });
      }

      const updatesToApply = {};

      for (const [rawKey, val] of Object.entries(payload)) {
        const key = rawKey.toUpperCase();
        if (!ALLOWED_SETTING_KEYS.includes(key)) {
          return res.status(400).json({
            success: false,
            message: `Unrecognized setting key: "${rawKey}". Allowed keys: ${ALLOWED_SETTING_KEYS.join(', ')}`,
          });
        }

        // Validate values based on key
        switch (key) {
          case 'BUSINESS_NAME':
            if (typeof val !== 'string' || !val.trim()) {
              return res.status(400).json({
                success: false,
                message: 'BUSINESS_NAME must be a non-empty string.',
              });
            }
            updatesToApply[key] = val.trim();
            break;

          case 'SUPPORT_EMAIL':
            if (typeof val !== 'string' || !/^\S+@\S+\.\S+$/.test(val.trim())) {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_EMAIL must be a valid email address.',
              });
            }
            updatesToApply[key] = val.trim().toLowerCase();
            break;

          case 'SUPPORT_PHONE': {
            const digits = String(val).replace(/\D/g, '');
            if (digits.length !== 10) {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_PHONE must be a valid 10-digit mobile number.',
              });
            }
            updatesToApply[key] = digits;
            break;
          }

          case 'MINIMUM_ORDER_AMOUNT':
          case 'MINIMUM_ORDER_VALUE': {
            const num = Number(val);
            if (isNaN(num) || num < 0) {
              return res.status(400).json({
                success: false,
                message: `${key} must be a non-negative number.`,
              });
            }
            updatesToApply.MINIMUM_ORDER_AMOUNT = num;
            updatesToApply.MINIMUM_ORDER_VALUE = num;
            break;
          }

          case 'DEFAULT_DELIVERY_FEE':
          case 'DELIVERY_CHARGE_AMOUNT': {
            const fee = Number(val);
            if (isNaN(fee) || fee < 0) {
              return res.status(400).json({
                success: false,
                message: `${key} must be a non-negative number.`,
              });
            }
            updatesToApply[key] = fee;
            // Keep DEFAULT_DELIVERY_FEE and DELIVERY_CHARGE_AMOUNT in sync
            updatesToApply.DEFAULT_DELIVERY_FEE = fee;
            updatesToApply.DELIVERY_CHARGE_AMOUNT = fee;
            break;
          }

          case 'DELIVERY_CHARGE_ENABLED':
            if (typeof val !== 'boolean') {
              return res.status(400).json({
                success: false,
                message: 'DELIVERY_CHARGE_ENABLED must be a boolean (true or false).',
              });
            }
            updatesToApply[key] = val;
            break;

          case 'DEFAULT_PREPARATION_TIME': {
            const prep = Number(val);
            if (!Number.isInteger(prep) || prep < 1) {
              return res.status(400).json({
                success: false,
                message: 'DEFAULT_PREPARATION_TIME must be an integer >= 1 minute.',
              });
            }
            updatesToApply[key] = prep;
            break;
          }

          case 'OPERATING_DAYS':
            if (!Array.isArray(val) || val.length === 0) {
              return res.status(400).json({
                success: false,
                message: 'OPERATING_DAYS must be a non-empty array of day names.',
              });
            }
            updatesToApply[key] = val.map((d) => String(d).trim());
            break;

          case 'OPENING_TIME':
          case 'CLOSING_TIME':
            if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(String(val))) {
              return res.status(400).json({
                success: false,
                message: `${key} must be in HH:mm 24-hour format.`,
              });
            }
            updatesToApply[key] = String(val);
            break;

          case 'ORDER_ACCEPTANCE_ENABLED':
          case 'MAINTENANCE_MODE':
            if (typeof val !== 'boolean') {
              return res.status(400).json({
                success: false,
                message: `${key} must be a boolean (true or false).`,
              });
            }
            updatesToApply[key] = val;
            break;

          case 'KITCHEN_NAME':
          case 'KITCHEN_LANDMARK':
          case 'KITCHEN_ADDRESS':
            if (typeof val !== 'string' || !val.trim()) {
              return res.status(400).json({
                success: false,
                message: `${key} must be a non-empty string.`,
              });
            }
            updatesToApply[key] = val.trim();
            break;

          case 'KITCHEN_PINCODE':
            if (!/^[1-9][0-9]{5}$/.test(String(val).trim())) {
              return res.status(400).json({
                success: false,
                message: 'KITCHEN_PINCODE must be a valid 6-digit Indian PIN code.',
              });
            }
            updatesToApply[key] = String(val).trim();
            break;

          case 'KITCHEN_LATITUDE': {
            const lat = Number(val);
            if (isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) {
              return res.status(400).json({
                success: false,
                message: 'KITCHEN_LATITUDE must be a number between -90 and 90.',
              });
            }
            updatesToApply[key] = lat;
            break;
          }

          case 'KITCHEN_LONGITUDE': {
            const lng = Number(val);
            if (isNaN(lng) || !isFinite(lng) || lng < -180 || lng > 180) {
              return res.status(400).json({
                success: false,
                message: 'KITCHEN_LONGITUDE must be a number between -180 and 180.',
              });
            }
            updatesToApply[key] = lng;
            break;
          }

          case 'FSSAI_STATUS': {
            const allowed = ['NOT_APPLIED', 'APPLICATION_SUBMITTED', 'APPROVED', 'EXPIRED', 'SUSPENDED'];
            const upper = String(val || '').toUpperCase().trim();
            if (!allowed.includes(upper)) {
              return res.status(400).json({
                success: false,
                message: `FSSAI_STATUS must be one of: ${allowed.join(', ')}`,
              });
            }
            updatesToApply[key] = upper;
            break;
          }

          case 'FSSAI_NUMBER': {
            const fssai = String(val || '').trim();
            if (fssai && !/^\d{14}$/.test(fssai)) {
              return res.status(400).json({
                success: false,
                message: 'FSSAI_NUMBER must be a valid 14-digit registration or licence number, or left empty.',
              });
            }
            updatesToApply[key] = fssai;
            break;
          }

          case 'FSSAI_CERTIFICATE_URL':
          case 'GST_CERTIFICATE_URL': {
            updatesToApply[key] = String(val || '').trim();
            break;
          }

          case 'GSTIN': {
            const gstin = String(val || '').toUpperCase().trim();
            if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
              return res.status(400).json({
                success: false,
                message: 'GSTIN must be a valid 15-character Indian Goods and Services Tax Identification Number, or left empty.',
              });
            }
            updatesToApply[key] = gstin;
            break;
          }

          case 'WEBSITE_URL':
          case 'BUSINESS_ADDRESS': {
            updatesToApply[key] = String(val || '').trim();
            break;
          }

          default:
            break;
        }
      }

      // Upsert all validated settings
      const upsertPromises = Object.entries(updatesToApply).map(([key, value]) =>
        SystemSetting.findOneAndUpdate(
          { key },
          { key, value },
          { upsert: true, returnDocument: 'after', runValidators: true }
        )
      );

      await Promise.all(upsertPromises);

      const allMerged = await AdminSettingsController.getAllMergedSettings();

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully.',
        data: { settings: allMerged },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminSettingsController;
