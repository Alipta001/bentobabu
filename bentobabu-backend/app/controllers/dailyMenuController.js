const mongoose = require('mongoose');
const { DailyMenu, Product } = require('../models');
const {
  getKolkataDateString,
  isValidDateString,
  getYesterday,
  getMondayOfWeek,
  getWeekDates,
} = require('../utils/businessDate');
const { redisDelPattern } = require('../config/redis');

class DailyMenuController {
  /**
   * Helper to resolve active products and their availability for a specific date
   */
  static async resolveDateAvailability(dateStr) {
    const [dailyMenu, allActiveProducts] = await Promise.all([
      DailyMenu.findOne({ date: dateStr }).lean(),
      Product.find({ isActive: true })
        .populate('category', 'name slug')
        .sort({ category: 1, name: 1 })
        .lean(),
    ]);

    const availabilityMap = new Map();

    if (dailyMenu && Array.isArray(dailyMenu.items)) {
      dailyMenu.items.forEach((it) => {
        const prodId = it.product?._id ? it.product._id.toString() : it.product?.toString();
        if (prodId) {
          availabilityMap.set(prodId, Boolean(it.isAvailable));
        }
      });
    }

    const items = allActiveProducts.map((p) => {
      const pId = p._id.toString();
      // Master availability rule: if product master is unavailable, it cannot be available on daily menu.
      // If master is available, respect dailyMenu's specific availability override.
      let isAvailable = Boolean(p.isAvailable);
      if (isAvailable && availabilityMap.has(pId)) {
        isAvailable = Boolean(availabilityMap.get(pId));
      }

      return {
        product: {
          id: pId,
          _id: pId,
          name: p.name,
          slug: p.slug,
          category: p.category,
          price: p.price,
          images: p.images,
          dietaryTags: p.dietaryTags,
          stockQuantity: p.stockQuantity,
          masterIsAvailable: p.isAvailable,
          isActive: p.isActive,
        },
        isAvailable,
      };
    });

    return {
      date: dateStr,
      isConfigured: Boolean(dailyMenu),
      isPublished: dailyMenu ? Boolean(dailyMenu.isPublished) : false,
      notes: dailyMenu?.notes || '',
      items,
    };
  }

  /**
   * GET /api/v1/menu/daily
   * Public/Admin: Get daily menu configuration for a date (defaults to today in Asia/Kolkata)
   */
  static async getDailyMenu(req, res, next) {
    try {
      let targetDate = req.query.date;

      if (!targetDate || typeof targetDate !== 'string') {
        targetDate = getKolkataDateString();
      } else {
        targetDate = targetDate.trim();
        if (!isValidDateString(targetDate)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid date format. Expected YYYY-MM-DD.',
          });
        }
      }

      const result = await DailyMenuController.resolveDateAvailability(targetDate);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/menu/daily
   * ADMIN only: Save or update daily menu availability for a specific date
   */
  static async saveDailyMenu(req, res, next) {
    try {
      const { date, items, isPublished = true, notes = '' } = req.body;

      if (!date || !isValidDateString(date)) {
        return res.status(400).json({
          success: false,
          message: 'A valid date string (YYYY-MM-DD) is required.',
        });
      }

      if (!Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          message: 'Items must be an array of { product: string, isAvailable: boolean }.',
        });
      }

      const cleanItems = [];
      for (const item of items) {
        const prodId = item.product || item.productId || item.product?.id || item.product?._id;
        if (!prodId || !mongoose.Types.ObjectId.isValid(prodId)) {
          continue;
        }
        cleanItems.push({
          product: new mongoose.Types.ObjectId(prodId),
          isAvailable: Boolean(item.isAvailable),
        });
      }

