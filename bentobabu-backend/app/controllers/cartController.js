const mongoose = require('mongoose');
const { Cart, Product, DailyMenu } = require('../models');
const { getKolkataDateString } = require('../utils/businessDate');

class CartController {
  /**
   * Helper to check whether a product is available on today's business date
   */
  static async checkProductAvailabilityToday(productId, masterProduct = null) {
    const todayStr = getKolkataDateString();
    const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();

    if (dailyMenu && Array.isArray(dailyMenu.items)) {
      const match = dailyMenu.items.find((it) => {
        const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
        return idStr === productId.toString();
      });
      if (match !== undefined) {
        return Boolean(match.isAvailable);
      }
    }

    if (masterProduct) {
      return Boolean(masterProduct.isAvailable);
    }

    const prod = await Product.findById(productId).select('isAvailable isActive').lean();
    return prod ? Boolean(prod.isAvailable) : false;
  }

  /**
   * Helper to format and compute live cart items and totals
   */
  static async calculateCart(cart) {
    if (!cart) {
      return {
        items: [],
        itemCount: 0,
        itemTotal: 0,
        isAllOrderable: true,
      };
    }

    let populatedCart = cart;
    if (!cart.populated || !cart.populated('items.product')) {
      populatedCart = await Cart.findById(cart._id).populate({
        path: 'items.product',
        select: 'name slug images price stockQuantity isAvailable isActive dietaryTags',
      });
    }

    if (!populatedCart) {
      return {
        items: [],
        itemCount: 0,
        itemTotal: 0,
        isAllOrderable: true,
      };
    }

    const todayStr = getKolkataDateString();
    const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();
    const dailyMap = new Map();
    if (dailyMenu && Array.isArray(dailyMenu.items)) {
      dailyMenu.items.forEach((it) => {
        const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
        if (idStr) dailyMap.set(idStr, Boolean(it.isAvailable));
      });
    }

    let totalPaise = 0;
    let allOrderable = true;
    const calculatedItems = [];

    for (const item of populatedCart.items) {
      if (!item.product) continue;

      const p = item.product;
      const isAvailableToday = dailyMap.has(p._id.toString())
        ? dailyMap.get(p._id.toString())
        : Boolean(p.isAvailable);

      const isSufficientStock = p.stockQuantity >= item.quantity;
      const isOrderable = p.isActive && isAvailableToday && isSufficientStock;

      if (!isOrderable) {
        allOrderable = false;
      }

      // Precise financial calculation using integer paise
      const unitPrice = p.price;
      const unitPricePaise = Math.round(unitPrice * 100);
      const subtotalPaise = unitPricePaise * item.quantity;

      if (isOrderable) {
        totalPaise += subtotalPaise;
      }

      calculatedItems.push({
        product: {
          id: p._id.toString(),
          name: p.name,
          slug: p.slug,
          images: p.images,
          price: p.price,
          stockQuantity: p.stockQuantity,
          isAvailable: isAvailableToday,
          isActive: p.isActive,
          dietaryTags: p.dietaryTags,
        },
        quantity: item.quantity,
        unitPrice,
        subtotal: subtotalPaise / 100,
        isOrderable,
        orderableReason: !p.isActive
          ? 'Product is no longer available'
          : !isAvailableToday
          ? 'Product is not available on today\'s menu'
          : !isSufficientStock
          ? `Only ${p.stockQuantity} item(s) in stock`
          : null,
      });
    }

    return {
      items: calculatedItems,
      itemCount: calculatedItems.length,
      itemTotal: totalPaise / 100,
      isAllOrderable: allOrderable,
    };
  }

