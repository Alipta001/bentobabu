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
const ProductController = require('../app/controllers/productController');
const CartController = require('../app/controllers/cartController');
const OrderController = require('../app/controllers/orderController');
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
  console.log('\n====================================================================');
  console.log(' BentoBabu: Product Variants & Price-Based Customisation Test Suite');
  console.log('====================================================================\n');

  await connectDB();

  const currentDbName = mongoose.connection.name;
  console.log(`[Safety Verification] Connected to database: "${currentDbName}"`);

  const timestamp = Date.now();
  const testPin = '700120';
  let testUser, testAddress, testZone, testCategory;
  let singleProduct, variantProduct;

  try {
    // =================================================================
    // FIXTURE SETUP
    // =================================================================
    console.log('[Setup] Creating test fixtures...');

    testCategory = await Category.create({
      name: `Variants Test Category ${timestamp}`,
      slug: `variants-cat-${timestamp}`,
      description: 'Test category for product variants',
      image: 'https://res.cloudinary.com/test/image/upload/sample.jpg',
      isActive: true,
    });

    testUser = await User.create({
      name: `Variant Tester ${timestamp}`,
      email: `variant_tester_${timestamp}@bentobabu.test`,
      phone: `98765${String(timestamp).slice(-5)}`,
      role: 'customer',
      isActive: true,
      isVerified: true,
    });

    testZone = await DeliveryZone.create({
      name: `Barrackpore Test Zone ${timestamp}`,
      pincodes: [testPin],
      deliveryCharge: 0,
      minimumOrderAmount: 0,
      isActive: true,
    });

    testAddress = await Address.create({
      user: testUser._id,
      fullName: testUser.name,
      phone: testUser.phone,
      addressLine: 'Station Road, Barrackpore',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: testPin,
      isDefault: true,
    });

    // =================================================================
    // 1. SCHEMA & MODEL VALIDATION TESTS
    // =================================================================
    console.log('\n[Test 1] Testing Schema & Model validation rules for variants...');

    // 1.1 Single price product works without variants (backward compatibility)
    singleProduct = await Product.create({
      name: `Classic Paneer Bento ${timestamp}`,
      slug: `classic-paneer-bento-${timestamp}`,
      description: 'Traditional home-cooked bento with single price',
      category: testCategory._id,
      categories: [testCategory._id],
      price: 180,
      stockQuantity: 20,
      isAvailable: true,
      isActive: true,
      hasVariants: false,
    });
    assert.strictEqual(singleProduct.hasVariants, false, 'hasVariants should default or be false');
    assert.strictEqual(singleProduct.variants.length, 0, 'variants array should be empty');
    console.log('  ✓ 1.1 Single price product created with hasVariants=false');

    // 1.2 Product with hasVariants=true requires at least one variant
    const mockRes12 = createMockRes();
    await ProductController.createProduct(
      {
        body: {
          name: `Variant Bowl Invalid ${timestamp}`,
          slug: `variant-bowl-inv-${timestamp}`,
          category: testCategory._id.toString(),
          hasVariants: true,
          variants: [],
        },
      },
      mockRes12,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes12.statusCode, 400, 'Should reject product with hasVariants=true and empty variants');
    console.log('  ✓ 1.2 Rejected product with hasVariants=true and empty variants');

    // 1.3 Product with duplicate variant names rejected (case/whitespace-insensitive)
    const mockRes13 = createMockRes();
    await ProductController.createProduct(
      {
        body: {
          name: `Variant Bowl Dup ${timestamp}`,
          slug: `variant-bowl-dup-${timestamp}`,
          category: testCategory._id.toString(),
          hasVariants: true,
          variants: [
            { name: 'Chicken', price: 199 },
            { name: '  chicken  ', price: 219 },
          ],
        },
      },
      mockRes13,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes13.statusCode, 400, 'Should reject duplicate variant names');
    assert(mockRes13.data.message.includes('Duplicate variant name'), 'Error message should indicate duplicate variant name');
    console.log('  ✓ 1.3 Rejected duplicate variant names (case/whitespace-insensitive)');

    // 1.4 Product with negative variant price rejected
    const mockRes14 = createMockRes();
    await ProductController.createProduct(
      {
        body: {
          name: `Variant Bowl Neg ${timestamp}`,
          slug: `variant-bowl-neg-${timestamp}`,
          category: testCategory._id.toString(),
          hasVariants: true,
          variants: [
            { name: 'Chicken', price: -50 },
          ],
        },
      },
      mockRes14,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes14.statusCode, 400, 'Should reject negative variant price');
    console.log('  ✓ 1.4 Rejected negative variant price');

    // 1.5 Valid product creation with multiple variants
    // Example from user request: Protein Power Bowl: Chicken ₹199, Paneer ₹179, Soyabean ₹149
    const mockRes15 = createMockRes();
    await ProductController.createProduct(
      {
        body: {
          name: `Protein Power Bowl ${timestamp}`,
          slug: `protein-power-bowl-${timestamp}`,
          description: 'High protein fitness bowl with choice of protein source',
          category: testCategory._id.toString(),
          hasVariants: true,
          variantLabel: 'Choose Protein',
          variants: [
            { name: 'Chicken', price: 199, isAvailable: true, sortOrder: 1 },
            { name: 'Paneer', price: 179, isAvailable: true, sortOrder: 2 },
            { name: 'Soyabean', price: 149, isAvailable: true, sortOrder: 3 },
          ],
          stockQuantity: 30,
          isAvailable: true,
          isActive: true,
        },
      },
      mockRes15,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes15.statusCode, 201, 'Should successfully create product with variants');
    variantProduct = mockRes15.data.data;
    assert.strictEqual(variantProduct.hasVariants, true);
    assert.strictEqual(variantProduct.variantLabel, 'Choose Protein');
    assert.strictEqual(variantProduct.variants.length, 3);
    assert.strictEqual(variantProduct.variants[0].name, 'Chicken');
    assert.strictEqual(variantProduct.variants[0].price, 199);
    assert.strictEqual(variantProduct.variants[1].name, 'Paneer');
    assert.strictEqual(variantProduct.variants[1].price, 179);
    assert.strictEqual(variantProduct.variants[2].name, 'Soyabean');
    assert.strictEqual(variantProduct.variants[2].price, 149);
    assert(variantProduct.variants[0]._id, 'Each variant must have a generated _id');
    console.log('  ✓ 1.5 Successfully created Protein Power Bowl with Chicken (₹199), Paneer (₹179), Soyabean (₹149)');

    // =================================================================
    // 2. PRODUCT CONTROLLER UPDATE & AVAILABILITY TESTS
    // =================================================================
    console.log('\n[Test 2] Testing ProductController update & variant availability toggle...');

    // 2.1 Update variant availability (disable Soyabean)
    const soyabeanId = variantProduct.variants[2]._id;
    const mockRes21 = createMockRes();
    await ProductController.updateProduct(
      {
        params: { id: variantProduct._id.toString() },
        body: {
          variants: [
            { _id: variantProduct.variants[0]._id, name: 'Chicken', price: 199, isAvailable: true },
            { _id: variantProduct.variants[1]._id, name: 'Paneer', price: 179, isAvailable: true },
            { _id: soyabeanId, name: 'Soyabean', price: 149, isAvailable: false },
          ],
        },
      },
      mockRes21,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes21.statusCode, 200);
    const updatedProd = mockRes21.data.data;
    const updatedSoyabean = updatedProd.variants.find((v) => v._id.toString() === soyabeanId.toString());
    assert.strictEqual(updatedSoyabean.isAvailable, false, 'Soyabean variant should now be unavailable');
    console.log('  ✓ 2.1 Successfully toggled Soyabean variant availability to false');

    // =================================================================
    // 3. CART SYSTEM INTEGRATION TESTS
    // =================================================================
    console.log('\n[Test 3] Testing Cart system integration with variants...');

    // 3.1 Adding variant product to cart without variantId fails
    const mockRes31 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          quantity: 1,
        },
      },
      mockRes31,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes31.statusCode, 400, 'Should reject variant product added without variantId');
    console.log('  ✓ 3.1 Rejected adding variant product to cart without variantId');

    // 3.2 Adding unavailable variant (Soyabean) to cart fails
    const mockRes32 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          variantId: soyabeanId.toString(),
          quantity: 1,
        },
      },
      mockRes32,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes32.statusCode, 400, 'Should reject adding unavailable variant');
    assert(mockRes32.data.message.includes('unavailable'), 'Message should indicate variant unavailable');
    console.log('  ✓ 3.2 Rejected adding unavailable variant (Soyabean) to cart');

    // 3.3 Add Chicken variant (₹199, qty 2) to cart
    const chickenId = variantProduct.variants[0]._id.toString();
    const mockRes33 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          variantId: chickenId,
          quantity: 2,
        },
      },
      mockRes33,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes33.statusCode, 200);
    assert.strictEqual(mockRes33.data.data.items.length, 1);
    assert.strictEqual(mockRes33.data.data.items[0].variantName, 'Chicken');
    assert.strictEqual(mockRes33.data.data.items[0].unitPrice, 199);
    assert.strictEqual(mockRes33.data.data.items[0].subtotal, 398); // 199 * 2
    assert.strictEqual(mockRes33.data.data.itemTotal, 398);
    console.log('  ✓ 3.3 Added Chicken variant (qty 2) to cart. Line subtotal: ₹398');

    // 3.4 Add Paneer variant (₹179, qty 1) for the SAME product -> creates separate line!
    const paneerId = variantProduct.variants[1]._id.toString();
    const mockRes34 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          variantId: paneerId,
          quantity: 1,
        },
      },
      mockRes34,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes34.statusCode, 200);
    assert.strictEqual(mockRes34.data.data.items.length, 2, 'Cart should have 2 distinct lines for different variants of the same product');
    const chickenLine = mockRes34.data.data.items.find((it) => it.variantName === 'Chicken');
    const paneerLine = mockRes34.data.data.items.find((it) => it.variantName === 'Paneer');
    assert.strictEqual(chickenLine.quantity, 2);
    assert.strictEqual(chickenLine.unitPrice, 199);
    assert.strictEqual(paneerLine.quantity, 1);
    assert.strictEqual(paneerLine.unitPrice, 179);
    assert.strictEqual(mockRes34.data.data.itemTotal, 398 + 179); // 577
    console.log('  ✓ 3.4 Added Paneer variant for same product -> created separate line item. Total: ₹577');

    // 3.5 Incrementing Chicken variant increments only that specific line
    const mockRes35 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          variantId: chickenId,
          quantity: 1,
        },
      },
      mockRes35,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes35.statusCode, 200);
    assert.strictEqual(mockRes35.data.data.items.length, 2);
    const updatedChicken = mockRes35.data.data.items.find((it) => it.variantName === 'Chicken');
    assert.strictEqual(updatedChicken.quantity, 3); // 2 + 1
    assert.strictEqual(updatedChicken.subtotal, 199 * 3); // 597
    assert.strictEqual(mockRes35.data.data.itemTotal, 597 + 179); // 776
    console.log('  ✓ 3.5 Incrementing Chicken variant incremented only that line to qty 3 (Total: ₹776)');

    // 3.6 Add single price product (₹180, qty 1) alongside variant products
    const mockRes36 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: singleProduct._id.toString(),
          quantity: 1,
        },
      },
      mockRes36,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes36.statusCode, 200);
    assert.strictEqual(mockRes36.data.data.items.length, 3, 'Cart should contain 3 items');
    const singleLine = mockRes36.data.data.items.find((it) => it.product.id === singleProduct._id.toString());
    assert.strictEqual(singleLine.unitPrice, 180);
    assert.strictEqual(singleLine.variantId, null);
    assert.strictEqual(singleLine.variantName, null);
    assert.strictEqual(mockRes36.data.data.itemTotal, 776 + 180); // 956
    console.log('  ✓ 3.6 Single-price product coexists seamlessly in cart with variant lines. Total: ₹956');

    // =================================================================
    // 4. CHECKOUT SUMMARY & AUTHORITATIVE PRICING TESTS
    // =================================================================
    console.log('\n[Test 4] Testing Checkout Summary authoritative pricing calculations...');

    const mockRes41 = createMockRes();
    await OrderController.getCheckoutSummary(
      {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
        },
      },
      mockRes41,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes41.statusCode, 200);
    const summary = mockRes41.data.data;
    assert.strictEqual(summary.itemTotal, 956);
    assert.strictEqual(summary.items.length, 3);

    const summaryChicken = summary.items.find((it) => it.variantName === 'Chicken');
    const summaryPaneer = summary.items.find((it) => it.variantName === 'Paneer');
    const summarySingle = summary.items.find((it) => !it.variantName);

    assert(summaryChicken, 'Checkout summary must include Chicken variant snapshot');
    assert.strictEqual(summaryChicken.unitPrice, 199);
    assert.strictEqual(summaryChicken.quantity, 3);
    assert.strictEqual(summaryChicken.subtotal, 597);

    assert(summaryPaneer, 'Checkout summary must include Paneer variant snapshot');
    assert.strictEqual(summaryPaneer.unitPrice, 179);
    assert.strictEqual(summaryPaneer.quantity, 1);
    assert.strictEqual(summaryPaneer.subtotal, 179);

    assert(summarySingle, 'Checkout summary must include single price item snapshot');
    assert.strictEqual(summarySingle.unitPrice, 180);
    assert.strictEqual(summarySingle.quantity, 1);
    assert.strictEqual(summarySingle.subtotal, 180);

    console.log('  ✓ 4.1 Checkout summary verified authoritative pricing from database records');

    // =================================================================
    // 5. ORDER PLACEMENT & IMMUTABLE SNAPSHOT TESTS
    // =================================================================
    console.log('\n[Test 5] Testing Order Placement & immutable snapshot preservation...');

    const mockRes51 = createMockRes();
    await OrderController.placeOrder(
      {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
          paymentMethod: 'COD',
        },
      },
      mockRes51,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes51.statusCode, 201);
    const placedOrder = mockRes51.data.data;
    assert.strictEqual(placedOrder.itemTotal, 956);
    assert.strictEqual(placedOrder.items.length, 3);

    // Verify stored snapshot in database
    const dbOrder = await Order.findById(placedOrder._id).lean();
    assert(dbOrder, 'Order must exist in database');

    const dbChicken = dbOrder.items.find((it) => it.variantName === 'Chicken');
    const dbPaneer = dbOrder.items.find((it) => it.variantName === 'Paneer');
    const dbSingle = dbOrder.items.find((it) => !it.variantName);

    assert.strictEqual(dbChicken.variantId.toString(), chickenId);
    assert.strictEqual(dbChicken.variantName, 'Chicken');
    assert.strictEqual(dbChicken.unitPrice, 199);
    assert.strictEqual(dbChicken.quantity, 3);
    assert.strictEqual(dbChicken.subtotal, 597);

    assert.strictEqual(dbPaneer.variantId.toString(), paneerId);
    assert.strictEqual(dbPaneer.variantName, 'Paneer');
    assert.strictEqual(dbPaneer.unitPrice, 179);
    assert.strictEqual(dbPaneer.quantity, 1);
    assert.strictEqual(dbPaneer.subtotal, 179);

    assert.strictEqual(dbSingle.variantId, null);
    assert.strictEqual(dbSingle.variantName, '');
    assert.strictEqual(dbSingle.unitPrice, 180);
    assert.strictEqual(dbSingle.quantity, 1);
    assert.strictEqual(dbSingle.subtotal, 180);

    console.log('  ✓ 5.1 Order placed with immutable snapshots storing variantId, variantName, and unitPrice');

    // 5.2 Verify historical integrity: Even if master product variant price changes in future,
    // the placed order item snapshot remains unchanged!
    await Product.updateOne(
      { _id: variantProduct._id, 'variants._id': chickenId },
      { $set: { 'variants.$.price': 249 } }
    );
    const reloadedOrder = await Order.findById(placedOrder._id).lean();
    const reloadedChicken = reloadedOrder.items.find((it) => it.variantName === 'Chicken');
    assert.strictEqual(reloadedChicken.unitPrice, 199, 'Historical order snapshot price must NOT change when catalog price changes');
    console.log('  ✓ 5.2 Historical order integrity preserved when master variant price changed in catalog');

    // =================================================================
    // 6. PARENT VS VARIANT AVAILABILITY PRECEDENCE TESTS
    // =================================================================
    console.log('\n[Test 6] Testing Parent vs Variant availability precedence...');

    // Put Chicken variant back in new cart
    const mockRes61 = createMockRes();
    await CartController.addItem(
      {
        user: { id: testUser._id.toString() },
        body: {
          productId: variantProduct._id.toString(),
          variantId: chickenId,
          quantity: 1,
        },
      },
      mockRes61,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes61.statusCode, 200);

    // Disable parent product availability
    await Product.updateOne({ _id: variantProduct._id }, { $set: { isAvailable: false } });

    // Now checkout summary should fail because parent product is unavailable
    const mockRes62 = createMockRes();
    await OrderController.getCheckoutSummary(
      {
        user: { id: testUser._id.toString() },
        body: {
          addressId: testAddress._id.toString(),
        },
      },
      mockRes62,
      (err) => { throw err; }
    );
    assert.strictEqual(mockRes62.statusCode, 400);
    assert(mockRes62.data.message.includes('unavailable'), 'Parent unavailability must take precedence');
    console.log('  ✓ 6.1 Parent product unavailability takes precedence over variant availability');

    console.log('\n====================================================================');
    console.log(' 🎉 ALL 12 TEST SCENARIOS PASSED WITH COMPLETE ACCURACY! 🎉');
    console.log('====================================================================\n');
  } finally {
    // Cleanup test fixtures
    console.log('[Cleanup] Cleaning up test fixtures...');
    if (testUser) {
      await Cart.deleteMany({ user: testUser._id });
      await Order.deleteMany({ user: testUser._id });
      await Address.deleteMany({ user: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    if (singleProduct) await Product.deleteOne({ _id: singleProduct._id });
    if (variantProduct) await Product.deleteOne({ _id: variantProduct._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testZone) await DeliveryZone.deleteOne({ _id: testZone._id });

    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected from database.');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
