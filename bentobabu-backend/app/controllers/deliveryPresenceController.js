const mongoose = require('mongoose');
const { DeliveryPartnerPresence, DeliveryApplication, User, Order } = require('../models');
const { redisSet, redisGet } = require('../config/redis');

// Configurable thresholds
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.DELIVERY_HEARTBEAT_INTERVAL_MS, 10) || 25000;
const CONNECTION_TIMEOUT_MS = parseInt(process.env.DELIVERY_CONNECTION_TIMEOUT_MS, 10) || 60000;
const LOCATION_FRESH_MS = parseInt(process.env.DELIVERY_LOCATION_FRESH_MS, 10) || 120000;

class DeliveryPresenceController {
  /**
   * Helper: Ensure presence document exists and syncs with User/Application status
   */
  static async getOrCreatePresence(userId) {
    let presence = await DeliveryPartnerPresence.findOne({ user: userId });

    const [user, application] = await Promise.all([
      User.findById(userId).lean(),
      DeliveryApplication.findOne({ user: userId }).lean(),
    ]);

    let calculatedAccountStatus = 'ACTIVE';
    if (!user || user.isActive === false) {
      calculatedAccountStatus = application?.status === 'SUSPENDED' ? 'SUSPENDED' : 'DEACTIVATED';
    } else if (application?.status === 'SUSPENDED') {
      calculatedAccountStatus = 'SUSPENDED';
    }

    if (!presence) {
      presence = await DeliveryPartnerPresence.create({
        user: userId,
        application: application?._id || null,
        accountStatus: calculatedAccountStatus,
        availabilityStatus: 'OFFLINE',
        intendedAvailability: 'OFFLINE',
      });
    } else if (presence.accountStatus !== calculatedAccountStatus) {
      presence.accountStatus = calculatedAccountStatus;
      if (calculatedAccountStatus !== 'ACTIVE') {
        presence.availabilityStatus = 'OFFLINE';
      }
      await presence.save();
    }

    return { presence, user, application };
  }

