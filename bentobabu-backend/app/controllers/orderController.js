const crypto = require('crypto');
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
  DailyMenu,
} = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { redisDelPattern } = require('../config/redis');
const { getKolkataDateString } = require('../utils/businessDate');
const { normalizePincode } = require('../utils/pincode');
const AdminSettingsController = require('./adminSettingsController');
const DailyInventoryService = require('../services/dailyInventoryService');
const DeliverySlotService = require('../services/deliverySlotService');
const { generateOrderReceiptPdf } = require('../utils/receiptGenerator');
const orderReceiptService = require('../utils/orderReceiptService');
const receiptQueue = require('../utils/receiptQueue');

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
        return res.status(503).json({
          success: false,
          code: 'ORDERING_DISABLED',
          message: "We're not accepting new orders right now. Please check back later.",
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
      const cleanPin = normalizePincode(address.pincode) || address.pincode;
      const zone = await DeliveryZone.findOne({
        pincodes: cleanPin,
        isActive: true,
        isDeleted: { $ne: true },
      });

      if (!zone) {
        return res.status(400).json({
          success: false,
          code: 'UNSERVICEABLE_LOCATION',
          message: `Delivery is currently not serviceable to PIN code ${cleanPin}`,
          data: {
            pincode: cleanPin,
            city: address.city,
            state: address.state,
          },
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

        const slotValidation = await DeliverySlotService.validateSlotForBooking(slot);
        if (!slotValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: slotValidation.message,
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

      // 5. Fetch Live Product Records & Validate Stock and Daily Menu Availability
      const todayStr = getKolkataDateString();
      const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();
      const dailyMap = new Map();
      if (dailyMenu && Array.isArray(dailyMenu.items)) {
        dailyMenu.items.forEach((it) => {
          const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
          if (idStr) dailyMap.set(idStr, Boolean(it.isAvailable));
        });
      }

      const productIds = cart.items.map((i) => i.product);
      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
      });

      const productMap = new Map();
      products.forEach((p) => productMap.set(p._id.toString(), p));

      const dailyInvMap = await DailyInventoryService.getInventoryMapForDate(
        productIds,
        todayStr
      );

      let itemTotalPaise = 0;
      const itemSnapshots = [];

      for (const item of cart.items) {
        const prod = productMap.get(item.product.toString());
        if (!prod) {
          return res.status(400).json({
            success: false,
            message: `One or more products in your cart are no longer active`,
          });
        }

        const inv = dailyInvMap.get(prod._id.toString());
        const isManuallyDisabled = inv?.isManuallyDisabled || !prod.isAvailable;
        if (isManuallyDisabled) {
          return res.status(400).json({
            success: false,
            message: `"${prod.name}" is currently unavailable and cannot be ordered. Please remove it from your cart.`,
          });
        }

        const isAvailableToday =
          !isManuallyDisabled &&
          (!dailyMap.has(prod._id.toString()) || dailyMap.get(prod._id.toString()) === true);

        if (!isAvailableToday) {
          return res.status(400).json({
            success: false,
            message: `"${prod.name}" is not available on today's menu`,
          });
        }

        const effectiveAvailable = inv !== undefined ? inv.remainingStock : prod.stockQuantity;
        if (item.quantity > effectiveAvailable) {
          return res.status(400).json({
            success: false,
            code: 'ITEM_CAPACITY_EXCEEDED',
            message:
              effectiveAvailable <= 0
                ? `"${prod.name}" is sold out for today. Please remove it from your cart.`
                : `Insufficient stock for "${prod.name}". Only ${effectiveAvailable} packet(s) available for today. (Requested: ${item.quantity})`,
            data: {
              productId: prod._id,
              productName: prod.name,
              requestedQuantity: item.quantity,
              availableQuantity: effectiveAvailable,
              serviceDate: todayStr,
            },
          });
        }

        let unitPrice = prod.price;
        let variantName = '';
        let variantId = null;

        if (prod.hasVariants) {
          const matchedVariant = Array.isArray(prod.variants)
            ? prod.variants.find((v) => v._id && v._id.toString() === (item.variantId ? item.variantId.toString() : ''))
            : null;
          if (!matchedVariant) {
            return res.status(400).json({
              success: false,
              message: `A selected option for "${prod.name}" is no longer available. Please update your cart.`,
            });
          }
          if (matchedVariant.isAvailable === false) {
            return res.status(400).json({
              success: false,
              message: `Option "${matchedVariant.name}" for "${prod.name}" is currently unavailable. Please update your cart.`,
            });
          }
          unitPrice = matchedVariant.price;
          variantName = matchedVariant.name;
          variantId = matchedVariant._id;
        }

        const pricePaise = Math.round(unitPrice * 100);
        const subtotalPaise = pricePaise * item.quantity;
        itemTotalPaise += subtotalPaise;

        itemSnapshots.push({
          product: prod._id,
          productName: prod.name,
          variantId: variantId || null,
          variantName: variantName || '',
          image: prod.images && prod.images.length > 0 ? prod.images[0] : '',
          quantity: item.quantity,
          unitPrice,
          subtotal: subtotalPaise / 100,
        });
      }

      // Check system-level admin configured minimum order value
      const minOrderSetting = await SystemSetting.findOne({
        key: { $in: ['MINIMUM_ORDER_VALUE', 'MINIMUM_ORDER_AMOUNT'] },
      }).lean();

      let configuredMinOrder = 0;
      if (
        minOrderSetting &&
        typeof minOrderSetting.value === 'number' &&
        minOrderSetting.value >= 0
      ) {
        configuredMinOrder = minOrderSetting.value;
      }

      if (configuredMinOrder > 0) {
        const platformMinPaise = Math.round(configuredMinOrder * 100);
        if (itemTotalPaise < platformMinPaise) {
          const diff = Math.ceil((platformMinPaise - itemTotalPaise) / 100);
          return res.status(400).json({
            success: false,
            message: `Minimum order value is ₹${configuredMinOrder}. Add ₹${diff} more to continue.`,
            minimumOrderValue: configuredMinOrder,
            shortfall: diff,
          });
        }
      }

      if (
        configuredMinOrder > 0 &&
        typeof zone.minimumOrderAmount === 'number' &&
        zone.minimumOrderAmount > configuredMinOrder
      ) {
        const zoneMinOrderPaise = Math.round(zone.minimumOrderAmount * 100);
        if (itemTotalPaise < zoneMinOrderPaise) {
          const diff = Math.ceil((zoneMinOrderPaise - itemTotalPaise) / 100);
          return res.status(400).json({
            success: false,
            message: `Minimum order amount of ₹${zone.minimumOrderAmount} required for delivery zone "${zone.name}". Add ₹${diff} more to continue.`,
          });
        }
      }

      // 6. Admin-controlled Delivery Fee calculation
      const [chargeEnabledSetting, chargeAmountSetting] = await Promise.all([
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_ENABLED' }).lean(),
        SystemSetting.findOne({ key: 'DELIVERY_CHARGE_AMOUNT' }).lean(),
      ]);

      let adminDeliveryCharge = 0;
      const isChargeEnabled = chargeEnabledSetting ? chargeEnabledSetting.value !== false : true;

      if (isChargeEnabled) {
        if (typeof zone.deliveryCharge === 'number' && zone.deliveryCharge >= 0) {
          adminDeliveryCharge = zone.deliveryCharge;
        } else if (chargeAmountSetting && typeof chargeAmountSetting.value === 'number') {
          adminDeliveryCharge = chargeAmountSetting.value;
        }
        // If neither zone nor system setting specifies a charge, default to 0 (free delivery)
        // so admin retains full control — no silent hardcoded charge.
      }

      const deliveryChargePaise = Math.round(adminDeliveryCharge * 100);

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
          zoneName: zone ? zone.name : null,
          pincode: cleanPin,
          deliverySlot: slot,
          coupon: appliedCoupon,
          couponDiscount: couponDiscountPaise / 100,
          deliveryCharge: deliveryChargePaise / 100,
          taxAmount: taxAmountPaise / 100,
          grandTotal: grandTotalPaise / 100,
          minimumOrderValue: configuredMinOrder,
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

    const { addressId, deliverySlotId, couponCode, paymentMethod } = req.body;

    const rawIdempotencyKey =
      req.headers?.['idempotency-key'] ||
      req.headers?.['x-idempotency-key'] ||
      req.body?.idempotencyKey;
    const idempotencyKey =
      typeof rawIdempotencyKey === 'string' && rawIdempotencyKey.trim()
        ? rawIdempotencyKey.trim()
        : null;

    const normalizedPaymentMethod =
      typeof paymentMethod === 'string' ? paymentMethod.toUpperCase() : '';

    const payloadFingerprint = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          addressId: String(addressId || ''),
          deliverySlotId: deliverySlotId ? String(deliverySlotId) : null,
          couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
          paymentMethod: normalizedPaymentMethod,
        })
      )
      .digest('hex');

    if (idempotencyKey) {
      const existingOrder = await Order.findOne({
        user: req.user.id,
        idempotencyKey,
      });
      if (existingOrder) {
        if (
          existingOrder.idempotencyPayloadHash &&
          existingOrder.idempotencyPayloadHash !== payloadFingerprint
        ) {
          return res.status(409).json({
            success: false,
            message: 'Idempotency key was previously used with a different request payload',
          });
        }
        return res.status(200).json({
          success: true,
          message: 'Order retrieved via idempotency key',
          data: existingOrder,
          idempotentReplay: true,
        });
      }
    }

    if (!paymentMethod || !['RAZORPAY', 'COD'].includes(normalizedPaymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Payment method must be either "RAZORPAY" or "COD"',
      });
    }

    // Check system maintenance, order acceptance, and settings
    const [
      maintSetting,
      acceptSetting,
      minOrderSetting,
      chargeEnabledSetting,
      chargeAmountSetting,
    ] = await Promise.all([
      SystemSetting.findOne({ key: 'MAINTENANCE_MODE' }).lean(),
      SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' }).lean(),
      SystemSetting.findOne({ key: { $in: ['MINIMUM_ORDER_VALUE', 'MINIMUM_ORDER_AMOUNT'] } }).lean(),
      SystemSetting.findOne({ key: 'DELIVERY_CHARGE_ENABLED' }).lean(),
      SystemSetting.findOne({ key: 'DELIVERY_CHARGE_AMOUNT' }).lean(),
    ]);

    if (maintSetting && maintSetting.value === true) {
      return res.status(503).json({
        success: false,
        message: 'Platform is currently under maintenance. Please try again later.',
      });
    }

    if (acceptSetting && acceptSetting.value === false) {
      return res.status(503).json({
        success: false,
        code: 'ORDERING_DISABLED',
        message: "We're not accepting new orders right now. Please check back later.",
      });
    }

    // 1. Verify Delivery Address
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid delivery address ID is required',
      });
    }

    const address = await Address.findOne({
      _id: addressId,
      user: req.user.id,
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Delivery address not found or does not belong to you',
      });
    }

    // 2. Verify Delivery Zone
    const cleanPin = normalizePincode(address.pincode) || address.pincode;
    const zone = await DeliveryZone.findOne({
      pincodes: cleanPin,
      isActive: true,
      isDeleted: { $ne: true },
    });

    if (!zone) {
      return res.status(400).json({
        success: false,
        code: 'UNSERVICEABLE_LOCATION',
        message: `Delivery is currently not serviceable to PIN code ${cleanPin}`,
        data: {
          pincode: cleanPin,
          city: address.city,
          state: address.state,
        },
      });
    }

    // Resolve daily menu availability for today
    const todayStr = getKolkataDateString();
    const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();
    const dailyMap = new Map();
    if (dailyMenu && Array.isArray(dailyMenu.items)) {
      dailyMenu.items.forEach((it) => {
        const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
        if (idStr) dailyMap.set(idStr, Boolean(it.isAvailable));
      });
    }

    let configuredMinOrder = 0;
    if (
      minOrderSetting &&
      typeof minOrderSetting.value === 'number' &&
      minOrderSetting.value >= 0
    ) {
      configuredMinOrder = minOrderSetting.value;
    }

    let adminDeliveryCharge = 0;
    const isChargeEnabled = chargeEnabledSetting ? chargeEnabledSetting.value !== false : true;
    if (isChargeEnabled) {
      if (typeof zone.deliveryCharge === 'number' && zone.deliveryCharge >= 0) {
        adminDeliveryCharge = zone.deliveryCharge;
      } else if (chargeAmountSetting && typeof chargeAmountSetting.value === 'number') {
        adminDeliveryCharge = chargeAmountSetting.value;
      }
    }
    const deliveryChargePaise = Math.round(adminDeliveryCharge * 100);

    // Validate cart and pre-warm daily inventory records before transaction starts
    // to prevent MongoDB snapshot isolation anomalies across transaction boundaries
    const preCart = await Cart.findOne({ user: req.user.id });
    if (!preCart || !Array.isArray(preCart.items) || preCart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty',
      });
    }

    for (const it of preCart.items) {
      await DailyInventoryService.getOrCreateDailyInventory(it.product, todayStr);
    }

    const maxRetries = 10;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
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
        // 0. Atomic serialization gate against admin ordering availability toggle
        // Ensures order creation serializes with concurrent admin updates to ORDER_ACCEPTANCE_ENABLED
        const gateOpts = session ? { returnDocument: 'after', session } : { returnDocument: 'after' };
        const orderingGate = await SystemSetting.findOneAndUpdate(
          { key: 'ORDER_ACCEPTANCE_ENABLED', value: true },
          { $set: { lastOrderCheckAt: new Date() } },
          gateOpts
        );

        if (!orderingGate) {
          const currentSetting = session
            ? await SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' }).session(session)
            : await SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' });

          if (currentSetting && currentSetting.value === false) {
            if (session) {
              await session.abortTransaction();
              session.endSession();
            }
            return res.status(503).json({
              success: false,
              code: 'ORDERING_DISABLED',
              message: "We're not accepting new orders right now. Please check back later.",
            });
          }
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

          // Revalidate dynamic booking controls immediately before proceeding
          const slotValidation = await DeliverySlotService.validateSlotForBooking(slot);
          if (!slotValidation.isValid) {
            if (session) {
              await session.abortTransaction();
              session.endSession();
            } else {
              await DeliverySlot.updateOne({ _id: slot._id }, { $inc: { bookedCount: -1 } });
            }
            return res.status(400).json({
              success: false,
              message: slotValidation.message,
            });
          }
        }

        // 4. Fetch Customer Cart
        const cartQuery = Cart.findOne({ user: req.user.id });
        const cart = session ? await cartQuery.session(session) : await cartQuery;

        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
          if (idempotencyKey) {
            const existingOrder = await Order.findOne({ user: req.user.id, idempotencyKey });
            if (existingOrder) {
              if (session) {
                await session.abortTransaction();
                session.endSession();
              } else if (reservedSlotId) {
                await DeliverySlot.updateOne({ _id: reservedSlotId }, { $inc: { bookedCount: -1 } });
              }
              if (
                existingOrder.idempotencyPayloadHash &&
                existingOrder.idempotencyPayloadHash !== payloadFingerprint
              ) {
                return res.status(409).json({
                  success: false,
                  message: 'Idempotency key was previously used with a different request payload',
                });
              }
              return res.status(200).json({
                success: true,
                message: 'Order retrieved via idempotency key',
                data: existingOrder,
                idempotentReplay: true,
              });
            }
          }
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
        // Verify daily availability for all products in cart
        const cartProductIds = cart.items.map((i) => i.product);
        const cartProducts = await Product.find({ _id: { $in: cartProductIds }, isActive: true }).lean();
        const cartProductMap = new Map();
        cartProducts.forEach((p) => cartProductMap.set(p._id.toString(), p));

        for (const item of cart.items) {
          const prod = cartProductMap.get(item.product.toString());
          if (!prod) {
            throw new Error('One or more products in your cart are no longer active');
          }
          if (!prod.isAvailable) {
            throw new Error(`"${prod.name}" is currently unavailable and cannot be ordered. Please remove it from your cart.`);
          }
          const isAvailableToday =
            Boolean(prod.isAvailable) &&
            (!dailyMap.has(prod._id.toString()) || dailyMap.get(prod._id.toString()) === true);
          if (!isAvailableToday) {
            throw new Error(`"${prod.name}" is not available on today's menu`);
          }
        }

        let itemTotalPaise = 0;
        const itemSnapshots = [];

        const serviceDateToday = getKolkataDateString();
        const aggregatedReserveMap = new Map();
        for (const it of cart.items) {
          const pid = it.product.toString();
          aggregatedReserveMap.set(pid, (aggregatedReserveMap.get(pid) || 0) + it.quantity);
        }

        const itemsToReserve = Array.from(aggregatedReserveMap.entries()).map(([productId, quantity]) => {
          const prod = cartProductMap.get(productId);
          return {
            productId,
            productName: prod ? prod.name : 'Food Item',
            quantity,
          };
        });

        // Atomic reservation on DailyInventory with concurrency protection
        await DailyInventoryService.reserveStockAtomic(itemsToReserve, serviceDateToday, session);

        for (const it of itemsToReserve) {
          reservedStockItems.push({
            productId: it.productId,
            quantity: it.quantity,
            serviceDate: serviceDateToday,
          });
        }

        for (const item of cart.items) {
          const product = cartProductMap.get(item.product.toString());
          let unitPrice = product.price;
          let variantName = '';
          let variantId = null;

          if (product.hasVariants) {
            const matchedVariant = Array.isArray(product.variants)
              ? product.variants.find((v) => v._id && v._id.toString() === (item.variantId ? item.variantId.toString() : ''))
              : null;
            if (!matchedVariant) {
              throw new Error(`A selected option for "${product.name}" is no longer available. Please update your cart.`);
            }
            if (matchedVariant.isAvailable === false) {
              throw new Error(`Option "${matchedVariant.name}" for "${product.name}" is currently unavailable. Please update your cart.`);
            }
            unitPrice = matchedVariant.price;
            variantName = matchedVariant.name;
            variantId = matchedVariant._id;
          }

          const pricePaise = Math.round(unitPrice * 100);
          const subtotalPaise = pricePaise * item.quantity;
          itemTotalPaise += subtotalPaise;

          const productImg =
            (product.images && product.images.length > 0 && typeof product.images[0] === 'string' && product.images[0].trim()
              ? product.images[0].trim()
              : null) ||
            (product.imagesData && product.imagesData.length > 0 && product.imagesData[0]?.secureUrl
              ? product.imagesData[0].secureUrl.trim()
              : null) ||
            '';

          itemSnapshots.push({
            product: product._id,
            productName: product.name,
            variantId: variantId || null,
            variantName: variantName || '',
            image: productImg,
            quantity: item.quantity,
            unitPrice,
            subtotal: subtotalPaise / 100,
          });
        }

        // Check system-level admin configured minimum order value
        if (configuredMinOrder > 0) {
          const platformMinPaise = Math.round(configuredMinOrder * 100);
          if (itemTotalPaise < platformMinPaise) {
            const diff = Math.ceil((platformMinPaise - itemTotalPaise) / 100);
            throw new Error(`Minimum order value is ₹${configuredMinOrder}. Add ₹${diff} more to continue.`);
          }
        }

        if (
          configuredMinOrder > 0 &&
          typeof zone.minimumOrderAmount === 'number' &&
          zone.minimumOrderAmount > configuredMinOrder
        ) {
          const zoneMinOrderPaise = Math.round(zone.minimumOrderAmount * 100);
          if (itemTotalPaise < zoneMinOrderPaise) {
            const diff = Math.ceil((zoneMinOrderPaise - itemTotalPaise) / 100);
            throw new Error(
              `Minimum order amount of ₹${zone.minimumOrderAmount} required for delivery zone "${zone.name}". Add ₹${diff} more to continue.`
            );
          }
        }

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
          pincode: cleanPin,
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
          idempotencyKey,
          idempotencyPayloadHash: payloadFingerprint,
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

        if (order.deliverySlot) {
          DeliverySlotService.invalidateCache().catch(() => {});
        }

        // Schedule or recalculate kitchen preparation reminder based on delivery date & slot
        try {
          const { PreparationReminderService } = require('../services/preparationReminderService');
          await PreparationReminderService.scheduleOrRecalculateReminder(order, {
            slotDoc: slot || null,
          });
        } catch (remErr) {
          console.error('[OrderController] Preparation reminder schedule error:', remErr.message);
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

        // Dispatch real-time web push and in-app alerts to active ADMIN and KITCHEN staff
        NotificationDispatcher.dispatchStaffOrderPush({
          orderId: order._id,
          order,
          eventType: 'ORDER_CREATED',
        }).catch((e) => console.error('[Notification] ORDER_CREATED staff push dispatch error:', e.message));

        // Invalidate product stock cache and admin dashboard live KPIs
        await redisDelPattern('cache:products:*');
        await redisDelPattern('cache:admin:dashboard:*');

        // Asynchronously enqueue receipt generation and Backblaze B2 persistence for COD orders.
        // For ONLINE orders, receipt is enqueued upon authoritative payment confirmation.
        if (order.paymentMethod === 'COD') {
          receiptQueue
            .enqueueReceipt(order._id)
            .catch((e) => console.error('[OrderController] Initial receipt queue error:', e.message));
        }

        return res.status(201).json({
          success: true,
          message: 'Order created successfully',
          data: order,
        });
      } catch (error) {
        if (session) {
          try {
            await session.abortTransaction();
          } catch (_) { }
          try {
            session.endSession();
          } catch (_) { }
        } else {
          // Rollback reserved stock, slot, coupon and usage for standalone MongoDB
          if (couponUsageDoc && couponUsageDoc._id) {
            await CouponUsage.deleteOne({ _id: couponUsageDoc._id });
          }
          for (const item of reservedStockItems) {
            try {
              await DailyInventoryService.releaseStockAtomic([item], item.serviceDate || getKolkataDateString());
            } catch (_) { }
            try {
              await Product.updateOne({ _id: item.productId }, { $inc: { stockQuantity: item.quantity } });
            } catch (_) { }
          }
          if (reservedSlotId) {
            await DeliverySlot.updateOne({ _id: reservedSlotId }, { $inc: { bookedCount: -1 } });
          }
          if (reservedCouponId) {
            await Coupon.updateOne({ _id: reservedCouponId }, { $inc: { usedCount: -1 } });
          }
        }

        if (error.code === 'ITEM_CAPACITY_EXCEEDED') {
          return res.status(400).json({
            success: false,
            code: 'ITEM_CAPACITY_EXCEEDED',
            message: error.message,
            data: error.data,
          });
        }

        if (idempotencyKey && (error.code === 11000 || error.message?.includes('duplicate key') || error.message?.includes('idempotencyKey'))) {
          const existingOrder = await Order.findOne({
            user: req.user.id,
            idempotencyKey,
          });
          if (existingOrder) {
            if (
              existingOrder.idempotencyPayloadHash &&
              existingOrder.idempotencyPayloadHash !== payloadFingerprint
            ) {
              return res.status(409).json({
                success: false,
                message: 'Idempotency key was previously used with a different request payload',
              });
            }
            return res.status(200).json({
              success: true,
              message: 'Order retrieved via idempotency key',
              data: existingOrder,
              idempotentReplay: true,
            });
          }
        }

        const isUnknownCommit =
          error.hasErrorLabel?.('UnknownTransactionCommitResult') ||
          (Array.isArray(error.errorLabels) && error.errorLabels.includes('UnknownTransactionCommitResult'));

        if (isUnknownCommit && idempotencyKey) {
          const committedOrder = await Order.findOne({ user: req.user.id, idempotencyKey });
          if (committedOrder) {
            return res.status(200).json({
              success: true,
              message: 'Order retrieved via idempotency key after ambiguous commit result',
              data: committedOrder,
              idempotentReplay: true,
            });
          }
        }

        const isTransient =
          isUnknownCommit ||
          error.hasErrorLabel?.('TransientTransactionError') ||
          (Array.isArray(error.errorLabels) && error.errorLabels.includes('TransientTransactionError')) ||
          error.message?.includes('Write conflict') ||
          error.message?.includes('WriteConflict') ||
          error.message?.includes('LockTimeout') ||
          error.message?.includes('NoSuchTransaction') ||
          error.code === 112 ||
          error.code === 251;

        if (isTransient && attempt < maxRetries) {
          // Jittered backoff to allow competing concurrent transaction to complete
          await new Promise((r) =>
            setTimeout(r, Math.min(500, 30 * Math.pow(1.5, attempt) + Math.floor(Math.random() * 50)))
          );
          continue;
        }

        return res.status(400).json({
          success: false,
          message: error.message || 'Failed to place order',
        });
      }
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

      const [rawOrders, total] = await Promise.all([
        Order.find({ user: req.user.id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('deliverySlot', 'label startTime endTime date')
          .populate('deliveryZone', 'name estimatedDeliveryMinutes')
          .populate('items.product', 'name images imagesData price isAvailable')
          .lean(),
        Order.countDocuments({ user: req.user.id }),
      ]);

      const orders = rawOrders.map((ord) => {
        if (Array.isArray(ord.items)) {
          ord.items = ord.items.map((it) => {
            const prod = typeof it.product === 'object' && it.product !== null ? it.product : null;
            const fallbackImg =
              (prod?.images && prod.images.length > 0 ? prod.images[0] : null) ||
              (prod?.imagesData && prod.imagesData.length > 0 ? prod.imagesData[0]?.secureUrl : null) ||
              '';
            const resolvedImg = it.image || it.productImage || fallbackImg || '';
            return {
              ...it,
              image: resolvedImg,
              productImage: resolvedImg,
            };
          });
        }
        return ord;
      });

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
        .populate('items.product', 'name images imagesData price isAvailable')
        .select('+deliveryOtpCode');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const orderData = order.toJSON();

      if (Array.isArray(orderData.items)) {
        orderData.items = orderData.items.map((it) => {
          const prod = typeof it.product === 'object' && it.product !== null ? it.product : null;
          const fallbackImg =
            (prod?.images && prod.images.length > 0 ? prod.images[0] : null) ||
            (prod?.imagesData && prod.imagesData.length > 0 ? prod.imagesData[0]?.secureUrl : null) ||
            '';
          const resolvedImg = it.image || it.productImage || fallbackImg || '';
          return {
            ...it,
            image: resolvedImg,
            productImage: resolvedImg,
          };
        });
      }

      // Retrieve latest cancellation request if any
      const CancellationRequest = require('../models/CancellationRequest');
      const cancellationRequest = await CancellationRequest.findOne({ order: order._id })
        .sort({ createdAt: -1 })
        .populate('reviewedBy', 'name email')
        .lean();
      orderData.cancellationRequest = cancellationRequest || null;

      // Only expose deliveryOtpCode to the customer who owns the order when PICKED_UP or OUT_FOR_DELIVERY
      if (
        req.user.role === 'CUSTOMER' &&
        ['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.orderStatus) &&
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
   * CUSTOMER / ADMIN: Download official PDF order receipt
   * Uses Backblaze B2 persistent storage, streaming the verified PDF buffer.
   * GET /api/v1/orders/:id/receipt
   */
  static async downloadReceipt(req, res, next) {
    try {
      const orderId = req.params.id;

      const order = await orderReceiptService.loadFullOrder(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Customer ownership validation: customers can strictly only download receipts for their own orders
      const isOwner = req.user && order.user && order.user.toString() === req.user.id.toString();
      const isAdminOrStaff = req.user && (req.user.role === 'ADMIN' || req.user.role === 'KITCHEN');

      if (!isOwner && !isAdminOrStaff) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You are not authorized to download receipts for this order.',
        });
      }

      // Retrieve or generate persistent PDF receipt using Backblaze B2 storage service
      const receiptData = await orderReceiptService.getReceiptForDownload(order);

      if (!receiptData || !receiptData.buffer) {
        return res.status(500).json({
          success: false,
          message: 'Unable to retrieve or generate receipt. Please try again shortly.',
        });
      }

      const filename = receiptData.fileName || `BentoBabu-Receipt-${order.orderNumber || order._id}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', receiptData.buffer.length);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

      return res.status(200).send(receiptData.buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN: Controlled regeneration and storage of an order receipt in Backblaze B2
   * POST /api/v1/orders/:id/receipt/regenerate
   */
  static async regenerateReceipt(req, res, next) {
    try {
      const orderId = req.params.id;

      const order = await orderReceiptService.loadFullOrder(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const updateBusinessDetails = Boolean(
        req.body?.updateBusinessDetails || req.query?.updateBusinessDetails === 'true'
      );

      const result = await orderReceiptService.generateAndStoreReceipt(order, {
        forceRegenerate: true,
        updateBusinessDetails,
      });

      return res.status(200).json({
        success: true,
        message:
          result.status === 'STORED'
            ? 'Receipt regenerated and successfully stored in Backblaze B2'
            : 'Receipt regenerated but storage could not be completed. Marked as FAILED.',
        data: {
          receipt: result.order.receipt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CUSTOMER / ADMIN: Cancel an eligible order
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

      // If caller is an admin, delegate to admin cancellation logic
      if (req.user && req.user.role === 'ADMIN') {
        const AdminOrderController = require('./adminOrderController');
        return AdminOrderController.cancelOrder(req, res, next);
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

      // Exactly-once release of reserved product stock and daily inventory
      const orderDateStr = getKolkataDateString(order.createdAt);
      const itemsToRelease = order.items
        .filter((it) => it.product && it.quantity)
        .map((it) => ({ productId: it.product, quantity: it.quantity }));

      try {
        await DailyInventoryService.releaseStockAtomic(itemsToRelease, orderDateStr);
      } catch (_) { }

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
      if (order.deliverySlot) {
        DeliverySlotService.invalidateCache().catch(() => {});
      }
      try {
        const { PreparationReminderService } = require('../services/preparationReminderService');
        await PreparationReminderService.cancelReminderForOrder(order._id);
      } catch (remErr) {
        console.error('[OrderController] Cancel reminder error:', remErr.message);
      }
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

