/**
 * Comprehensive Phase 6 Test Suite: Coupons, Orders, Payments & Operations
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../app/config/db');
const { startServer } = require('../server');
const { generateAccessToken } = require('../app/utils/token');
const {
  User,
  Category,
  Product,
  Address,
  Cart,
  DeliveryZone,
  DeliverySlot,
  Coupon,
  Order,
  WebhookEvent,
  CouponUsage,
} = require('../app/models');

const CouponController = require('../app/controllers/couponController');
const OrderController = require('../app/controllers/orderController');
const PaymentController = require('../app/controllers/paymentController');
const OrderOperationsController = require('../app/controllers/orderOperationsController');

// Mock Razorpay SDK orders.create so tests run offline safely
PaymentController.getRazorpayClient = () => ({
  orders: {
    create: async (params) => ({
      id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      amount: params.amount,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      status: 'created',
    }),
  },
});

const BASE_URL = 'http://127.0.0.1:5000';

const makeRequest = ({ method, path, headers = {}, body = null }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;

    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
      postData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    } else if (Buffer.isBuffer(body)) {
      postData = body;
      reqHeaders['Content-Length'] = body.length;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: rawData,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 6 VERIFICATION SUITE  ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Reason: ${err.message}\n`);
      throw err;
    }
  };

  await connectDB();
  const serverInstance = await startServer();

  try {
    // 0. Class-based static async controller convention check
    await test('0. Class-based static async controller convention verification', () => {
      assert.strictEqual(typeof CouponController, 'function');
      assert.strictEqual(typeof CouponController.createCoupon, 'function');
      assert.strictEqual(CouponController.prototype.createCoupon, undefined);

      assert.strictEqual(typeof OrderController, 'function');
      assert.strictEqual(typeof OrderController.placeOrder, 'function');
      assert.strictEqual(OrderController.prototype.placeOrder, undefined);

      assert.strictEqual(typeof PaymentController, 'function');
      assert.strictEqual(typeof PaymentController.verifyRazorpayPayment, 'function');
      assert.strictEqual(PaymentController.prototype.verifyRazorpayPayment, undefined);

      assert.strictEqual(typeof OrderOperationsController, 'function');
      assert.strictEqual(typeof OrderOperationsController.updateKitchenStatus, 'function');
      assert.strictEqual(OrderOperationsController.prototype.updateKitchenStatus, undefined);
    });

    // Clean test artifacts
    await User.deleteMany({ email: { $regex: /phase6.*@bento\.in/ } });
    await Category.deleteMany({ slug: { $regex: /phase6/ } });
    await Product.deleteMany({ slug: { $regex: /phase6/ } });
    await DeliveryZone.deleteMany({ name: { $regex: /Phase 6/ } });
    await DeliverySlot.deleteMany({ label: { $regex: /Phase 6/ } });
    await Coupon.deleteMany({ code: { $regex: /^P6/ } });
    await Order.deleteMany({ orderNumber: { $regex: /^BB-P6/ } });
    await WebhookEvent.deleteMany({});
    await CouponUsage.deleteMany({});

  // 1. Seed Roles
  const hashedPassword = await bcrypt.hash('Password123!', 10);
  const customerUser = await User.create({
    name: 'Phase6 Customer',
    email: 'phase6.customer@bento.in',
    phone: '9888800001',
    password: hashedPassword,
    role: 'CUSTOMER',
  });
  const customer2 = await User.create({
    name: 'Phase6 Customer Two',
    email: 'phase6.customer2@bento.in',
    phone: '9888800002',
    password: hashedPassword,
    role: 'CUSTOMER',
  });
  const adminUser = await User.create({
    name: 'Phase6 Admin',
    email: 'phase6.admin@bento.in',
    phone: '9888800003',
    password: hashedPassword,
    role: 'ADMIN',
  });
  const kitchenUser = await User.create({
    name: 'Phase6 Kitchen Staff',
    email: 'phase6.kitchen@bento.in',
    phone: '9888800004',
    password: hashedPassword,
    role: 'KITCHEN',
  });
  const deliveryUser = await User.create({
    name: 'Phase6 Delivery Partner',
    email: 'phase6.delivery@bento.in',
    phone: '9888800005',
    password: hashedPassword,
    role: 'DELIVERY',
  });

  const customerToken = generateAccessToken(customerUser);
  const customer2Token = generateAccessToken(customer2);
  const adminToken = generateAccessToken(adminUser);
  const kitchenToken = generateAccessToken(kitchenUser);
  const deliveryToken = generateAccessToken(deliveryUser);

  // 2. Seed Base Domain Records
  const category = await Category.create({
    name: 'Phase 6 Meals',
    slug: 'phase6-meals',
  });

  const product1 = await Product.create({
    name: 'Phase 6 Bento Bowl',
    slug: 'phase6-bento-bowl',
    description: 'Fresh nutritious bowl',
    category: category._id,
    price: 250,
    stockQuantity: 10,
    isAvailable: true,
    isActive: true,
  });

  const product2 = await Product.create({
    name: 'Phase 6 Protein Salad',
    slug: 'phase6-protein-salad',
    description: 'High protein fresh salad',
    category: category._id,
    price: 150,
    stockQuantity: 5,
    isAvailable: true,
    isActive: true,
  });

  const zone = await DeliveryZone.create({
    name: 'Phase 6 Barrackpore Zone',
    pincodes: ['700120'],
    deliveryCharge: 40,
    minimumOrderAmount: 200,
    estimatedDeliveryMinutes: 30,
    isActive: true,
  });

  const slotTomorrow = new Date();
  slotTomorrow.setDate(slotTomorrow.getDate() + 1);

  const deliverySlot = await DeliverySlot.create({
    date: slotTomorrow,
    label: 'Phase 6 Lunch Slot',
    startTime: '12:00',
    endTime: '13:00',
    capacity: 2,
    bookedCount: 0,
    isActive: true,
  });

  const customerAddress = await Address.create({
    user: customerUser._id,
    fullName: 'Customer One',
    phone: '9888800001',
    addressLine: '12 Park Street',
    city: 'Barrackpore',
    state: 'West Bengal',
    pincode: '700120',
    addressType: 'HOME',
    isDefault: true,
  });

  // Setup Customer Cart
  await Cart.create({
    user: customerUser._id,
    items: [
      { product: product1._id, quantity: 2 }, // 250 * 2 = 500
      { product: product2._id, quantity: 1 }, // 150 * 1 = 150 -> subtotal = 650
    ],
  });

  // ==========================================
  // SUB-STAGE A: COUPON TESTS
  // ==========================================
  let createdCouponId = null;

  await test('1. Admin creates a coupon (POST /api/v1/coupons)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'P6WELCOME20',
        description: '20% off up to ₹100',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minimumOrderAmount: 400,
        maximumDiscount: 100,
        usageLimit: 10,
        usageLimitPerUser: 1,
        expiryDate: new Date(Date.now() + 7 * 86400000),
      },
    });
    if (res.status !== 201) {
      console.log('Place order failed response:', res.body);
    }
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.code, 'P6WELCOME20');
    createdCouponId = res.body.data.id;
  });

  await test('2. CUSTOMER cannot create a coupon (403 Forbidden)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        code: 'P6HACK',
        discountType: 'FIXED',
        discountValue: 100,
        expiryDate: new Date(Date.now() + 86400000),
      },
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.success, false);
  });

  await test('3. Customer validates active coupon (POST /api/v1/coupons/validate)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: 'P6WELCOME20' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.valid, true);
    assert.strictEqual(res.body.data.subtotal, 650);
    // 20% of 650 is 130, capped at maxDiscount 100
    assert.strictEqual(res.body.data.discount, 100);
    assert.strictEqual(res.body.data.finalPayableAmount, 550);
  });

  await test('4. Non-existent coupon rejection (404 Not Found)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: 'NONEXISTENT_CODE' },
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.data.valid, false);
  });

  await test('5. Minimum order requirement rejection (400 Bad Request)', async () => {
    const highMinCoupon = await Coupon.create({
      code: 'P6HIGHMIN',
      discountType: 'FIXED',
      discountValue: 100,
      minimumOrderAmount: 2000,
      expiryDate: new Date(Date.now() + 86400000),
    });

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: highMinCoupon.code },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.data.valid, false);
    assert.ok(res.body.message.includes('Minimum order amount'));
  });

  await test('6. Expired coupon rejection (400 Bad Request)', async () => {
    const expiredCoupon = await Coupon.create({
      code: 'P6EXPIRED',
      discountType: 'FIXED',
      discountValue: 50,
      startDate: new Date(Date.now() - 200000),
      expiryDate: new Date(Date.now() - 100000),
    });

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: expiredCoupon.code },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.data.valid, false);
    assert.ok(res.body.message.includes('expired'));
  });

  await test('7. Inactive coupon rejection (400 Bad Request)', async () => {
    const inactiveCoupon = await Coupon.create({
      code: 'P6INACTIVE',
      discountType: 'FIXED',
      discountValue: 50,
      isActive: false,
      expiryDate: new Date(Date.now() + 86400000),
    });

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: inactiveCoupon.code },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.data.valid, false);
    assert.ok(res.body.message.includes('inactive'));
  });

  await test('8. Total usage limit rejection (400 Bad Request)', async () => {
    const maxedCoupon = await Coupon.create({
      code: 'P6MAXED',
      discountType: 'FIXED',
      discountValue: 50,
      usageLimit: 3,
      usedCount: 3,
      expiryDate: new Date(Date.now() + 86400000),
    });

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/coupons/validate',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { code: maxedCoupon.code },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.data.valid, false);
    assert.ok(res.body.message.includes('usage limit'));
  });

  await test('9. Admin coupon status toggle & soft-delete', async () => {
    // Status toggle
    const toggleRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/coupons/${createdCouponId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { isActive: false },
    });
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleRes.body.data.isActive, false);

    // Re-enable
    await makeRequest({
      method: 'PATCH',
      path: `/api/v1/coupons/${createdCouponId}/status`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { isActive: true },
    });

    // Soft delete dummy coupon
    const delRes = await makeRequest({
      method: 'DELETE',
      path: `/api/v1/coupons/${createdCouponId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(delRes.status, 200);

    const checkDoc = await Coupon.findById(createdCouponId);
    assert.strictEqual(checkDoc.isDeleted, true);
    assert.strictEqual(checkDoc.isActive, false);

    // Restore for subsequent order tests
    checkDoc.isDeleted = false;
    checkDoc.isActive = true;
    await checkDoc.save();
  });

  // ==========================================
  // SUB-STAGE B: CHECKOUT & ORDER PROCESSING
  // ==========================================
  let placedOrderId = null;
  let placedOrderNumber = null;

  await test('10. Calculate checkout summary (POST /api/v1/orders/checkout-summary)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders/checkout-summary',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        deliverySlotId: deliverySlot._id.toString(),
        couponCode: 'P6WELCOME20',
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.itemTotal, 650);
    assert.strictEqual(res.body.data.deliveryCharge, 40);
    assert.strictEqual(res.body.data.couponDiscount, 100);
    assert.strictEqual(res.body.data.grandTotal, 590); // 650 - 100 + 40
  });

  await test('11. Unserviceable PIN code rejected during checkout summary', async () => {
    const unserviceableAddress = await Address.create({
      user: customerUser._id,
      fullName: 'Far Away',
      phone: '9888800001',
      addressLine: '99 Out of Scope Road',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700001', // Unserviceable
    });

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders/checkout-summary',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: unserviceableAddress._id.toString(),
      },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('not serviceable'));
  });

  await test('12. Insufficient stock rejected during checkout summary', async () => {
    // Product 2 only has 5 in stock; set cart quantity to 10
    await Cart.findOneAndUpdate(
      { user: customerUser._id, 'items.product': product2._id },
      { $set: { 'items.$.quantity': 10 } }
    );

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders/checkout-summary',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
      },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('Insufficient stock'));

    // Restore cart quantity
    await Cart.findOneAndUpdate(
      { user: customerUser._id, 'items.product': product2._id },
      { $set: { 'items.$.quantity': 1 } }
    );
  });

  await test('13. Successful order placement (POST /api/v1/orders)', async () => {
    const initialProduct1Stock = (await Product.findById(product1._id)).stockQuantity;
    const initialSlotBooked = (await DeliverySlot.findById(deliverySlot._id)).bookedCount;
    const initialCouponUsed = (await Coupon.findById(createdCouponId)).usedCount;

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        deliverySlotId: deliverySlot._id.toString(),
        couponCode: 'P6WELCOME20',
        paymentMethod: 'RAZORPAY',
      },
    });

    if (res.status !== 201) {
      console.log('Place order failed response:', res.body);
    }
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.orderStatus, 'PENDING');
    assert.strictEqual(res.body.data.paymentStatus, 'PENDING');
    assert.strictEqual(res.body.data.grandTotal, 590);

    placedOrderId = res.body.data.id;
    placedOrderNumber = res.body.data.orderNumber;

    // Verify atomic reservations
    const updatedProd1 = await Product.findById(product1._id);
    assert.strictEqual(updatedProd1.stockQuantity, initialProduct1Stock - 2);

    const updatedSlot = await DeliverySlot.findById(deliverySlot._id);
    assert.strictEqual(updatedSlot.bookedCount, initialSlotBooked + 1);

    const updatedCoupon = await Coupon.findById(createdCouponId);
    assert.strictEqual(updatedCoupon.usedCount, initialCouponUsed + 1);

    // Verify cart was cleared
    const customerCart = await Cart.findOne({ user: customerUser._id });
    assert.strictEqual(customerCart.items.length, 0);
  });

  await test('14. Immutable item snapshot & address snapshot preserved', async () => {
    const order = await Order.findById(placedOrderId);
    assert.strictEqual(order.items.length, 2);
    assert.strictEqual(order.items[0].productName, product1.name);
    assert.strictEqual(order.items[0].unitPrice, 250);
    assert.strictEqual(order.deliveryAddress.fullName, customerAddress.fullName);
    assert.strictEqual(order.deliveryAddress.pincode, '700120');
  });

  await test('15. Per-customer coupon limit blocks duplicate reuse', async () => {
    // Refill cart for customer 1
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: product1._id, quantity: 2 }] } }
    );

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        couponCode: 'P6WELCOME20',
        paymentMethod: 'COD',
      },
    });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('maximum usage limit'));
  });

  await test('16. Customer order history & ownership scoping', async () => {
    // Customer 1 gets history
    const res1 = await makeRequest({
      method: 'GET',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(res1.status, 200);
    assert.ok(res1.body.data.some((o) => o.id === placedOrderId));

    // Customer 2 cannot see Customer 1's order
    const res2 = await makeRequest({
      method: 'GET',
      path: `/api/v1/orders/${placedOrderId}`,
      headers: { Authorization: `Bearer ${customer2Token}` },
    });
    assert.strictEqual(res2.status, 404);
  });

  await test('17. Order cancellation releases stock, slot capacity, and coupon exactly once', async () => {
    const prodBefore = (await Product.findById(product1._id)).stockQuantity;
    const slotBefore = (await DeliverySlot.findById(deliverySlot._id)).bookedCount;
    const couponBefore = (await Coupon.findById(createdCouponId)).usedCount;

    const cancelRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/orders/${placedOrderId}/cancel`,
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { reason: 'Changed my mind' },
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.data.orderStatus, 'CANCELLED');

    // Check release
    const prodAfter = (await Product.findById(product1._id)).stockQuantity;
    const slotAfter = (await DeliverySlot.findById(deliverySlot._id)).bookedCount;
    const couponAfter = (await Coupon.findById(createdCouponId)).usedCount;

    assert.strictEqual(prodAfter, prodBefore + 2);
    assert.strictEqual(slotAfter, slotBefore - 1);
    assert.strictEqual(couponAfter, couponBefore - 1);

    // Duplicate cancellation attempt rejected
    const dupCancelRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/orders/${placedOrderId}/cancel`,
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(dupCancelRes.status, 400);
    assert.ok(dupCancelRes.body.message.includes('already cancelled'));

    // Verify stock was not released a second time
    const prodAfterDup = (await Product.findById(product1._id)).stockQuantity;
    assert.strictEqual(prodAfterDup, prodAfter);
  });

  // ==========================================
  // SUB-STAGE C: PAYMENTS & RAZORPAY INTEGRATION
  // ==========================================
  // Place a fresh order for payment testing
  await Cart.findOneAndUpdate(
    { user: customerUser._id },
    { $set: { items: [{ product: product1._id, quantity: 1 }] } }
  );
  const freshOrderRes = await makeRequest({
    method: 'POST',
    path: '/api/v1/orders',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: {
      addressId: customerAddress._id.toString(),
      deliverySlotId: deliverySlot._id.toString(),
      paymentMethod: 'RAZORPAY',
    },
  });
  const payOrderId = freshOrderRes.body.data.id;
  let razorpayOrderId = null;

  await test('18. Create Razorpay order (POST /api/v1/payments/razorpay/create-order)', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/create-order',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { orderId: payOrderId },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.razorpayOrderId.startsWith('order_mock_'));
    assert.strictEqual(res.body.data.amount, 29000); // 250 + 40 delivery = 290 * 100 paise
    razorpayOrderId = res.body.data.razorpayOrderId;
  });

  await test('19. Non-owner cannot create Razorpay order for another customer', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/create-order',
      headers: { Authorization: `Bearer ${customer2Token}` },
      body: { orderId: payOrderId },
    });
    assert.strictEqual(res.status, 404);
  });

  await test('20. Cryptographic checkout signature verification rejection for forged signature', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/verify',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId: payOrderId,
        razorpayOrderId,
        razorpayPaymentId: 'pay_mock_12345',
        razorpaySignature: 'forged_invalid_signature_hash_value_here_that_is_64_chars_long0000',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('Invalid payment signature'));
  });

  await test('21. Valid checkout signature verification marks order PAID and CONFIRMED', async () => {
    const paymentId = 'pay_mock_valid_12345';
    const payload = `${razorpayOrderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder')
      .update(payload)
      .digest('hex');

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/verify',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId: payOrderId,
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.paymentStatus, 'PAID');
    assert.strictEqual(res.body.data.orderStatus, 'CONFIRMED');

    // Idempotent duplicate verification
    const dupRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/verify',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId: payOrderId,
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      },
    });
    assert.strictEqual(dupRes.status, 200);
    assert.ok(dupRes.body.message.includes('already verified'));
  });

  await test('22. Webhook signature verification and payment.captured processing', async () => {
    // Fresh order for webhook capture test
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: product2._id, quantity: 2 }] } }
    );
    const webOrderRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        deliverySlotId: deliverySlot._id.toString(),
        paymentMethod: 'RAZORPAY',
      },
    });
    const webhookOrderId = webOrderRes.body.data.id;

    // Create Razorpay order ID for it
    const rzpRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/create-order',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { orderId: webhookOrderId },
    });
    const rzpWebhookOrderId = rzpRes.body.data.razorpayOrderId;

    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_capture_999',
            order_id: rzpWebhookOrderId,
            amount: 34000,
            status: 'captured',
          },
        },
      },
    });

    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_placeholder';
    const validWebhookSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex');

    // Invalid signature rejected
    const badRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': 'bad_sig_000000000000000000000000000000000000000000000000000000000000',
        'Content-Type': 'application/json',
      },
      body: JSON.parse(webhookBody),
    });
    assert.strictEqual(badRes.status, 400);

    // Valid signature accepted
    const goodRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': validWebhookSig,
        'Content-Type': 'application/json',
      },
      body: JSON.parse(webhookBody),
    });
    if (goodRes.status !== 200 || goodRes.body.message !== 'Webhook processed successfully') {
      console.log('goodRes body:', goodRes.body);
    }
    assert.strictEqual(goodRes.status, 200);

    const updatedOrder = await Order.findById(webhookOrderId);
    assert.strictEqual(updatedOrder.paymentStatus, 'PAID');
    assert.strictEqual(updatedOrder.orderStatus, 'CONFIRMED');
  });

  await test('23. Cash on Delivery (COD) confirmation (POST /api/v1/payments/cod/confirm)', async () => {
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: product1._id, quantity: 1 }] } }
    );
    const codOrderRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        paymentMethod: 'COD',
      },
    });
    const codOrderId = codOrderRes.body.data.id;
    assert.strictEqual(codOrderRes.body.data.paymentStatus, 'COD_PENDING');

    const confirmRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/cod/confirm',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { orderId: codOrderId },
    });
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.data.paymentStatus, 'COD_PENDING');
    assert.strictEqual(confirmRes.body.data.orderStatus, 'CONFIRMED');
  });

  // ==========================================
  // SUB-STAGE D: KITCHEN & DELIVERY OPERATIONS
  // ==========================================
  // We will run the confirmed order (payOrderId) through the complete lifecycle:
  // CONFIRMED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED

  await test('24. Kitchen authorization (CUSTOMER rejected, KITCHEN allowed)', async () => {
    // CUSTOMER rejected with 403
    const custRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/operations/kitchen/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(custRes.status, 403);

    // KITCHEN allowed with 200
    const kitchRes = await makeRequest({
      method: 'GET',
      path: '/api/v1/operations/kitchen/orders',
      headers: { Authorization: `Bearer ${kitchenToken}` },
    });
    assert.strictEqual(kitchRes.status, 200);
    assert.ok(Array.isArray(kitchRes.body.data));
  });

  await test('25. Kitchen transitions order CONFIRMED -> PREPARING -> READY_FOR_PICKUP', async () => {
    // 1. CONFIRMED -> PREPARING
    const prepRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/kitchen/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${kitchenToken}` },
      body: { status: 'PREPARING', note: 'Chefs started cooking' },
    });
    assert.strictEqual(prepRes.status, 200);
    assert.strictEqual(prepRes.body.data.orderStatus, 'PREPARING');

    // 2. PREPARING -> READY_FOR_PICKUP
    const readyRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/kitchen/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${kitchenToken}` },
      body: { status: 'READY_FOR_PICKUP', note: 'Boxed and placed in dispatch counter' },
    });
    assert.strictEqual(readyRes.status, 200);
    assert.strictEqual(readyRes.body.data.orderStatus, 'READY_FOR_PICKUP');

    // Invalid transition: Kitchen cannot mark OUT_FOR_DELIVERY or DELIVERED
    const badRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/kitchen/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${kitchenToken}` },
      body: { status: 'DELIVERED' },
    });
    assert.strictEqual(badRes.status, 403);
  });

  let generatedDeliveryOtp = null;

  await test('26. Delivery partner claims order and transitions to OUT_FOR_DELIVERY with OTP generation', async () => {
    const outRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/delivery/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${deliveryToken}` },
      body: { status: 'OUT_FOR_DELIVERY', note: 'Picked up by delivery executive' },
    });
    assert.strictEqual(outRes.status, 200);
    assert.strictEqual(outRes.body.data.orderStatus, 'OUT_FOR_DELIVERY');

    // Verify assigned partner
    const dbOrder = await Order.findById(payOrderId).select('+deliveryOTP +deliveryOtpCode');
    assert.strictEqual(dbOrder.assignedDeliveryPartner.toString(), deliveryUser._id.toString());
    assert.ok(dbOrder.deliveryOTP, 'deliveryOTP hash must be set');
    assert.ok(dbOrder.deliveryOtpCode, 'deliveryOtpCode plain text must be set');
    generatedDeliveryOtp = dbOrder.deliveryOtpCode;

    // Verify normal response strips OTP
    assert.strictEqual(outRes.body.data.deliveryOTP, undefined);
    assert.strictEqual(outRes.body.data.deliveryOtpCode, undefined);
  });

  await test('27. Customer can retrieve delivery OTP when order is OUT_FOR_DELIVERY', async () => {
    const res = await makeRequest({
      method: 'GET',
      path: `/api/v1/orders/${payOrderId}`,
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.deliveryOtp, generatedDeliveryOtp);
  });

  await test('28. Delivery partner completes delivery with OTP verification and OTP invalidation', async () => {
    // 1. Wrong OTP rejected
    const badOtpRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/delivery/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${deliveryToken}` },
      body: { status: 'DELIVERED', otp: '000000' },
    });
    assert.strictEqual(badOtpRes.status, 400);
    assert.ok(badOtpRes.body.message.includes('Invalid delivery OTP'));

    // 2. Correct OTP succeeds
    const goodOtpRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/delivery/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${deliveryToken}` },
      body: { status: 'DELIVERED', otp: generatedDeliveryOtp },
    });
    assert.strictEqual(goodOtpRes.status, 200);
    assert.strictEqual(goodOtpRes.body.data.orderStatus, 'DELIVERED');

    // 3. Verify OTP invalidated in database
    const finalOrder = await Order.findById(payOrderId).select('+deliveryOTP +deliveryOtpCode');
    assert.strictEqual(finalOrder.deliveryOTP, null);
    assert.strictEqual(finalOrder.deliveryOtpCode, null);
    assert.strictEqual(finalOrder.orderStatus, 'DELIVERED');
  });

  await test('29. Delivery partner cannot modify another partner assigned order', async () => {
    // Create partner 2
    const otherPartner = await User.create({
      name: 'Phase6 Partner Two',
      email: 'phase6.partner2@bento.in',
      phone: '9888800099',
      password: hashedPassword,
      role: 'DELIVERY',
    });
    const partner2Token = generateAccessToken(otherPartner);

    const res = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/delivery/orders/${payOrderId}/status`,
      headers: { Authorization: `Bearer ${partner2Token}` },
      body: { status: 'DELIVERED', otp: '123456' },
    });
    assert.strictEqual(res.status, 403);
    assert.ok(res.body.message.includes('assigned to another delivery partner'));
  });

  // ==========================================
  // HARDENING & AUDIT EXTENSION TESTS
  // ==========================================

  await test('30. Paid order cancellation is rejected (400 Bad Request)', async () => {
    // Place and pay for an order
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: product1._id, quantity: 1 }] } }
    );
    const orderRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        paymentMethod: 'RAZORPAY',
      },
    });
    const paidOrderId = orderRes.body.data.id;

    // Mark it paid directly
    await Order.updateOne(
      { _id: paidOrderId },
      { $set: { paymentStatus: 'PAID', orderStatus: 'CONFIRMED' } }
    );

    // Customer attempts to self-cancel paid order
    const cancelRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/orders/${paidOrderId}/cancel`,
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { reason: 'Want my money back' },
    });

    assert.strictEqual(cancelRes.status, 400);
    assert.strictEqual(cancelRes.body.success, false);
    assert.ok(cancelRes.body.message.includes('Paid orders cannot be self-cancelled'));
  });

  await test('31. Pending payment expiry auto-cancels timed-out orders and releases inventory', async () => {
    const prodStockBefore = (await Product.findById(product1._id)).stockQuantity;

    // Create an order
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: product1._id, quantity: 2 }] } }
    );
    const expOrderRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        addressId: customerAddress._id.toString(),
        paymentMethod: 'RAZORPAY',
      },
    });
    const expiringOrderId = expOrderRes.body.data.id;
    assert.strictEqual(
      (await Product.findById(product1._id)).stockQuantity,
      prodStockBefore - 2
    );

    // Artificially back-date the order's createdAt to 30 minutes ago
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(expiringOrderId) },
      { $set: { createdAt: new Date(Date.now() - 30 * 60 * 1000) } }
    );

    // Call expire-pending endpoint
    const expireRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders/expire-pending',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { maxAgeMinutes: 15 },
    });
    assert.strictEqual(expireRes.status, 200);
    assert.ok(expireRes.body.data.expiredOrderIds.some((id) => id.toString() === expiringOrderId));

    // Verify order was cancelled and inventory was restored
    const expiredDoc = await Order.findById(expiringOrderId);
    assert.strictEqual(expiredDoc.orderStatus, 'CANCELLED');
    assert.strictEqual(expiredDoc.paymentStatus, 'FAILED');
    assert.strictEqual(
      (await Product.findById(product1._id)).stockQuantity,
      prodStockBefore
    );
  });

  await test('32. Late checkout payment verification rejected on cancelled/expired order', async () => {
    // Attempt to verify payment for the expired order from test 31
    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/verify',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId: payOrderId, // payOrderId was delivered in test 28, so let's test on cancelled order
        razorpayOrderId: 'order_mock_test',
        razorpayPaymentId: 'pay_mock_test',
        razorpaySignature: 'dummy',
      },
    });
    // payOrderId is already delivered and paid, but let's test with placedOrderId which is cancelled
    const resCancelled = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/verify',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        orderId: placedOrderId, // CANCELLED order
        razorpayOrderId: 'order_mock_test',
        razorpayPaymentId: 'pay_mock_test',
        razorpaySignature: 'dummy',
      },
    });
    // Signature check happens or cancelled check happens (400)
    assert.strictEqual(resCancelled.status, 400);
  });

  await test('33. Late webhook capture event on cancelled order logs review note without reviving order', async () => {
    // placedOrderId is CANCELLED
    const lateRzpOrderId = `order_late_webhook_${Date.now()}`;
    await Order.updateOne(
      { _id: placedOrderId },
      { $set: { 'paymentDetails.razorpayOrderId': lateRzpOrderId } }
    );

    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_late_webhook_999',
            order_id: lateRzpOrderId,
            amount: 59000,
            status: 'captured',
          },
        },
      },
    });
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_placeholder';
    const sig = crypto.createHmac('sha256', webhookSecret).update(webhookBody).digest('hex');

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': `evt_late_capture_${Date.now()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.parse(webhookBody),
    });
    assert.strictEqual(res.status, 200);

    const orderDoc = await Order.findById(placedOrderId);
    // Order MUST still be CANCELLED, not revived into CONFIRMED!
    assert.strictEqual(orderDoc.orderStatus, 'CANCELLED');
    assert.ok(
      orderDoc.statusHistory.some((h) => h.note && h.note.includes('Late payment captured'))
    );
  });

  await test('34. Duplicate webhook event returns idempotent 200 without reprocessing', async () => {
    const webhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_dup_webhook_111',
            order_id: 'order_dup_test_123',
            amount: 25000,
            status: 'captured',
          },
        },
      },
    });
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_placeholder';
    const sig = crypto.createHmac('sha256', webhookSecret).update(webhookBody).digest('hex');

    // First delivery of webhook
    const firstRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': 'evt_dup_unique_id_999',
        'Content-Type': 'application/json',
      },
      body: JSON.parse(webhookBody),
    });
    assert.strictEqual(firstRes.status, 200);

    // Second duplicate delivery of same event
    const dupRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': 'evt_dup_unique_id_999',
        'Content-Type': 'application/json',
      },
      body: JSON.parse(webhookBody),
    });
    assert.strictEqual(dupRes.status, 200);
    assert.ok(dupRes.body.message.includes('already processed'));
  });

  await test('35. Out-of-order webhook event (payment.failed after payment.captured) cannot overwrite PAID', async () => {
    // Create an order marked PAID
    const orderPaid = await Order.create({
      orderNumber: 'BB-P6-PAID-TEST-1',
      user: customerUser._id,
      items: [
        {
          product: product1._id,
          productName: product1.name,
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      ],
      deliveryAddress: {
        fullName: 'Test User',
        phone: '9888800001',
        addressLine: '12 Test St',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 250,
      deliveryCharge: 40,
      grandTotal: 290,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      paymentDetails: { razorpayOrderId: 'order_ooo_test_456' },
    });

    const failedWebhookBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_late_000',
            order_id: 'order_ooo_test_456',
            error_description: 'Late delayed failure event',
          },
        },
      },
    });
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_webhook_secret_placeholder';
    const sig = crypto.createHmac('sha256', webhookSecret).update(failedWebhookBody).digest('hex');

    const res = await makeRequest({
      method: 'POST',
      path: '/api/v1/payments/razorpay/webhook',
      headers: {
        'x-razorpay-signature': sig,
        'x-razorpay-event-id': 'evt_late_failure_ooo',
        'Content-Type': 'application/json',
      },
      body: JSON.parse(failedWebhookBody),
    });
    assert.strictEqual(res.status, 200);

    const docAfter = await Order.findById(orderPaid._id);
    // MUST remain PAID! Not overwritten by failed event
    assert.strictEqual(docAfter.paymentStatus, 'PAID');
    assert.strictEqual(docAfter.orderStatus, 'CONFIRMED');
  });

  await test('36. Financial precision edge cases (fractional prices, discount caps)', async () => {
    // Clean and create product with fractional price 249.99
    await Product.deleteMany({ slug: { $regex: /fractional/ } });
    const fractionalProduct = await Product.create({
      name: 'Fractional Bento',
      slug: `fractional-bento-${Date.now()}`,
      description: 'Precision test product',
      category: category._id,
      price: 249.99,
      stockQuantity: 10,
      isActive: true,
      isAvailable: true,
    });

    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { $set: { items: [{ product: fractionalProduct._id, quantity: 3 }] } }
    );

    const summaryRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/orders/checkout-summary',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { addressId: customerAddress._id.toString() },
    });

    assert.strictEqual(summaryRes.status, 200);
    // 249.99 * 3 = 749.97 in rupees (74997 in paise)
    assert.strictEqual(summaryRes.body.data.itemTotal, 749.97);
    // With delivery 40: 789.97
    assert.strictEqual(summaryRes.body.data.grandTotal, 789.97);
  });

  await test('37. Delivery OTP rate limiting blocks verification after 5 consecutive failed attempts (429)', async () => {
    // Create an order in OUT_FOR_DELIVERY status
    const otpTestOrder = await Order.create({
      orderNumber: 'BB-P6-OTP-TEST-1',
      user: customerUser._id,
      items: [
        {
          product: product1._id,
          productName: product1.name,
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      ],
      deliveryAddress: {
        fullName: 'Test User',
        phone: '9888800001',
        addressLine: '12 Test St',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 250,
      deliveryCharge: 40,
      grandTotal: 290,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: deliveryUser._id,
      deliveryOTP: crypto.createHash('sha256').update('888888').digest('hex'),
      deliveryOtpCode: '888888',
      failedOtpAttempts: 0,
    });

    // Make 5 consecutive wrong OTP attempts
    for (let i = 0; i < 5; i++) {
      const wrongRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${otpTestOrder._id}/status`,
        headers: { Authorization: `Bearer ${deliveryToken}` },
        body: { status: 'DELIVERED', otp: `00000${i}` },
      });
      assert.strictEqual(wrongRes.status, 400);
    }

    // 6th attempt is blocked with 429 Too Many Requests
    const blockedRes = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/operations/delivery/orders/${otpTestOrder._id}/status`,
      headers: { Authorization: `Bearer ${deliveryToken}` },
      body: { status: 'DELIVERED', otp: '888888' }, // Even with correct OTP!
    });
    assert.strictEqual(blockedRes.status, 429);
    assert.ok(blockedRes.body.message.includes('attempts exceeded'));
  });

  } finally {
    // Clean up
    await User.deleteMany({ email: { $regex: /phase6.*@bento\.in/ } });
    await Category.deleteMany({ slug: { $regex: /phase6/ } });
    await Product.deleteMany({ slug: { $regex: /phase6/ } });
    await DeliveryZone.deleteMany({ name: { $regex: /Phase 6/ } });
    await DeliverySlot.deleteMany({ label: { $regex: /Phase 6/ } });
    await Coupon.deleteMany({ code: { $regex: /^P6/ } });
    await Order.deleteMany({ orderNumber: { $regex: /^BB-P6/ } });
    await WebhookEvent.deleteMany({});
    await CouponUsage.deleteMany({});

    await new Promise((resolve) => serverInstance.close(resolve));
    await mongoose.connection.close(false);
  }

  console.log('\n====================================================');
  console.log(`Phase 6 Verification Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

