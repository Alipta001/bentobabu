const mongoose = require('mongoose');
const { Product, InventoryLog, DailyInventory } = require('../models');
const { redisDelPattern } = require('../config/redis');
const DailyInventoryService = require('../services/dailyInventoryService');
const { getKolkataDateString, isValidDateString } = require('../utils/businessDate');

/**
 * Class-based Controller for Admin Inventory Management
 */
class InventoryController {
  /**
   * GET /api/v1/admin/inventory/daily
   * List daily inventory records for a specific service date with filters & summary
   */
  static async getDailyInventory(req, res, next) {
    try {
      const {
        date,
        search,
        categoryId,
        status, // 'ALL', 'AVAILABLE', 'LOW_STOCK', 'SOLD_OUT', 'MANUALLY_UNAVAILABLE'
      } = req.query;

      const serviceDate = DailyInventoryService.resolveServiceDate(date);

      // Fetch all active products
      const prodFilter = { isActive: true };
      if (search && typeof search === 'string' && search.trim()) {
        prodFilter.name = { $regex: search.trim(), $options: 'i' };
      }
      if (categoryId && mongoose.isValidObjectId(categoryId)) {
        prodFilter.category = categoryId;
      }

      const products = await Product.find(prodFilter)
        .populate('category', 'name slug')
        .sort({ category: 1, name: 1 })
        .lean();

      const productIds = products.map((p) => p._id);
      const inventoryMap = await DailyInventoryService.getInventoryMapForDate(productIds, serviceDate);

      // Combine products with their daily inventory stats
      const items = products.map((p) => {
        const pId = p._id.toString();
        const inv = inventoryMap.get(pId) || {
          initialStock: serviceDate === getKolkataDateString() ? p.stockQuantity : 0,
          restockedQuantity: 0,
          totalStock: serviceDate === getKolkataDateString() ? p.stockQuantity : 0,
          reservedQuantity: 0,
          soldQuantity: 0,
          remainingStock: serviceDate === getKolkataDateString() ? p.stockQuantity : 0,
          isManuallyDisabled: !p.isAvailable,
          lowStockThreshold: p.lowStockThreshold || 5,
          status: !p.isAvailable
            ? 'MANUALLY_UNAVAILABLE'
            : (serviceDate === getKolkataDateString() ? p.stockQuantity : 0) <= 0
            ? 'SOLD_OUT'
            : (serviceDate === getKolkataDateString() ? p.stockQuantity : 0) <= (p.lowStockThreshold || 5)
            ? 'LOW_STOCK'
            : 'AVAILABLE',
          isSoldOut: (serviceDate === getKolkataDateString() ? p.stockQuantity : 0) <= 0,
        };

        const remainingStock = Math.max(0, (inv.totalStock || 0) - (inv.reservedQuantity || 0));
        const isSoldOut = remainingStock <= 0;
        const currentStatus = inv.isManuallyDisabled
          ? 'MANUALLY_UNAVAILABLE'
          : isSoldOut
          ? 'SOLD_OUT'
          : remainingStock <= (inv.lowStockThreshold || p.lowStockThreshold || 5)
          ? 'LOW_STOCK'
          : 'AVAILABLE';

        return {
          productId: pId,
          product: {
            id: pId,
            name: p.name,
            slug: p.slug,
            category: p.category,
            price: p.price,
            images: p.images,
            servingSize: p.portionSize || '1 portion',
            lowStockThreshold: p.lowStockThreshold || 5,
            masterIsAvailable: p.isAvailable,
          },
          serviceDate,
          initialStock: inv.initialStock || 0,
          restockedQuantity: inv.restockedQuantity || 0,
          totalStock: inv.totalStock || 0,
          reservedQuantity: inv.reservedQuantity || 0,
          soldQuantity: inv.soldQuantity || 0,
          remainingStock,
          isSoldOut,
          isManuallyDisabled: Boolean(inv.isManuallyDisabled),
          status: currentStatus,
        };
      });

      // Filter by status if requested
      const filteredItems = items.filter((it) => {
        if (!status || status === 'ALL') return true;
        return it.status === status;
      });

      const summary = {
        totalDishes: items.length,
        totalCapacity: items.reduce((acc, it) => acc + it.totalStock, 0),
        totalReserved: items.reduce((acc, it) => acc + it.reservedQuantity, 0),
        totalRemaining: items.reduce((acc, it) => acc + it.remainingStock, 0),
        availableCount: items.filter((it) => it.status === 'AVAILABLE').length,
        lowStockCount: items.filter((it) => it.status === 'LOW_STOCK').length,
        soldOutCount: items.filter((it) => it.status === 'SOLD_OUT').length,
        manuallyDisabledCount: items.filter((it) => it.status === 'MANUALLY_UNAVAILABLE').length,
      };

      return res.status(200).json({
        success: true,
        data: {
          serviceDate,
          summary,
          items: filteredItems,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/inventory/daily/set-capacity
   * Set initial daily production capacity for a food item and service date
   */
  static async setDailyCapacity(req, res, next) {
    try {
      const { productId, serviceDate, capacity, reason } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required.',
        });
      }

      const updated = await DailyInventoryService.setInitialCapacity({
        productId,
        serviceDate,
        capacity,
        adminUser: req.user,
        reason,
      });

      return res.status(200).json({
        success: true,
        message: 'Initial daily capacity updated successfully.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/inventory/daily/restock
   * Restock a food item (+N packets) for a service date
   * Re-enables availability automatically if not manually disabled
   */
  static async restockDailyItem(req, res, next) {
    try {
      const { productId, serviceDate, additionalQuantity, note } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required.',
        });
      }

      const updated = await DailyInventoryService.restockItem({
        productId,
        serviceDate,
        additionalQuantity,
        adminUser: req.user,
        note,
      });

      return res.status(200).json({
        success: true,
        message: `Successfully restocked ${additionalQuantity} packet(s). Item is now available for ordering.`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/inventory/daily/toggle-availability
   * Manually enable or disable item for a service date (separate from stock)
   */
  static async toggleDailyAvailability(req, res, next) {
    try {
      const { productId, serviceDate, isManuallyDisabled, reason } = req.body;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required.',
        });
      }

      const updated = await DailyInventoryService.toggleManualAvailability({
        productId,
        serviceDate,
        isManuallyDisabled,
        adminUser: req.user,
        reason,
      });

      return res.status(200).json({
        success: true,
        message: isManuallyDisabled
          ? 'Item manually disabled for this service date.'
          : 'Item manual availability restored.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/inventory/daily/:productId/history
   * Retrieve restock and movement audit history for a product
   */
  static async getDailyRestockHistory(req, res, next) {
    try {
      const { productId } = req.params;
      const { serviceDate } = req.query;

      if (!productId || !mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required.',
        });
      }

      const sDate = DailyInventoryService.resolveServiceDate(serviceDate);
      const inventory = await DailyInventory.findOne({
        product: productId,
        serviceDate: sDate,
      }).lean();

      const generalLogs = await InventoryLog.find({ product: productId })
        .populate('admin', 'name email role')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      return res.status(200).json({
        success: true,
        data: {
          serviceDate: sDate,
          history: inventory?.restockHistory || [],
          restockHistory: inventory?.restockHistory || [],
          initialStock: inventory?.initialStock || 0,
          restockedQuantity: inventory?.restockedQuantity || 0,
          totalStock: inventory?.totalStock || 0,
          remainingStock: inventory ? Math.max(0, inventory.totalStock - inventory.reservedQuantity) : 0,
          generalLogs,
        },
      });
    } catch (error) {
      next(error);
    }
  }
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

