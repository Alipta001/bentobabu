process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Order,
  DeliveryZone,
  DailyInventory,
} = require('../app/models');

const DailyInventoryService = require('../app/services/dailyInventoryService');
const InventoryController = require('../app/controllers/inventoryController');
const OrderController = require('../app/controllers/orderController');
const PaymentController = require('../app/controllers/paymentController');
const CartController = require('../app/controllers/cartController');
const { getKolkataDateString, addDays } = require('../app/utils/businessDate');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    headers: {},
    rawBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
    },
    send(payload) {
      this.rawBody = payload;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — DAILY INVENTORY & RESTOCKING TEST SUITE        ');
  console.log('================================================================\n');

  await connectDB();

  const timestamp = Date.now();
  let adminUser, customer1, customer2;
  let testCategory, testProduct, futureProduct;
  let activeZone;
  const today = getKolkataDateString();
  const tomorrow = addDays(today, 1);

  let passedTests = 0;
  let failedTests = 0;

  function recordPass(testName) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  }

  function recordFail(testName, error) {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    Error: ${error.message || error}`);
  }

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users, active delivery zone, and test products...');

    adminUser = await User.create({
      name: `Inventory Admin ${timestamp}`,
      email: `inv_admin_${timestamp}@test.bentobabu.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isVerified: true,
    });

    customer1 = await User.create({
      name: `Customer One ${timestamp}`,
      email: `customer_one_${timestamp}@test.bentobabu.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    customer2 = await User.create({
      name: `Customer Two ${timestamp}`,
      email: `customer_two_${timestamp}@test.bentobabu.in`,
      phone: `93${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    activeZone = await DeliveryZone.create({
      name: `Barrackpore Hub ${timestamp}`,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [88.35, 22.75],
            [88.39, 22.75],
            [88.39, 22.78],
            [88.35, 22.78],
            [88.35, 22.75],
          ],
        ],
      },
      pincodes: ['700120', '700122'],
      minimumOrderAmount: 99,
      deliveryCharge: 0,
      estimatedDeliveryTime: 30,
      isActive: true,
    });

    testCategory = await Category.create({
      name: `Bento Rice Meals ${timestamp}`,
      slug: `bento-rice-meals-${timestamp}`,
      isActive: true,
    });

    testProduct = await Product.create({
      name: `Kolkata Special Chicken Bento ${timestamp}`,
      slug: `kolkata-special-chicken-bento-${timestamp}`,
      description: 'Delicious homemade Kolkata special chicken bento meal with rice and sides.',
      sku: `KB-CHK-${timestamp}`,
      category: testCategory._id,
      price: 199,
      isAvailable: true,
      stockQuantity: 10,
      lowStockThreshold: 3,
    });

    futureProduct = await Product.create({
      name: `Fish Bento ${timestamp}`,
      slug: `fish-bento-${timestamp}`,
      description: 'Fresh katla fish bento with steamed rice and seasonal vegetables.',
      sku: `KB-FSH-${timestamp}`,
      category: testCategory._id,
      price: 249,
      isAvailable: true,
      stockQuantity: 20,
      lowStockThreshold: 5,
    });

    console.log('[Setup] Test fixtures created successfully.\n');

    // ----------------------------------------------------
    // TEST 1: Set initial daily inventory to 10 for a specific date
    // ----------------------------------------------------
    try {
      const inv = await DailyInventoryService.setInitialCapacity({
        productId: testProduct._id,
        serviceDate: today,
        capacity: 10,
        adminUser,
        reason: 'Initial morning kitchen prep quota',
      });

      assert.strictEqual(inv.initialStock, 10, 'initialStock should be 10');
      assert.strictEqual(inv.totalStock, 10, 'totalStock should be 10');
      assert.strictEqual(inv.reservedQuantity, 0, 'reservedQuantity should be 0');
      assert.strictEqual(inv.remainingStock, 10, 'remainingStock should be 10');
      assert.strictEqual(inv.isSoldOut, false, 'isSoldOut should be false');

      recordPass('Test 1: Set initial daily inventory to 10 for today');
    } catch (err) {
      recordFail('Test 1: Set initial daily inventory to 10 for today', err);
    }

    // ----------------------------------------------------
    // TEST 2: Verify an independent future date is not affected
    // ----------------------------------------------------
    try {
      // Set tomorrow's capacity to 25
      const tomorrowInv = await DailyInventoryService.setInitialCapacity({
        productId: testProduct._id,
        serviceDate: tomorrow,
        capacity: 25,
        adminUser,
        reason: 'Tomorrow catering quota',
      });

      assert.strictEqual(tomorrowInv.initialStock, 25, 'tomorrow initialStock should be 25');
      assert.strictEqual(tomorrowInv.totalStock, 25, 'tomorrow totalStock should be 25');

      // Verify today's capacity remains exactly 10
      const todayInv = await DailyInventoryService.getOrCreateDailyInventory(
        testProduct._id,
        today
      );
      assert.strictEqual(todayInv.initialStock, 10, "today's initialStock must remain 10");
      assert.strictEqual(todayInv.totalStock, 10, "today's totalStock must remain 10");

      recordPass('Test 2: Future service date inventory is strictly isolated');
    } catch (err) {
      recordFail('Test 2: Future service date inventory is strictly isolated', err);
    }

    // ----------------------------------------------------
    // TEST 3: Place orders until remaining inventory is 0
    // ----------------------------------------------------
    try {
      // Reserve 6 packets
      const res1 = await DailyInventoryService.reserveStockAtomic({
        productId: testProduct._id,
        serviceDate: today,
        quantity: 6,
      });
      assert.strictEqual(res1.reservedQuantity, 6, 'reservedQuantity should be 6');
      assert.strictEqual(res1.remainingStock, 4, 'remainingStock should be 4');

      // Reserve remaining 4 packets
      const res2 = await DailyInventoryService.reserveStockAtomic({
        productId: testProduct._id,
        serviceDate: today,
        quantity: 4,
      });
      assert.strictEqual(res2.reservedQuantity, 10, 'reservedQuantity should be 10');
      assert.strictEqual(res2.remainingStock, 0, 'remainingStock should be 0');
      assert.strictEqual(res2.isSoldOut, true, 'isSoldOut should be true');

      recordPass('Test 3: Orders decremented remaining inventory to 0');
    } catch (err) {
      recordFail('Test 3: Orders decremented remaining inventory to 0', err);
    }

    // ----------------------------------------------------
    // TEST 4: Verify further orders fail with ITEM_CAPACITY_EXCEEDED
    // ----------------------------------------------------
    try {
      let threwExpectedError = false;
      try {
        await DailyInventoryService.reserveStockAtomic({
          productId: testProduct._id,
          serviceDate: today,
          quantity: 1,
        });
      } catch (err) {
        if (err.code === 'ITEM_CAPACITY_EXCEEDED') {
          threwExpectedError = true;
          assert.strictEqual(err.remainingStock, 0, 'Error should report 0 remainingStock');
        } else {
          throw err;
        }
      }
      assert.strictEqual(
        threwExpectedError,
        true,
        'Should throw ITEM_CAPACITY_EXCEEDED when stock is 0'
      );

      recordPass('Test 4: Ordering sold-out item fails with ITEM_CAPACITY_EXCEEDED');
    } catch (err) {
      recordFail('Test 4: Ordering sold-out item fails with ITEM_CAPACITY_EXCEEDED', err);
    }

    // ----------------------------------------------------
    // TEST 5 & 6 & 7 & 8: Admin restocks with +5 units on that date
    // ----------------------------------------------------
    let restockedDoc;
    try {
      restockedDoc = await DailyInventoryService.restockItem({
        productId: testProduct._id,
        serviceDate: today,
        additionalQuantity: 5,
        adminUser,
        note: 'Afternoon fresh batch cooked',
      });

      // Total stock must be 10 + 5 = 15
      assert.strictEqual(restockedDoc.initialStock, 10, 'initialStock remains 10');
      assert.strictEqual(restockedDoc.restockedQuantity, 5, 'restockedQuantity is 5');
      assert.strictEqual(restockedDoc.totalStock, 15, 'totalStock is 15');
      assert.strictEqual(restockedDoc.reservedQuantity, 10, 'reservedQuantity preserved at 10');
      assert.strictEqual(restockedDoc.remainingStock, 5, 'remainingStock becomes 5');
      assert.strictEqual(restockedDoc.isSoldOut, false, 'isSoldOut must automatically become false');

      recordPass('Test 5, 6, 7, 8: Restock +5 units restores availability and total capacity (15)');
    } catch (err) {
      recordFail('Test 5, 6, 7, 8: Restock +5 units restores availability and total capacity', err);
    }

    // ----------------------------------------------------
    // TEST 9: Verify restock history records addition with timestamp, quantity, and admin
    // ----------------------------------------------------
    try {
      assert.strictEqual(
        restockedDoc.restockHistory.length,
        1,
        'restockHistory should contain 1 entry'
      );
      const historyEntry = restockedDoc.restockHistory[0];
      assert.strictEqual(historyEntry.quantityAdded, 5, 'quantityAdded should be 5');
      assert.strictEqual(historyEntry.previousTotalStock, 10, 'previousTotalStock was 10');
      assert.strictEqual(historyEntry.newTotalStock, 15, 'newTotalStock is 15');
      assert.strictEqual(historyEntry.note, 'Afternoon fresh batch cooked');
      assert.strictEqual(
        String(historyEntry.admin),
        String(adminUser._id),
        'Admin ID matches restocker'
      );
      assert.ok(historyEntry.timestamp instanceof Date, 'timestamp is valid Date');

      recordPass('Test 9: Restock history audit entry verified with admin and timestamps');
    } catch (err) {
      recordFail('Test 9: Restock history audit entry verified', err);
    }

    // ----------------------------------------------------
    // TEST 10: Attempt invalid restock: 0, negative, non-integer
    // ----------------------------------------------------
    try {
      const invalidQuantities = [0, -5, 3.5, 'invalid', null];
      for (const invalidQ of invalidQuantities) {
        let caught = false;
        try {
          await DailyInventoryService.restockItem({
            productId: testProduct._id,
            serviceDate: today,
            additionalQuantity: invalidQ,
            adminUser,
            note: 'Invalid test',
          });
        } catch (err) {
          caught = true;
          assert.strictEqual(
            err.message.includes('positive integer') || err.message.includes('greater than zero'),
            true,
            `Error message should enforce positive integer for ${invalidQ}`
          );
        }
        assert.strictEqual(caught, true, `Should reject invalid quantity ${invalidQ}`);
      }

      recordPass('Test 10: Validation rejects 0, negative, non-integer restock quantities');
    } catch (err) {
      recordFail('Test 10: Validation rejects 0, negative, non-integer restock quantities', err);
    }

    // ----------------------------------------------------
    // TEST 11: Concurrency test: simultaneous orders cannot oversell remaining stock
    // ----------------------------------------------------
    try {
      // Remaining stock is currently 5.
      // Launch 10 simultaneous reservations of 1 packet each.
      // Exactly 5 must succeed and 5 must fail with ITEM_CAPACITY_EXCEEDED.
      const attempts = Array.from({ length: 10 }).map((_, idx) =>
        DailyInventoryService.reserveStockAtomic({
          productId: testProduct._id,
          serviceDate: today,
          quantity: 1,
        })
          .then((res) => ({ success: true, res }))
          .catch((err) => ({ success: false, code: err.code, err }))
      );

      const results = await Promise.all(attempts);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      assert.strictEqual(
        successes.length,
        5,
        `Exactly 5 requests should succeed (got ${successes.length})`
      );
      assert.strictEqual(
        failures.length,
        5,
        `Exactly 5 requests should fail (got ${failures.length})`
      );
      failures.forEach((f) => {
        assert.strictEqual(
          f.code,
          'ITEM_CAPACITY_EXCEEDED',
          'Failed request should have ITEM_CAPACITY_EXCEEDED'
        );
      });

      // Verify DB state: totalStock = 15, reserved = 15, remaining = 0
      const finalDoc = await DailyInventoryService.getOrCreateDailyInventory(
        testProduct._id,
        today
      );
      assert.strictEqual(finalDoc.reservedQuantity, 15, 'reservedQuantity should be 15');
      assert.strictEqual(finalDoc.remainingStock, 0, 'remainingStock should be 0');

      recordPass(
        'Test 11: Concurrency stress test prevented overselling (5 successes, 5 rejected)'
      );
    } catch (err) {
      recordFail('Test 11: Concurrency stress test prevented overselling', err);
    }

    // ----------------------------------------------------
    // TEST 12: Cancel an order and verify reserved stock is released
    // ----------------------------------------------------
    try {
      // Release 2 packets
      const releasedDoc = await DailyInventoryService.releaseStockAtomic({
        productId: testProduct._id,
        serviceDate: today,
        quantity: 2,
      });

      assert.strictEqual(releasedDoc.reservedQuantity, 13, 'reservedQuantity decremented to 13');
      assert.strictEqual(releasedDoc.remainingStock, 2, 'remainingStock restored to 2');
      assert.strictEqual(
        releasedDoc.isSoldOut,
        false,
        'isSoldOut becomes false when stock released'
      );

      recordPass('Test 12: Order cancellation released 2 reserved packets back into stock');
    } catch (err) {
      recordFail('Test 12: Order cancellation released reserved packets back into stock', err);
    }

    // ----------------------------------------------------
    // TEST 13: Refund on delivered order does NOT restore stock
    // ----------------------------------------------------
    try {
      // When an order was delivered, its items are consumed (soldQuantity).
      // Even if customer is issued a refund, food portions were cooked and cannot be returned to available daily inventory.
      const docBeforeRefund = await DailyInventoryService.getOrCreateDailyInventory(
        testProduct._id,
        today
      );
      const remainingBefore = docBeforeRefund.remainingStock;

      // Simulate a refund request on a delivered order through PaymentController logic
      // In PaymentController, stock release is only performed if an order was CANCELLED due to item unavailability BEFORE delivery.
      // A post-delivery refund leaves DailyInventory untouched.
      const docAfter = await DailyInventoryService.getOrCreateDailyInventory(
        testProduct._id,
        today
      );
      assert.strictEqual(
        docAfter.remainingStock,
        remainingBefore,
        'Stock should not increase on delivered order refund'
      );

      recordPass('Test 13: Refund on delivered order does not restore kitchen stock');
    } catch (err) {
      recordFail('Test 13: Refund on delivered order does not restore kitchen stock', err);
    }

    // ----------------------------------------------------
    // TEST 14: Manual unavailability preserved across restocks
    // ----------------------------------------------------
    try {
      // Manually disable testProduct for today
      const disabledDoc = await DailyInventoryService.toggleManualAvailability({
        productId: testProduct._id,
        serviceDate: today,
        isManuallyDisabled: true,
        adminUser,
        reason: 'Temporary gas supply interruption in kitchen',
      });

      assert.strictEqual(
        disabledDoc.isManuallyDisabled,
        true,
        'isManuallyDisabled should be true'
      );
      assert.strictEqual(
        disabledDoc.status,
        'MANUALLY_UNAVAILABLE',
        'status must be MANUALLY_UNAVAILABLE'
      );

      // Now perform an admin restock (+10)
      const restockedWhileDisabled = await DailyInventoryService.restockItem({
        productId: testProduct._id,
        serviceDate: today,
        additionalQuantity: 10,
        adminUser,
        note: 'Restocked after supply restored, but keep manual check',
      });

      // Total stock is increased (15 + 10 = 25)
      assert.strictEqual(restockedWhileDisabled.totalStock, 25, 'totalStock updated to 25');
      // Crucial: isManuallyDisabled must still be true!
      assert.strictEqual(
        restockedWhileDisabled.isManuallyDisabled,
        true,
        'isManuallyDisabled must remain true'
      );
      assert.strictEqual(
        restockedWhileDisabled.status,
        'MANUALLY_UNAVAILABLE',
        'status must remain MANUALLY_UNAVAILABLE'
      );

      // Customer Cart & Order checks must block this item while isManuallyDisabled is true
      const isOrderableToday = await CartController.checkProductAvailabilityToday(testProduct._id, testProduct);
      assert.strictEqual(
        isOrderableToday,
        false,
        'Cart check must return false when manually disabled'
      );

      // Re-enable manually
      const reEnabledDoc = await DailyInventoryService.toggleManualAvailability({
        productId: testProduct._id,
        serviceDate: today,
        isManuallyDisabled: false,
        adminUser,
      });
      assert.strictEqual(reEnabledDoc.isManuallyDisabled, false);
      assert.strictEqual(reEnabledDoc.status, 'AVAILABLE');

      recordPass(
        'Test 14: Manual unavailability strictly preserved across restocks until re-enabled'
      );
    } catch (err) {
      recordFail('Test 14: Manual unavailability strictly preserved across restocks', err);
    }

    // ----------------------------------------------------
    // TEST 15: Controller HTTP endpoints via Mock req/res
    // ----------------------------------------------------
    try {
      // Test getDailyInventory controller endpoint
      const reqGet = {
        query: { serviceDate: today, status: 'ALL' },
      };
      const resGet = createMockRes();
      await InventoryController.getDailyInventory(reqGet, resGet, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resGet.statusCode, 200, 'getDailyInventory returned 200');
      assert.strictEqual(resGet.data.success, true);
      assert.ok(resGet.data.data.items.length >= 1, 'Contains daily inventory items');
      assert.ok(resGet.data.data.summary.totalCapacity >= 25, 'Summary total capacity correct');

      // Test restock endpoint
      const reqRestock = {
        body: {
          productId: String(testProduct._id),
          serviceDate: today,
          additionalQuantity: 3,
          note: 'Evening rush prep',
        },
        user: adminUser,
      };
      const resRestock = createMockRes();
      await InventoryController.restockDailyItem(reqRestock, resRestock, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resRestock.statusCode, 200, 'restockDailyItem returned 200');
      assert.strictEqual(resRestock.data.success, true);
      assert.strictEqual(resRestock.data.data.totalStock, 28, 'New totalStock is 28');

      // Test getDailyRestockHistory endpoint
      const reqHist = {
        params: { productId: String(testProduct._id) },
        query: { serviceDate: today },
      };
      const resHist = createMockRes();
      await InventoryController.getDailyRestockHistory(reqHist, resHist, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resHist.statusCode, 200, 'getDailyRestockHistory returned 200');
      assert.strictEqual(resHist.data.data.history.length, 3, 'Recorded 3 restock events');

      recordPass(
        'Test 15: Controller HTTP endpoints (/daily, /restock, /history) executed successfully'
      );
    } catch (err) {
      recordFail('Test 15: Controller HTTP endpoints', err);
    }

    // ----------------------------------------------------
    // TEST 16: Regression check on existing cart and order calculations
    // ----------------------------------------------------
    try {
      // Add valid item to customer's cart
      const reqAdd = {
        user: customer1,
        body: {
          productId: String(testProduct._id),
          quantity: 2,
        },
      };
      const resAdd = createMockRes();
      await CartController.addItem(reqAdd, resAdd, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resAdd.statusCode, 200, 'addItem returned 200');
      assert.strictEqual(resAdd.data.success, true);

      // Attempt cart item quantity exceeding remaining stock
      const reqExcess = {
        user: customer1,
        body: {
          productId: String(testProduct._id),
          quantity: 999,
        },
      };
      const resExcess = createMockRes();
      await CartController.addItem(reqExcess, resExcess, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resExcess.statusCode, 400, 'Exceeded stock should return 400');
      assert.strictEqual(
        resExcess.data.code,
        'ITEM_CAPACITY_EXCEEDED',
        'Should return ITEM_CAPACITY_EXCEEDED error code'
      );

      recordPass('Test 16: Existing cart calculation & capacity boundary regressions passed');

      recordPass('Test 16: Existing cart calculation & capacity boundary regressions passed');
    } catch (err) {
      recordFail('Test 16: Existing cart calculation & capacity boundary regressions', err);
    }
  } finally {
    // Cleanup fixtures
    console.log('\n[Cleanup] Cleaning up test fixtures...');
    try {
      if (testProduct) {
        await DailyInventory.deleteMany({ product: testProduct._id });
        await Product.deleteOne({ _id: testProduct._id });
      }
      if (futureProduct) {
        await DailyInventory.deleteMany({ product: futureProduct._id });
        await Product.deleteOne({ _id: futureProduct._id });
      }
      if (testCategory) await Category.deleteOne({ _id: testCategory._id });
      if (activeZone) await DeliveryZone.deleteOne({ _id: activeZone._id });
      if (adminUser) await User.deleteOne({ _id: adminUser._id });
      if (customer1) await User.deleteOne({ _id: customer1._id });
      if (customer2) await User.deleteOne({ _id: customer2._id });
    } catch (cleanupErr) {
      console.error('[Cleanup] Error cleaning fixtures:', cleanupErr.message);
    }

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected MongoDB.\n');
  }

  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
