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
  SystemSetting,
  DailyMenu,
} = require('../app/models');
const DailyMenuController = require('../app/controllers/dailyMenuController');
const ProductController = require('../app/controllers/productController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const OrderController = require('../app/controllers/orderController');
const DeliveryController = require('../app/controllers/deliveryController');
const CartController = require('../app/controllers/cartController');
const { getKolkataDateString, addDays } = require('../app/utils/businessDate');

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

async function runTests() {
  console.log('\n======================================================');
  console.log(' Starting BentoBabu Functional Verification Test Suite ');
  console.log('======================================================\n');

  await connectDB();

  const timestamp = Date.now();
  let testUser, testAddress, testZone, cat1, cat2, prod1, prod2;

  try {
    // ----------------------------------------------------
    // SETUP TEST FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users, categories, products, and zones...');

    testUser = await User.create({
      name: `Test Customer ${timestamp}`,
      email: `customer_${timestamp}@test.bentobabu.in`,
      phone: `99${String(timestamp).slice(-8)}`,
      password: 'TestPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    testAddress = await Address.create({
      user: testUser._id,
      fullName: 'Test Customer',
      phone: testUser.phone,
      addressLine: 'Flat 4B, Kolkata Central Rd',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700120',
      addressType: 'HOME',
      isDefault: true,
    });

    testZone = await DeliveryZone.findOneAndUpdate(
      { pincodes: '700120' },
      {
        name: 'Barrackpore Test Zone',
        pincodes: ['700120'],
        deliveryCharge: 30,
        minimumOrderAmount: 100,
        estimatedDeliveryMinutes: 30,
        isActive: true,
      },
      { upsert: true, returnDocument: 'after' }
    );

    cat1 = await Category.create({
      name: `Fitness Meals ${timestamp}`,
      slug: `fitness-meals-${timestamp}`,
      description: 'High protein fitness meals',
      isActive: true,
    });

    cat2 = await Category.create({
      name: `Comfort Bowls ${timestamp}`,
      slug: `comfort-bowls-${timestamp}`,
      description: 'Digestible healing comfort bowls',
      isActive: true,
    });

    prod1 = await Product.create({
      name: `Chicken Protein Bento ${timestamp}`,
      slug: `chicken-protein-bento-${timestamp}`,
      description: 'Grilled chicken with quinoa',
      category: cat1._id,
      price: 250,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
      dietaryTags: ['NON_VEG'],
    });

    prod2 = await Product.create({
      name: `Millet Khichdi Bento ${timestamp}`,
      slug: `millet-khichdi-bento-${timestamp}`,
      description: 'Comforting foxtail millet khichdi',
      category: cat2._id,
      price: 180,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
      dietaryTags: ['VEG'],
    });

    console.log('✓ Test fixtures ready.\n');

    // ----------------------------------------------------
    // TEST SUITE 1: DELIVERY CHARGE (ADMIN CONTROLLED)
    // ----------------------------------------------------
    console.log('[Test 1.1] Admin sets ₹30 delivery charge...');
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_CHARGE_ENABLED' },
      { key: 'DELIVERY_CHARGE_ENABLED', value: true },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_CHARGE_AMOUNT' },
      { key: 'DELIVERY_CHARGE_AMOUNT', value: 30 },
      { upsert: true }
    );
    testZone.deliveryCharge = 30;
    await testZone.save();

    // Check serviceability
    const resServ1 = createMockRes();
    await DeliveryController.checkServiceability(
      { query: { pincode: '700120' } },
      resServ1,
      (err) => { throw err; }
    );
    assert.strictEqual(resServ1.statusCode, 200);
    assert.strictEqual(resServ1.data.data.deliveryCharge, 30);
    console.log('✓ Serviceability reports ₹30 delivery charge.');

    // Add prod1 to customer cart
    await Cart.findOneAndUpdate(
      { user: testUser._id },
      { user: testUser._id, items: [{ product: prod1._id, quantity: 1 }] },
      { upsert: true }
    );

    // Customer checkout summary
    const resSummary1 = createMockRes();
    await OrderController.getCheckoutSummary(
      { user: { id: testUser._id.toString() }, body: { addressId: testAddress._id.toString() } },
      resSummary1,
      (err) => { throw err; }
    );
    assert.strictEqual(resSummary1.statusCode, 200);
    assert.strictEqual(resSummary1.data.data.deliveryCharge, 30);
    assert.strictEqual(resSummary1.data.data.grandTotal, 250 + 30);
    console.log('✓ Customer sees ₹30 at checkout. Grand total = ₹280.');

    console.log('[Test 1.2] Admin sets delivery charge to ₹0 (Free Delivery)...');
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_CHARGE_ENABLED' },
      { key: 'DELIVERY_CHARGE_ENABLED', value: false },
      { upsert: true }
    );

    const resServ2 = createMockRes();
    await DeliveryController.checkServiceability(
      { query: { pincode: '700120' } },
      resServ2,
      (err) => { throw err; }
    );
    assert.strictEqual(resServ2.data.data.deliveryCharge, 0);

    const resSummary2 = createMockRes();
    await OrderController.getCheckoutSummary(
      { user: { id: testUser._id.toString() }, body: { addressId: testAddress._id.toString() } },
      resSummary2,
      (err) => { throw err; }
    );
    assert.strictEqual(resSummary2.statusCode, 200);
    assert.strictEqual(resSummary2.data.data.deliveryCharge, 0);
    assert.strictEqual(resSummary2.data.data.grandTotal, 250);
    console.log('✓ Customer sees ₹0 Free Delivery at checkout. Grand total = ₹250.');

    console.log('[Test 1.3] Customer cannot manipulate delivery charge through API requests...');
    // Customer submits placeOrder with an attempted deliveryCharge = 5 injection in req.body
    await Cart.findOneAndUpdate(
      { user: testUser._id },
      { user: testUser._id, items: [{ product: prod1._id, quantity: 1 }] },
      { upsert: true }
    );

    // Admin sets charge to ₹45
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_CHARGE_ENABLED' },
      { key: 'DELIVERY_CHARGE_ENABLED', value: true },
      { upsert: true }
    );
    testZone.deliveryCharge = 45;
    await testZone.save();

    const resOrder1 = createMockRes();
    await OrderController.placeOrder(
      {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          paymentMethod: 'COD',
          deliveryCharge: 0, // Injected attempt to bypass delivery charge
        },
      },
      resOrder1,
      (err) => { throw err; }
    );
    assert.strictEqual(resOrder1.statusCode, 201);
    const createdOrder = resOrder1.data.data.order || resOrder1.data.data;
    assert.strictEqual(createdOrder.deliveryCharge, 45, 'Order must use server-calculated delivery charge snapshot');
    assert.strictEqual(createdOrder.grandTotal, 250 + 45);
    console.log('✓ Order securely created with admin ₹45 charge snapshot (injected ₹0 ignored).');

    console.log('[Test 1.4] Existing orders retain original delivery charge snapshot...');
    // Admin changes delivery charge to ₹60
    testZone.deliveryCharge = 60;
    await testZone.save();

    const storedOrder = await Order.findById(createdOrder.id || createdOrder._id);
    assert.strictEqual(storedOrder.deliveryCharge, 45, 'Historical order must retain ₹45 snapshot');
    console.log('✓ Historical order retained original ₹45 snapshot even after admin changed config to ₹60.\n');

    // ----------------------------------------------------
    // TEST SUITE 2: FOOD CATEGORY VISIBILITY (ALL CATEGORIES)
    // ----------------------------------------------------
    const extractProducts = (res) => (Array.isArray(res.data?.data) ? res.data.data : (res.data?.data?.products || []));

    console.log('[Test 2.1] Food Category Visibility across All Categories and specific categories...');
    const resAll = createMockRes();
    await ProductController.getProducts(
      { query: {} },
      resAll,
      (err) => { throw err; }
    );
    assert.strictEqual(resAll.statusCode, 200);
    const allProducts = extractProducts(resAll);
    const foundProd1 = allProducts.find((p) => p.slug === prod1.slug);
    const foundProd2 = allProducts.find((p) => p.slug === prod2.slug);
    assert.ok(foundProd1, 'Product 1 must appear under All Categories');
    assert.ok(foundProd2, 'Product 2 must appear under All Categories');
    console.log('✓ All Categories displays products across all categories.');

    console.log('[Test 2.2] Specific category filter displays only its products...');
    const resCat1 = createMockRes();
    await ProductController.getProducts(
      { query: { category: cat1._id.toString() } },
      resCat1,
      (err) => { throw err; }
    );
    const cat1Products = extractProducts(resCat1);
    assert.ok(cat1Products.some((p) => p.slug === prod1.slug), 'Product 1 must appear in Category 1');
    assert.ok(!cat1Products.some((p) => p.slug === prod2.slug), 'Product 2 must NOT appear in Category 1');

    const resCat2 = createMockRes();
    await ProductController.getProducts(
      { query: { category: cat2.slug } },
      resCat2,
      (err) => { throw err; }
    );
    const cat2Products = extractProducts(resCat2);
    assert.ok(cat2Products.some((p) => p.slug === prod2.slug), 'Product 2 must appear in Category 2');
    assert.ok(!cat2Products.some((p) => p.slug === prod1.slug), 'Product 1 must NOT appear in Category 2');
    console.log('✓ Specific category filters work accurately without hiding items from All Categories.\n');

    // ----------------------------------------------------
    // TEST SUITE 3: DAILY MENU AVAILABILITY
    // ----------------------------------------------------
    console.log('[Test 3.1] Daily Menu: configure Monday and Tuesday independently...');
    const monday = '2026-11-23';
    const tuesday = '2026-11-24';

    // Monday: prod1 is Available, prod2 is Unavailable
    const resMonSave = createMockRes();
    await DailyMenuController.saveDailyMenu(
      {
        body: {
          date: monday,
          items: [
            { product: prod1._id.toString(), isAvailable: true },
            { product: prod2._id.toString(), isAvailable: false },
          ],
          isPublished: true,
        },
        user: { id: testUser._id.toString() },
      },
      resMonSave,
      (err) => { throw err; }
    );
    assert.strictEqual(resMonSave.statusCode, 200);

    // Tuesday: prod1 is Unavailable, prod2 is Available
    const resTueSave = createMockRes();
    await DailyMenuController.saveDailyMenu(
      {
        body: {
          date: tuesday,
          items: [
            { product: prod1._id.toString(), isAvailable: false },
            { product: prod2._id.toString(), isAvailable: true },
          ],
          isPublished: true,
        },
        user: { id: testUser._id.toString() },
      },
      resTueSave,
      (err) => { throw err; }
    );
    assert.strictEqual(resTueSave.statusCode, 200);

    // Query Monday's customer menu
    const resMonList = createMockRes();
    await ProductController.getProducts(
      { query: { date: monday } },
      resMonList,
      (err) => { throw err; }
    );
    const monList = extractProducts(resMonList);
    assert.ok(monList.some((p) => p.slug === prod1.slug), 'Prod1 must be available on Monday');
    assert.ok(!monList.some((p) => p.slug === prod2.slug), 'Prod2 must be hidden on Monday');
    console.log('✓ Monday menu shows Prod1 available and Prod2 hidden.');

    // Query Tuesday's customer menu
    const resTueList = createMockRes();
    await ProductController.getProducts(
      { query: { date: tuesday } },
      resTueList,
      (err) => { throw err; }
    );
    const tueList = extractProducts(resTueList);
    assert.ok(!tueList.some((p) => p.slug === prod1.slug), 'Prod1 must be hidden on Tuesday');
    assert.ok(tueList.some((p) => p.slug === prod2.slug), 'Prod2 must be available on Tuesday');
    console.log('✓ Tuesday menu shows Prod2 available and Prod1 hidden.');

    // Verify Monday remained unchanged
    const resMonRecheck = createMockRes();
    await DailyMenuController.getDailyMenu(
      { query: { date: monday } },
      resMonRecheck,
      (err) => { throw err; }
    );
    const monProd1 = resMonRecheck.data.data.items.find((i) => i.product.id === prod1._id.toString());
    const monProd2 = resMonRecheck.data.data.items.find((i) => i.product.id === prod2._id.toString());
    assert.strictEqual(monProd1.isAvailable, true);
    assert.strictEqual(monProd2.isAvailable, false);
    console.log('✓ Monday menu remained completely unchanged after Tuesday was configured.\n');

    // ----------------------------------------------------
    // TEST SUITE 4: CONTINUE YESTERDAY'S MENU
    // ----------------------------------------------------
    console.log('[Test 4.1] Continue Yesterday\'s Menu: Copying Tuesday to Wednesday...');
    const wednesday = '2026-11-25';

    const resWedCopy = createMockRes();
    await DailyMenuController.continueYesterday(
      {
        body: { targetDate: wednesday },
        user: { id: testUser._id.toString() },
      },
      resWedCopy,
      (err) => { throw err; }
    );
    assert.strictEqual(resWedCopy.statusCode, 200);

    const wedProd1 = resWedCopy.data.data.items.find((i) => i.product.id === prod1._id.toString());
    const wedProd2 = resWedCopy.data.data.items.find((i) => i.product.id === prod2._id.toString());
    assert.strictEqual(wedProd1.isAvailable, false, 'Wednesday prod1 should match Tuesday (false)');
    assert.strictEqual(wedProd2.isAvailable, true, 'Wednesday prod2 should match Tuesday (true)');
    console.log('✓ Wednesday copied Tuesday configuration successfully.');

    // Now modify Wednesday and verify Tuesday is untouched
    await DailyMenuController.saveDailyMenu(
      {
        body: {
          date: wednesday,
          items: [
            { product: prod1._id.toString(), isAvailable: true },
            { product: prod2._id.toString(), isAvailable: true },
          ],
          isPublished: true,
        },
        user: { id: testUser._id.toString() },
      },
      createMockRes(),
      (err) => { throw err; }
    );

    const resTueRecheck = createMockRes();
    await DailyMenuController.getDailyMenu(
      { query: { date: tuesday } },
      resTueRecheck,
      (err) => { throw err; }
    );
    const tueProd1 = resTueRecheck.data.data.items.find((i) => i.product.id === prod1._id.toString());
    assert.strictEqual(tueProd1.isAvailable, false, 'Tuesday must remain false despite Wednesday edit');
    console.log('✓ Tuesday configuration remained intact after modifying Wednesday.\n');

    // ----------------------------------------------------
    // TEST SUITE 5: WEEKLY MENU MANAGEMENT & MATRIX
    // ----------------------------------------------------
    console.log('[Test 5.1] Weekly Menu: Matrix retrieval and batch apply...');
    const weekStart = '2026-11-23'; // Monday
    const resWeekly = createMockRes();
    await DailyMenuController.getWeeklyMenu(
      { query: { startDate: weekStart } },
      resWeekly,
      (err) => { throw err; }
    );
    assert.strictEqual(resWeekly.statusCode, 200);
    assert.strictEqual(resWeekly.data.data.days.length, 7);
    console.log('✓ Weekly matrix returned 7 distinct days.');

    console.log('[Test 5.2] Apply Monday to whole week...');
    const all7Days = resWeekly.data.data.days.map((d) => d.date);
    const target6Days = all7Days.filter((d) => d !== monday);

    const resApplyWeek = createMockRes();
    await DailyMenuController.applyWeekAll(
      {
        body: { sourceDate: monday, targetDates: target6Days },
        user: { id: testUser._id.toString() },
      },
      resApplyWeek,
      (err) => { throw err; }
    );
    assert.strictEqual(resApplyWeek.statusCode, 200);

    // Verify Sunday now has Monday's configuration
    const sunday = all7Days[6];
    const resSun = createMockRes();
    await DailyMenuController.getDailyMenu(
      { query: { date: sunday } },
      resSun,
      (err) => { throw err; }
    );
    const sunProd1 = resSun.data.data.items.find((i) => i.product.id === prod1._id.toString());
    const sunProd2 = resSun.data.data.items.find((i) => i.product.id === prod2._id.toString());
    assert.strictEqual(sunProd1.isAvailable, true, 'Sunday Prod1 should be true');
    assert.strictEqual(sunProd2.isAvailable, false, 'Sunday Prod2 should be false');
    console.log('✓ Monday configuration applied across all 7 days of the week successfully.\n');

    console.log('======================================================');
    console.log(' ALL 5 TEST SUITES PASSED FLAWLESSLY!                 ');
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testAddress) await Address.deleteOne({ _id: testAddress._id });
    if (cat1) await Category.deleteOne({ _id: cat1._id });
    if (cat2) await Category.deleteOne({ _id: cat2._id });
    if (prod1) await Product.deleteOne({ _id: prod1._id });
    if (prod2) await Product.deleteOne({ _id: prod2._id });
    await DailyMenu.deleteMany({ date: { $in: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'] } });
    await mongoose.disconnect();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
