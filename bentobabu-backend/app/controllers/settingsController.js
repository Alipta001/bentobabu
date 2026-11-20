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
}

module.exports = SettingsController;
