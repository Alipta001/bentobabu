const mongoose = require('mongoose');
const { Product, InventoryLog } = require('../models');
const { redisDelPattern } = require('../config/redis');

/**
 * Class-based Controller for Admin Inventory Management
 */
class InventoryController {
  /**
   * GET /api/v1/admin/inventory
   * List products with stock status and pagination
   */
  static async getInventory(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        categoryId,
        lowStock,
        sortBy = 'name',
        sortOrder = 'asc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};

      if (search && typeof search === 'string' && search.trim()) {
        filter.name = { $regex: search.trim(), $options: 'i' };
      }

      if (categoryId && mongoose.isValidObjectId(categoryId)) {
        filter.category = categoryId;
      }

      if (lowStock === 'true' || lowStock === true) {
        filter.$expr = { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 5] }] };
      }

      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const [products, totalProducts] = await Promise.all([
        Product.find(filter)
          .populate('category', 'name slug')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          products,
          pagination: {
            totalProducts,
            totalPages: Math.ceil(totalProducts / limitNum) || 1,
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
   * GET /api/v1/admin/inventory/low-stock
   * List active products where stockQuantity <= lowStockThreshold and stockQuantity > 0
   */
  static async getLowStock(req, res, next) {
    try {
      const lowStockProducts = await Product.find({
        isActive: true,
        stockQuantity: { $gt: 0 },
        $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', 5] }] },
      })
        .populate('category', 'name slug')
        .sort({ stockQuantity: 1 })
        .lean();

      return res.status(200).json({
        success: true,
        data: {
          count: lowStockProducts.length,
          products: lowStockProducts,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/inventory/out-of-stock
   * List active products where stockQuantity <= 0
   */
  static async getOutOfStock(req, res, next) {
    try {
      const outOfStockProducts = await Product.find({
        isActive: true,
        stockQuantity: { $lte: 0 },
      })
        .populate('category', 'name slug')
        .sort({ updatedAt: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        data: {
          count: outOfStockProducts.length,
          products: outOfStockProducts,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/inventory/:productId
   * Get stock details for a single product
   */
  static async getProductStockDetails(req, res, next) {
    try {
      const { productId } = req.params;

      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID format.',
        });
      }

      const product = await Product.findById(productId)
        .populate('category', 'name slug')
        .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          productId: product._id,
          name: product.name,
          stockQuantity: product.stockQuantity,
          lowStockThreshold: product.lowStockThreshold || 5,
          isAvailable: product.isAvailable,
          isActive: product.isActive,
          isLowStock: product.stockQuantity <= (product.lowStockThreshold || 5) && product.stockQuantity > 0,
          isOutOfStock: product.stockQuantity <= 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/inventory/:productId/adjust
   * Adjust product stock atomically with append-only log
   */
  static async adjustStock(req, res, next) {
    try {
      const { productId } = req.params;
      const { adjustmentType, quantity, reason } = req.body;

      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID format.',
        });
      }

      const upperType = typeof adjustmentType === 'string' ? adjustmentType.toUpperCase() : null;
      if (!upperType || !['ADD', 'REMOVE', 'SET'].includes(upperType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid adjustmentType. Must be ADD, REMOVE, or SET.',
        });
      }

      const numQuantity = Number(quantity);
      if (!Number.isInteger(numQuantity) || numQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a non-negative integer.',
        });
      }

      if ((upperType === 'ADD' || upperType === 'REMOVE') && numQuantity === 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be greater than 0 for ADD or REMOVE adjustments.',
        });
      }

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Reason for stock adjustment is required.',
        });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }

      const previousStock = product.stockQuantity;
      let newStock;

      if (upperType === 'ADD') {
        newStock = previousStock + numQuantity;
      } else if (upperType === 'REMOVE') {
        newStock = previousStock - numQuantity;
      } else {
        newStock = numQuantity;
      }

      if (newStock < 0) {
        return res.status(400).json({
          success: false,
          message: `Adjustment would result in negative stock quantity (${newStock}). Current stock is ${previousStock}.`,
        });
      }

      // Update product stock and availability (preserve isActive)
      product.stockQuantity = newStock;
      if (newStock > 0) {
        product.isAvailable = true;
      } else {
        product.isAvailable = false;
      }

      await product.save();

      // Invalidate product catalog and admin dashboard caches
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      // Write append-only inventory log
      const log = await InventoryLog.create({
        product: product._id,
        adjustmentType: upperType,
        quantity: numQuantity,
        previousStock,
        newStock,
        reason: reason.trim(),
        admin: req.user._id,
      });

      return res.status(200).json({
        success: true,
        message: 'Stock adjusted successfully.',
        data: {
          product: {
            id: product._id,
            name: product.name,
            stockQuantity: product.stockQuantity,
            isAvailable: product.isAvailable,
            isActive: product.isActive,
          },
          adjustment: {
            logId: log._id,
            adjustmentType: upperType,
            quantity: numQuantity,
            previousStock,
            newStock,
            reason: reason.trim(),
            createdAt: log.createdAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/inventory/:productId/history
   * Get paginated audit logs for a product's stock changes
   */
  static async getInventoryHistory(req, res, next) {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID format.',
        });
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [logs, totalLogs] = await Promise.all([
        InventoryLog.find({ product: productId })
          .populate('admin', 'name email role')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        InventoryLog.countDocuments({ product: productId }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          history: logs,
          pagination: {
            totalLogs,
            totalPages: Math.ceil(totalLogs / limitNum) || 1,
            currentPage: pageNum,
            limit: limitNum,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = InventoryController;

