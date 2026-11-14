const mongoose = require('mongoose');
const { Notification } = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');

/**
 * Class-based Controller for Admin Notification Management & Auditing
 */
class AdminNotificationController {
  /**
   * GET /api/v1/admin/notifications
   * List all system notifications with filtering and pagination
   */
  static async getNotifications(req, res, next) {
    try {
      const {
        channel,
        status,
        eventType,
        userId,
        orderId,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};

      if (channel && typeof channel === 'string') {
        const upperChannel = channel.toUpperCase();
        if (['EMAIL', 'WHATSAPP', 'IN_APP'].includes(upperChannel)) {
          filter.channel = upperChannel;
        }
      }

      if (status && typeof status === 'string') {
        const upperStatus = status.toUpperCase();
        if (['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'].includes(upperStatus)) {
          filter.status = upperStatus;
        }
      }

      if (eventType && typeof eventType === 'string') {
        filter.eventType = eventType.toUpperCase();
      }

      if (userId && mongoose.isValidObjectId(userId)) {
        filter.user = userId;
      }

      if (orderId && mongoose.isValidObjectId(orderId)) {
        filter.order = orderId;
      }

      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt = { $gte: start, $lte: end };
      }

      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [notifications, total] = await Promise.all([
        Notification.find(filter)
          .populate('user', 'name email phone role')
          .populate('order', 'orderNumber orderStatus grandTotal')
          .sort(sort)
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
   * GET /api/v1/admin/notifications/stats
   * Aggregated metrics for notification deliveries across channels
   */
  static async getNotificationStats(req, res, next) {
    try {
      const [statusAgg, channelAgg, totalCount] = await Promise.all([
        Notification.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Notification.aggregate([
          { $group: { _id: '$channel', count: { $sum: 1 } } },
        ]),
        Notification.countDocuments(),
      ]);

      const statusBreakdown = {
        SENT: 0,
        FAILED: 0,
        PENDING: 0,
        PROCESSING: 0,
        SKIPPED: 0,
      };

      statusAgg.forEach((s) => {
        if (statusBreakdown[s._id] !== undefined) {
          statusBreakdown[s._id] = s.count;
        }
      });

      const channelBreakdown = {
        EMAIL: 0,
        WHATSAPP: 0,
        IN_APP: 0,
      };

      channelAgg.forEach((c) => {
        if (channelBreakdown[c._id] !== undefined) {
          channelBreakdown[c._id] = c.count;
        }
      });

      const totalDeliveredOrFailed = statusBreakdown.SENT + statusBreakdown.FAILED;
      const successRate =
        totalDeliveredOrFailed > 0
          ? Math.round((statusBreakdown.SENT / totalDeliveredOrFailed) * 10000) / 100
          : 100;

      return res.status(200).json({
        success: true,
        data: {
          totalNotifications: totalCount,
          successRate,
          statusBreakdown,
          channelBreakdown,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/notifications/:id
   * Get single notification details
   */
  static async getNotificationById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification ID format.',
        });
      }

      const notification = await Notification.findById(id)
        .populate('user', 'name email phone role')
        .populate('order', 'orderNumber orderStatus grandTotal')
        .lean();

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: { notification },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/notifications/:id/retry
   * Safely retry a failed notification with concurrency locking
   */
  static async retryNotification(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid notification ID format.',
        });
      }

      const retriedNotification = await NotificationDispatcher.retry(id);

      return res.status(200).json({
        success: true,
        message: 'Notification retry processed.',
        data: { notification: retriedNotification },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Notification retry failed.',
      });
    }
  }
}

module.exports = AdminNotificationController;

