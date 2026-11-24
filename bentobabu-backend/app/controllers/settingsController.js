const { SystemSetting } = require('../models');
const { redisGet, redisSet } = require('../config/redis');

class SettingsController {
  /**
   * GET /api/v1/settings/ordering-status
   * Public read-only ordering availability status.
   * Cache-safe with no-cache headers and short Redis caching with instant invalidation.
   */
  static async getOrderingStatus(req, res, next) {
    try {
      // Ensure HTTP clients and CDNs never serve stale ordering availability
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });

      // 1. Check Redis cache first if available
      const cacheKey = 'cache:ordering_status';
      const cached = await redisGet(cacheKey);
      if (
        cached !== null &&
        typeof cached === 'object' &&
        typeof cached.acceptingOrders === 'boolean'
      ) {
        return res.status(200).json({
          success: true,
          data: cached,
        });
      }

      // 2. Query authoritative SystemSetting from MongoDB
      const setting = await SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' }).lean();
      const acceptingOrders = setting ? Boolean(setting.value) : true;

      const data = {
        acceptingOrders,
        message: acceptingOrders ? null : 'Our kitchen is currently resting.',
      };

      // 3. Cache in Redis (60s TTL), invalidated immediately on admin toggle
      await redisSet(cacheKey, data, 60);

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/settings/public
   * Public read-only business branding, verified contacts, and operating hours.
   * Safe for storefront display with Redis caching and immediate invalidation on admin update.
   */
  static async getPublicSettings(req, res, next) {
    try {
      res.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      });

      const cacheKey = 'cache:public_settings';
      const cached = await redisGet(cacheKey);
      if (cached !== null && typeof cached === 'object' && cached.businessName) {
        return res.status(200).json({
          success: true,
          data: cached,
        });
      }

      const AdminSettingsController = require('./adminSettingsController');
      const settings = await AdminSettingsController.getAllMergedSettings();

      const openTime = settings.OPENING_TIME || '10:00';
      const closeTime = settings.CLOSING_TIME || '22:00';
      const fallbackHours = `${openTime} - ${closeTime} (Daily)`;
      const operatingHours = settings.SUPPORT_HOURS || fallbackHours;

      const businessAddress =
        settings.BUSINESS_ADDRESS ||
        settings.KITCHEN_ADDRESS ||
        'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';

      const data = {
        name: settings.BUSINESS_NAME || 'Bento Babu',
        businessName: settings.BUSINESS_NAME || 'Bento Babu',
        tagline: 'Pure Ingredients, Mindful Nutrition',
        description:
          'Bento Babu brings gourmet healthy eating to fitness enthusiasts, mindful families, growing kids, and active seniors. Prepared daily with farm-fresh produce and zero preservatives.',
        contact: {
          email: settings.SUPPORT_EMAIL || 'bentobabuofficial@gmail.com',
          phone: settings.SUPPORT_PHONE || '+91 8584085669',
          whatsapp: settings.SUPPORT_WHATSAPP || settings.SUPPORT_PHONE || '+91 8584085669',
          address: businessAddress,
          operatingHours,
        },
        social: {
          instagram: settings.INSTAGRAM_URL || 'https://instagram.com/bentobabu',
          facebook: settings.FACEBOOK_URL || 'https://facebook.com/bentobabu',
          twitter: settings.TWITTER_URL || 'https://twitter.com/bentobabu',
          linkedin: settings.LINKEDIN_URL || 'https://linkedin.com/company/bentobabu',
        },
        fssai: {
          status: settings.FSSAI_STATUS || 'APPLICATION_SUBMITTED',
          number: settings.FSSAI_NUMBER || '',
        },
        websiteUrl: settings.WEBSITE_URL || 'https://bentobabu.com',
      };

      await redisSet(cacheKey, data, 300); // 5 minutes TTL in Redis

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SettingsController;
