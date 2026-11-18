process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Address,
  Cart,
  Order,
  DeliveryZone,
  DailyMenu,
} = require('../app/models');

const crypto = require('crypto');
const ProductController = require('../app/controllers/productController');
const CartController = require('../app/controllers/cartController');
const OrderController = require('../app/controllers/orderController');
const DailyMenuController = require('../app/controllers/dailyMenuController');
const PaymentController = require('../app/controllers/paymentController');
const { validateEnv } = require('../app/config/env');
const { getKolkataDateString } = require('../app/utils/businessDate');
const { initRedis, redisDelPattern, disconnectRedis } = require('../app/config/redis');

// Mock Express response helper
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

// Next middleware catcher
function createMockNext() {
  return function (err) {
    if (err) throw err;
  };
}

async function runAvailabilityTests() {
  console.log('\n===============================================================');
  console.log(' BentoBabu — Product Availability Synchronization Test Suite');
  console.log('===============================================================\n');

  await connectDB();
  await initRedis();

  const timestamp = Date.now();
  let testUser, testAddress, testZone, testCategory, prodA, prodB;

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test category, products, user, and delivery zone...');

    testCategory = await Category.create({
      name: `Test Cat ${timestamp}`,
      slug: `test-cat-${timestamp}`,
      description: 'Category for testing availability synchronization',
      isActive: true,
    });

    prodA = await Product.create({
      name: `Avail Test Bento A ${timestamp}`,
      slug: `avail-test-bento-a-${timestamp}`,
      description: 'Delicious high protein bento A',
      category: testCategory._id,
      price: 250,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    prodB = await Product.create({
      name: `Avail Test Bento B ${timestamp}`,
      slug: `avail-test-bento-b-${timestamp}`,
      description: 'Delicious healthy bento B',
      category: testCategory._id,
      price: 300,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    testUser = await User.create({
      name: `Customer ${timestamp}`,
      email: `customer_${timestamp}@bentobabu.test`,
      password: 'TestPassword123!',
      phone: `98765${String(timestamp).slice(-5)}`,
      role: 'CUSTOMER',
      isVerified: true,
    });

    testZone = await DeliveryZone.create({
      name: `Test Zone ${timestamp}`,
      pincodes: ['700120'],
      deliveryCharge: 30,
      freeDeliveryThreshold: 500,
      estimatedDeliveryTime: '30 mins',
      isActive: true,
    });

    testAddress = await Address.create({
      user: testUser._id,
      fullName: 'Test Customer',
      phone: '9876543210',
      pincode: '700120',
      addressLine: '123 Healthy Street',
      city: 'Barrackpore',
      state: 'West Bengal',
      isDefault: true,
    });

    const { SystemSetting } = require('../app/models');
    await SystemSetting.findOneAndUpdate(
      { key: 'ORDER_ACCEPTANCE_ENABLED' },
      { key: 'ORDER_ACCEPTANCE_ENABLED', value: true, dataType: 'BOOLEAN' },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'MAINTENANCE_MODE' },
      { key: 'MAINTENANCE_MODE', value: false, dataType: 'BOOLEAN' },
      { upsert: true }
    );

    // Wipe any existing redis product cache
    await redisDelPattern('cache:products:*');

    // ====================================================
    // SCENARIO 1: Admin marks Product A as Unavailable
    // ====================================================
    console.log('\n--- Scenario 1: Admin marks Product A as Unavailable ---');
    {
      const req = {
        params: { id: prodA._id.toString() },
        body: { isAvailable: false },
        user: { id: 'admin_test_id', role: 'ADMIN' },
      };
      const res = createMockRes();
      await ProductController.updateProductAvailability(req, res, createMockNext());

      assert.strictEqual(res.statusCode, 200, 'updateProductAvailability should return HTTP 200');
      assert.strictEqual(res.data.success, true, 'Response success should be true');
      assert.strictEqual(res.data.data.isAvailable, false, 'Product data should reflect isAvailable = false');

      // Verify MongoDB persistence
      const updatedInDb = await Product.findById(prodA._id);
      assert.strictEqual(updatedInDb.isAvailable, false, 'Database record must have isAvailable = false');
      console.log('✔ Admin availability toggle persisted isAvailable: false in database.');
    }

    // ====================================================
    // SCENARIO 2: Customer menu reflects Product A as Unavailable
    // ====================================================
    console.log('\n--- Scenario 2: Customer menu displays Product A as Unavailable ---');
    {
      const req = { query: {} };
      const res = createMockRes();
      await ProductController.getProducts(req, res, createMockNext());

      assert.strictEqual(res.statusCode, 200, 'getProducts should return HTTP 200');
      const items = res.data.data;
      const foundA = items.find((p) => p._id.toString() === prodA._id.toString());
      const foundB = items.find((p) => p._id.toString() === prodB._id.toString());

      assert(foundA, 'Product A should remain visible on menu');
      assert.strictEqual(foundA.isAvailable, false, 'Product A must have isAvailable: false');
      assert(foundB, 'Product B should remain visible on menu');
      assert.strictEqual(foundB.isAvailable, true, 'Product B must have isAvailable: true');
      console.log('✔ Customer menu lists Product A with isAvailable: false and Product B with isAvailable: true.');
    }

    // ====================================================
    // SCENARIO 3: Product Detail Page reflects Product A as Unavailable
    // ====================================================
    console.log('\n--- Scenario 3: Product detail page shows isAvailable: false ---');
    {
      const req = { params: { slug: prodA.slug } };
      const res = createMockRes();
      await ProductController.getProductBySlug(req, res, createMockNext());

      assert.strictEqual(res.statusCode, 200, 'getProductBySlug should return HTTP 200');
      assert.strictEqual(res.data.data.isAvailable, false, 'Product detail must return isAvailable: false');
      console.log('✔ Product detail page correctly returns isAvailable: false.');
    }

    // ====================================================
    // SCENARIO 4: Cannot add Unavailable Product to Cart
    // ====================================================
    console.log('\n--- Scenario 4: User cannot add unavailable Product A to cart ---');
    {
      const req = {
        user: { id: testUser._id.toString() },
        body: { productId: prodA._id.toString(), quantity: 1 },
      };
      const res = createMockRes();
      await CartController.addItem(req, res, createMockNext());

      assert.strictEqual(res.statusCode, 400, 'addItem must return HTTP 400 for unavailable product');
      assert.strictEqual(res.data.success, false, 'Response success should be false');
      assert(
        res.data.message.toLowerCase().includes('unavailable'),
        `Error message should explain item is unavailable. Got: ${res.data.message}`
      );
      console.log(`✔ Cart addition blocked: "${res.data.message}"`);
    }

    // ====================================================
    // SCENARIO 5: Cannot place order containing Unavailable Product
    // ====================================================
    console.log('\n--- Scenario 5: Order placement with unavailable product fails on backend ---');
    {
      // Put Product A into cart directly to simulate cart added before item became unavailable
      let userCart = await Cart.findOne({ user: testUser._id });
      if (!userCart) {
        userCart = new Cart({ user: testUser._id, items: [] });
      }
      userCart.items = [{ product: prodA._id, quantity: 2 }];
      await userCart.save();

      // Test 5A: Checkout Summary rejection
      const summaryReq = {
        user: { id: testUser._id.toString() },
        body: { addressId: testAddress._id.toString() },
      };
      const summaryRes = createMockRes();
      await OrderController.getCheckoutSummary(summaryReq, summaryRes, createMockNext());

      assert.strictEqual(summaryRes.statusCode, 400, 'getCheckoutSummary must reject unavailable cart items');
      assert(
        summaryRes.data.message.toLowerCase().includes('unavailable'),
        `Checkout summary error must mention unavailable. Got: ${summaryRes.data.message}`
      );
      console.log(`✔ Checkout summary rejected: "${summaryRes.data.message}"`);

      // Test 5B: COD Order placement rejection
      const orderReq = {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          paymentMethod: 'COD',
        },
      };
      const orderRes = createMockRes();
      await OrderController.placeOrder(orderReq, orderRes, createMockNext());

      assert.strictEqual(orderRes.statusCode, 400, 'placeOrder must reject unavailable cart items');
      assert(
        orderRes.data.message.toLowerCase().includes('unavailable'),
        `Order creation error must mention unavailable. Got: ${orderRes.data.message}`
      );
      console.log(`✔ COD Order placement rejected: "${orderRes.data.message}"`);
    }

    // ====================================================
    // SCENARIO 6: Admin marks Product A as Available again
    // ====================================================
    console.log('\n--- Scenario 6: Admin marks Product A Available again ---');
    {
      const req = {
        params: { id: prodA._id.toString() },
        body: { isAvailable: true },
        user: { id: 'admin_test_id', role: 'ADMIN' },
      };
      const res = createMockRes();
      await ProductController.updateProductAvailability(req, res, createMockNext());

      assert.strictEqual(res.statusCode, 200, 'updateProductAvailability should return HTTP 200');
      assert.strictEqual(res.data.data.isAvailable, true, 'Product should reflect isAvailable = true');

      // Verify MongoDB persistence
      const inDb = await Product.findById(prodA._id);
      assert.strictEqual(inDb.isAvailable, true, 'Database record must have isAvailable = true');

      // Verify Customer Menu
      const menuRes = createMockRes();
      await ProductController.getProducts({ query: {} }, menuRes, createMockNext());
      const foundA = menuRes.data.data.find((p) => p._id.toString() === prodA._id.toString());
      assert.strictEqual(foundA.isAvailable, true, 'Customer menu must now return isAvailable: true');

      // Verify Product Detail View
      const detailRes = createMockRes();
      await ProductController.getProductBySlug({ params: { slug: prodA.slug } }, detailRes, createMockNext());
      assert.strictEqual(detailRes.data.data.isAvailable, true, 'Product detail view must now return isAvailable: true');
      console.log('✔ Product A restored to Available state across DB, menu, and detail view.');
    }

    // ====================================================
    // SCENARIO 7: User can now order Product A normally
    // ====================================================
    console.log('\n--- Scenario 7: User can now add Product A to cart and checkout ---');
    {
      // Clear previous cart
      await Cart.deleteOne({ user: testUser._id });

      // Add Product A
      const addReq = {
        user: { id: testUser._id.toString() },
        body: { productId: prodA._id.toString(), quantity: 2 },
      };
      const addRes = createMockRes();
      await CartController.addItem(addReq, addRes, createMockNext());
      assert.strictEqual(addRes.statusCode, 200, 'addItem must succeed when product is available');

      // Checkout summary
      const sumReq = {
        user: { id: testUser._id.toString() },
        body: { addressId: testAddress._id.toString() },
      };
      const sumRes = createMockRes();
      await OrderController.getCheckoutSummary(sumReq, sumRes, createMockNext());
      assert.strictEqual(sumRes.statusCode, 200, 'getCheckoutSummary must succeed');
      assert.strictEqual(sumRes.data.data.itemTotal, 500, 'itemTotal should be 2 x 250 = 500');

      // Place COD Order
      const orderReq = {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          paymentMethod: 'COD',
        },
      };
      const orderRes = createMockRes();
      await OrderController.placeOrder(orderReq, orderRes, createMockNext());
      assert.strictEqual(orderRes.statusCode, 201, 'placeOrder must succeed with HTTP 201');
      assert(orderRes.data.data.orderNumber, 'Order number must be generated');
      console.log(`✔ Order placed successfully: Order #${orderRes.data.data.orderNumber}`);
    }

    // ====================================================
    // SCENARIO 8: Edge case - Product becomes unavailable between cart addition and checkout
    // ====================================================
    console.log('\n--- Scenario 8: Edge case - Product in cart becomes unavailable before checkout ---');
    {
      // 1. Add Product B to cart while available
      const addReq = {
        user: { id: testUser._id.toString() },
        body: { productId: prodB._id.toString(), quantity: 2 },
      };
      const addRes = createMockRes();
      await CartController.addItem(addReq, addRes, createMockNext());
      assert.strictEqual(addRes.statusCode, 200, 'Adding Product B should succeed');

      // 2. Admin marks Product B as Unavailable
      await ProductController.updateProductAvailability(
        {
          params: { id: prodB._id.toString() },
          body: { isAvailable: false },
          user: { id: 'admin_test_id', role: 'ADMIN' },
        },
        createMockRes(),
        createMockNext()
      );

      // 3. User tries to get checkout summary
      const sumRes = createMockRes();
      await OrderController.getCheckoutSummary(
        {
          user: { id: testUser._id.toString() },
          body: { addressId: testAddress._id.toString() },
        },
        sumRes,
        createMockNext()
      );
      assert.strictEqual(sumRes.statusCode, 400, 'Checkout summary must reject now-unavailable item');
      assert(
        sumRes.data.message.toLowerCase().includes('unavailable'),
        `Error must mention unavailable. Got: ${sumRes.data.message}`
      );

      // 4. User tries to submit order
      const ordRes = createMockRes();
      await OrderController.placeOrder(
        {
          user: { id: testUser._id.toString() },
          body: {
            addressId: testAddress._id.toString(),
            paymentMethod: 'COD',
          },
        },
        ordRes,
        createMockNext()
      );
      assert.strictEqual(ordRes.statusCode, 400, 'Order creation must reject now-unavailable item');
      assert(
        ordRes.data.message.toLowerCase().includes('unavailable'),
        `Error must mention unavailable. Got: ${ordRes.data.message}`
      );
      console.log(`✔ Edge case verified: Backend prevented checkout submission for now-unavailable item: "${ordRes.data.message}"`);
    }

    // ====================================================
    // SCENARIO 9: DailyMenu integration and Master-Availability precedence
    // ====================================================
    console.log('\n--- Scenario 9: DailyMenu integration & Master-Availability precedence ---');
    {
      const todayStr = getKolkataDateString();

      // Case A: Product is master-unavailable (prodB). DailyMenu is published with isAvailable: true.
      // Master unavailability MUST take precedence.
      await DailyMenuController.saveDailyMenu(
        {
          body: {
            date: todayStr,
            items: [
              { product: prodA._id.toString(), isAvailable: true },
              { product: prodB._id.toString(), isAvailable: true }, // trying to publish unavailable item as true
            ],
            isPublished: true,
          },
          user: { id: new mongoose.Types.ObjectId().toString(), role: 'ADMIN' },
        },
        createMockRes(),
        createMockNext()
      );

      // Check DailyMenuController.resolveDateAvailability
      const resolved = await DailyMenuController.resolveDateAvailability(todayStr);
      const resItemA = resolved.items.find((it) => it.product.id === prodA._id.toString());
      const resItemB = resolved.items.find((it) => it.product.id === prodB._id.toString());

      assert.strictEqual(resItemA.isAvailable, true, 'Product A (master available) should be available');
      assert.strictEqual(resItemB.isAvailable, false, 'Product B (master unavailable) must remain unavailable despite dailyMenu=true');

      // Check Customer Menu
      const menuRes = createMockRes();
      await ProductController.getProducts({ query: {} }, menuRes, createMockNext());
      const menuA = menuRes.data.data.find((p) => p._id.toString() === prodA._id.toString());
      const menuB = menuRes.data.data.find((p) => p._id.toString() === prodB._id.toString());
      assert.strictEqual(menuA.isAvailable, true, 'Product A in customer menu must be available');
      assert.strictEqual(menuB.isAvailable, false, 'Product B in customer menu must be unavailable');

      // Case B: Product is master-available (prodA). DailyMenu specifically marks it isAvailable: false today.
      await DailyMenuController.saveDailyMenu(
        {
          body: {
            date: todayStr,
            items: [
              { product: prodA._id.toString(), isAvailable: false }, // specific override for today
            ],
            isPublished: true,
          },
          user: { id: new mongoose.Types.ObjectId().toString(), role: 'ADMIN' },
        },
        createMockRes(),
        createMockNext()
      );

      const menuRes2 = createMockRes();
      await ProductController.getProducts({ query: {} }, menuRes2, createMockNext());
      const menuA2 = menuRes2.data.data.find((p) => p._id.toString() === prodA._id.toString());
      assert.strictEqual(menuA2.isAvailable, false, 'Product A must be unavailable today when dailyMenu marks it false');

      console.log('✔ DailyMenu precedence verified: Master-unavailability always takes precedence, and DailyMenu overrides work accurately.');
    }

    // ====================================================
    // SCENARIO 10: Razorpay Payment Verification Edge Case
    // Product becomes unavailable between order creation and payment verification
    // ====================================================
    console.log('\n--- Scenario 10: Product becomes unavailable between Razorpay order creation and payment verification ---');
    {
      const env = validateEnv();

      // 1. Ensure Product A is available and DailyMenu is reset
      const todayStr = getKolkataDateString();
      await DailyMenu.deleteOne({ date: todayStr });
      await Product.updateOne({ _id: prodA._id }, { isAvailable: true, stockQuantity: 20 });
      const initialProd = await Product.findById(prodA._id);
      assert.strictEqual(initialProd.stockQuantity, 20);

      // 2. User puts Product A into cart
      let userCart = await Cart.findOne({ user: testUser._id });
      if (!userCart) {
        userCart = new Cart({ user: testUser._id, items: [] });
      }
      userCart.items = [{ product: prodA._id, quantity: 2 }];
      await userCart.save();

      // 3. User places RAZORPAY order while product is available
      const orderRes = createMockRes();
      await OrderController.placeOrder(
        {
          user: { id: testUser._id.toString() },
          body: {
            addressId: testAddress._id.toString(),
            paymentMethod: 'RAZORPAY',
          },
        },
        orderRes,
        createMockNext()
      );

      assert.strictEqual(orderRes.statusCode, 201, 'Order placement must succeed');
      const order = orderRes.data.data;
      assert.strictEqual(order.orderStatus, 'PENDING');
      assert.strictEqual(order.paymentStatus, 'PENDING');

      // Verify stock was decremented from 20 to 18
      const midProd = await Product.findById(prodA._id);
      assert.strictEqual(midProd.stockQuantity, 18, 'Stock must be reserved upon order placement');

      // 4. Create Razorpay order ID
      const rzpRes = createMockRes();
      await PaymentController.createRazorpayOrder(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: order._id.toString() },
        },
        rzpRes,
        createMockNext()
      );
      assert.strictEqual(rzpRes.statusCode, 200);
      const razorpayOrderId = rzpRes.data.data.razorpayOrderId;
      assert(razorpayOrderId, 'Razorpay order ID must exist');

      // 5. Admin marks Product A as UNAVAILABLE while customer is on payment modal
      await Product.updateOne({ _id: prodA._id }, { isAvailable: false });

      // 6. Customer completes payment on Razorpay; signature verification callback arrives
      const razorpayPaymentId = `pay_test_${crypto.randomBytes(6).toString('hex')}`;
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const razorpaySignature = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(payload)
        .digest('hex');

      const verifyRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: {
            orderId: order._id.toString(),
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
          },
        },
        verifyRes,
        createMockNext()
      );

      // Verify that backend safely rejected order confirmation with HTTP 409
      assert.strictEqual(
        verifyRes.statusCode,
        409,
        'Backend must return HTTP 409 Conflict when item became unavailable before verification'
      );
      assert.strictEqual(verifyRes.data.success, false);
      assert(
        verifyRes.data.message.includes('unavailable') && verifyRes.data.message.includes('refund'),
        `Message must explain unavailability and refund. Got: ${verifyRes.data.message}`
      );

      // 7. Verify Order database record: CANCELLED, REFUNDED, audit note
      const cancelledOrder = await Order.findById(order._id);
      assert.strictEqual(cancelledOrder.orderStatus, 'CANCELLED', 'Order must be marked CANCELLED');
      assert.strictEqual(cancelledOrder.paymentStatus, 'REFUNDED', 'Payment status must be REFUNDED');
      assert.strictEqual(cancelledOrder.paymentDetails.razorpayPaymentId, razorpayPaymentId);
      assert(
        cancelledOrder.statusHistory.some((h) => h.note && h.note.includes('Full refund of')),
        'Status history must log cancellation and refund note'
      );

      // 8. Verify reserved stock was restored back to 20
      const restoredProd = await Product.findById(prodA._id);
      assert.strictEqual(
        restoredProd.stockQuantity,
        20,
        'Reserved stock must be rolled back when order is cancelled'
      );

      console.log(`✔ Razorpay payment verification edge case verified successfully:`);
      console.log(`  - Returned HTTP 409 Conflict`);
      console.log(`  - Order cancelled and refund initiated without confirming unavailable food`);
      console.log(`  - Reserved stock restored (18 -> 20)`);
      console.log(`  - Audit trail preserved in Order status history`);
    }

    console.log('\n===============================================================');
    console.log(' ALL 10 PRODUCT AVAILABILITY SYNCHRONIZATION TESTS PASSED! ');
    console.log('===============================================================\n');
  } finally {
    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log('[Cleanup] Cleaning up test data...');
    if (prodA) await Product.deleteOne({ _id: prodA._id });
    if (prodB) await Product.deleteOne({ _id: prodB._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await Cart.deleteOne({ user: testUser._id });
      await Address.deleteMany({ user: testUser._id });
      await Order.deleteMany({ user: testUser._id });
    }
    if (testZone) await DeliveryZone.deleteOne({ _id: testZone._id });
    const todayStr = getKolkataDateString();
    await DailyMenu.deleteOne({ date: todayStr });
    await redisDelPattern('cache:products:*');
    await disconnectRedis();
    await mongoose.disconnect();
    console.log('[Cleanup] Done.');
    setTimeout(() => process.exit(0), 200);
  }
}

runAvailabilityTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