  /**
   * GET /api/v1/delivery/presence/me
   * Delivery partner fetches own live presence details
   */
  static async getMyPresence(req, res, next) {
    try {
      const { presence, user, application } = await DeliveryPresenceController.getOrCreatePresence(
        req.user.id
      );

      // Check if partner has an active in-progress order
      const activeOrder = await Order.findOne({
        assignedDeliveryPartner: req.user.id,
        orderStatus: 'OUT_FOR_DELIVERY',
      })
        .select('_id orderNumber orderStatus items total deliverySlot deliveryZone deliveryAddress')
        .populate('deliveryAddress', 'houseNo street city state pincode landmark');

      if (activeOrder && presence.availabilityStatus !== 'BUSY') {
        presence.availabilityStatus = 'BUSY';
        presence.currentOrderId = activeOrder._id;
        await presence.save();
      } else if (!activeOrder && presence.availabilityStatus === 'BUSY') {
        presence.availabilityStatus = presence.intendedAvailability || 'OFFLINE';
        presence.currentOrderId = null;
        await presence.save();
      }

      return res.status(200).json({
        success: true,
        data: {
          presence,
          activeOrder: activeOrder || null,
          config: {
            heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
            connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
            locationFreshMs: LOCATION_FRESH_MS,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/delivery/presence/availability
   * Delivery partner switches ONLINE or OFFLINE
   */
  static async updateAvailability(req, res, next) {
    try {
      const { availability } = req.body;
      const normalized = typeof availability === 'string' ? availability.toUpperCase().trim() : null;

      if (!['ONLINE', 'OFFLINE'].includes(normalized)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid availability status. Must be "ONLINE" or "OFFLINE".',
        });
      }

      const { presence, user, application } = await DeliveryPresenceController.getOrCreatePresence(
        req.user.id
      );

      // Check account status
      if (presence.accountStatus !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: `Cannot change availability: account is ${presence.accountStatus.toLowerCase()}. Contact operations support.`,
        });
      }

      // Check if partner currently has an active delivery
      const activeOrder = await Order.findOne({
        assignedDeliveryPartner: req.user.id,
        orderStatus: 'OUT_FOR_DELIVERY',
      });

      if (normalized === 'ONLINE') {
        presence.intendedAvailability = 'ONLINE';
        if (activeOrder) {
          presence.availabilityStatus = 'BUSY';
          presence.currentOrderId = activeOrder._id;
        } else {
          presence.availabilityStatus = 'ONLINE';
        }
        presence.lastHeartbeat = new Date();
      } else {
        // Going OFFLINE
        presence.intendedAvailability = 'OFFLINE';
        if (activeOrder) {
          // Keep BUSY until current active delivery finishes, but note intention
          presence.availabilityStatus = 'BUSY';
          presence.currentOrderId = activeOrder._id;
        } else {
          presence.availabilityStatus = 'OFFLINE';
          presence.currentOrderId = null;
        }
      }

      await presence.save();

      // Update Redis cache
      await redisSet(`presence:delivery:${req.user.id}`, {
        userId: req.user.id,
        accountStatus: presence.accountStatus,
        availabilityStatus: presence.availabilityStatus,
        intendedAvailability: presence.intendedAvailability,
        lastHeartbeat: presence.lastHeartbeat,
        lastLocation: presence.lastLocation,
      }, 180);

      return res.status(200).json({
        success: true,
        message: `Availability updated to ${presence.availabilityStatus}`,
        data: {
          presence,
          hasActiveOrder: !!activeOrder,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/delivery/presence/heartbeat
   * Periodic connection ping sent while delivery partner app is running
   */
  static async heartbeat(req, res, next) {
    try {
      const now = new Date();
      const { presence } = await DeliveryPresenceController.getOrCreatePresence(req.user.id);

      if (presence.accountStatus !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: `Delivery partner account is ${presence.accountStatus.toLowerCase()}.`,
          accountStatus: presence.accountStatus,
        });
      }

      presence.lastHeartbeat = now;
      await presence.save();

      // Quick Redis update
      await redisSet(`presence:delivery:${req.user.id}`, {
        userId: req.user.id,
        accountStatus: presence.accountStatus,
        availabilityStatus: presence.availabilityStatus,
        lastHeartbeat: now,
        lastLocation: presence.lastLocation,
      }, 180);

      return res.status(200).json({
        success: true,
        timestamp: now.getTime(),
        availabilityStatus: presence.availabilityStatus,
        accountStatus: presence.accountStatus,
        connectionStatus: 'CONNECTED',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/delivery/presence/location
   * GPS coordinate update from partner's device
   */
  static async updateLocation(req, res, next) {
    try {
      const { latitude, longitude, accuracy, heading, speed, batteryLevel } = req.body;

      // Latitude validation (-90 to 90)
      if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
        return res.status(400).json({
          success: false,
          message: 'Invalid latitude. Must be a valid number between -90 and 90.',
        });
      }

      // Longitude validation (-180 to 180)
      if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          message: 'Invalid longitude. Must be a valid number between -180 and 180.',
        });
      }

      // Reject bogus coordinates (0, 0)
      if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
        return res.status(400).json({
          success: false,
          message: 'Invalid GPS coordinates (Null Island coordinates rejected).',
        });
      }

      // Validate accuracy
      const safeAccuracy =
        typeof accuracy === 'number' && !isNaN(accuracy) && accuracy >= 0 && accuracy <= 10000
          ? Math.round(accuracy * 10) / 10
          : null;

      // Validate heading (0 to 360)
      const safeHeading =
        typeof heading === 'number' && !isNaN(heading) && heading >= 0 && heading <= 360
          ? Math.round(heading)
          : null;

      // Validate speed (m/s)
      const safeSpeed =
        typeof speed === 'number' && !isNaN(speed) && speed >= 0 && speed <= 100
          ? Math.round(speed * 10) / 10
          : null;

      // Validate battery level (0-100)
      const safeBattery =
        typeof batteryLevel === 'number' && !isNaN(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100
          ? Math.round(batteryLevel)
          : null;

      const now = new Date();
      const { presence } = await DeliveryPresenceController.getOrCreatePresence(req.user.id);

      if (presence.accountStatus !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: `Delivery partner account is ${presence.accountStatus.toLowerCase()}.`,
        });
      }

      presence.lastLocation = {
        latitude: Math.round(latitude * 1e7) / 1e7,
        longitude: Math.round(longitude * 1e7) / 1e7,
        accuracy: safeAccuracy,
        heading: safeHeading,
        speed: safeSpeed,
        batteryLevel: safeBattery,
        updatedAt: now,
      };
      presence.lastHeartbeat = now;

      await presence.save();

      // Update Redis cache
      await redisSet(`presence:delivery:${req.user.id}`, {
        userId: req.user.id,
        accountStatus: presence.accountStatus,
        availabilityStatus: presence.availabilityStatus,
        lastHeartbeat: now,
        lastLocation: presence.lastLocation,
      }, 180);

      return res.status(200).json({
        success: true,
        message: 'Location updated successfully',
        data: {
          lastLocation: presence.lastLocation,
          lastHeartbeat: now,
          locationFreshness: 'LIVE',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DeliveryPresenceController;
