const mongoose = require('mongoose');
const { DailyInventory, Product, InventoryLog } = require('../models');
const { getKolkataDateString, isValidDateString } = require('../utils/businessDate');
const { redisDelPattern } = require('../config/redis');

class DailyInventoryService {
  /**
   * Resolve effective service date in Asia/Kolkata
   * @param {string} [dateStr]
   * @returns {string} YYYY-MM-DD
   */
  static resolveServiceDate(dateStr) {
    if (dateStr && isValidDateString(dateStr.trim())) {
      return dateStr.trim();
    }
    return getKolkataDateString();
  }

  /**
   * Get or initialize a daily inventory record for a product and service date
   * @param {string|ObjectId} productId
   * @param {string} [serviceDate]
   */
  static async getOrCreateDailyInventory(productId, serviceDate = getKolkataDateString(), session = null) {
    const sDate = this.resolveServiceDate(serviceDate);
    const prodId = new mongoose.Types.ObjectId(productId);

    const findOpts = session ? { session } : {};
    let doc = await DailyInventory.findOne({ product: prodId, serviceDate: sDate }, null, findOpts);
    if (!doc) {
      // Find product to seed default threshold and master stock if same-day
      const product = await Product.findById(prodId, null, findOpts).lean();
      if (!product) {
        throw new Error('Product not found');
      }

      const isToday = sDate === getKolkataDateString();
      const initialStock = isToday ? (product.stockQuantity || 0) : 0;

      try {
        const createData = {
          product: prodId,
          serviceDate: sDate,
          initialStock,
          restockedQuantity: 0,
          totalStock: initialStock,
          reservedQuantity: 0,
          soldQuantity: 0,
          isManuallyDisabled: !product.isAvailable,
          lowStockThreshold: product.lowStockThreshold || 5,
        };
        if (session) {
          const created = await DailyInventory.create([createData], { session });
          doc = created[0];
        } else {
          doc = await DailyInventory.create(createData);
        }
      } catch (err) {
        // Handle race condition if created concurrently
        if (err.code === 11000) {
          doc = await DailyInventory.findOne({ product: prodId, serviceDate: sDate }, null, findOpts);
        } else {
          throw err;
        }
      }
    }
    return doc;
  }