  /**
   * GET /api/v1/cart
   * Return the authenticated customer's cart with live server-side calculations
   */
  static async getCart(req, res, next) {
    try {
      let cart = await Cart.findOne({ user: req.user.id });

      if (!cart) {
        cart = await Cart.create({ user: req.user.id, items: [] });
      }

      const data = await CartController.calculateCart(cart);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cart/merge
   * Atomically merge guest/local cart items into the authenticated customer's MongoDB cart
   */
  static async mergeCart(req, res, next) {
    try {
      const { items } = req.body;

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          const productId = item.productId || item.product?.id || item.product?._id;
          const qty = parseInt(item.quantity, 10);

          if (!productId || !mongoose.Types.ObjectId.isValid(productId) || !Number.isInteger(qty) || qty < 1) {
            continue;
          }

          const product = await Product.findById(productId);
          if (!product || !product.isActive || !product.isAvailable) {
            continue;
          }

          const existingIndex = cart.items.findIndex(
            (i) => i.product.toString() === productId.toString()
          );

          if (existingIndex > -1) {
            const newTotal = Math.min(product.stockQuantity, Math.max(cart.items[existingIndex].quantity, qty));
            cart.items[existingIndex].quantity = newTotal;
          } else {
            cart.items.push({
              product: product._id,
              quantity: Math.min(product.stockQuantity, qty),
            });
          }
        }
        await cart.save();
      }

      const data = await CartController.calculateCart(cart);

      res.status(200).json({
        success: true,
        message: 'Cart synchronized successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/cart/items
   * Add a product to the authenticated customer's cart
   */
  static async addItem(req, res, next) {
    try {
      const { productId, quantity } = req.body;

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid Product identifier is required',
        });
      }

      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive integer (minimum 1)',
        });
      }

      // Fetch live product from database to verify status and stock
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or inactive',
        });
      }

      const isAvailableToday = await CartController.checkProductAvailabilityToday(productId, product);
      if (!isAvailableToday) {
        return res.status(400).json({
          success: false,
          message: `"${product.name}" is not available on today's menu`,
        });
      }

      if (product.stockQuantity < qty) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Only ${product.stockQuantity} item(s) available`,
        });
      }

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      const existingIndex = cart.items.findIndex(
        (i) => i.product.toString() === productId
      );

      if (existingIndex > -1) {
        const newTotalQuantity = cart.items[existingIndex].quantity + qty;
        if (newTotalQuantity > product.stockQuantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more. Total in cart (${newTotalQuantity}) would exceed available stock (${product.stockQuantity})`,
          });
        }
        cart.items[existingIndex].quantity = newTotalQuantity;
      } else {
        cart.items.push({
          product: product._id,
          quantity: qty,
        });
      }

      await cart.save();
      const data = await CartController.calculateCart(cart);

      res.status(200).json({
        success: true,
        message: 'Product added to cart successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/cart/items/:productId
   * Update quantity of an existing item in the cart
   */
  static async updateItemQuantity(req, res, next) {
    try {
      const { productId } = req.params;
      const { quantity } = req.body;

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid Product identifier is required',
        });
      }

      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive integer (minimum 1)',
        });
      }

      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or inactive',
        });
      }

      const isAvailableToday = await CartController.checkProductAvailabilityToday(productId, product);
      if (!isAvailableToday) {
        return res.status(400).json({
          success: false,
          message: `"${product.name}" is not available on today's menu`,
        });
      }

      if (qty > product.stockQuantity) {
        return res.status(400).json({
          success: false,
          message: `Requested quantity exceeds available stock of ${product.stockQuantity}`,
        });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({
          success: false,
          message: 'Cart not found',
        });
      }

      const itemIndex = cart.items.findIndex(
        (i) => i.product.toString() === productId
      );

      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Item not found in cart',
        });
      }

      cart.items[itemIndex].quantity = qty;
      await cart.save();
      const data = await CartController.calculateCart(cart);

      res.status(200).json({
        success: true,
        message: 'Cart item updated successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/cart/items/:productId
   * Remove a single product from the customer's cart
   */
  static async removeItem(req, res, next) {
    try {
      const { productId } = req.params;

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid Product identifier is required',
        });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (cart) {
        cart.items = cart.items.filter(
          (i) => i.product.toString() !== productId
        );
        await cart.save();
      }

      const data = await CartController.calculateCart(cart);

      res.status(200).json({
        success: true,
        message: 'Item removed from cart successfully',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/cart
   * Clear all items from the customer's cart
   */
  static async clearCart(req, res, next) {
    try {
      const cart = await Cart.findOne({ user: req.user.id });
      if (cart) {
        cart.items = [];
        await cart.save();
      }

      res.status(200).json({
        success: true,
        message: 'Cart cleared successfully',
        data: {
          items: [],
          itemCount: 0,
          itemTotal: 0,
          isAllOrderable: true,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CartController;

