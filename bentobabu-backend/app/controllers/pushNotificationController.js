const mongoose = require('mongoose');
const { DeviceToken, User, Notification } = require('../models');
const { getMessaging, isFirebaseConfigured } = require('../config/firebase');

/**
 * Class-based Controller for Web Push Device Registration & Testing
 * Strictly scoped to authenticated ADMIN and KITCHEN users for staff push alerts.
 */
class PushNotificationController {
  /**
   * POST /api/v1/notifications/push/register
   * Register or rotate a device FCM push token
   */
  static async registerDevice(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      const { token, platform = 'WEB', deviceName = 'Web Browser', browser = '' } = req.body;

      if (!token || typeof token !== 'string' || token.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'A valid FCM registration token is required.',
        });
      }

      // Initial release audience restriction: ADMIN and KITCHEN only
      const allowedRoles = ['ADMIN', 'KITCHEN'];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Push notification registration is currently restricted to authorized staff accounts.',
        });
      }

      const trimmedToken = token.trim();
      const validPlatforms = ['WEB', 'ANDROID', 'IOS'];
      const normalizedPlatform = validPlatforms.includes(platform?.toUpperCase())
        ? platform.toUpperCase()
        : 'WEB';

      // Safe reassignment: If the token was previously registered to another account (e.g. shared device or re-login),
      // reassign ownership to the currently authenticated user session.
      const device = await DeviceToken.findOneAndUpdate(
        { token: trimmedToken },
        {
          $set: {
            user: req.user._id,
            role: req.user.role,
            platform: normalizedPlatform,
            deviceName: typeof deviceName === 'string' ? deviceName.trim().substring(0, 100) : 'Web Browser',
            browser: typeof browser === 'string' ? browser.trim().substring(0, 100) : '',
            isActive: true,
            lastSeenAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );

      console.log(`[PushNotification] Registered device token for ${req.user.role} user ${req.user.id} (device: ${device.deviceName})`);

      return res.status(200).json({
        success: true,
        message: 'Device push notification token registered successfully.',
        data: {
          device: device.toJSON(),
        },
      });
    } catch (error) {
      if (typeof next === 'function') {
        next(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * DELETE /api/v1/notifications/push/unregister
   * Unregister / deactivate push notifications for a device
   */
  static async unregisterDevice(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      const { token } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Device token is required to unregister.',
        });
      }

      const trimmedToken = token.trim();

      // Ownership enforcement: Only allow unregistering a device owned by the authenticated user
      const device = await DeviceToken.findOneAndUpdate(
        {
          token: trimmedToken,
          user: req.user._id,
        },
        {
          $set: {
            isActive: false,
            deactivationReason: 'USER_REVOKED',
            lastSeenAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'No registered device found for this account with the provided token.',
        });
      }

      console.log(`[PushNotification] Deactivated device token for user ${req.user.id}`);

      return res.status(200).json({
        success: true,
        message: 'Device unregistered from push notifications successfully.',
      });
    } catch (error) {
      if (typeof next === 'function') {
        next(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * GET /api/v1/notifications/push/devices
   * List all registered devices for the authenticated user
   */
  static async getRegisteredDevices(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      const devices = await DeviceToken.find({ user: req.user._id })
        .sort({ lastSeenAt: -1 })
        .lean();

      // Mask tokens in output for security
      const sanitized = devices.map((d) => ({
        id: d._id.toString(),
        platform: d.platform,
        deviceName: d.deviceName,
        browser: d.browser,
        isActive: d.isActive,
        lastSeenAt: d.lastSeenAt,
        createdAt: d.createdAt,
        maskedToken: d.token && d.token.length > 12
          ? `${d.token.substring(0, 6)}...${d.token.substring(d.token.length - 6)}`
          : '******',
      }));

      return res.status(200).json({
        success: true,
        data: {
          devices: sanitized,
          total: sanitized.length,
          activeCount: sanitized.filter((d) => d.isActive).length,
        },
      });
    } catch (error) {
      if (typeof next === 'function') {
        next(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * POST /api/v1/notifications/push/test
   * Send a test push notification to the authenticated user's registered devices
   */
  static async sendTestNotification(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      // Role enforcement
      if (!['ADMIN', 'KITCHEN'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only authorized ADMIN and KITCHEN accounts can send test push notifications.',
        });
      }

      const activeDevices = await DeviceToken.find({
        user: req.user._id,
        isActive: true,
      });

      if (!activeDevices || activeDevices.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active registered push devices found for your account. Please enable notifications first.',
        });
      }

      const messaging = getMessaging();
      const isConfigured = isFirebaseConfigured();

      const testPayload = {
        title: 'BentoBabu — Push Notification Test',
        body: `Hello ${req.user.name}! Push alerts are properly configured on this device.`,
        data: {
          type: 'TEST_PUSH',
          clickAction: '/orders',
          timestamp: new Date().toISOString(),
        },
      };

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const device of activeDevices) {
        if (!isConfigured || !messaging) {
          // Dry-run mode for tests or development without FCM credentials
          console.log(`[PushNotification:DryRun] Simulated test notification to ${device.deviceName}`);
          results.push({
            deviceId: device._id.toString(),
            status: 'SIMULATED',
            message: 'Firebase credentials not configured; simulated successfully.',
          });
          successCount++;
          continue;
        }

        try {
          const response = await messaging.send({
            token: device.token,
            notification: {
              title: testPayload.title,
              body: testPayload.body,
            },
            data: testPayload.data,
            webpush: {
              fcmOptions: {
                link: '/orders',
              },
              notification: {
                icon: '/bentobabu_logo.png',
                badge: '/bentobabu_logo.png',
              },
            },
          });

          device.lastSeenAt = new Date();
          await device.save();

          results.push({
            deviceId: device._id.toString(),
            status: 'SENT',
            messageId: response,
          });
          successCount++;
        } catch (sendErr) {
          failureCount++;
          const errorCode = sendErr.code || '';
          console.error(`[PushNotification] Failed test push to device ${device._id}:`, sendErr.message);

          // Permanent error handling: Deactivate invalid/unregistered tokens
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            device.isActive = false;
            await device.save();
          }

          results.push({
            deviceId: device._id.toString(),
            status: 'FAILED',
            error: sendErr.message,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: `Test notification dispatched to ${activeDevices.length} device(s). Success: ${successCount}, Failed: ${failureCount}`,
        data: {
          totalDevices: activeDevices.length,
          tokensTargeted: activeDevices.length,
          successCount,
          failureCount,
          results,
        },
      });
    } catch (error) {
      if (typeof next === 'function') {
        next(error);
      } else {
        throw error;
      }
    }
  }
}

module.exports = PushNotificationController;