  /**
   * Retrieve active inventory metrics for a list of products on a service date
   * @param {Array<string|ObjectId>} productIds
   * @param {string} [serviceDate]
   * @returns {Promise<Map<string, Object>>}
   */
  static async getInventoryMapForDate(productIds, serviceDate = getKolkataDateString()) {
    const sDate = this.resolveServiceDate(serviceDate);
    const objectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));

    const records = await DailyInventory.find({
      product: { $in: objectIds },
      serviceDate: sDate,
    }).lean();

    const map = new Map();
    records.forEach((rec) => {
      const remaining = Math.max(0, (rec.totalStock || 0) - (rec.reservedQuantity || 0));
      map.set(rec.product.toString(), {
        ...rec,
        remainingStock: remaining,
        isSoldOut: remaining <= 0,
        status: rec.isManuallyDisabled
          ? 'MANUALLY_UNAVAILABLE'
          : remaining <= 0
          ? 'SOLD_OUT'
          : remaining <= (rec.lowStockThreshold || 5)
          ? 'LOW_STOCK'
          : 'AVAILABLE',
      });
    });

    return map;
  }

  /**
   * Set initial daily capacity for a product and service date
   */
  static async setInitialCapacity({ productId, serviceDate, capacity, adminUser, reason }) {
    const sDate = this.resolveServiceDate(serviceDate);
    const numCap = Number(capacity);

    if (!Number.isInteger(numCap) || numCap < 0) {
      throw new Error('Capacity must be a non-negative integer');
    }

    const prodId = new mongoose.Types.ObjectId(productId);
    const product = await Product.findById(prodId);
    if (!product) {
      throw new Error('Product not found');
    }

    const inventory = await this.getOrCreateDailyInventory(prodId, sDate);

    // Warning / Protection: if lowering total capacity below currently reserved orders
    const newTotalStock = numCap + (inventory.restockedQuantity || 0);
    if (newTotalStock < (inventory.reservedQuantity || 0)) {
      const activeRes = inventory.reservedQuantity || 0;
      throw new Error(
        `Cannot set initial stock to ${numCap}. Total capacity (${newTotalStock}) would be below active reserved orders (${activeRes}). Please adjust existing orders or set higher stock.`
      );
    }

    const previousInitial = inventory.initialStock;
    const previousTotal = inventory.totalStock;

    inventory.initialStock = numCap;
    inventory.totalStock = newTotalStock;
    await inventory.save();

    // Sync master product if this is today's inventory
    const isToday = sDate === getKolkataDateString();
    if (isToday) {
      const remaining = Math.max(0, inventory.totalStock - inventory.reservedQuantity);
      product.stockQuantity = remaining;
      // Do not override manual availability
      if (remaining > 0 && !inventory.isManuallyDisabled) {
        product.isAvailable = true;
      }
      await product.save();
    }

    // Write audit log
    await InventoryLog.create({
      product: product._id,
      adjustmentType: 'SET',
      quantity: numCap,
      previousStock: previousTotal,
      newStock: newTotalStock,
      reason: reason || `Set initial capacity for service date ${sDate}`,
      admin: adminUser._id,
    });

    await redisDelPattern('cache:products:*');
    await redisDelPattern('cache:admin:dashboard:*');

    return inventory;
  }

  /**
   * Restock an item for a service date (+N packets)
   * Formula: totalStock = initialStock + sum(additionalRestocks)
   * remainingStock = totalStock - activeReservedQuantity
   */
  static async restockItem({ productId, serviceDate, additionalQuantity, adminUser, note }) {
    const sDate = this.resolveServiceDate(serviceDate);
    const qty = Number(additionalQuantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('Restock quantity must be a positive integer greater than zero');
    }

    const prodId = new mongoose.Types.ObjectId(productId);
    const product = await Product.findById(prodId);
    if (!product) {
      throw new Error('Product not found');
    }

    const inventory = await this.getOrCreateDailyInventory(prodId, sDate);
    const previousTotal = inventory.totalStock || 0;
    const newTotal = previousTotal + qty;
    const newRestockedQty = (inventory.restockedQuantity || 0) + qty;

    const historyEntry = {
      quantityAdded: qty,
      previousTotalStock: previousTotal,
      newTotalStock: newTotal,
      admin: adminUser._id,
      adminName: adminUser.name || 'Admin',
      note: (note || '').trim(),
      timestamp: new Date(),
    };

    inventory.restockedQuantity = newRestockedQty;
    inventory.totalStock = newTotal;
    inventory.restockHistory.push(historyEntry);
    await inventory.save();

    // If today's date, sync master product stock and restore available status if not manually disabled
    const isToday = sDate === getKolkataDateString();
    if (isToday) {
      const remaining = Math.max(0, inventory.totalStock - inventory.reservedQuantity);
      product.stockQuantity = remaining;
      if (!inventory.isManuallyDisabled) {
        product.isAvailable = true;
      }
      await product.save();
    }

    // Append to InventoryLog
    await InventoryLog.create({
      product: product._id,
      adjustmentType: 'ADD',
      quantity: qty,
      previousStock: previousTotal,
      newStock: newTotal,
      reason: note ? `Restock: ${note.trim()}` : `Restocked ${qty} packets for ${sDate}`,
      admin: adminUser._id,
    });

    await redisDelPattern('cache:products:*');
    await redisDelPattern('cache:admin:dashboard:*');

    return inventory;
  }

  /**
   * Toggle manual availability (separate from stock capacity)
   */
  static async toggleManualAvailability({ productId, serviceDate, isManuallyDisabled, adminUser, reason }) {
    const sDate = this.resolveServiceDate(serviceDate);
    const prodId = new mongoose.Types.ObjectId(productId);
    const product = await Product.findById(prodId);
    if (!product) {
      throw new Error('Product not found');
    }

    const inventory = await this.getOrCreateDailyInventory(prodId, sDate);
    inventory.isManuallyDisabled = Boolean(isManuallyDisabled);
    await inventory.save();

    const isToday = sDate === getKolkataDateString();
    if (isToday) {
      if (inventory.isManuallyDisabled) {
        product.isAvailable = false;
      } else {
        const remaining = Math.max(0, inventory.totalStock - inventory.reservedQuantity);
        product.isAvailable = remaining > 0;
      }
      await product.save();
    }

    await redisDelPattern('cache:products:*');
    await redisDelPattern('cache:admin:dashboard:*');

    return inventory;
  }

  /**
   * Atomically reserve stock for an array of items on a service date
   * Prevents overselling under concurrency without negative stock
   * @param {Array<{productId: string|ObjectId, quantity: number, productName?: string}>|Object} items
   * @param {string} [serviceDate]
   * @param {ClientSession} [session]
   */
  static async reserveStockAtomic(items, serviceDate = getKolkataDateString(), session = null) {
    let normalizedItems = items;
    let sDate = this.resolveServiceDate(serviceDate);
    let currentSession = session;
    let isSingleInput = false;

    if (items && !Array.isArray(items)) {
      if (Array.isArray(items.items)) {
        normalizedItems = items.items;
        if (items.serviceDate) sDate = this.resolveServiceDate(items.serviceDate);
        if (items.session) currentSession = items.session;
      } else if (items.productId) {
        normalizedItems = [items];
        isSingleInput = true;
        if (items.serviceDate) sDate = this.resolveServiceDate(items.serviceDate);
        if (items.session) currentSession = items.session;
      }
    }

    const reservedItems = [];
    let lastUpdatedDoc = null;

    try {
      for (const item of normalizedItems) {
        const prodId = new mongoose.Types.ObjectId(item.productId);
        const qty = Number(item.quantity);

        // Ensure daily inventory document exists
        await this.getOrCreateDailyInventory(prodId, sDate, currentSession);

        // Atomic conditional increment: totalStock - reservedQuantity >= qty
        // In MongoDB: $expr: { $gte: [{ $subtract: ['$totalStock', '$reservedQuantity'] }, qty] }
        const updateQuery = {
          product: prodId,
          serviceDate: sDate,
          isManuallyDisabled: { $ne: true },
          $expr: {
            $gte: [{ $subtract: ['$totalStock', '$reservedQuantity'] }, qty],
          },
        };

        const updateDoc = {
          $inc: { reservedQuantity: qty },
        };

        const opts = currentSession
          ? { returnDocument: 'after', session: currentSession }
          : { returnDocument: 'after' };

        const updated = await DailyInventory.findOneAndUpdate(updateQuery, updateDoc, opts);

        if (!updated) {
          // Fetch current state to construct accurate error
          const current = await DailyInventory.findOne({ product: prodId, serviceDate: sDate }).lean();
          const prod = await Product.findById(prodId).lean();
          const prodName = prod?.name || item.productName || 'Food Item';
          const available = current ? Math.max(0, (current.totalStock || 0) - (current.reservedQuantity || 0)) : 0;

          const error = new Error(
            available <= 0
              ? `"${prodName}" is currently sold out for service date ${sDate}.`
              : `Only ${available} packet(s) of "${prodName}" are available for service date ${sDate}. (Requested: ${qty})`
          );
          error.code = 'ITEM_CAPACITY_EXCEEDED';
          error.remainingStock = available;
          error.data = {
            productId: prodId.toString(),
            productName: prodName,
            requestedQuantity: qty,
            availableQuantity: available,
            serviceDate: sDate,
          };
          throw error;
        }

        lastUpdatedDoc = updated;
        reservedItems.push({
          productId: prodId,
          quantity: qty,
          serviceDate: sDate,
        });

        // Also sync Product.stockQuantity for backward compatibility if today
        if (sDate === getKolkataDateString()) {
          const remaining = Math.max(0, updated.totalStock - updated.reservedQuantity);
          await Product.updateOne(
            { _id: prodId },
            {
              $set: {
                stockQuantity: remaining,
                isAvailable: remaining > 0 && !updated.isManuallyDisabled,
              },
            },
            currentSession ? { session: currentSession } : {}
          );
        }
      }

      return isSingleInput ? lastUpdatedDoc : reservedItems;
    } catch (err) {
      // Rollback any successfully reserved items in this loop if not in an aborted transaction
      if (!currentSession) {
        for (const resItem of reservedItems) {
          try {
            await this.releaseStockAtomic([resItem], resItem.serviceDate);
          } catch (_) {}
        }
      }
      throw err;
    }
  }

  /**
   * Atomically release reserved stock
   * @param {Array<{productId: string|ObjectId, quantity: number}>|Object} items
   * @param {string} [serviceDate]
   */
  static async releaseStockAtomic(items, serviceDate = getKolkataDateString()) {
    let normalizedItems = items;
    let sDate = this.resolveServiceDate(serviceDate);
    let isSingleInput = false;

    if (items && !Array.isArray(items)) {
      if (Array.isArray(items.items)) {
        normalizedItems = items.items;
        if (items.serviceDate) sDate = this.resolveServiceDate(items.serviceDate);
      } else if (items.productId) {
        normalizedItems = [items];
        isSingleInput = true;
        if (items.serviceDate) sDate = this.resolveServiceDate(items.serviceDate);
      }
    }

    let lastUpdatedDoc = null;
    for (const item of normalizedItems) {
      const prodId = new mongoose.Types.ObjectId(item.productId);
      const qty = Number(item.quantity);

      const updated = await DailyInventory.findOneAndUpdate(
        { product: prodId, serviceDate: sDate },
        { $inc: { reservedQuantity: -qty } },
        { new: true }
      );

      lastUpdatedDoc = updated;

      if (updated && sDate === getKolkataDateString()) {
        const remaining = Math.max(0, updated.totalStock - updated.reservedQuantity);
        await Product.updateOne(
          { _id: prodId },
          {
            $set: {
              stockQuantity: remaining,
              isAvailable: remaining > 0 && !updated.isManuallyDisabled,
            },
          }
        );
      }
    }

    await redisDelPattern('cache:products:*');
    await redisDelPattern('cache:admin:dashboard:*');

    return isSingleInput ? lastUpdatedDoc : true;
  }

  /**
   * Atomically move reserved stock to sold stock upon order delivery / fulfillment
   */
  static async confirmSoldStockAtomic(items, serviceDate = getKolkataDateString()) {
    const sDate = this.resolveServiceDate(serviceDate);

    for (const item of items) {
      const prodId = new mongoose.Types.ObjectId(item.productId);
      const qty = Number(item.quantity);

      await DailyInventory.updateOne(
        { product: prodId, serviceDate: sDate },
        {
          $inc: {
            reservedQuantity: -qty,
            soldQuantity: qty,
          },
        }
      );
    }
  }
}

module.exports = DailyInventoryService;
