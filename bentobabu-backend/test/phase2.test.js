/**
 * Comprehensive Phase 2 Test Suite: Database Models & Schemas
 * Verifies all 10 requirements:
 * 1. All models load without errors
 * 2. Every model can be instantiated
 * 3. Required-field validation
 * 4. Enum validation
 * 5. Unique indexes and compound indexes
 * 6. Invalid prices, quantities, ratings and PIN codes
 * 7. User password excluded from JSON output
 * 8. RefreshSession stores tokenHash, not raw token
 * 9. Order item snapshots and status fields
 * 10. MongoDB indexes created correctly and clean-up
 */

const assert = require('assert');
const mongoose = require('mongoose');
const connectDB = require('../app/config/db');

const {
  User,
  RefreshSession,
  Category,
  Product,
  Address,
  Cart,
  DeliveryZone,
  DeliverySlot,
  Coupon,
  Order,
  Review,
  SystemSetting,
} = require('../app/models');

const expectValidationError = async (doc, path = null) => {
  let err = null;
  try {
    await doc.validate();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `Expected document to fail validation`);
  assert.strictEqual(err.name, 'ValidationError');
  if (path) {
    assert.ok(err.errors[path], `Expected validation error on path "${path}"`);
  }
  return err;
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 2 MODEL VERIFICATION  ');
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
    }
  };

  // 1. Confirm all models load without errors
  await test('1. Confirm all 12 models load without errors', () => {
    const models = [
      User,
      RefreshSession,
      Category,
      Product,
      Address,
      Cart,
      DeliveryZone,
      DeliverySlot,
      Coupon,
      Order,
      Review,
      SystemSetting,
    ];
    for (const m of models) {
      assert.ok(m, `Model must be defined`);
      assert.ok(m.schema, `Model must have schema`);
    }
  });

  // 2. Verify every model can be instantiated
  await test('2. Verify every model can be instantiated', () => {
    const dummyId = new mongoose.Types.ObjectId();
    const instances = [
      new User({ name: 'Test', email: 'test@bento.in', phone: '9876543210', password: 'secretpassword' }),
      new RefreshSession({ user: dummyId, tokenHash: 'dummy_hash', expiresAt: new Date(Date.now() + 3600000) }),
      new Category({ name: 'Meal Bowls', slug: 'meal-bowls' }),
      new Product({ name: 'High Protein Salad', slug: 'high-protein-salad', description: 'Fresh', category: dummyId, price: 249 }),
      new Address({ user: dummyId, fullName: 'John Doe', phone: '9876543210', addressLine: '12 SN Banerjee Road', city: 'Barrackpore', state: 'West Bengal', pincode: '700120' }),
      new Cart({ user: dummyId, items: [{ product: dummyId, quantity: 2 }] }),
      new DeliveryZone({ name: 'Barrackpore Central', pincodes: ['700120'], deliveryCharge: 30, minimumOrderAmount: 0, estimatedDeliveryMinutes: 30 }),
      new DeliverySlot({ date: new Date(), label: 'Lunch', startTime: '12:00', endTime: '13:00', capacity: 20 }),
      new Coupon({ code: 'BENTO50', discountType: 'PERCENTAGE', discountValue: 50, expiryDate: new Date(Date.now() + 86400000) }),
      new Order({
        orderNumber: 'BB-TEST-1',
        user: dummyId,
        items: [{ product: dummyId, productName: 'Salad', quantity: 1, unitPrice: 200, subtotal: 200 }],
        deliveryAddress: { fullName: 'John Doe', phone: '9876543210', addressLine: 'Station Road', city: 'Barrackpore', state: 'West Bengal', pincode: '700120' },
        itemTotal: 200,
        deliveryCharge: 30,
        taxAmount: 10,
        grandTotal: 240,
        paymentMethod: 'COD',
      }),
      new Review({ user: dummyId, product: dummyId, order: dummyId, rating: 5, comment: 'Excellent healthy food' }),
      new SystemSetting({ key: 'STORE_STATUS', value: { isOpen: true } }),
    ];

    assert.strictEqual(instances.length, 12);
  });

  // 3. Test required-field validation
  await test('3. Test required-field validation', async () => {
    // User without email and password
    const badUser = new User({ name: 'Test' });
    await expectValidationError(badUser, 'email');
    await expectValidationError(badUser, 'phone');
    await expectValidationError(badUser, 'password');

    // Product without price and category
    const badProduct = new Product({ name: 'No Price Dish', slug: 'no-price' });
    await expectValidationError(badProduct, 'price');
    await expectValidationError(badProduct, 'category');

    // Order without items
    const badOrder = new Order({ orderNumber: 'BB-NO-ITEMS', user: new mongoose.Types.ObjectId() });
    await expectValidationError(badOrder, 'items');
  });

  // 4. Test enum validation
  await test('4. Test enum validation', async () => {
    const invalidRoleUser = new User({
      name: 'Bad Role',
      email: 'badrole@bento.in',
      phone: '9876543210',
      password: 'password',
      role: 'SUPERADMIN_INVALID',
    });
    await expectValidationError(invalidRoleUser, 'role');

    const invalidAddressType = new Address({
      user: new mongoose.Types.ObjectId(),
      fullName: 'A',
      phone: '9876543210',
      addressLine: 'B',
      city: 'C',
      state: 'D',
      pincode: '700120',
      addressType: 'HOTEL',
    });
    await expectValidationError(invalidAddressType, 'addressType');

    const invalidPaymentMethod = new Order({
      orderNumber: 'BB-BAD-PAY',
      user: new mongoose.Types.ObjectId(),
      items: [{ product: new mongoose.Types.ObjectId(), productName: 'X', quantity: 1, unitPrice: 100, subtotal: 100 }],
      deliveryAddress: { fullName: 'A', phone: '9876543210', addressLine: 'B', city: 'C', state: 'D', pincode: '700120' },
      itemTotal: 100,
      grandTotal: 100,
      paymentMethod: 'BITCOIN',
    });
    await expectValidationError(invalidPaymentMethod, 'paymentMethod');
  });

  // 6. Test invalid prices, quantities, ratings, PIN codes and discount limits
  await test('6. Test invalid prices, quantities, ratings and PIN codes', async () => {
    // Negative price
    const negPriceProd = new Product({
      name: 'Negative',
      slug: 'negative',
      description: 'Test',
      category: new mongoose.Types.ObjectId(),
      price: -50,
    });
    await expectValidationError(negPriceProd, 'price');

    // Cart with zero quantity
    const zeroQtyCart = new Cart({
      user: new mongoose.Types.ObjectId(),
      items: [{ product: new mongoose.Types.ObjectId(), quantity: 0 }],
    });
    await expectValidationError(zeroQtyCart, 'items.0.quantity');

    // Review with rating 6
    const highRatingReview = new Review({
      user: new mongoose.Types.ObjectId(),
      product: new mongoose.Types.ObjectId(),
      order: new mongoose.Types.ObjectId(),
      rating: 6,
    });
    await expectValidationError(highRatingReview, 'rating');

    // Address with invalid 3-digit PIN code
    const badPinAddress = new Address({
      user: new mongoose.Types.ObjectId(),
      fullName: 'A',
      phone: '9876543210',
      addressLine: 'B',
      city: 'C',
      state: 'D',
      pincode: '700',
    });
    await expectValidationError(badPinAddress, 'pincode');

    // Coupon with percentage > 100
    const over100Coupon = new Coupon({
      code: 'FREE150',
      discountType: 'PERCENTAGE',
      discountValue: 150,
      expiryDate: new Date(Date.now() + 86400000),
    });
    await expectValidationError(over100Coupon, 'discountValue');

    // DeliverySlot with endTime <= startTime
    const badTimeSlot = new DeliverySlot({
      date: new Date(),
      label: 'Invalid Slot',
      startTime: '14:00',
      endTime: '13:00',
      capacity: 10,
    });
    await expectValidationError(badTimeSlot, 'endTime');
  });

  // 7. Verify User password fields are excluded from normal JSON output
  await test('7. Verify User password fields are excluded from normal JSON output', () => {
    const user = new User({
      name: 'Safe User',
      email: 'safe@bento.in',
      phone: '9876543210',
      password: 'super_secret_raw_password',
      role: 'CUSTOMER',
    });

    const json = user.toJSON();
    assert.strictEqual(json.password, undefined, 'Password must not be in toJSON output');
    assert.ok(json.id, 'JSON output must contain id string');
    assert.strictEqual(json._id, undefined, '_id should be mapped to id');
    assert.strictEqual(json.__v, undefined, '__v should be stripped');
  });

  // 8. Verify RefreshSession stores a hash field, not a raw token
  await test('8. Verify RefreshSession stores tokenHash, not raw token', () => {
    const session = new RefreshSession({
      user: new mongoose.Types.ObjectId(),
      tokenHash: 'sha256_hashed_token_string_here',
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });

    assert.ok(session.tokenHash, 'tokenHash field must be present');
    assert.strictEqual(session.token, undefined, 'Raw token property should not exist');
  });

  // 9. Verify Order item snapshots and status fields
  await test('9. Verify Order item snapshots and status fields', () => {
    const productId = new mongoose.Types.ObjectId();
    const order = new Order({
      orderNumber: 'BB-SNAPSHOT-TEST-1',
      user: new mongoose.Types.ObjectId(),
      items: [
        {
          product: productId,
          productName: 'Brown Rice Khichdi',
          image: 'https://cdn.bentobabu.in/khichdi.jpg',
          quantity: 2,
          unitPrice: 160,
          subtotal: 320,
        },
      ],
      deliveryAddress: {
        fullName: 'Jane Doe',
        phone: '9876543210',
        addressLine: 'Flat 4B, Greenfield',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
      },
      itemTotal: 320,
      deliveryCharge: 30,
      taxAmount: 16,
      grandTotal: 366,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      deliveryOTP: 'hashed_otp_9999',
    });

    assert.strictEqual(order.items[0].productName, 'Brown Rice Khichdi');
    assert.strictEqual(order.items[0].unitPrice, 160);
    assert.strictEqual(order.orderStatus, 'CONFIRMED');
    assert.strictEqual(order.paymentStatus, 'PAID');

    const json = order.toJSON();
    assert.strictEqual(json.deliveryOTP, undefined, 'deliveryOTP must be excluded from toJSON output');
  });

  // Connect to live MongoDB to test database operations and indexes
  await connectDB();

  // 5 & 10. Test unique indexes, compound indexes and clean up
  await test('5 & 10. Verify MongoDB indexes and unique constraint enforcement', async () => {
    // Sync all indexes in the database
    await Promise.all([
      User.syncIndexes(),
      RefreshSession.syncIndexes(),
      Category.syncIndexes(),
      Product.syncIndexes(),
      Address.syncIndexes(),
      Cart.syncIndexes(),
      DeliveryZone.syncIndexes(),
      DeliverySlot.syncIndexes(),
      Coupon.syncIndexes(),
      Order.syncIndexes(),
      Review.syncIndexes(),
      SystemSetting.syncIndexes(),
    ]);

    // Test unique email on User
    const testEmail = `test_unique_${Date.now()}@bentobabu.in`;
    const user1 = await User.create({
      name: 'User 1',
      email: testEmail,
      phone: '9876543211',
      password: 'password123',
    });

    let dupUserErr = null;
    try {
      await User.create({
        name: 'User 2',
        email: testEmail,
        phone: '9876543212',
        password: 'password123',
      });
    } catch (err) {
      dupUserErr = err;
    }
    assert.ok(dupUserErr, 'Duplicate email should throw E11000 duplicate key error');
    assert.strictEqual(dupUserErr.code, 11000);

    // Test unique compound index on Review (user + product + order)
    const revUserId = new mongoose.Types.ObjectId();
    const revProdId = new mongoose.Types.ObjectId();
    const revOrderId = new mongoose.Types.ObjectId();

    await Review.create({
      user: revUserId,
      product: revProdId,
      order: revOrderId,
      rating: 5,
      comment: 'Initial Review',
    });

    let dupReviewErr = null;
    try {
      await Review.create({
        user: revUserId,
        product: revProdId,
        order: revOrderId,
        rating: 4,
        comment: 'Duplicate Review',
      });
    } catch (err) {
      dupReviewErr = err;
    }
    assert.ok(dupReviewErr, 'Duplicate review on same (user, product, order) must fail');
    assert.strictEqual(dupReviewErr.code, 11000);

    // Clean up temporary documents
    await User.deleteOne({ _id: user1._id });
    await Review.deleteOne({ user: revUserId, product: revProdId, order: revOrderId });
  });

  // Clean close connection
  await mongoose.connection.close(false);

  console.log('\n====================================================');
  console.log(`Phase 2 Verification Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Phase 2 test runner error:', err);
  process.exit(1);
});
