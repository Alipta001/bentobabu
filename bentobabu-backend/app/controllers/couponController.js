const mongoose = require('mongoose');
const { Coupon, Cart, Product, Order } = require('../models');

/**
 * Class-based Controller for Coupon Management & Customer Validation
 */
class CouponController {
  /**
   * ADMIN: Create a new coupon
   * POST /api/v1/coupons
   */
  static async createCoupon(req, res, next) {
    try {
      const {
        code,
        description,
        discountType,
        discountValue,
        minimumOrderAmount,
        maximumDiscount,
        usageLimit,
        usageLimitPerUser,
        startDate,
        expiryDate,
        applicableProducts,
        applicableCategories,
        isActive,
        isFirstOrderOnly,
      } = req.body;

      if (!code || !discountType || discountValue === undefined || !expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'Code, discountType, discountValue, and expiryDate are required',
        });
      }

      const formattedCode = code.trim().toUpperCase();

      const existing = await Coupon.findOne({ code: formattedCode });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Coupon with code "${formattedCode}" already exists`,
        });
      }

      const coupon = new Coupon({
        code: formattedCode,
        description: description || '',
        discountType,
        discountValue,
        minimumOrderAmount: minimumOrderAmount || 0,
        maximumDiscount: maximumDiscount !== undefined ? maximumDiscount : null,
        usageLimit: usageLimit !== undefined ? usageLimit : null,
        usageLimitPerUser: usageLimitPerUser !== undefined ? usageLimitPerUser : 1,
        startDate: startDate ? new Date(startDate) : new Date(),
        expiryDate: new Date(expiryDate),
        applicableProducts: Array.isArray(applicableProducts) ? applicableProducts : [],
        applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isFirstOrderOnly: isFirstOrderOnly !== undefined ? Boolean(isFirstOrderOnly) : false,
      });

      await coupon.save();

      return res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: coupon,
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', '),
        });
      }
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Coupon code already exists',
        });
      }
      next(error);
    }
  }

  /**
   * ADMIN: List all coupons with filtering & pagination
   * GET /api/v1/coupons
   */
  static async getCoupons(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const filter = { isDeleted: false };
      if (req.query.isActive !== undefined) {
        filter.isActive = req.query.isActive === 'true';
      }

      const [coupons, total] = await Promise.all([
        Coupon.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('applicableCategories', 'name slug')
          .populate('applicableProducts', 'name slug price'),
        Coupon.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        count: coupons.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: coupons,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Get single coupon details
   * GET /api/v1/coupons/:id
   */
  static async getCouponById(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon ID format',
        });
      }

      const coupon = await Coupon.findOne({ _id: req.params.id, isDeleted: false })
        .populate('applicableCategories', 'name slug')
        .populate('applicableProducts', 'name slug price');

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: coupon,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Update coupon details
   * PATCH /api/v1/coupons/:id
   */
  static async updateCoupon(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon ID format',
        });
      }

      const updates = { ...req.body };
      delete updates._id;
      delete updates.id;
      delete updates.usedCount; // Prevent arbitrary tamper of usage
      delete updates.isDeleted;
      delete updates.deletedAt;

      if (updates.code) {
        updates.code = updates.code.trim().toUpperCase();
      }

      const coupon = await Coupon.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { $set: updates },
        { returnDocument: 'after', runValidators: true }
      );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Coupon updated successfully',
        data: coupon,
      });
    } catch (error) {
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({
          success: false,
          message: messages.join(', '),
        });
      }
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Coupon code already exists',
        });
      }
      next(error);
    }
  }

  /**
   * ADMIN: Toggle or set coupon active status
   * PATCH /api/v1/coupons/:id/status
   */
  static async updateCouponStatus(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon ID format',
        });
      }

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive boolean flag is required',
        });
      }

      const coupon = await Coupon.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { $set: { isActive } },
        { returnDocument: 'after' }
      );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: `Coupon ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: coupon,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Soft-delete a coupon
   * DELETE /api/v1/coupons/:id
   */
  static async deleteCoupon(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon ID format',
        });
      }

      const coupon = await Coupon.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { $set: { isDeleted: true, isActive: false, deletedAt: new Date() } },
        { returnDocument: 'after' }
      );

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Coupon deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER: Validate coupon against current cart
   * POST /api/v1/coupons/validate
   */
  static async validateCoupon(req, res, next) {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Coupon code is required',
          data: { valid: false, reason: 'Coupon code is required' },
        });
      }

      const formattedCode = code.trim().toUpperCase();

      // 1. Fetch customer cart
      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty. Add items before applying a coupon.',
          data: { valid: false, reason: 'Cart is empty' },
        });
      }

      // 2. Fetch live product details from MongoDB
      const productIds = cart.items.map((i) => i.product);
      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
        isAvailable: true,
      });

      const productMap = new Map();
      products.forEach((p) => productMap.set(p._id.toString(), p));

      // Calculate server-side subtotal in integer paise
      let subtotalPaise = 0;
      const validItems = [];

      for (const item of cart.items) {
        const prod = productMap.get(item.product.toString());
        if (!prod) continue;
        const pricePaise = Math.round(prod.price * 100);
        const itemSubtotalPaise = pricePaise * item.quantity;
        subtotalPaise += itemSubtotalPaise;
        validItems.push({
          product: prod,
          quantity: item.quantity,
          itemSubtotalPaise,
        });
      }

      if (validItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No available items found in cart',
          data: { valid: false, reason: 'No available items in cart' },
        });
      }

      // 3. Find coupon
      const coupon = await Coupon.findOne({ code: formattedCode, isDeleted: false });
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Invalid coupon code',
          data: { valid: false, reason: 'Coupon not found' },
        });
      }

      // 4. Validate coupon active status
      if (!coupon.isActive) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is currently inactive',
          data: { valid: false, reason: 'Coupon is inactive' },
        });
      }

      // 5. Validity date period
      const now = new Date();
      if (coupon.startDate && now < coupon.startDate) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is not yet active',
          data: { valid: false, reason: 'Coupon not yet started' },
        });
      }

      if (coupon.expiryDate && now > coupon.expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'This coupon has expired',
          data: { valid: false, reason: 'Coupon expired' },
        });
      }

      // 6. Global usage limit
      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({
          success: false,
          message: 'This coupon has reached its total usage limit',
          data: { valid: false, reason: 'Total usage limit reached' },
        });
      }

      // 7. Customer per-user usage limit
      const customerOrdersCount = await Order.countDocuments({
        user: req.user.id,
        coupon: coupon._id,
        orderStatus: { $ne: 'CANCELLED' },
      });

      if (customerOrdersCount >= coupon.usageLimitPerUser) {
        return res.status(400).json({
          success: false,
          message: `You have already used this coupon ${customerOrdersCount} time(s). Maximum allowed is ${coupon.usageLimitPerUser}.`,
          data: { valid: false, reason: 'Customer usage limit reached' },
        });
      }

      // 8. First order restriction
      if (coupon.isFirstOrderOnly) {
        const totalUserOrders = await Order.countDocuments({
          user: req.user.id,
          orderStatus: { $ne: 'CANCELLED' },
        });
        if (totalUserOrders > 0) {
          return res.status(400).json({
            success: false,
            message: 'This coupon is valid only for your first order',
            data: { valid: false, reason: 'First-order only restriction' },
          });
        }
      }

      // 9. Applicable products or categories
      let eligibleSubtotalPaise = 0;
      const hasProductFilter = coupon.applicableProducts && coupon.applicableProducts.length > 0;
      const hasCategoryFilter = coupon.applicableCategories && coupon.applicableCategories.length > 0;

      if (!hasProductFilter && !hasCategoryFilter) {
        eligibleSubtotalPaise = subtotalPaise;
      } else {
        const allowedProductIds = new Set(
          (coupon.applicableProducts || []).map((id) => id.toString())
        );
        const allowedCategoryIds = new Set(
          (coupon.applicableCategories || []).map((id) => id.toString())
        );

        for (const item of validItems) {
          const prodId = item.product._id.toString();
          const catId = item.product.category ? item.product.category.toString() : '';

          if (allowedProductIds.has(prodId) || allowedCategoryIds.has(catId)) {
            eligibleSubtotalPaise += item.itemSubtotalPaise;
          }
        }
      }

      if (eligibleSubtotalPaise === 0) {
        return res.status(400).json({
          success: false,
          message: 'Coupon does not apply to any products in your cart',
          data: { valid: false, reason: 'No applicable products in cart' },
        });
      }

      // 10. Minimum order amount
      const minOrderPaise = Math.round(coupon.minimumOrderAmount * 100);
      if (subtotalPaise < minOrderPaise) {
        return res.status(400).json({
          success: false,
          message: `Minimum order amount of ₹${coupon.minimumOrderAmount} required for this coupon`,
          data: {
            valid: false,
            reason: `Minimum order amount of ₹${coupon.minimumOrderAmount} required`,
          },
        });
      }

      // 11. Calculate discount in integer paise
      let discountPaise = 0;
      if (coupon.discountType === 'PERCENTAGE') {
        discountPaise = Math.round((eligibleSubtotalPaise * coupon.discountValue) / 100);
        if (coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) {
          const maxCapPaise = Math.round(coupon.maximumDiscount * 100);
          discountPaise = Math.min(discountPaise, maxCapPaise);
        }
      } else if (coupon.discountType === 'FIXED') {
        const fixedPaise = Math.round(coupon.discountValue * 100);
        discountPaise = Math.min(fixedPaise, eligibleSubtotalPaise);
      }

      // Never discount more than subtotal
      discountPaise = Math.min(discountPaise, subtotalPaise);

      const subtotal = subtotalPaise / 100;
      const eligibleSubtotal = eligibleSubtotalPaise / 100;
      const discount = discountPaise / 100;
      const deliveryCharge = 0; // Default or calculated at checkout with zone
      const finalPayableAmount = Math.max(0, subtotal - discount + deliveryCharge);

      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        data: {
          valid: true,
          coupon: {
            id: coupon.id,
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minimumOrderAmount: coupon.minimumOrderAmount,
            maximumDiscount: coupon.maximumDiscount,
          },
          subtotal,
          eligibleSubtotal,
          discount,
          deliveryCharge,
          finalPayableAmount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CouponController;

