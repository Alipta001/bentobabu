const { SystemSetting } = require('../models');
const { redisDel } = require('../config/redis');

const DEFAULT_SETTINGS = {
  BUSINESS_NAME: 'Bento Babu',
  SUPPORT_EMAIL: 'bentobabuofficial@gmail.com',
  SUPPORT_PHONE: '+91 8584085669',
  SUPPORT_WHATSAPP: '+91 8584085669',
  SUPPORT_HOURS: '10:00 AM – 10:00 PM (Daily)',
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
  DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: 0,
  MAX_ADVANCE_BOOKING_DAYS: 3,
  ORDER_ACCEPTANCE_ENABLED: true,
  MAINTENANCE_MODE: false,
  KITCHEN_NAME: 'BentoBabu Central Kitchen',
  KITCHEN_LANDMARK: 'Apollo Pharmacy / Apollo 24|7',
  KITCHEN_ADDRESS: 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India',
  KITCHEN_PINCODE: '700122',
  KITCHEN_LATITUDE: 22.7666909,
  KITCHEN_LONGITUDE: 88.3788318,
  FSSAI_STATUS: 'APPLICATION_SUBMITTED',
  FSSAI_NUMBER: '',
  FSSAI_CERTIFICATE_URL: '',
  GSTIN: '',
  GST_CERTIFICATE_URL: '',
  WEBSITE_URL: 'https://bentobabu.com',
  INSTAGRAM_URL: 'https://instagram.com/bentobabu',
  FACEBOOK_URL: 'https://facebook.com/bentobabu',
  TWITTER_URL: 'https://twitter.com/bentobabu',
  LINKEDIN_URL: 'https://linkedin.com/company/bentobabu',
  BUSINESS_ADDRESS: 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India',
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
    let storedSettings = [];
    if (SystemSetting.db && SystemSetting.db.readyState === 1) {
      try {
        storedSettings = await SystemSetting.find().lean();
      } catch {
        storedSettings = [];
      }
    }
    const settingsMap = { ...DEFAULT_SETTINGS };

    storedSettings.forEach((item) => {
      if (ALLOWED_SETTING_KEYS.includes(item.key)) {
        if (item.key === 'SUPPORT_PHONE' || item.key === 'SUPPORT_WHATSAPP') {
          const digits = String(item.value || '').replace(/\D/g, '');
          if (digits === '9876543210' || digits.startsWith('98765') || digits.startsWith('99999')) {
            settingsMap[item.key] = DEFAULT_SETTINGS[item.key];
            return;
          }
        }
        settingsMap[item.key] = item.value;
      }
    });

    if (!settingsMap.SUPPORT_WHATSAPP) {
      settingsMap.SUPPORT_WHATSAPP = settingsMap.SUPPORT_PHONE;
    }

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
            const rawDigits = String(val).replace(/\D/g, '');
            let phoneDigits = rawDigits;
            if (rawDigits.length === 12 && rawDigits.startsWith('91')) {
              phoneDigits = rawDigits.slice(2);
            }
            if (phoneDigits.length !== 10) {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_PHONE must be a valid 10-digit mobile number.',
              });
            }
            if (phoneDigits === '9876543210' || phoneDigits.startsWith('98765') || phoneDigits === '9999999999') {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_PHONE cannot be the legacy test placeholder number.',
              });
            }
            updatesToApply[key] = `+91 ${phoneDigits}`;
            break;
          }

          case 'SUPPORT_WHATSAPP': {
            const strVal = String(val === null || val === undefined ? '' : val).trim();
            if (!strVal) {
              updatesToApply[key] = '';
              break;
            }
            const rawDigits = strVal.replace(/\D/g, '');
            let phoneDigits = rawDigits;
            if (rawDigits.length === 12 && rawDigits.startsWith('91')) {
              phoneDigits = rawDigits.slice(2);
            }
            if (phoneDigits.length !== 10) {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_WHATSAPP must be a valid 10-digit mobile number, or left empty.',
              });
            }
            if (phoneDigits === '9876543210' || phoneDigits.startsWith('98765') || phoneDigits === '9999999999') {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_WHATSAPP cannot be the legacy test placeholder number.',
              });
            }
            updatesToApply[key] = `+91 ${phoneDigits}`;
            break;
          }

          case 'SUPPORT_HOURS': {
            if (typeof val !== 'string' || !val.trim()) {
              return res.status(400).json({
                success: false,
                message: 'SUPPORT_HOURS must be a non-empty string.',
              });
            }
            updatesToApply[key] = val.trim();
            break;
          }

          case 'INSTAGRAM_URL':
          case 'FACEBOOK_URL':
          case 'TWITTER_URL':
          case 'LINKEDIN_URL': {
            const urlStr = String(val === null || val === undefined ? '' : val).trim();
            if (urlStr && !/^https?:\/\//i.test(urlStr)) {
              return res.status(400).json({
                success: false,
                message: `${key} must be a valid web URL starting with http:// or https://.`,
              });
            }
            updatesToApply[key] = urlStr;
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

          case 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES': {
            const cutoff = Number(val);
            if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 1440) {
              return res.status(400).json({
                success: false,
                message: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES must be an integer between 0 and 1440 minutes.',
              });
            }
            updatesToApply[key] = cutoff;
            break;
          }

          case 'MAX_ADVANCE_BOOKING_DAYS': {
            const days = Number(val);
            if (!Number.isInteger(days) || days < 0 || days > 30) {
              return res.status(400).json({
                success: false,
                message: 'MAX_ADVANCE_BOOKING_DAYS must be an integer between 0 and 30 days.',
              });
            }
            updatesToApply[key] = days;
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

      // Invalidate public ordering status, brand settings, and delivery slot caches immediately
      await redisDel('cache:ordering_status');
      await redisDel('cache:public_settings');
      await redisDel('cache:support_config');
      try {
        const DeliverySlotService = require('../services/deliverySlotService');
        await DeliverySlotService.invalidateCache();
      } catch (err) {
        console.warn('[AdminSettingsController] DeliverySlotService cache invalidation warning:', err.message);
      }

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
