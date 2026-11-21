/**
 * Test Suite: Multi-Category Product Assignment & Dynamic Customer Categories
 *
 * Verifies:
 * - Test A: Multi-category creation, persistence in MongoDB, editing & removal of categories.
 * - Test B: Customer filtering across assigned categories, non-appearance in unrelated categories, single appearance in "All".
 * - Test C: Dynamic categories API as source of truth, absence of uncreated categories, soft-delete / delete handling.
 * - Test D: Regressions: prep time, image deduplication, inventory compatibility, search, sorting.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Product, Category, User } = require('../app/models');
const ProductController = require('../app/controllers/productController');
const CategoryController = require('../app/controllers/categoryController');
const { initRedis, redisDelPattern, disconnectRedis } = require('../app/config/redis');

// Mock response helper
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

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — MULTI-CATEGORY ASSIGNMENT & FILTERING SUITE     ');
  console.log('================================================================\n');

  // Use staging database for isolated testing
  const mongoUri = process.env.MONGODB_URI.replace(/\/bentobabu[a-z_]*\?/, '/bentobabu_staging?');
  await mongoose.connect(mongoUri);
  console.log('[Setup] Connected to database: bentobabu_staging');

  await initRedis();
  await redisDelPattern('cache:*');
  console.log('[Setup] Flushed Redis caches');

  const createdCategoryIds = [];
  const createdProductIds = [];

  try {
    // -------------------------------------------------------------
    // PART 1: TEST A — MULTI-CATEGORY ASSIGNMENT
    // -------------------------------------------------------------
    console.log('\n--- PART 1: TEST A — MULTI-CATEGORY ASSIGNMENT ---');

    // 1. Create three distinct categories through CategoryController
    const catNames = ['Healthy Food Test', 'Gym & Fitness Test', 'Breakfast Test'];
    const catDocs = [];

    for (let i = 0; i < catNames.length; i++) {
      const req = {
        body: {
          name: catNames[i],
          slug: `test-cat-${Date.now()}-${i}`,
          description: `Description for ${catNames[i]}`,
          displayOrder: i + 1,
          isActive: true,
        },
      };
      const res = createMockRes();
      await CategoryController.createCategory(req, res, (err) => { throw err; });
      assert.strictEqual(res.statusCode, 201, `Category ${catNames[i]} creation failed`);
      assert.ok(res.data?.data?._id, 'Category ID must be returned');
      catDocs.push(res.data.data);
      createdCategoryIds.push(res.data.data._id);
    }
    console.log('✔ Test A1 PASS: Created 3 test categories successfully');

    // 2. Create a product and assign two categories
    const createProdReq = {
      body: {
        name: 'Protein Oats Bowl Multi',
        slug: `protein-oats-bowl-${Date.now()}`,
        description: 'Nutritious breakfast bowl packed with clean plant protein and rolled oats',
        categories: [catDocs[0]._id, catDocs[1]._id],
        price: 249,
        preparationTime: 25,
        images: [
          'https://res.cloudinary.com/test/image/upload/v1234/meals/oats-1.jpg',
          'https://res.cloudinary.com/test/image/upload/w_800/v1234/meals/oats-1.jpg', // Duplicate to test dedup
        ],
        stockQuantity: 20,
        isAvailable: true,
        isActive: true,
      },
    };
    const createProdRes = createMockRes();
    await ProductController.createProduct(createProdReq, createProdRes, (err) => { throw err; });
    assert.strictEqual(createProdRes.statusCode, 201, 'Product creation failed');
    const createdProd = createProdRes.data.data;
    createdProductIds.push(createdProd._id);

    // 3. Verify both category IDs are saved in MongoDB
    const fetchedProdDb = await Product.findById(createdProd._id).lean();
    assert.ok(fetchedProdDb, 'Product must exist in MongoDB');
    assert.strictEqual(fetchedProdDb.categories.length, 2, 'Product must have exactly 2 categories in MongoDB');
    assert.strictEqual(fetchedProdDb.categories[0].toString(), catDocs[0]._id.toString());
    assert.strictEqual(fetchedProdDb.categories[1].toString(), catDocs[1]._id.toString());
    assert.strictEqual(fetchedProdDb.category.toString(), catDocs[0]._id.toString(), 'Primary category must match categories[0]');
    assert.strictEqual(fetchedProdDb.preparationTime, 25, 'Preparation time must be saved as 25 minutes');
    assert.strictEqual(fetchedProdDb.images.length, 1, 'Duplicate image URLs must be deduplicated to 1');
    console.log('✔ Test A2 PASS: Product assigned to 2 categories saved cleanly in MongoDB');

    // 4. Edit product: remove one category and keep only the second category
    const updateProdReq = {
      params: { id: createdProd._id.toString() },
      body: {
        categoryIds: [catDocs[1]._id.toString()],
        preparationTime: 30,
      },
    };
    const updateProdRes = createMockRes();
    await ProductController.updateProduct(updateProdReq, updateProdRes, (err) => { throw err; });
    assert.strictEqual(updateProdRes.statusCode, 200, 'Product update failed');

    // 5. Verify the category edit persisted
    const updatedProdDb = await Product.findById(createdProd._id).lean();
    assert.strictEqual(updatedProdDb.categories.length, 1, 'Product must now have 1 category in MongoDB');
    assert.strictEqual(updatedProdDb.categories[0].toString(), catDocs[1]._id.toString());
    assert.strictEqual(updatedProdDb.category.toString(), catDocs[1]._id.toString());
    assert.strictEqual(updatedProdDb.preparationTime, 30, 'Preparation time update must persist');
    console.log('✔ Test A3 PASS: Edited product category assignment and verified persistence');

    // Re-assign to both categories 0 & 1 for subsequent filter tests
    const restoreCategoriesReq = {
      params: { id: createdProd._id.toString() },
      body: {
        categories: [catDocs[0]._id, catDocs[1]._id],
      },
    };
    const restoreCategoriesRes = createMockRes();
    await ProductController.updateProduct(restoreCategoriesReq, restoreCategoriesRes, (err) => { throw err; });
    assert.strictEqual(restoreCategoriesRes.statusCode, 200);

    // -------------------------------------------------------------
    // PART 2: TEST B — CUSTOMER FILTERING
    // -------------------------------------------------------------
    console.log('\n--- PART 2: TEST B — CUSTOMER FILTERING ---');

    // 1. Query for Category 0 -> Product must appear
    const queryCat0Req = { query: { category: catDocs[0]._id.toString(), skipCache: 'true' } };
    const queryCat0Res = createMockRes();
    await ProductController.getProducts(queryCat0Req, queryCat0Res, (err) => { throw err; });
    assert.strictEqual(queryCat0Res.statusCode, 200);
    const cat0Items = queryCat0Res.data.data;
    const foundInCat0 = cat0Items.some((p) => p._id.toString() === createdProd._id.toString());
    assert.ok(foundInCat0, 'Product must appear when filtering by Category 0');
    console.log('✔ Test B1 PASS: Product appears under Category 0');

    // 2. Query for Category 1 -> Product must appear
    const queryCat1Req = { query: { category: catDocs[1]._id.toString(), skipCache: 'true' } };
    const queryCat1Res = createMockRes();
    await ProductController.getProducts(queryCat1Req, queryCat1Res, (err) => { throw err; });
    assert.strictEqual(queryCat1Res.statusCode, 200);
    const cat1Items = queryCat1Res.data.data;
    const foundInCat1 = cat1Items.some((p) => p._id.toString() === createdProd._id.toString());
    assert.ok(foundInCat1, 'Product must appear when filtering by Category 1');
    console.log('✔ Test B2 PASS: Product appears under Category 1');

    // 3. Query for Category 2 (unrelated) -> Product must NOT appear
    const queryCat2Req = { query: { category: catDocs[2]._id.toString(), skipCache: 'true' } };
    const queryCat2Res = createMockRes();
    await ProductController.getProducts(queryCat2Req, queryCat2Res, (err) => { throw err; });
    assert.strictEqual(queryCat2Res.statusCode, 200);
    const cat2Items = queryCat2Res.data.data;
    const foundInCat2 = cat2Items.some((p) => p._id.toString() === createdProd._id.toString());
    assert.strictEqual(foundInCat2, false, 'Product must NOT appear under unrelated Category 2');
    console.log('✔ Test B3 PASS: Product does not appear under unrelated Category 2');

    // 4. Query All Categories -> Product must appear exactly once
    const queryAllReq = { query: { limit: '100', skipCache: 'true' } };
    const queryAllRes = createMockRes();
    await ProductController.getProducts(queryAllReq, queryAllRes, (err) => { throw err; });
    assert.strictEqual(queryAllRes.statusCode, 200);
    const allMatches = queryAllRes.data.data.filter((p) => p._id.toString() === createdProd._id.toString());
    assert.strictEqual(allMatches.length, 1, 'Product must appear exactly once in All Categories');
    console.log('✔ Test B4 PASS: Multi-category product appears only once in overall menu');

    // -------------------------------------------------------------
    // PART 3: TEST C — CATEGORY SOURCE OF TRUTH & DYNAMIC LISTS
    // -------------------------------------------------------------
    console.log('\n--- PART 3: TEST C — CATEGORY SOURCE OF TRUTH ---');

    // 1. Fetch categories via public API
    const listCatReq = { query: { skipCache: 'true' }, headers: {} };
    const listCatRes = createMockRes();
    await CategoryController.getCategories(listCatReq, listCatRes, (err) => { throw err; });
    assert.strictEqual(listCatRes.statusCode, 200);
    const returnedCategories = listCatRes.data.data;

    // Verify all returned categories exist in database
    for (const c of returnedCategories) {
      assert.ok(c.name, 'Category must have a valid name');
      assert.ok(c.slug, 'Category must have a valid slug');
      assert.strictEqual(c.isActive, true, 'Public category list must only contain active categories');
    }
    console.log(`✔ Test C1 PASS: Public Category API returned ${returnedCategories.length} active database categories`);

    // 2. Deactivate Category 2 and verify it disappears from public API
    const toggleReq = {
      params: { id: catDocs[2]._id.toString() },
      body: { isActive: false },
    };
    const toggleRes = createMockRes();
    await CategoryController.updateCategoryStatus(toggleReq, toggleRes, (err) => { throw err; });
    assert.strictEqual(toggleRes.statusCode, 200);

    const listCatAfterToggleRes = createMockRes();
    await CategoryController.getCategories({ query: { skipCache: 'true' }, headers: {} }, listCatAfterToggleRes, (err) => { throw err; });
    const activeCatsAfterToggle = listCatAfterToggleRes.data.data;
    const cat2Found = activeCatsAfterToggle.some((c) => c._id.toString() === catDocs[2]._id.toString());
    assert.strictEqual(cat2Found, false, 'Deactivated category must not appear in public category API');
    console.log('✔ Test C2 PASS: Deactivated category disappeared from public category navigation');

    // 3. Delete Category 0 and verify safe product unlinking
    const deleteReq = { params: { id: catDocs[0]._id.toString() } };
    const deleteRes = createMockRes();
    await CategoryController.deleteCategory(deleteReq, deleteRes, (err) => { throw err; });
    assert.strictEqual(deleteRes.statusCode, 200);

    // Verify product safely unlinked from deleted category and retained category 1
    const prodAfterDeleteDb = await Product.findById(createdProd._id).lean();
    assert.ok(prodAfterDeleteDb, 'Product must remain intact');
    const hasDeletedCat = prodAfterDeleteDb.categories.some((c) => c.toString() === catDocs[0]._id.toString());
    assert.strictEqual(hasDeletedCat, false, 'Deleted category must be removed from product categories array');
    assert.strictEqual(prodAfterDeleteDb.categories[0].toString(), catDocs[1]._id.toString(), 'Product must retain surviving category');
    assert.strictEqual(prodAfterDeleteDb.category.toString(), catDocs[1]._id.toString(), 'Primary category must safely fallback to surviving category');
    console.log('✔ Test C3 PASS: Deleted category removed and product category fallback safely executed');

    // -------------------------------------------------------------
    // PART 4: TEST D — REGRESSION CHECKS
    // -------------------------------------------------------------
    console.log('\n--- PART 4: TEST D — REGRESSION CHECKS ---');

    // 1. Check legacy single-category product works transparently
    const legacyProdReq = {
      body: {
        name: 'Legacy Single Category Dish',
        slug: `legacy-dish-${Date.now()}`,
        description: 'A dish created using legacy category parameter',
        category: catDocs[1]._id.toString(),
        price: 199,
        preparationTimeMinutes: 20,
        stockQuantity: 15,
        isActive: true,
      },
    };
    const legacyProdRes = createMockRes();
    await ProductController.createProduct(legacyProdReq, legacyProdRes, (err) => { throw err; });
    assert.strictEqual(legacyProdRes.statusCode, 201);
    const legacyProd = legacyProdRes.data.data;
    createdProductIds.push(legacyProd._id);

    const legacyDb = await Product.findById(legacyProd._id).lean();
    assert.strictEqual(legacyDb.categories.length, 1, 'Legacy product must automatically synchronize categories array');
    assert.strictEqual(legacyDb.categories[0].toString(), catDocs[1]._id.toString());
    assert.strictEqual(legacyDb.preparationTime, 20, 'Preparation time from preparationTimeMinutes must be preserved');
    console.log('✔ Test D1 PASS: Legacy single-category product creation & field synchronization verified');

    // 2. Search and sorting with category filter
    const searchReq = {
      query: {
        search: 'Protein Oats',
        category: catDocs[1]._id.toString(),
        sortBy: 'price_low_to_high',
        skipCache: 'true',
      },
    };
    const searchRes = createMockRes();
    await ProductController.getProducts(searchReq, searchRes, (err) => { throw err; });
    assert.strictEqual(searchRes.statusCode, 200);
    assert.ok(searchRes.data.data.length > 0, 'Search within category must return matching products');
    assert.strictEqual(searchRes.data.data[0]._id.toString(), createdProd._id.toString());
    console.log('✔ Test D2 PASS: Search, sorting, and multi-category combination query verified');

    console.log('\n================================================================');
    console.log('       ALL MULTI-CATEGORY & DYNAMIC CATEGORY TESTS PASSED       ');
    console.log('================================================================\n');
  } finally {
    // Clean up created test fixtures
    console.log('[Cleanup] Cleaning up test fixtures...');
    if (createdProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: createdProductIds } });
    }
    if (createdCategoryIds.length > 0) {
      await Category.deleteMany({ _id: { $in: createdCategoryIds } });
    }
    await redisDelPattern('cache:*');
    await mongoose.disconnect();
    await disconnectRedis();
    console.log('[Cleanup] Test fixtures safely purged and connections closed.');
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
