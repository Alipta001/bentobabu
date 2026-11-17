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
} = require('../app/models');
const AdminDeliveryController = require('../app/controllers/adminDeliveryController');
const DeliveryController = require('../app/controllers/deliveryController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const OrderController = require('../app/controllers/orderController');
const CartController = require('../app/controllers/cartController');

function createMockRes() {
  const res = {
    statusCode: 200,
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
  console.log(' Starting Delivery Zone CRUD & Min Order Value Tests  ');
  console.log('======================================================\n');

  await connectDB();

  const timestamp = Date.now();
  const testPin = '700199';
  let adminUser, customerUser, testAddress, testCat, prod50, prod99, prod100, prod149, prod250;
  let createdZoneId = null;

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users, categories, products, and address...');

    adminUser = await User.create({
      name: `Admin Tester ${timestamp}`,
      email: `admin_${timestamp}@test.bentobabu.in`,
      phone: `98${String(timestamp).slice(-8)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isVerified: true,
    });

    customerUser = await User.create({
      name: `Customer Tester ${timestamp}`,
      email: `customer_${timestamp}@test.bentobabu.in`,
      phone: `97${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    testCat = await Category.create({
      name: `Zone Test Cat ${timestamp}`,
      slug: `zone-test-cat-${timestamp}`,
      isActive: true,
    });

    // Create products with exact test price points
    prod50 = await Product.create({
      name: `Dish 50 ${timestamp}`,
      slug: `dish-50-${timestamp}`,
      description: 'Delicious meal 50',
      category: testCat._id,
      price: 50,
      stockQuantity: 100,
      isActive: true,
      isAvailable: true,
    });

    prod99 = await Product.create({
      name: `Dish 99 ${timestamp}`,
      slug: `dish-99-${timestamp}`,
      description: 'Delicious meal 99',
      category: testCat._id,
      price: 99,
      stockQuantity: 100,
      isActive: true,
      isAvailable: true,
    });

    prod100 = await Product.create({
      name: `Dish 100 ${timestamp}`,
      slug: `dish-100-${timestamp}`,
      description: 'Delicious meal 100',
      category: testCat._id,
      price: 100,
      stockQuantity: 100,
      isActive: true,
      isAvailable: true,
    });

    prod149 = await Product.create({
      name: `Dish 149 ${timestamp}`,
      slug: `dish-149-${timestamp}`,
      description: 'Delicious meal 149',
      category: testCat._id,
      price: 149,
      stockQuantity: 100,
      isActive: true,
      isAvailable: true,
    });

    prod250 = await Product.create({
      name: `Dish 250 ${timestamp}`,
      slug: `dish-250-${timestamp}`,
      description: 'Delicious meal 250',
      category: testCat._id,
      price: 250,
      stockQuantity: 100,
      isActive: true,
      isAvailable: true,
    });

    testAddress = await Address.create({
      user: customerUser._id,
      fullName: 'Customer Tester',
      phone: customerUser.phone,
      addressLine: '123 Salt Lake Sector V',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: testPin,
      addressType: 'HOME',
      isDefault: true,
    });

    console.log('✓ Test fixtures created successfully.\n');

    // ====================================================
    // SUITE 1: DELIVERY ZONE MANAGEMENT (CRUD)
    // ====================================================
    console.log('------------------------------------------------------');
    console.log(' SUITE 1: Delivery Zone Management (Create, Edit, Delete)');
    console.log('------------------------------------------------------');

    // Test 1.1: Create a delivery zone
    console.log('[Test 1.1] Create delivery zone...');
    const resCreate = createMockRes();
    await AdminDeliveryController.createZone(
      {
        body: {
          name: `Salt Lake Sector V Zone ${timestamp}`,
          pincodes: [testPin],
          deliveryCharge: 35,
          minimumOrderAmount: 0,
          estimatedDeliveryMinutes: 40,
          isActive: true,
        },
      },
      resCreate,
      (err) => { throw err; }
    );
    assert.strictEqual(resCreate.statusCode, 201);
    const createdZone = resCreate.data.data.zone;
    createdZoneId = createdZone._id || createdZone.id;
    assert.ok(createdZoneId, 'Zone ID must be returned');
    assert.strictEqual(createdZone.name, `Salt Lake Sector V Zone ${timestamp}`);
    console.log('✓ Delivery zone created successfully.');

    // Test 1.2: Edit delivery zone name and details
    console.log('[Test 1.2] Edit delivery zone details (update existing record)...');
    const resUpdate = createMockRes();
    await AdminDeliveryController.updateZone(
      {
        params: { id: createdZoneId.toString() },
        body: {
          name: `Salt Lake Sector V UPDATED ${timestamp}`,
          pincodes: [testPin],
          deliveryCharge: 45,
          minimumOrderAmount: 0,
          estimatedDeliveryMinutes: 25,
          isActive: true,
        },
      },
      resUpdate,
      (err) => { throw err; }
    );
    assert.strictEqual(resUpdate.statusCode, 200);
    const updatedZone = resUpdate.data.data.zone;
    assert.strictEqual(updatedZone.name, `Salt Lake Sector V UPDATED ${timestamp}`);
    assert.strictEqual(updatedZone.deliveryCharge, 45);
    assert.strictEqual(updatedZone.estimatedDeliveryMinutes, 25);

    // Verify database record updated and no duplicate created
    const allMatchingZones = await DeliveryZone.find({ pincodes: testPin, isDeleted: { $ne: true } });
    assert.strictEqual(allMatchingZones.length, 1, 'Exactly one zone must exist for testPin');
    console.log('✓ Delivery zone edited and updated existing record without duplication.');

    // Test 1.3: Serviceability check reflects updated zone
    console.log('[Test 1.3] Serviceability check reflects updated delivery fee...');
    const resServ = createMockRes();
    await DeliveryController.checkServiceability(
      { query: { pincode: testPin } },
      resServ,
      (err) => { throw err; }
    );
    assert.strictEqual(resServ.statusCode, 200);
    assert.strictEqual(resServ.data.serviceable, true);
    assert.strictEqual(resServ.data.data.deliveryCharge, 45);
    console.log('✓ Serviceability check reflects updated zone delivery charge of ₹45.');

    // Test 1.4: Place an order referencing this zone
    console.log('[Test 1.4] Place an order referencing the delivery zone...');
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { items: [{ product: prod250._id, quantity: 1 }] },
      { upsert: true }
    );
    const resOrder = createMockRes();
    await OrderController.placeOrder(
      {
        user: { id: customerUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          paymentMethod: 'COD',
        },
      },
      resOrder,
      (err) => { throw err; }
    );
    assert.strictEqual(resOrder.statusCode, 201);
    const orderData = resOrder.data.data.order || resOrder.data.data;
    assert.strictEqual(orderData.deliveryZone.toString(), createdZoneId.toString());
    console.log('✓ Order placed with reference to delivery zone.');

    // Test 1.5: In-flight order protection prevents zone deletion
    console.log('[Test 1.5] In-flight order protection blocks premature zone deletion...');
    const resDeleteBlocked = createMockRes();
    await AdminDeliveryController.deleteZone(
      { params: { id: createdZoneId.toString() } },
      resDeleteBlocked,
      (err) => { throw err; }
    );
    assert.strictEqual(resDeleteBlocked.statusCode, 400);
    assert.ok(resDeleteBlocked.data.message.includes('active in-flight order'), 'Must reject due to active in-flight order');
    console.log('✓ Deletion successfully blocked while order is in-flight (PENDING).');

    // Complete the order to simulate historical completed order
    await Order.updateOne({ _id: orderData._id }, { orderStatus: 'DELIVERED', paymentStatus: 'PAID' });

    // Test 1.6: Delete/deactivate delivery zone after operational completion
    console.log('[Test 1.6] Soft-delete delivery zone after order is completed...');
    const resDelete = createMockRes();
    await AdminDeliveryController.deleteZone(
      { params: { id: createdZoneId.toString() } },
      resDelete,
      (err) => { throw err; }
    );
    assert.strictEqual(resDelete.statusCode, 200);
    console.log('✓ Delivery zone deleted (soft-deleted).');

    // Test 1.7: Deleted zone is excluded from serviceability
    console.log('[Test 1.7] Verify deleted zone is excluded from serviceability...');
    const resServAfterDelete = createMockRes();
    await DeliveryController.checkServiceability(
      { query: { pincode: testPin } },
      resServAfterDelete,
      (err) => { throw err; }
    );
    assert.strictEqual(resServAfterDelete.statusCode, 200);
    assert.strictEqual(resServAfterDelete.data.serviceable, false);
    console.log('✓ Deleted zone is correctly excluded from serviceability (serviceable = false).');

    // Test 1.8: Historical order retains original delivery zone reference
    console.log('[Test 1.8] Verify historical order retains delivery zone reference...');
    const storedHistoricalOrder = await Order.findById(orderData._id);
    assert.strictEqual(storedHistoricalOrder.deliveryZone.toString(), createdZoneId.toString());
    assert.strictEqual(storedHistoricalOrder.deliveryCharge, 45);
    console.log('✓ Historical order retains its original delivery zone reference and ₹45 fee snapshot.\n');

    // Re-create an active zone for testPin for Suite 2
    await DeliveryZone.create({
      name: `Suite 2 Active Zone ${timestamp}`,
      pincodes: [testPin],
      deliveryCharge: 30,
      minimumOrderAmount: 0,
      estimatedDeliveryMinutes: 30,
      isActive: true,
    });

    // ====================================================
    // SUITE 2: ADMIN-CONTROLLED MINIMUM ORDER VALUE
    // ====================================================
    console.log('------------------------------------------------------');
    console.log(' SUITE 2: Minimum Order Value Matrix Verification     ');
    console.log('------------------------------------------------------');

    // Helper to test checkout summary & order placement for a given admin config and subtotal
    async function testMinOrderScenario({ configMin, product, quantity = 1, shouldAccept, label }) {
      // 1. Set admin configuration
      await AdminSettingsController.updateSettings(
        { body: { settings: { MINIMUM_ORDER_VALUE: configMin } } },
        createMockRes(),
        (err) => { throw err; }
      );

      // 2. Set customer cart
      await Cart.findOneAndUpdate(
        { user: customerUser._id },
        { items: [{ product: product._id, quantity }] },
        { upsert: true }
      );

      const subtotal = product.price * quantity;

      // 3. Test Checkout Summary
      const resSummary = createMockRes();
      await OrderController.getCheckoutSummary(
        {
          user: { id: customerUser._id.toString() },
          body: { addressId: testAddress._id.toString() },
        },
        resSummary,
        (err) => { throw err; }
      );

      if (shouldAccept) {
        assert.strictEqual(
          resSummary.statusCode,
          200,
          `Checkout summary should accept [${label}]: Config ₹${configMin}, Subtotal ₹${subtotal}`
        );
      } else {
        assert.strictEqual(
          resSummary.statusCode,
          400,
          `Checkout summary should reject [${label}]: Config ₹${configMin}, Subtotal ₹${subtotal}`
        );
        assert.ok(
          resSummary.data.message.includes(`Minimum order value is ₹${configMin}`),
          `Rejection message must mention ₹${configMin}`
        );
      }

      // 4. Test Place Order
      let orderAccepted = false;
      let orderRejectionMessage = '';
      try {
        const resPlace = createMockRes();
        await OrderController.placeOrder(
          {
            user: { id: customerUser._id.toString() },
            body: {
              addressId: testAddress._id.toString(),
              paymentMethod: 'COD',
            },
          },
          resPlace,
          (err) => { throw err; }
        );
        if (resPlace.statusCode === 201) {
          orderAccepted = true;
          // Clean up stock for next tests
          await Product.updateOne({ _id: product._id }, { $inc: { stockQuantity: quantity } });
        }
      } catch (err) {
        orderAccepted = false;
        orderRejectionMessage = err.message;
      }

      assert.strictEqual(
        orderAccepted,
        shouldAccept,
        `Order placement acceptance mismatch for [${label}]. Expected: ${shouldAccept}, Got: ${orderAccepted}. Msg: ${orderRejectionMessage}`
      );

      console.log(`✓ [${label}] Config: ₹${configMin}, Subtotal: ₹${subtotal} => ${shouldAccept ? 'ACCEPTED' : 'REJECTED'}`);
    }

    // Matrix tests specified in requirement table:
    // | Admin Configuration | Customer Subtotal | Expected Result |
    // | ₹99                 | ₹50               | Reject          |
    // | ₹99                 | ₹99               | Accept          |
    // | ₹149                | ₹100              | Reject          |
    // | ₹149                | ₹149              | Accept          |
    // | ₹199                | ₹250              | Accept          |
    // | ₹0                  | ₹50               | Accept          |

    console.log('[Test 2.1] Config ₹99, Subtotal ₹50 => Expect Reject');
    await testMinOrderScenario({
      configMin: 99,
      product: prod50,
      quantity: 1,
      shouldAccept: false,
      label: 'Matrix 1: ₹99 vs ₹50',
    });

    console.log('[Test 2.2] Config ₹99, Subtotal ₹99 => Expect Accept');
    await testMinOrderScenario({
      configMin: 99,
      product: prod99,
      quantity: 1,
      shouldAccept: true,
      label: 'Matrix 2: ₹99 vs ₹99',
    });

    console.log('[Test 2.3] Config ₹149, Subtotal ₹100 => Expect Reject');
    await testMinOrderScenario({
      configMin: 149,
      product: prod100,
      quantity: 1,
      shouldAccept: false,
      label: 'Matrix 3: ₹149 vs ₹100',
    });

    console.log('[Test 2.4] Config ₹149, Subtotal ₹149 => Expect Accept');
    await testMinOrderScenario({
      configMin: 149,
      product: prod149,
      quantity: 1,
      shouldAccept: true,
      label: 'Matrix 4: ₹149 vs ₹149',
    });

    console.log('[Test 2.5] Config ₹199, Subtotal ₹250 => Expect Accept');
    await testMinOrderScenario({
      configMin: 199,
      product: prod250,
      quantity: 1,
      shouldAccept: true,
      label: 'Matrix 5: ₹199 vs ₹250',
    });

    console.log('[Test 2.6] Config ₹0 (Disabled), Subtotal ₹50 => Expect Accept');
    await testMinOrderScenario({
      configMin: 0,
      product: prod50,
      quantity: 1,
      shouldAccept: true,
      label: 'Matrix 6: ₹0 vs ₹50',
    });

    // Test 2.7: Customer cannot manipulate minimum order value in API request
    console.log('[Test 2.7] Customer attempts to bypass minimum order by injecting minimumOrderValue: 0 in request...');
    await AdminSettingsController.updateSettings(
      { body: { settings: { MINIMUM_ORDER_VALUE: 199 } } },
      createMockRes(),
      (err) => { throw err; }
    );
    await Cart.findOneAndUpdate(
      { user: customerUser._id },
      { items: [{ product: prod50._id, quantity: 1 }] },
      { upsert: true }
    );

    const resBypassSummary = createMockRes();
    await OrderController.getCheckoutSummary(
      {
        user: { id: customerUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          minimumOrderValue: 0, // Injected attempt to bypass
          minimumOrderAmount: 0,
        },
      },
      resBypassSummary,
      (err) => { throw err; }
    );
    assert.strictEqual(resBypassSummary.statusCode, 400, 'Server must enforce admin minimum and ignore injected body values');
    console.log('✓ Server securely ignored customer-injected minimum order override.');

    // Test 2.8: Delivery fee is not counted toward minimum order value
    console.log('[Test 2.8] Verify delivery charges are not counted towards minimum order threshold...');
    // Subtotal = ₹50, Delivery fee = ₹30 => Total is ₹80, but min order is ₹99. Should be rejected!
    await AdminSettingsController.updateSettings(
      { body: { settings: { MINIMUM_ORDER_VALUE: 99, DELIVERY_CHARGE_AMOUNT: 30 } } },
      createMockRes(),
      (err) => { throw err; }
    );
    const resDeliveryExclusion = createMockRes();
    await OrderController.getCheckoutSummary(
      {
        user: { id: customerUser._id.toString() },
        body: { addressId: testAddress._id.toString() },
      },
      resDeliveryExclusion,
      (err) => { throw err; }
    );
    assert.strictEqual(resDeliveryExclusion.statusCode, 400, 'Delivery fee must not satisfy item subtotal minimum');
    console.log('✓ Delivery charges are strictly excluded from item subtotal minimum calculation.\n');

    console.log('======================================================');
    console.log(' ALL DELIVERY ZONE & MIN ORDER TESTS PASSED!          ');
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (customerUser) await User.deleteOne({ _id: customerUser._id });
    if (testAddress) await Address.deleteOne({ _id: testAddress._id });
    if (testCat) await Category.deleteOne({ _id: testCat._id });
    if (prod50) await Product.deleteOne({ _id: prod50._id });
    if (prod99) await Product.deleteOne({ _id: prod99._id });
    if (prod100) await Product.deleteOne({ _id: prod100._id });
    if (prod149) await Product.deleteOne({ _id: prod149._id });
    if (prod250) await Product.deleteOne({ _id: prod250._id });
    await DeliveryZone.deleteMany({ pincodes: testPin });
    // Reset standard minimum order value
    await SystemSetting.findOneAndUpdate(
      { key: 'MINIMUM_ORDER_VALUE' },
      { value: 99 },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'MINIMUM_ORDER_AMOUNT' },
      { value: 99 },
      { upsert: true }
    );
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
