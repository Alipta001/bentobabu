const mongoose = require('mongoose');
const { Notification, User } = require('../models');

/**
 * Class-based Controller for Customer Notifications & Preferences
 */
class NotificationController {
  /**
   * GET /api/v1/notifications
   * List customer's notifications with pagination and filters
   */
  static async getNotifications(req, res, next) {
    try {
      const {
        channel,
        isRead,
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      // Customer isolation: strictly scoped to authenticated user
      const filter = { user: req.user._id };

      if (channel && typeof channel === 'string') {
        const upperChannel = channel.toUpperCase();
        if (['EMAIL', 'WHATSAPP', 'IN_APP'].includes(upperChannel)) {
          filter.channel = upperChannel;
        }
      }

      if (isRead !== undefined && isRead !== '') {
        filter.isRead = isRead === 'true' || isRead === true;
      }

      const [notifications, total] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Notification.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          notifications,
          pagination: {
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
            currentPage: pageNum,
            limit: limitNum,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/unread-count
   * Return total unread notifications for current customer
   */
  static async getUnreadCount(req, res, next) {
    try {
      const unreadCount = await Notification.countDocuments({
        user: req.user._id,
        isRead: false,
      });

      return res.status(200).json({
        success: true,
        data: { unreadCount },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark a specific notification as read
   */
  static async markAsRead(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification ID format.',
        });
      }

      const notification = await Notification.findOne({
        _id: id,
        user: req.user._id,
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found.',
        });
      }

      notification.isRead = true;
      await notification.save();

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read.',
        data: { notification },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/read-all
   * Mark all unread notifications as read for current customer
   */
  static async markAllAsRead(req, res, next) {
    try {
      const result = await Notification.updateMany(
        { user: req.user._id, isRead: false },
        { $set: { isRead: true } }
      );

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read.',
        data: {
          updatedCount: result.modifiedCount || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/preferences
   * Get notification preferences for authenticated customer
   */
  static async getPreferences(req, res, next) {
    try {
      const user = await User.findById(req.user._id).select('notificationPreferences');

      const isStaff = ['ADMIN', 'KITCHEN'].includes(req.user.role);
      const userPrefs = user?.notificationPreferences || {};

      const preferences = {
        email: userPrefs.email ?? true,
        whatsapp: userPrefs.whatsapp ?? false,
        inApp: userPrefs.inApp ?? true,
        push: userPrefs.push ?? true,
        ...(isStaff
          ? {
              newOrderPushEnabled: userPrefs.newOrderPushEnabled ?? true,
              orderUpdatePushEnabled: userPrefs.orderUpdatePushEnabled ?? true,
            }
          : {}),
      };

      return res.status(200).json({
        success: true,
        data: { preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/preferences
   * Update notification preferences (email, whatsapp opt-in/opt-out, inApp, push)
   */
  static async updatePreferences(req, res, next) {
    try {
      const {
        email,
        whatsapp,
        inApp,
        push,
        newOrderPushEnabled,
        orderUpdatePushEnabled,
      } = req.body;

      if (
        email === undefined &&
        whatsapp === undefined &&
        inApp === undefined &&
        push === undefined &&
        newOrderPushEnabled === undefined &&
        orderUpdatePushEnabled === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: 'At least one valid preference field must be provided.',
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found.',
        });
      }

      if (!user.notificationPreferences) {
        user.notificationPreferences = {
          email: true,
          whatsapp: false,
          inApp: true,
          push: true,
          newOrderPushEnabled: ['ADMIN', 'KITCHEN'].includes(req.user.role),
          orderUpdatePushEnabled: true,
        };
      }

      if (email !== undefined) {
        if (typeof email !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'email preference must be a boolean (true or false).',
          });
        }
        user.notificationPreferences.email = email;
      }

      if (whatsapp !== undefined) {
        if (typeof whatsapp !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'whatsapp preference must be a boolean (true or false).',
          });
        }
        user.notificationPreferences.whatsapp = whatsapp;
      }

      if (inApp !== undefined) {
        if (typeof inApp !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'inApp preference must be a boolean (true or false).',
          });
        }
        user.notificationPreferences.inApp = inApp;
      }

      if (push !== undefined) {
        if (typeof push !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'push preference must be a boolean (true or false).',
          });
        }
        user.notificationPreferences.push = push;
      }

      // Security check: Reject any role elevation attempt
      if (req.body.role && req.body.role !== req.user.role) {
        return res.status(403).json({
          success: false,
          message: 'Role elevation is not permitted.',
        });
      }

      // Security check: Only ADMIN and KITCHEN users can configure staff new-order alerts
      const isStaff = ['ADMIN', 'KITCHEN'].includes(req.user.role);

      if (newOrderPushEnabled !== undefined) {
        if (typeof newOrderPushEnabled !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'newOrderPushEnabled must be a boolean.',
          });
        }
        if (!isStaff) {
          return res.status(403).json({
            success: false,
            message: 'Only authorized ADMIN and KITCHEN staff can configure new order push alerts.',
          });
        }
        user.notificationPreferences.newOrderPushEnabled = newOrderPushEnabled;
      }

      if (orderUpdatePushEnabled !== undefined) {
        if (typeof orderUpdatePushEnabled !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'orderUpdatePushEnabled must be a boolean.',
          });
        }
        if (!isStaff) {
          return res.status(403).json({
            success: false,
            message: 'Only authorized ADMIN and KITCHEN staff can configure staff order update alerts.',
          });
        }
        user.notificationPreferences.orderUpdatePushEnabled = orderUpdatePushEnabled;
      }

      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Notification preferences updated successfully.',
        data: {
          preferences: user.notificationPreferences,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationController;

