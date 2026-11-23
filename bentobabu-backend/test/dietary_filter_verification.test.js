/**
 * Test Suite: Dietary Choice Filtering Verification
 *
 * Verifies:
 * - 1. Filter by dietaryTags=VEG
 * - 2. Filter by dietaryTags=NON_VEG
 * - 3. Filter by dietaryTags=VEGAN
 * - 4. Filter by dietaryTags=EGG
 * - 5. Filter by dietary=vegetarian (friendly parameter name)
 * - 6. Filter by dietary=egg
 * - 7. Multi-selection: comma-separated dietaryTags=VEG,NON_VEG
 * - 8. Product update with dietary field normalizes to dietaryTags
 */

const assert = require('assert');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Product } = require('../app/models');
const ProductController = require('../app/controllers/productController');
const { initRedis, redisDelPattern, disconnectRedis } = require('../app/config/redis');

function createMockRes() {
  return {
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
}

function getProductsList(res) {
  if (Array.isArray(res.data?.data)) return res.data.data;
  if (Array.isArray(res.data?.data?.products)) return res.data.data.products;
  if (Array.isArray(res.data?.products)) return res.data.products;
  return [];
}

async function runTests() {
  console.log('--- Starting Dietary Choice Filter Verification ---');
  await mongoose.connect(process.env.MONGODB_URI);
  initRedis();
  await redisDelPattern('cache:products:*');

  // Test 1: Query by dietaryTags=VEG
  {
    console.log('Test 1: GET products with dietaryTags=VEG');
    const req = {
      query: { dietaryTags: 'VEG', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const products = getProductsList(res);
    assert.ok(products.length > 0, 'Expected at least 1 VEG product');
    for (const p of products) {
      const match = p.dietaryTags.some((t) => ['VEG', 'VEGETARIAN', 'veg', 'vegetarian'].includes(t));
      assert.ok(match, `Product ${p.name} should match VEG`);
    }
    console.log(`  ✓ Passed: Found ${products.length} VEG dish(es)`);
  }

  // Test 2: Query by dietaryTags=NON_VEG
  {
    console.log('Test 2: GET products with dietaryTags=NON_VEG');
    const req = {
      query: { dietaryTags: 'NON_VEG', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const products = getProductsList(res);
    assert.ok(products.length > 0, 'Expected at least 1 NON_VEG product');
    for (const p of products) {
      const match = p.dietaryTags.some((t) => ['NON_VEG', 'NON_VEGETARIAN', 'NON-VEG'].includes(t));
      assert.ok(match, `Product ${p.name} should match NON_VEG`);
    }
    console.log(`  ✓ Passed: Found ${products.length} NON_VEG dish(es)`);
  }

  // Test 3: Query by dietaryTags=VEGAN
  {
    console.log('Test 3: GET products with dietaryTags=VEGAN');
    const req = {
      query: { dietaryTags: 'VEGAN', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const products = getProductsList(res);
    assert.ok(products.length > 0, 'Expected at least 1 VEGAN product');
    for (const p of products) {
      assert.ok(p.dietaryTags.includes('VEGAN'), `Product ${p.name} should match VEGAN`);
    }
    console.log(`  ✓ Passed: Found ${products.length} VEGAN dish(es)`);
  }

  // Test 4: Query by dietaryTags=EGG
  {
    console.log('Test 4: GET products with dietaryTags=EGG');
    const req = {
      query: { dietaryTags: 'EGG', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    const products = getProductsList(res);
    assert.ok(products.length > 0, 'Expected at least 1 EGG product');
    for (const p of products) {
      assert.ok(p.dietaryTags.includes('EGG') || p.dietaryTags.includes('CONTAINS_EGG'));
    }
    console.log(`  ✓ Passed: Found ${products.length} EGG dish(es)`);
  }

  // Test 5: Query by dietary=vegetarian (friendly parameter name)
  {
    console.log('Test 5: GET products with dietary=vegetarian');
    const req = {
      query: { dietary: 'vegetarian', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    const products = getProductsList(res);
    assert.ok(products.length > 0);
    console.log(`  ✓ Passed: Friendly "dietary=vegetarian" resolved ${products.length} products`);
  }

  // Test 6: Query by dietary=egg
  {
    console.log('Test 6: GET products with dietary=egg');
    const req = {
      query: { dietary: 'egg', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    const products = getProductsList(res);
    assert.ok(products.length > 0);
    console.log(`  ✓ Passed: Friendly "dietary=egg" resolved ${products.length} products`);
  }

  // Test 7: Multi-selection: comma-separated dietaryTags=VEG,NON_VEG
  {
    console.log('Test 7: GET products with multi-tag dietaryTags=VEG,NON_VEG');
    const req = {
      query: { dietaryTags: 'VEG,NON_VEG', skipCache: 'true' },
      headers: {},
    };
    const res = createMockRes();
    await ProductController.getProducts(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    const products = getProductsList(res);
    assert.ok(products.length >= 2, 'Expected at least 2 dishes for VEG + NON_VEG');
    const hasVeg = products.some((p) => p.dietaryTags.some((t) => ['VEG', 'VEGETARIAN'].includes(t)));
    const hasNonVeg = products.some((p) => p.dietaryTags.some((t) => ['NON_VEG', 'NON_VEGETARIAN'].includes(t)));
    assert.ok(hasVeg, 'Should include VEG');
    assert.ok(hasNonVeg, 'Should include NON_VEG');
    console.log(`  ✓ Passed: Multi-select returned ${products.length} products with both VEG and NON_VEG`);
  }

  // Test 8: Product update with dietary field normalizes to dietaryTags
  {
    console.log('Test 8: Controller update with dietary="egg"');
    const prod = await Product.findOne({ slug: 'boiled-egg-brown-rice-bento' });
    assert.ok(prod);

    const req = {
      params: { id: prod._id.toString() },
      body: { dietary: 'egg' },
      query: {},
      headers: {},
    };
    const res = createMockRes();
    await ProductController.updateProduct(req, res, (err) => { throw err; });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.dietaryTags.includes('EGG'));
    console.log(`  ✓ Passed: Product update normalized dietary="egg" to dietaryTags:`, res.data.data.dietaryTags);
  }

  console.log('--- All Dietary Choice Verification Tests Passed Successfully! ---');
  await redisDelPattern('cache:products:*');
  await disconnectRedis();
  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
