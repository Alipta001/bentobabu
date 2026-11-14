const mongoose = require('mongoose');
const {
  Order,
  Cart,
  Product,
  Address,
  DeliveryZone,
  DeliverySlot,
  Coupon,
  CouponUsage,
  SystemSetting,
} = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { redisDelPattern } = require('../config/redis');

/**
 * Class-based Controller for Checkout & Order Processing
 */
class OrderController {
  /**
   * CUSTOMER: Calculate live checkout summary
   * POST /api/v1/orders/checkout-summary
   */
  static async getCheckoutSummary(req, res, next) {
    try {
      const { addressId, deliverySlotId, couponCode } = req.body;

      // Check system maintenance and order acceptance settings
      const [maintSetting, acceptSetting] = await Promise.all([
        SystemSetting.findOne({ key: 'MAINTENANCE_MODE' }).lean(),
        SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' }).lean(),
      ]);

      if (maintSetting && maintSetting.value === true) {
        return res.status(503).json({
          success: false,
          message: 'Platform is currently under maintenance. Please try again later.',
        });
      }

      if (acceptSetting && acceptSetting.value === false) {
        return res.status(400).json({
          success: false,
          message: 'Order placement is currently disabled. We are not accepting new orders at this time.',
        });
      }

      // 1. Validate Address
      if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid delivery address ID is required',
        });
      }

      const address = await Address.findOne({ _id: addressId, user: req.user.id });
      if (!address) {
        return res.status(404).json({
          success: false,
          message: 'Delivery address not found or does not belong to you',
        });
      }

      // 2. Validate Delivery Zone
      const zone = await DeliveryZone.findOne({
        pincodes: address.pincode,
        isActive: true,
      });

      if (!zone) {
        return res.status(400).json({
          success: false,
          message: `Delivery is currently not serviceable to PIN code ${address.pincode}`,
        });
      }

      // 3. Validate Delivery Slot (if provided)
      let slot = null;
      if (deliverySlotId) {
        if (!mongoose.Types.ObjectId.isValid(deliverySlotId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid delivery slot ID format',
          });
        }

        slot = await DeliverySlot.findOne({ _id: deliverySlotId, isActive: true });
        if (!slot) {
          return res.status(400).json({
            success: false,
            message: 'Selected delivery slot is inactive or invalid',
          });
        }

        if (slot.bookedCount >= slot.capacity) {
          return res.status(400).json({
            success: false,
            message: 'Selected delivery slot is fully booked. Please choose another slot.',
          });
        }
      }

      // 4. Fetch Customer Cart
      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Your cart is empty',
        });
      }

      // 5. Fetch Live Product Records & Validate Stock
      const productIds = cart.items.map((i) => i.product);
      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
        isAvailable: true,
      });

      const productMap = new Map();
      products.forEach((p) => productMap.set(p._id.toString(), p));

      let itemTotalPaise = 0;
      const itemSnapshots = [];

      for (const item of cart.items) {
        const prod = productMap.get(item.product.toString());
        if (!prod) {
          return res.status(400).json({
            success: false,
            message: `One or more products in your cart are no longer available`,
          });
        }

        if (item.quantity > prod.stockQuantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${prod.name}". Available: ${prod.stockQuantity}, Requested: ${item.quantity}`,
          });
        }

        const pricePaise = Math.round(prod.price * 100);
        const subtotalPaise = pricePaise * item.quantity;
        itemTotalPaise += subtotalPaise;

        itemSnapshots.push({
          product: prod._id,
          productName: prod.name,
          image: prod.images && prod.images.length > 0 ? prod.images[0] : '',
          quantity: item.quantity,
          unitPrice: prod.price,
          subtotal: subtotalPaise / 100,
        });
      }

      // Check zone minimum order amount
      const zoneMinOrderPaise = Math.round(zone.minimumOrderAmount * 100);
      if (itemTotalPaise < zoneMinOrderPaise) {
        return res.status(400).json({
          success: false,
          message: `Minimum order amount of ₹${zone.minimumOrderAmount} required for delivery zone "${zone.name}"`,
        });
      }

      // Check system-level minimum order amount
      const minOrderSetting = await SystemSetting.findOne({ key: 'MINIMUM_ORDER_AMOUNT' }).lean();
      if (
        minOrderSetting &&
        typeof minOrderSetting.value === 'number' &&
        minOrderSetting.value > 0
      ) {
        const platformMinPaise = Math.round(minOrderSetting.value * 100);
        if (itemTotalPaise < platformMinPaise) {
          return res.status(400).json({
            success: false,
            message: `Minimum order amount of ₹${minOrderSetting.value} is required.`,
          });
        }
      }

      // 6. Delivery Fee calculation
      const deliveryChargePaise = Math.round(zone.deliveryCharge * 100);

      // 7. Validate Coupon (if provided)
      let couponDiscountPaise = 0;
      let appliedCoupon = null;

      if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
        const formattedCode = couponCode.trim().toUpperCase();
        const coupon = await Coupon.findOne({ code: formattedCode, isDeleted: false });

        if (!coupon || !coupon.isActive) {
          return res.status(400).json({
            success: false,
            message: 'Coupon is invalid or inactive',
          });
        }

        const now = new Date();
        if ((coupon.startDate && now < coupon.startDate) || (coupon.expiryDate && now > coupon.expiryDate)) {
          return res.status(400).json({
            success: false,
            message: 'Coupon is expired or not yet active',
          });
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
          return res.status(400).json({
            success: false,
            message: 'Coupon total usage limit reached',
          });
        }

        const customerUsageCount = await Order.countDocuments({
          user: req.user.id,
          coupon: coupon._id,
          orderStatus: { $ne: 'CANCELLED' },
        });

        if (customerUsageCount >= coupon.usageLimitPerUser) {
          return res.status(400).json({
            success: false,
            message: `You have reached the maximum usage limit for coupon ${coupon.code}`,
          });
        }

        if (coupon.isFirstOrderOnly) {
          const totalOrders = await Order.countDocuments({
            user: req.user.id,
            orderStatus: { $ne: 'CANCELLED' },
          });
          if (totalOrders > 0) {
            return res.status(400).json({
              success: false,
              message: 'Coupon is only valid for first-time orders',
            });
          }
        }

        const minOrderPaise = Math.round(coupon.minimumOrderAmount * 100);
        if (itemTotalPaise < minOrderPaise) {
          return res.status(400).json({
            success: false,
            message: `Minimum order amount of ₹${coupon.minimumOrderAmount} required for coupon ${coupon.code}`,
          });
        }

        if (coupon.discountType === 'PERCENTAGE') {
          couponDiscountPaise = Math.round((itemTotalPaise * coupon.discountValue) / 100);
          if (coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) {
            const maxCapPaise = Math.round(coupon.maximumDiscount * 100);
            couponDiscountPaise = Math.min(couponDiscountPaise, maxCapPaise);
          }
        } else if (coupon.discountType === 'FIXED') {
          couponDiscountPaise = Math.min(Math.round(coupon.discountValue * 100), itemTotalPaise);
        }

        couponDiscountPaise = Math.min(couponDiscountPaise, itemTotalPaise);

        appliedCoupon = {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountAmount: couponDiscountPaise / 100,
        };
      }

      const taxAmountPaise = 0;
      const grandTotalPaise = Math.max(
        0,
        itemTotalPaise - couponDiscountPaise + deliveryChargePaise + taxAmountPaise
      );

      return res.status(200).json({
        success: true,
        data: {
          items: itemSnapshots,
          itemTotal: itemTotalPaise / 100,
          deliveryAddress: address,
          deliveryZone: zone,
          deliverySlot: slot,
          coupon: appliedCoupon,
          couponDiscount: couponDiscountPaise / 100,
          deliveryCharge: deliveryChargePaise / 100,
          taxAmount: taxAmountPaise / 100,
          grandTotal: grandTotalPaise / 100,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER: Place an order
   * POST /api/v1/orders
   */
  static async placeOrder(req, res, next) {
    const topoType = mongoose.connection.client?.topology?.description?.type;
    const isReplicaSet = topoType === 'ReplicaSetWithPrimary' || topoType === 'Sharded';

    if (process.env.NODE_ENV === 'production' && !isReplicaSet) {
      return res.status(500).json({
        success: false,
        message:
          'Production configuration error: BentoBabu requires a MongoDB Replica Set (e.g. MongoDB Atlas) to guarantee multi-document ACID transactions.',
      });
    }

    const session = isReplicaSet ? await mongoose.startSession() : null;
    if (session) {
      session.startTransaction();
    }

    const reservedStockItems = [];
    let reservedSlotId = null;
    let reservedCouponId = null;
    let couponUsageDoc = null;
    let customerUsageCount = 0;

    try {
      const { addressId, deliverySlotId, couponCode, paymentMethod } = req.body;

      if (!paymentMethod || !['RAZORPAY', 'COD'].includes(paymentMethod.toUpperCase())) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(400).json({
          success: false,
          message: 'Payment method must be either "RAZORPAY" or "COD"',
        });
      }

      const normalizedPaymentMethod = paymentMethod.toUpperCase();

      // Check system maintenance and order acceptance settings
      const [maintSetting, acceptSetting] = await Promise.all([
        SystemSetting.findOne({ key: 'MAINTENANCE_MODE' }).lean(),
        SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' }).lean(),
      ]);

      if (maintSetting && maintSetting.value === true) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(503).json({
          success: false,
          message: 'Platform is currently under maintenance. Please try again later.',
        });
      }

      if (acceptSetting && acceptSetting.value === false) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(400).json({
          success: false,
          message: 'Order placement is currently disabled. We are not accepting new orders at this time.',
        });
      }

      // 1. Verify Delivery Address
      if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(400).json({
          success: false,
          message: 'Valid delivery address ID is required',
        });
      }

      const addressQuery = Address.findOne({
        _id: addressId,
        user: req.user.id,
      });
      const address = session ? await addressQuery.session(session) : await addressQuery;

      if (!address) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(404).json({
          success: false,
          message: 'Delivery address not found or does not belong to you',
        });
      }

      // 2. Verify Delivery Zone
      const zoneQuery = DeliveryZone.findOne({
        pincodes: address.pincode,
        isActive: true,
      });
      const zone = session ? await zoneQuery.session(session) : await zoneQuery;

      if (!zone) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }
        return res.status(400).json({
          success: false,
          message: `Delivery is currently not serviceable to PIN code ${address.pincode}`,
        });
      }

      // 3. Atomically allocate Delivery Slot capacity (if provided)
      let slot = null;
      if (deliverySlotId) {
        if (!mongoose.Types.ObjectId.isValid(deliverySlotId)) {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(400).json({
            success: false,
            message: 'Invalid delivery slot ID format',
          });
        }

        const slotUpdateOpts = session
          ? { returnDocument: 'after', session }
          : { returnDocument: 'after' };

        slot = await DeliverySlot.findOneAndUpdate(
          {
            _id: deliverySlotId,
            isActive: true,
            $expr: { $lt: ['$bookedCount', '$capacity'] },
          },
          { $inc: { bookedCount: 1 } },
          slotUpdateOpts
        );

        if (!slot) {
          if (session) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(400).json({
            success: false,
            message: 'Selected delivery slot is full, inactive, or unavailable',
          });
        }
        reservedSlotId = slot._id;
      }

      // 4. Fetch Customer Cart
      const cartQuery = Cart.findOne({ user: req.user.id });
      const cart = session ? await cartQuery.session(session) : await cartQuery;

      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        } else if (reservedSlotId) {
          await DeliverySlot.updateOne({ _id: reservedSlotId }, { $inc: { bookedCount: -1 } });
        }
        return res.status(400).json({
          success: false,
          message: 'Your cart is empty',
        });
      }

      // 5. Atomically reserve product stock and build immutable snapshots
      let itemTotalPaise = 0;
      const itemSnapshots = [];

      for (const item of cart.items) {
        const prodUpdateOpts = session
          ? { returnDocument: 'after', session }
          : { returnDocument: 'after' };

        const product = await Product.findOneAndUpdate(
          {
            _id: item.product,
            stockQuantity: { $gte: item.quantity },
            isAvailable: true,
            isActive: true,
          },
          { $inc: { stockQuantity: -item.quantity } },
          prodUpdateOpts
        );

        if (!product) {
          throw new Error(`Insufficient stock or product unavailable for item in cart`);
        }

        reservedStockItems.push({
          productId: product._id,
          quantity: item.quantity,
        });

        const pricePaise = Math.round(product.price * 100);
        const subtotalPaise = pricePaise * item.quantity;
        itemTotalPaise += subtotalPaise;

        itemSnapshots.push({
          product: product._id,
          productName: product.name,
          image: product.images && product.images.length > 0 ? product.images[0] : '',
          quantity: item.quantity,
          unitPrice: product.price,
          subtotal: subtotalPaise / 100,
        });
      }

      // Check zone minimum order amount
      const zoneMinOrderPaise = Math.round(zone.minimumOrderAmount * 100);
      if (itemTotalPaise < zoneMinOrderPaise) {
        throw new Error(
          `Minimum order amount of ₹${zone.minimumOrderAmount} required for delivery zone "${zone.name}"`
        );
      }

      // Check system-level minimum order amount
      const minOrderSetting = await SystemSetting.findOne({ key: 'MINIMUM_ORDER_AMOUNT' }).lean();
      if (
        minOrderSetting &&
        typeof minOrderSetting.value === 'number' &&
        minOrderSetting.value > 0
      ) {
        const platformMinPaise = Math.round(minOrderSetting.value * 100);
        if (itemTotalPaise < platformMinPaise) {
          throw new Error(`Minimum order amount of ₹${minOrderSetting.value} is required.`);
        }
      }

      const deliveryChargePaise = Math.round(zone.deliveryCharge * 100);

      // 6. Atomically reserve coupon usage (if provided)
      let couponDiscountPaise = 0;
      let couponDoc = null;

      if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
        const formattedCode = couponCode.trim().toUpperCase();
        const couponUpdateOpts = session
          ? { returnDocument: 'after', session }
          : { returnDocument: 'after' };

        couponDoc = await Coupon.findOneAndUpdate(
          {
            code: formattedCode,
            isActive: true,
            isDeleted: false,
            startDate: { $lte: new Date() },
            expiryDate: { $gte: new Date() },
            $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
          },
          { $inc: { usedCount: 1 } },
          couponUpdateOpts
        );

        if (!couponDoc) {
          throw new Error('Coupon is invalid, expired, or has reached its total usage limit');
        }

        reservedCouponId = couponDoc._id;

        // Verify per-customer usage atomically using CouponUsage
        const custCountQuery = CouponUsage.countDocuments({
          user: req.user.id,
          coupon: couponDoc._id,
        });
        customerUsageCount = session
          ? await custCountQuery.session(session)
          : await custCountQuery;

        if (customerUsageCount >= couponDoc.usageLimitPerUser) {
          throw new Error(`You have reached the maximum usage limit for coupon ${couponDoc.code}`);
        }

        // Verify first-order restriction
        if (couponDoc.isFirstOrderOnly) {
          const totalOrdersQuery = Order.countDocuments({
            user: req.user.id,
            orderStatus: { $ne: 'CANCELLED' },
          });
          const totalOrders = session
            ? await totalOrdersQuery.session(session)
            : await totalOrdersQuery;

          if (totalOrders > 0) {
            throw new Error('This coupon is valid only for your first order');
          }
        }

        // Check coupon minimum order amount
        const minOrderPaise = Math.round(couponDoc.minimumOrderAmount * 100);
        if (itemTotalPaise < minOrderPaise) {
          throw new Error(
            `Minimum order amount of ₹${couponDoc.minimumOrderAmount} required for coupon ${couponDoc.code}`
          );
        }

        // Calculate discount
        if (couponDoc.discountType === 'PERCENTAGE') {
          couponDiscountPaise = Math.round((itemTotalPaise * couponDoc.discountValue) / 100);
          if (couponDoc.maximumDiscount !== null && couponDoc.maximumDiscount !== undefined) {
            const maxCapPaise = Math.round(couponDoc.maximumDiscount * 100);
            couponDiscountPaise = Math.min(couponDiscountPaise, maxCapPaise);
          }
        } else if (couponDoc.discountType === 'FIXED') {
          couponDiscountPaise = Math.min(Math.round(couponDoc.discountValue * 100), itemTotalPaise);
        }

        couponDiscountPaise = Math.min(couponDiscountPaise, itemTotalPaise);
      }

      const taxAmountPaise = 0;
      const grandTotalPaise = Math.max(
        0,
        itemTotalPaise - couponDiscountPaise + deliveryChargePaise + taxAmountPaise
      );

      // 7. Generate Unique Order Number
      const orderNumber =
        'BB-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

      // 8. Immutable Delivery Address Snapshot
      const addressSnapshot = {
        fullName: address.fullName,
        phone: address.phone,
        addressLine: address.addressLine,
        landmark: address.landmark || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        addressType: address.addressType,
      };

      // 9. Initial Order & Payment Statuses
      const orderStatus = normalizedPaymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING';
      const paymentStatus = normalizedPaymentMethod === 'COD' ? 'COD_PENDING' : 'PENDING';

      const initialStatusHistory = [
        {
          status: orderStatus,
          changedBy: req.user.id,
          changedAt: new Date(),
          note:
            normalizedPaymentMethod === 'COD'
              ? 'Order placed with Cash on Delivery'
              : 'Order created awaiting online payment',
        },
      ];

      // 10. Instantiate and save the Order
      const order = new Order({
        orderNumber,
        user: req.user.id,
        items: itemSnapshots,
        deliveryAddress: addressSnapshot,
        deliveryZone: zone._id,
        deliverySlot: slot ? slot._id : null,
        coupon: couponDoc ? couponDoc._id : null,
        couponDiscount: couponDiscountPaise / 100,
        itemTotal: itemTotalPaise / 100,
        deliveryCharge: deliveryChargePaise / 100,
        taxAmount: taxAmountPaise / 100,
        grandTotal: grandTotalPaise / 100,
        paymentMethod: normalizedPaymentMethod,
        paymentStatus,
        orderStatus,
        statusHistory: initialStatusHistory,
      });

      if (session) {
        await order.save({ session });
        if (couponDoc) {
          couponUsageDoc = new CouponUsage({
            coupon: couponDoc._id,
            user: req.user.id,
            usageIndex: customerUsageCount + 1,
            order: order._id,
          });
          await couponUsageDoc.save({ session });
        }
        await Cart.findOneAndUpdate(
          { user: req.user.id },
          { $set: { items: [] } },
          { session }
        );
        await session.commitTransaction();
        session.endSession();
      } else {
        await order.save();
        if (couponDoc) {
          couponUsageDoc = new CouponUsage({
            coupon: couponDoc._id,
            user: req.user.id,
            usageIndex: customerUsageCount + 1,
            order: order._id,
          });
          await couponUsageDoc.save();
        }
        await Cart.findOneAndUpdate(
          { user: req.user.id },
          { $set: { items: [] } }
        );
      }

      // Safely dispatch notifications after order creation and transaction commit
      NotificationDispatcher.dispatch({
        userId: req.user.id,
        orderId: order._id,
        order,
        eventType: 'ORDER_PLACED',
      }).catch((e) => console.error('[Notification] ORDER_PLACED dispatch error:', e.message));

      if (order.paymentMethod === 'COD') {
        NotificationDispatcher.dispatch({
          userId: req.user.id,
          orderId: order._id,
          order,
          eventType: 'ORDER_CONFIRMED',
        }).catch((e) => console.error('[Notification] ORDER_CONFIRMED dispatch error:', e.message));
      }

      // Invalidate product stock cache and admin dashboard live KPIs
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: order,
      });
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      } else {
        // Rollback reserved stock, slot, coupon and usage for standalone MongoDB
        if (couponUsageDoc && couponUsageDoc._id) {
          await CouponUsage.deleteOne({ _id: couponUsageDoc._id });
        }
        for (const item of reservedStockItems) {
          await Product.updateOne({ _id: item.productId }, { $inc: { stockQuantity: item.quantity } });
        }
        if (reservedSlotId) {
          await DeliverySlot.updateOne({ _id: reservedSlotId }, { $inc: { bookedCount: -1 } });
        }
        if (reservedCouponId) {
          await Coupon.updateOne({ _id: reservedCouponId }, { $inc: { usedCount: -1 } });
        }
      }

      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to place order',
      });
    }
  }

  /**
   * CUSTOMER: Get order history
   * GET /api/v1/orders
   */
  static async getOrders(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const [orders, total] = await Promise.all([
        Order.find({ user: req.user.id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('deliverySlot', 'label startTime endTime date')
          .populate('deliveryZone', 'name estimatedDeliveryMinutes'),
        Order.countDocuments({ user: req.user.id }),
      ]);

      return res.status(200).json({
        success: true,
        count: orders.length,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER / OPERATIONS: Get order details by ID
   * GET /api/v1/orders/:id
   */
  static async getOrderById(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      // Customer can only view their own order; Admin, Kitchen & Delivery can view authorized orders
      const query = { _id: req.params.id };
      if (req.user.role === 'CUSTOMER') {
        query.user = req.user.id;
      }

      const order = await Order.findOne(query)
        .populate('deliverySlot', 'label startTime endTime date')
        .populate('deliveryZone', 'name estimatedDeliveryMinutes')
        .populate('coupon', 'code discountType discountValue')
        .select('+deliveryOtpCode');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const orderData = order.toJSON();

      // Only expose deliveryOtpCode to the customer who owns the order when OUT_FOR_DELIVERY
      if (
        req.user.role === 'CUSTOMER' &&
        order.orderStatus === 'OUT_FOR_DELIVERY' &&
        order.deliveryOtpCode
      ) {
        orderData.deliveryOtp = order.deliveryOtpCode;
      }

      return res.status(200).json({
        success: true,
        data: orderData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER: Cancel an eligible order
   * PATCH /api/v1/orders/:id/cancel
   */
  static async cancelOrder(req, res, next) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order ID format',
        });
      }

      // First check if the order exists and belongs to the customer
      const existing = await Order.findOne({ _id: req.params.id, user: req.user.id });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (existing.orderStatus === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          message: 'This order is already cancelled',
        });
      }

      if (existing.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message:
            'Paid orders cannot be self-cancelled. Please contact support for cancellation and refund assistance.',
        });
      }

      if (!['PENDING', 'CONFIRMED'].includes(existing.orderStatus)) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel order in "${existing.orderStatus}" status. Orders can only be cancelled before preparation starts.`,
        });
      }

      // Atomic conditional update to prevent double cancellation
      const cancellationReason = req.body.reason || 'Cancelled by customer';
      const order = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          user: req.user.id,
          orderStatus: { $in: ['PENDING', 'CONFIRMED'] },
          paymentStatus: { $ne: 'PAID' },
        },
        {
          $set: {
            orderStatus: 'CANCELLED',
            ...(existing.paymentStatus === 'COD_PENDING' ? { paymentStatus: 'FAILED' } : {}),
            cancellationReason,
          },
          $push: {
            statusHistory: {
              status: 'CANCELLED',
              changedBy: req.user.id,
              changedAt: new Date(),
              note: cancellationReason,
            },
          },
        },
        { returnDocument: 'after' }
      );

      if (!order) {
        return res.status(400).json({
          success: false,
          message: 'Order status changed concurrently or order is no longer eligible for cancellation',
        });
      }

      // Exactly-once release of reserved product stock
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.product },
          { $inc: { stockQuantity: item.quantity } }
        );
      }

      // Exactly-once release of booked delivery slot capacity
      if (order.deliverySlot) {
        await DeliverySlot.updateOne(
          { _id: order.deliverySlot },
          { $inc: { bookedCount: -1 } }
        );
      }

      // Exactly-once release of coupon usage
      if (order.coupon) {
        await CouponUsage.deleteMany({ order: order._id });
        await Coupon.updateOne(
          { _id: order.coupon },
          { $inc: { usedCount: -1 } }
        );
      }

      // Safely dispatch order cancellation notification
      NotificationDispatcher.dispatch({
        userId: order.user,
        orderId: order._id,
        order,
        eventType: 'ORDER_CANCELLED',
        metadata: { reason: order.cancellationReason },
      }).catch((e) => console.error('[Notification] ORDER_CANCELLED dispatch error:', e.message));

      // Invalidate restored products and admin dashboard
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully and resources released',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Expire pending unpaid orders after timeout window (default: 15 mins)
   * Safely releases stock, slot capacity, and coupons exactly once.
   */
  static async expirePendingOrders(maxAgeMinutes = 15) {
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const expiredOrders = await Order.find({
      orderStatus: 'PENDING',
      paymentStatus: 'PENDING',
      paymentMethod: 'RAZORPAY',
      createdAt: { $lt: cutoffDate },
    });

    const expiredIds = [];

    for (const order of expiredOrders) {
      const cancelled = await Order.findOneAndUpdate(
        {
          _id: order._id,
          orderStatus: 'PENDING',
          paymentStatus: 'PENDING',
        },
        {
          $set: {
            orderStatus: 'CANCELLED',
            paymentStatus: 'FAILED',
            cancellationReason: `Payment window expired (${maxAgeMinutes} minutes limit exceeded)`,
          },
          $push: {
            statusHistory: {
              status: 'CANCELLED',
              changedBy: null,
              changedAt: new Date(),
              note: `Auto-cancelled: Payment window expired (${maxAgeMinutes}m)`,
            },
          },
        },
        { returnDocument: 'after' }
      );

      if (cancelled) {
        for (const item of cancelled.items) {
          await Product.updateOne(
            { _id: item.product },
            { $inc: { stockQuantity: item.quantity } }
          );
        }
        if (cancelled.deliverySlot) {
          await DeliverySlot.updateOne(
            { _id: cancelled.deliverySlot },
            { $inc: { bookedCount: -1 } }
          );
        }
        if (cancelled.coupon) {
          await CouponUsage.deleteMany({ order: cancelled._id });
          await Coupon.updateOne(
            { _id: cancelled.coupon },
            { $inc: { usedCount: -1 } }
          );
        }

        // Safely dispatch order expiry notification
        NotificationDispatcher.dispatch({
          userId: cancelled.user,
          orderId: cancelled._id,
          order: cancelled,
          eventType: 'ORDER_EXPIRED',
          metadata: { reason: cancelled.cancellationReason },
        }).catch((e) => console.error('[Notification] ORDER_EXPIRED dispatch error:', e.message));

        expiredIds.push(cancelled._id);
      }
    }

    if (expiredIds.length > 0) {
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');
    }

    return expiredIds;
  }

  /**
   * ADMIN / CRON: Trigger pending payment expiry
   * POST /api/v1/orders/expire-pending
   */
  static async handleExpirePendingOrders(req, res, next) {
    try {
      const maxAgeMinutes = parseInt(req.body.maxAgeMinutes, 10) || 15;
      const expiredIds = await OrderController.expirePendingOrders(maxAgeMinutes);

      return res.status(200).json({
        success: true,
        message: `Successfully processed payment expiry. Expired ${expiredIds.length} orders.`,
        data: {
          expiredCount: expiredIds.length,
          expiredOrderIds: expiredIds,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OrderController;

