const mongoose = require('mongoose');
const { User, Product, Order, Category } = require('../models');
const { redisGet, redisSet } = require('../config/redis');

/**
 * Class-based Controller for Admin Business Dashboard & Analytics
 */
class AdminDashboardController {
  /**
   * Helper to parse date range from query params (period or custom dates)
   */
  static parseDateRange(query) {
    const now = new Date();
    let startDate = new Date();
    let groupByFormat = '%Y-%m-%d'; // Daily by default

    if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      return { startDate, endDate, groupByFormat };
    }

    const period = (query.period || '30d').toLowerCase();

    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '12m':
        startDate.setFullYear(now.getFullYear() - 1);
        groupByFormat = '%Y-%m'; // Monthly grouping
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate: now, groupByFormat };
  }

  /**
   * GET /api/v1/admin/dashboard/overview
   */
  static async getOverview(req, res, next) {
    try {
      const CACHE_KEY = 'cache:admin:dashboard:overview';
      const cached = await redisGet(CACHE_KEY);
      if (cached) {
        return res.status(200).json(cached);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        totalCustomers,
        totalActiveProducts,
        lowStockProductCount,
        allOrdersStats,
        todayOrdersStats,
        totalRevenueAgg,
        todayRevenueAgg,
      ] = await Promise.all([
        User.countDocuments({ role: 'CUSTOMER' }),
        Product.countDocuments({ isActive: true }),
        Product.countDocuments({
          isActive: true,
          $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 5] }] },
        }),
        // Order counts by status
        Order.aggregate([
          {
            $group: {
              _id: '$orderStatus',
              count: { $sum: 1 },
            },
          },
        ]),
        // Today's order counts by status
        Order.aggregate([
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
            },
          },
        ]),
        // Total collected revenue: ONLY successfully paid orders (excluding cancelled)
        Order.aggregate([
          {
            $match: {
              paymentStatus: 'PAID',
              orderStatus: { $ne: 'CANCELLED' },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$grandTotal' },
            },
          },
        ]),
        // Today's collected revenue: ONLY successfully paid orders today
        Order.aggregate([
          {
            $match: {
              paymentStatus: 'PAID',
              orderStatus: { $ne: 'CANCELLED' },
              createdAt: { $gte: todayStart },
            },
          },
          {
            $group: {
              _id: null,
              todayRevenue: { $sum: '$grandTotal' },
            },
          },
        ]),
      ]);

      const statusCounts = {
        PENDING: 0,
        CONFIRMED: 0,
        PREPARING: 0,
        READY_FOR_PICKUP: 0,
        READY_FOR_DISPATCH: 0,
        RIDER_ACCEPTED: 0,
        PICKED_UP: 0,
        OUT_FOR_DELIVERY: 0,
        DELIVERED: 0,
        CANCELLED: 0,
      };

      let totalOrders = 0;
      allOrdersStats.forEach((stat) => {
        if (statusCounts[stat._id] !== undefined) {
          statusCounts[stat._id] = stat.count;
        }
        totalOrders += stat.count;
      });

      const todayOrders = todayOrdersStats[0]?.totalOrders || 0;
      const totalRevenue = totalRevenueAgg[0]?.totalRevenue || 0;
      const todayRevenue = todayRevenueAgg[0]?.todayRevenue || 0;

      const responsePayload = {
        success: true,
        data: {
          totalCustomers,
          totalActiveProducts,
          lowStockProductCount,
          totalOrders,
          todayOrders,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          todayRevenue: Math.round(todayRevenue * 100) / 100,
          pendingOrders: statusCounts.PENDING,
          confirmedOrders: statusCounts.CONFIRMED,
          preparingOrders: statusCounts.PREPARING,
          readyForPickupOrders: statusCounts.READY_FOR_PICKUP + statusCounts.READY_FOR_DISPATCH,
          riderAcceptedOrders: statusCounts.RIDER_ACCEPTED,
          pickedUpOrders: statusCounts.PICKED_UP,
          outForDeliveryOrders: statusCounts.OUT_FOR_DELIVERY + statusCounts.PICKED_UP,
          deliveredOrders: statusCounts.DELIVERED,
          cancelledOrders: statusCounts.CANCELLED,
        },
      };

      await redisSet(CACHE_KEY, responsePayload, 180); // 3 minutes TTL

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/dashboard/revenue
   */
  static async getRevenue(req, res, next) {
    try {
      const period = (req.query.period || '30d').toLowerCase();
      const CACHE_KEY = `cache:admin:dashboard:revenue:${period}`;
      const cached = await redisGet(CACHE_KEY);
      if (cached) {
        return res.status(200).json(cached);
      }

      const { startDate, endDate, groupByFormat } = AdminDashboardController.parseDateRange(
        req.query
      );

      // Aggregate revenue strictly using successfully PAID orders, excluding CANCELLED
      const revenueTimeline = await Order.aggregate([
        {
          $match: {
            paymentStatus: 'PAID',
            orderStatus: { $ne: 'CANCELLED' },
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: groupByFormat, date: '$createdAt' } },
            revenue: { $sum: '$grandTotal' },
            paidOrdersCount: { $sum: 1 },
            discounts: { $sum: '$couponDiscount' },
            deliveryFees: { $sum: '$deliveryCharge' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Summary totals over the period
      let totalRevenue = 0;
      let totalPaidOrders = 0;
      let totalDiscounts = 0;
      let totalDeliveryFees = 0;

      revenueTimeline.forEach((point) => {
        totalRevenue += point.revenue;
        totalPaidOrders += point.paidOrdersCount;
        totalDiscounts += point.discounts;
        totalDeliveryFees += point.deliveryFees;
      });

      const averageOrderValue =
        totalPaidOrders > 0 ? Math.round((totalRevenue / totalPaidOrders) * 100) / 100 : 0;

      const responsePayload = {
        success: true,
        data: {
          period: req.query.period || '30d',
          startDate,
          endDate,
          summary: {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalPaidOrders,
            averageOrderValue,
            totalDiscounts: Math.round(totalDiscounts * 100) / 100,
            totalDeliveryFees: Math.round(totalDeliveryFees * 100) / 100,
          },
          timeline: revenueTimeline.map((item) => ({
            date: item._id,
            revenue: Math.round(item.revenue * 100) / 100,
            paidOrdersCount: item.paidOrdersCount,
            discounts: Math.round(item.discounts * 100) / 100,
            deliveryFees: Math.round(item.deliveryFees * 100) / 100,
          })),
        },
      };

      await redisSet(CACHE_KEY, responsePayload, 300); // 5 minutes TTL

      return res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/dashboard/orders
   */
  static async getOrders(req, res, next) {
    try {
      const { startDate, endDate } = AdminDashboardController.parseDateRange(req.query);

      const [statusBreakdown, paymentMethodBreakdown, paymentStatusBreakdown, dailyOrderTrends] =
        await Promise.all([
          // Group by order status
          Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
          ]),
          // Group by payment method
          Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
          ]),
          // Group by payment status
          Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
          ]),
          // Daily order counts
          Order.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ]);

      let totalOrders = 0;
      let totalCancelled = 0;

      statusBreakdown.forEach((s) => {
        totalOrders += s.count;
        if (s._id === 'CANCELLED') {
          totalCancelled = s.count;
        }
      });

      const cancellationRate =
        totalOrders > 0 ? Math.round((totalCancelled / totalOrders) * 10000) / 100 : 0;

      return res.status(200).json({
        success: true,
        data: {
          totalOrders,
          cancellationRate,
          statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
          paymentMethodBreakdown: paymentMethodBreakdown.map((p) => ({
            method: p._id,
            count: p.count,
          })),
          paymentStatusBreakdown: paymentStatusBreakdown.map((p) => ({
            status: p._id,
            count: p.count,
          })),
          dailyOrderTrends: dailyOrderTrends.map((d) => ({ date: d._id, count: d.count })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/dashboard/products
   */
  static async getProducts(req, res, next) {
    try {
      const [bestSellingAgg, lowStockProducts, outOfStockProducts, topCategoriesAgg] =
        await Promise.all([
          // Best selling items aggregated from historical order item snapshots (excluding CANCELLED)
          Order.aggregate([
            { $match: { orderStatus: { $ne: 'CANCELLED' } } },
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.product',
                productName: { $first: '$items.productName' },
                totalQuantitySold: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.subtotal' },
              },
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 10 },
          ]),
          // Low stock products
          Product.find({
            isActive: true,
            stockQuantity: { $gt: 0 },
            $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 5] }] },
          })
            .select('name slug price stockQuantity lowStockThreshold')
            .limit(20),
          // Out of stock products
          Product.find({
            isActive: true,
            stockQuantity: { $lte: 0 },
          })
            .select('name slug price stockQuantity')
            .limit(20),
          // Top categories by order item frequency
          Order.aggregate([
            { $match: { orderStatus: { $ne: 'CANCELLED' } } },
            { $unwind: '$items' },
            {
              $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productDoc',
              },
            },
            { $unwind: '$productDoc' },
            {
              $lookup: {
                from: 'categories',
                localField: 'productDoc.category',
                foreignField: '_id',
                as: 'categoryDoc',
              },
            },
            { $unwind: '$categoryDoc' },
            {
              $group: {
                _id: '$categoryDoc._id',
                categoryName: { $first: '$categoryDoc.name' },
                totalItemsSold: { $sum: '$items.quantity' },
              },
            },
            { $sort: { totalItemsSold: -1 } },
            { $limit: 5 },
          ]),
        ]);

      return res.status(200).json({
        success: true,
        data: {
          bestSellingProducts: bestSellingAgg.map((item) => ({
            productId: item._id,
            name: item.productName,
            totalQuantitySold: item.totalQuantitySold,
            totalRevenue: Math.round(item.totalRevenue * 100) / 100,
          })),
          lowStockProducts,
          outOfStockProducts,
          topCategories: topCategoriesAgg.map((c) => ({
            categoryId: c._id,
            name: c.categoryName,
            totalItemsSold: c.totalItemsSold,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/dashboard/customers
   */
  static async getCustomers(req, res, next) {
    try {
      const { startDate, endDate } = AdminDashboardController.parseDateRange(req.query);

      const [totalCustomers, newCustomers, returningCustomersAgg, topCustomersAgg] =
        await Promise.all([
          User.countDocuments({ role: 'CUSTOMER' }),
          User.countDocuments({
            role: 'CUSTOMER',
            createdAt: { $gte: startDate, $lte: endDate },
          }),
          // Returning customers: customers who placed > 1 non-cancelled order
          Order.aggregate([
            { $match: { orderStatus: { $ne: 'CANCELLED' } } },
            { $group: { _id: '$user', orderCount: { $sum: 1 } } },
            { $match: { orderCount: { $gt: 1 } } },
            { $count: 'returningCount' },
          ]),
          // Top customers by order frequency and spend
          Order.aggregate([
            { $match: { orderStatus: { $ne: 'CANCELLED' }, paymentStatus: 'PAID' } },
            {
              $group: {
                _id: '$user',
                orderCount: { $sum: 1 },
                totalSpent: { $sum: '$grandTotal' },
              },
            },
            { $sort: { orderCount: -1, totalSpent: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userDoc',
              },
            },
            { $unwind: '$userDoc' },
            {
              $project: {
                _id: 1,
                name: '$userDoc.name',
                email: '$userDoc.email',
                phone: '$userDoc.phone',
                orderCount: 1,
                totalSpent: 1,
              },
            },
          ]),
        ]);

      return res.status(200).json({
        success: true,
        data: {
          totalCustomers,
          newCustomers,
          returningCustomers: returningCustomersAgg[0]?.returningCount || 0,
          topCustomers: topCustomersAgg.map((c) => ({
            userId: c._id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            orderCount: c.orderCount,
            totalSpent: Math.round(c.totalSpent * 100) / 100,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminDashboardController;

