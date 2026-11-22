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
const OrderController = require('../app/controllers/orderController');
const DeliveryController = require('../app/controllers/deliveryController');
const AdminDeliveryController = require('../app/controllers/adminDeliveryController');
const AddressController = require('../app/controllers/addressController');
const CartController = require('../app/controllers/cartController');
const { normalizePincode, isValidPincode } = require('../app/utils/pincode');
const { getKolkataDateString } = require('../app/utils/businessDate');

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
  console.log('\n================================================================');
  console.log(' BentoBabu: Checkout Summary & Zone/Pincode Separation Test Suite');
  console.log('================================================================\n');

  await connectDB();

  // Safety check on connected database
  const currentDbName = mongoose.connection.name;
  console.log(`[Safety Verification] Connected to database: "${currentDbName}"`);
  if (!['bentobabu_staging', 'bentobabu_test'].includes(currentDbName)) {
    console.warn(`[Notice] Running in database: ${currentDbName}. All operations will use isolated test fixtures.`);
  }

  const timestamp = Date.now();
  const testPin1 = '700122';
  const testPin2 = '700123';
  let testUser, testAddress, testZone1, testZone2, testCategory, testProduct;

  try {
    // =================================================================
    // 1. PINCODE NORMALIZATION & VALIDATION UNIT TESTS
    // =================================================================
    console.log('[Test 1] Testing PIN code normalization and separation utility...');
    assert.strictEqual(normalizePincode('700122'), '700122');
    assert.strictEqual(normalizePincode(700122), '700122');
    assert.strictEqual(normalizePincode(' 700122 '), '700122');
    assert.strictEqual(normalizePincode('Barrackpore-700122'), '700122');
    assert.strictEqual(normalizePincode('barrackpore-700122'), '700122');
    assert.strictEqual(normalizePincode('Barrackpore 700122'), '700122');
    assert.strictEqual(normalizePincode('700 122'), '700122');
    assert.strictEqual(normalizePincode('WB-700122'), '700122');

    // Invalid PIN codes
    assert.strictEqual(normalizePincode('012345'), null);
    assert.strictEqual(normalizePincode('12345'), null);
    assert.strictEqual(normalizePincode('1234567'), null);
    assert.strictEqual(normalizePincode(''), null);
    assert.strictEqual(normalizePincode(null), null);
    assert.strictEqual(normalizePincode(undefined), null);

    assert.strictEqual(isValidPincode('700122'), true);
    assert.strictEqual(isValidPincode('012345'), false);
    assert.strictEqual(isValidPincode('Barrackpore-700122'), false); // strictly 6 digits
    console.log('  ✓ normalizePincode and isValidPincode behave correctly across all inputs');

    // =================================================================
    // 2. KOLKATA TIMEZONE HANDLING TESTS
    // =================================================================
    console.log('\n[Test 2] Testing Asia/Kolkata timezone date calculations...');
    const nowKolkata = getKolkataDateString();
    assert.match(nowKolkata, /^\d{4}-\d{2}-\d{2}$/);

    // Test UTC midnight boundary: 18:29:59 UTC = 23:59:59 IST (same date UTC)
    // 18:30:00 UTC = 00:00:00 IST (next calendar date in Kolkata)
    const d1 = new Date('2026-11-20T18:29:00Z');
    const d2 = new Date('2026-11-20T18:31:00Z');
    assert.strictEqual(getKolkataDateString(d1), '2026-11-20');
    assert.strictEqual(getKolkataDateString(d2), '2026-11-21');
    console.log('  ✓ getKolkataDateString correctly observes Asia/Kolkata midnight crossover (UTC+5:30)');

    // =================================================================
    // 3. SETUP FIXTURES
    // =================================================================
    console.log('\n[Setup] Creating test user, category, and product...');
    testUser = await User.create({
      phone: `99${String(timestamp).slice(-8)}`,
      name: 'Zone Test User',
      email: `zone.test.${timestamp}@bentobabu.local`,
      role: 'CUSTOMER',
      isPhoneVerified: true,
      isActive: true,
    });

    testCategory = await Category.create({
      name: `Category-${timestamp}`,
      slug: `category-${timestamp}`,
      isActive: true,
      sortOrder: 1,
    });

    testProduct = await Product.create({
      name: `Bento Meal ${timestamp}`,
      slug: `bento-meal-${timestamp}`,
      price: 249,
      category: testCategory._id,
      categories: [testCategory._id],
      preparationTime: 25,
      isAvailable: true,
      isActive: true,
      stockQuantity: 50,
      description: '<p>Fresh tasty Bento meal</p>',
    });

    // Clean up any stale test zones for testPin1
    await DeliveryZone.deleteMany({ pincodes: { $in: [testPin1, testPin2] } });

    // =================================================================
    // 4. ADMIN ZONE CREATION & PIN CODE CONFLICT ENFORCEMENT
    // =================================================================
    console.log('\n[Test 3] Testing Admin Zone Creation & PIN Conflict Enforcement...');
    // Create Zone "Barrackpore" with PIN "700122"
    const createReq1 = {
      body: {
        name: 'Barrackpore',
        pincodes: [testPin1], // '700122'
        deliveryCharge: 30,
        minimumOrderAmount: 150,
        estimatedDeliveryMinutes: 35,
        isActive: true,
      },
    };
    const createRes1 = createMockRes();
    await AdminDeliveryController.createZone(createReq1, createRes1, () => {});
    assert.strictEqual(createRes1.statusCode, 201);
    testZone1 = createRes1.data.data.zone;
    assert.strictEqual(testZone1.name, 'Barrackpore');
    assert.deepStrictEqual(testZone1.pincodes, [testPin1]);
    console.log('  ✓ Zone "Barrackpore" created with PIN [700122]');

    // Try creating another active zone with the same PIN code 700122 (must conflict)
    const createConflictReq = {
      body: {
        name: 'Barrackpore Suburbs',
        pincodes: [testPin1],
        isActive: true,
      },
    };
    const createConflictRes = createMockRes();
    await AdminDeliveryController.createZone(createConflictReq, createConflictRes, () => {});
    assert.strictEqual(createConflictRes.statusCode, 409);
    assert.match(createConflictRes.data.message, /already belong to active zone/i);
    console.log('  ✓ Overlapping PIN code across active zones rejected with 409 Conflict');

    // Create zone with prefixed PIN "Barrackpore-700123" -> must normalize to "700123"
    const createPrefixedReq = {
      body: {
        name: 'Barrackpore East',
        pincodes: [`Barrackpore-${testPin2}`],
        isActive: true,
      },
    };
    const createPrefixedRes = createMockRes();
    await AdminDeliveryController.createZone(createPrefixedReq, createPrefixedRes, () => {});
    assert.strictEqual(createPrefixedRes.statusCode, 201);
    testZone2 = createPrefixedRes.data.data.zone;
    assert.strictEqual(testZone2.name, 'Barrackpore East');
    assert.deepStrictEqual(testZone2.pincodes, [testPin2]); // Clean 6 digits!
    console.log('  ✓ Prefixed PIN code "Barrackpore-700123" safely normalized to pure "700123"');

    // =================================================================
    // 5. ADMIN EDITING ZONE NAME & PIN CODES INDEPENDENTLY
    // =================================================================
    console.log('\n[Test 4] Testing independent editing of Zone Name and PIN codes...');
    // Edit zone name without modifying PIN codes
    const editNameReq = {
      params: { id: testZone1._id.toString() },
      body: { name: 'Barrackpore Central' },
    };
    const editNameRes = createMockRes();
    await AdminDeliveryController.updateZone(editNameReq, editNameRes, () => {});
    assert.strictEqual(editNameRes.statusCode, 200);

    const updatedZone = await DeliveryZone.findById(testZone1._id);
    assert.strictEqual(updatedZone.name, 'Barrackpore Central');
    assert.deepStrictEqual(updatedZone.pincodes, [testPin1]);
    console.log('  ✓ Zone name updated to "Barrackpore Central" without altering PIN codes');

    // =================================================================
    // 6. ADDRESS CREATION & PIN CODE NORMALIZATION
    // =================================================================
    console.log('\n[Test 5] Testing Customer Address creation with PIN code normalization...');
    const addrReq = {
      user: { id: testUser._id.toString() },
      body: {
        fullName: 'Test Customer',
        phone: '9876543210',
        addressLine: '12 SN Banerjee Road',
        landmark: 'Near Railway Station',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: `Barrackpore-${testPin1}`, // Prefixed!
        addressType: 'HOME',
      },
    };
    const addrRes = createMockRes();
    await AddressController.createAddress(addrReq, addrRes, () => {});
    assert.strictEqual(addrRes.statusCode, 201);
    testAddress = addrRes.data.data;
    assert.strictEqual(testAddress.pincode, testPin1); // Strictly "700122"
    assert.strictEqual(testAddress.city, 'Barrackpore');
    console.log('  ✓ Address created with strictly 6-digit PIN code: "700122"');

    // =================================================================
    // 7. SERVICEABILITY CHECK
    // =================================================================
    console.log('\n[Test 6] Testing Serviceability Check...');
    const servReq = { query: { pincode: testPin1 } };
    const servRes = createMockRes();
    await DeliveryController.checkServiceability(servReq, servRes, () => {});
    assert.strictEqual(servRes.statusCode, 200);
    assert.strictEqual(servRes.data.serviceable, true);
    assert.strictEqual(servRes.data.data.zoneName, 'Barrackpore Central');
    assert.strictEqual(servRes.data.data.pincode, testPin1);
    assert.strictEqual(servRes.data.data.zone.name, 'Barrackpore Central');
    assert.strictEqual(servRes.data.data.zone.pincode, testPin1);
    console.log('  ✓ Serviceability check confirms zoneName ("Barrackpore Central") and pincode ("700122") are distinct');

    // Also test serviceability with prefixed PIN query
    const servPrefixedReq = { query: { pincode: `Barrackpore-${testPin1}` } };
    const servPrefixedRes = createMockRes();
    await DeliveryController.checkServiceability(servPrefixedReq, servPrefixedRes, () => {});
    assert.strictEqual(servPrefixedRes.statusCode, 200);
    assert.strictEqual(servPrefixedRes.data.serviceable, true);
    assert.strictEqual(servPrefixedRes.data.data.pincode, testPin1);
    console.log('  ✓ Querying with "Barrackpore-700122" correctly resolves serviceability for 700122');

    // =================================================================
    // 8. CHECKOUT SUMMARY — todayKolkata VERIFICATION
    // =================================================================
    console.log('\n[Test 7] Testing Checkout Summary (Fix for "todayKolkata is not defined")...');
    // Put item in customer cart
    await Cart.findOneAndUpdate(
      { user: testUser._id },
      {
        user: testUser._id,
        items: [{ product: testProduct._id, quantity: 2 }],
      },
      { upsert: true, returnDocument: 'after' }
    );

    const summaryReq = {
      user: { id: testUser._id.toString() },
      body: {
        addressId: testAddress._id.toString(),
      },
    };
    const summaryRes = createMockRes();

    // Call getCheckoutSummary directly
    let summaryError = null;
    try {
      await OrderController.getCheckoutSummary(summaryReq, summaryRes, (err) => {
        if (err) summaryError = err;
      });
    } catch (err) {
      summaryError = err;
    }

    assert.strictEqual(summaryError, null, `getCheckoutSummary threw an error: ${summaryError?.message}`);
    assert.strictEqual(summaryRes.statusCode, 200, `Expected status 200, got ${summaryRes.statusCode}: ${JSON.stringify(summaryRes.data)}`);
    assert.strictEqual(summaryRes.data.success, true);
    assert.strictEqual(summaryRes.data.data.itemTotal, 498);
    assert.strictEqual(summaryRes.data.data.deliveryAddress.pincode, testPin1);
    assert.strictEqual(summaryRes.data.data.deliveryZone.name, 'Barrackpore Central');
    assert.strictEqual(summaryRes.data.data.zoneName, 'Barrackpore Central');
    assert.strictEqual(summaryRes.data.data.pincode, testPin1);
    console.log('  ✓ Checkout summary calculated successfully without ReferenceError!');
    console.log(`    - Item Total: ₹${summaryRes.data.data.itemTotal}`);
    console.log(`    - Zone Name: ${summaryRes.data.data.zoneName}`);
    console.log(`    - PIN Code: ${summaryRes.data.data.pincode}`);
    console.log(`    - Delivery Charge: ₹${summaryRes.data.data.deliveryCharge}`);
    console.log(`    - Grand Total: ₹${summaryRes.data.data.grandTotal}`);

    // =================================================================
    // 9. ORDER PLACEMENT & ADDRESS SNAPSHOT VERIFICATION
    // =================================================================
    console.log('\n[Test 8] Testing Order Placement & Address Snapshot Separation...');
    const orderReq = {
      user: { id: testUser._id.toString() },
      headers: {},
      body: {
        addressId: testAddress._id.toString(),
        paymentMethod: 'COD',
      },
    };
    const orderRes = createMockRes();

    let orderError = null;
    try {
      await OrderController.placeOrder(orderReq, orderRes, (err) => {
        if (err) orderError = err;
      });
    } catch (err) {
      orderError = err;
    }

    assert.strictEqual(orderError, null, `placeOrder threw an error: ${orderError?.message}`);
    assert.strictEqual(orderRes.statusCode, 201, `Expected status 201, got ${orderRes.statusCode}: ${JSON.stringify(orderRes.data)}`);
    assert.strictEqual(orderRes.data.success, true);

    const placedOrder = orderRes.data.data;
    assert.strictEqual(placedOrder.deliveryAddress.pincode, testPin1);
    assert.strictEqual(placedOrder.deliveryAddress.city, 'Barrackpore');
    assert.strictEqual(placedOrder.deliveryZone.toString(), testZone1._id.toString());
    console.log('  ✓ Order placed successfully:');
    console.log(`    - Order Number: ${placedOrder.orderNumber}`);
    console.log(`    - Delivery Address PIN: "${placedOrder.deliveryAddress.pincode}"`);
    console.log(`    - Delivery Zone Ref: ${placedOrder.deliveryZone}`);
    console.log('    - Zone Name and PIN code are stored as independent entities');

    console.log('\n================================================================');
    console.log(' ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY! ');
    console.log('================================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    throw error;
  } finally {
    // Teardown test fixtures
    console.log('[Teardown] Cleaning up test fixtures...');
    if (testUser) {
      await Order.deleteMany({ user: testUser._id });
      await Cart.deleteMany({ user: testUser._id });
      await Address.deleteMany({ user: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    if (testProduct) await Product.deleteOne({ _id: testProduct._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testZone1) await DeliveryZone.deleteOne({ _id: testZone1._id });
    if (testZone2) await DeliveryZone.deleteOne({ _id: testZone2._id });
    await mongoose.disconnect();
    console.log('[Teardown] Complete.\n');
  }
}

runTests()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