      const updatedDoc = await DailyMenu.findOneAndUpdate(
        { date },
        {
          date,
          items: cleanItems,
          isPublished: Boolean(isPublished),
          notes: typeof notes === 'string' ? notes.trim() : '',
          lastUpdatedBy: (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)) ? req.user.id : null,
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // Invalidate relevant redis caches
      await redisDelPattern('cache:products:*');

      const resolved = await DailyMenuController.resolveDateAvailability(date);

      return res.status(200).json({
        success: true,
        message: `Daily menu for ${date} saved successfully.`,
        data: resolved,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/menu/daily/continue-yesterday
   * ADMIN only: Copy yesterday's menu availability configuration to target date
   */
  static async continueYesterday(req, res, next) {
    try {
      let targetDate = req.body.targetDate;

      if (!targetDate || typeof targetDate !== 'string') {
        targetDate = getKolkataDateString();
      } else {
        targetDate = targetDate.trim();
        if (!isValidDateString(targetDate)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid targetDate format. Expected YYYY-MM-DD.',
          });
        }
      }

      const yesterday = getYesterday(targetDate);
      const yesterdayResolved = await DailyMenuController.resolveDateAvailability(yesterday);

      const targetItems = yesterdayResolved.items.map((it) => ({
        product: new mongoose.Types.ObjectId(it.product.id),
        isAvailable: it.isAvailable,
      }));

      await DailyMenu.findOneAndUpdate(
        { date: targetDate },
        {
          date: targetDate,
          items: targetItems,
          isPublished: true,
          notes: `Copied from yesterday's menu (${yesterday})`,
          lastUpdatedBy: (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)) ? req.user.id : null,
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      await redisDelPattern('cache:products:*');

      const resolved = await DailyMenuController.resolveDateAvailability(targetDate);

      return res.status(200).json({
        success: true,
        message: `Yesterday's (${yesterday}) menu successfully copied to ${targetDate}.`,
        data: resolved,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/menu/weekly
   * ADMIN only: Retrieve 7-day schedule matrix starting from startDate (or this week's Monday)
   */
  static async getWeeklyMenu(req, res, next) {
    try {
      let startDate = req.query.startDate;

      if (!startDate || typeof startDate !== 'string') {
        startDate = getMondayOfWeek(getKolkataDateString());
      } else {
        startDate = startDate.trim();
        if (!isValidDateString(startDate)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid startDate format. Expected YYYY-MM-DD.',
          });
        }
      }

      const weekDates = getWeekDates(startDate);

      const [allActiveProducts, weeklyDocs] = await Promise.all([
        Product.find({ isActive: true })
          .populate('category', 'name slug')
          .sort({ category: 1, name: 1 })
          .lean(),
        DailyMenu.find({ date: { $in: weekDates } }).lean(),
      ]);

      const docMap = new Map();
      weeklyDocs.forEach((d) => docMap.set(d.date, d));

      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      const days = weekDates.map((dateStr, idx) => {
        const doc = docMap.get(dateStr);
        const itemMap = {};

        if (doc && Array.isArray(doc.items)) {
          doc.items.forEach((it) => {
            const pId = it.product?._id ? it.product._id.toString() : it.product?.toString();
            if (pId) {
              itemMap[pId] = Boolean(it.isAvailable);
            }
          });
        }

        const availability = {};
        allActiveProducts.forEach((p) => {
          const pId = p._id.toString();
          availability[pId] = pId in itemMap ? itemMap[pId] : Boolean(p.isAvailable);
        });

        return {
          date: dateStr,
          dayName: dayNames[idx],
          isConfigured: Boolean(doc),
          isPublished: doc ? Boolean(doc.isPublished) : false,
          availability,
        };
      });

      const products = allActiveProducts.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        slug: p.slug,
        category: p.category,
        price: p.price,
        images: p.images,
        dietaryTags: p.dietaryTags,
        masterIsAvailable: p.isAvailable,
      }));

      return res.status(200).json({
        success: true,
        data: {
          startDate,
          endDate: weekDates[6],
          days,
          products,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/menu/weekly
   * ADMIN only: Save entire weekly matrix schedule
   */
  static async saveWeeklyMenu(req, res, next) {
    try {
      const { days } = req.body;

      if (!Array.isArray(days) || days.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Days array is required.',
        });
      }

      const upsertPromises = days.map((day) => {
        const { date, items, isPublished = true, notes = '' } = day;
        if (!date || !isValidDateString(date)) {
          throw new Error(`Invalid date in weekly payload: ${date}`);
        }

        const cleanItems = [];
        if (Array.isArray(items)) {
          items.forEach((item) => {
            const prodId = item.product || item.productId || item.product?.id || item.product?._id;
            if (prodId && mongoose.Types.ObjectId.isValid(prodId)) {
              cleanItems.push({
                product: new mongoose.Types.ObjectId(prodId),
                isAvailable: Boolean(item.isAvailable),
              });
            }
          });
        }

        return DailyMenu.findOneAndUpdate(
          { date },
          {
            date,
            items: cleanItems,
            isPublished: Boolean(isPublished),
            notes: typeof notes === 'string' ? notes.trim() : '',
            lastUpdatedBy: (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)) ? req.user.id : null,
          },
          { upsert: true, returnDocument: 'after', runValidators: true }
        );
      });

      await Promise.all(upsertPromises);
      await redisDelPattern('cache:products:*');

      return res.status(200).json({
        success: true,
        message: 'Weekly menu schedule saved and published successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/menu/weekly/apply-all
   * ADMIN only: Apply one day's menu to all other days of the week
   */
  static async applyWeekAll(req, res, next) {
    try {
      const { sourceDate, targetDates } = req.body;

      if (!sourceDate || !isValidDateString(sourceDate)) {
        return res.status(400).json({
          success: false,
          message: 'A valid sourceDate (YYYY-MM-DD) is required.',
        });
      }

      if (!Array.isArray(targetDates) || targetDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'TargetDates array of dates (YYYY-MM-DD) is required.',
        });
      }

      const sourceResolved = await DailyMenuController.resolveDateAvailability(sourceDate);

      const itemsToApply = sourceResolved.items.map((it) => ({
        product: new mongoose.Types.ObjectId(it.product.id),
        isAvailable: it.isAvailable,
      }));

      const upsertPromises = targetDates.map((targetDate) => {
        if (!isValidDateString(targetDate)) {
          throw new Error(`Invalid targetDate: ${targetDate}`);
        }
        return DailyMenu.findOneAndUpdate(
          { date: targetDate },
          {
            date: targetDate,
            items: itemsToApply,
            isPublished: true,
            notes: `Applied from ${sourceDate}`,
            lastUpdatedBy: (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id)) ? req.user.id : null,
          },
          { upsert: true, returnDocument: 'after', runValidators: true }
        );
      });

      await Promise.all(upsertPromises);
      await redisDelPattern('cache:products:*');

      return res.status(200).json({
        success: true,
        message: `Menu from ${sourceDate} applied to all ${targetDates.length} selected days.`,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DailyMenuController;
