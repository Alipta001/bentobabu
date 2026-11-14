/**
 * Comprehensive Phase 4 Test Suite: Product & Menu APIs
 * Verifies all 30 requirements:
 * Category Tests:
 * 1. Public category listing
 * 2. Inactive categories excluded
 * 3. Category details by slug
 * 4. ADMIN category creation
 * 5. CUSTOMER cannot create categories
 * 6. Duplicate slug rejection
 * 7. Category update
 * 8. Category activation/deactivation
 *
 * Product Tests:
 * 9. Public product listing
 * 10. Product detail by slug
 * 11. Search functionality
 * 12. Category filtering
 * 13. Dietary tag filtering
 * 14. Meal type filtering
 * 15. Price range filtering
 * 16. Sorting
 * 17. Pagination
 * 18. Inactive products excluded
 * 19. Unavailable products excluded from normal browsing
 * 20. Featured products endpoint
 * 21. ADMIN product creation
 * 22. CUSTOMER cannot create products
 * 23. Invalid product data rejection
 * 24. Duplicate slug rejection
 * 25. Product update
 * 26. Product availability toggle
 * 27. Product stock update
 * 28. Soft deletion
 * 29. Invalid ObjectId handling
 * 30. Maximum pagination limit enforcement
 * + Class-based static async method convention verification
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { User, Category, Product } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');

const CategoryController = require('../app/controllers/categoryController');
const ProductController = require('../app/controllers/productController');

const env = validateEnv();
const host = '127.0.0.1';
const port = env.port || 5000;

const makeRequest = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 4 CATALOG VERIFICATION ');
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

  // Connect to DB and start HTTP server
  await connectDB();
  const { startServer } = require('../server');
  const serverInstance = await startServer();

  const timestamp = Date.now();

  let adminUser = null;
  let adminToken = null;
  let customerUser = null;
  let customerToken = null;

  let activeCat1 = null;
  let inactiveCat = null;
  let activeProduct1 = null;
  let unavailableProduct = null;
  let inactiveProduct = null;

  try {
    // Initial cleanup of any lingering records from previously killed runs
    await Category.deleteMany({ slug: { $in: ['gym-fitness', 'seasonal-monsoon-specials'] } });
    await Product.deleteMany({
      slug: {
        $in: [
          'grilled-herb-paneer-bowl',
          'sprouted-moong-salad',
          'roast-chicken-protein-box',
          'out-of-stock-millet-upma',
          'discontinued-spinach-wrap',
        ],
      },
    });

    // Controller Class-Based Static Convention Verification
    await test('Class-based static async controller convention verification', () => {
      assert.strictEqual(typeof CategoryController, 'function');
      assert.strictEqual(typeof CategoryController.getCategories, 'function');
      assert.strictEqual(CategoryController.prototype.getCategories, undefined, 'Must be static method');

      assert.strictEqual(typeof ProductController, 'function');
      assert.strictEqual(typeof ProductController.getProducts, 'function');
      assert.strictEqual(ProductController.prototype.getProducts, undefined, 'Must be static method');
    });

    // Setup Test Users: ADMIN and CUSTOMER
    const pwHash = await bcrypt.hash('Password123#', 12);
    adminUser = await User.create({
      name: 'Catalog Admin',
      email: `admin_cat_${timestamp}@bento.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'ADMIN',
      isActive: true,
    });
    adminToken = generateAccessToken(adminUser);

    customerUser = await User.create({
      name: 'Regular Customer',
      email: `cust_cat_${timestamp}@bento.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'CUSTOMER',
      isActive: true,
    });
    customerToken = generateAccessToken(customerUser);

    // ==========================================
    // CATEGORY TESTS
    // ==========================================

    // 4. ADMIN category creation
    await test('4. ADMIN category creation (POST /api/v1/categories)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/categories',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Gym & Fitness',
          description: 'High-protein, calorie-controlled meals',
          image: 'https://cdn.bentobabu.in/gym.jpg',
          displayOrder: 1,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.name, 'Gym & Fitness');
      assert.strictEqual(res.body.data.slug, 'gym-fitness');
      activeCat1 = res.body.data;
    });

    // 5. CUSTOMER cannot create categories
    await test('5. CUSTOMER cannot create categories (403 Forbidden)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/categories',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`,
          },
        },
        {
          name: 'Hacked Category',
        }
      );

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
    });

    // 6. Duplicate slug rejection
    await test('6. Duplicate slug rejection (409 Conflict)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/categories',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Gym & Fitness', // same slug
        }
      );

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.success, false);
    });

    // Create a second inactive category for filtering tests
    const inactRes = await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/categories',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Seasonal Monsoon Specials',
        isActive: false,
        displayOrder: 10,
      }
    );
    inactiveCat = inactRes.body.data;

    // 1. Public category listing
    await test('1. Public category listing (GET /api/v1/categories)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/categories',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const gymCat = res.body.data.find((c) => c.slug === 'gym-fitness');
      assert.ok(gymCat, 'Gym & Fitness category should be present in public listing');
    });

    // 2. Inactive categories excluded
    await test('2. Inactive categories excluded from public listing', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/categories',
        method: 'GET',
      });

      const inact = res.body.data.find((c) => c.slug === 'seasonal-monsoon-specials');
      assert.strictEqual(inact, undefined, 'Inactive category must be excluded from public listing');
    });

    // 3. Category details by slug
    await test('3. Category details by slug (GET /api/v1/categories/:slug)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/categories/gym-fitness',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.name, 'Gym & Fitness');

      // Non-existent slug returns 404
      const res404 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/categories/non-existent-slug-xyz',
        method: 'GET',
      });
      assert.strictEqual(res404.statusCode, 404);
    });

    // 7. Category update
    await test('7. Category update (PATCH /api/v1/categories/:id)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/categories/${activeCat1.id}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          description: 'Updated high-protein gym diet description',
          displayOrder: 2,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.description, 'Updated high-protein gym diet description');
      assert.strictEqual(res.body.data.displayOrder, 2);
    });

    // 8. Category activation/deactivation
    await test('8. Category activation/deactivation (PATCH /api/v1/categories/:id/status)', async () => {
      // Activate the inactive category
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/categories/${inactiveCat.id}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isActive: true }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.isActive, true);

      // Re-deactivate
      await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/categories/${inactiveCat.id}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isActive: false }
      );
    });

    // ==========================================
    // PRODUCT TESTS
    // ==========================================

    // 21. ADMIN product creation
    await test('21. ADMIN product creation (POST /api/v1/products)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Grilled Herb Paneer Bowl',
          description: 'Marinated low-fat cottage cheese with brown rice and steamed greens',
          category: activeCat1.id,
          price: 249,
          compareAtPrice: 299,
          ingredients: ['Low Fat Paneer', 'Brown Rice', 'Broccoli', 'Bell Peppers'],
          portionSize: '350g bowl',
          dietaryTags: ['VEG', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
          mealTypes: ['LUNCH', 'DINNER'],
          nutrition: {
            calories: 420,
            protein: 28,
            carbohydrates: 45,
            fat: 12,
            fibre: 8,
          },
          stockQuantity: 25,
          isAvailable: true,
          isFeatured: true,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.slug, 'grilled-herb-paneer-bowl');
      assert.strictEqual(res.body.data.price, 249);
      activeProduct1 = res.body.data;
    });

    // 22. CUSTOMER cannot create products
    await test('22. CUSTOMER cannot create products (403 Forbidden)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`,
          },
        },
        {
          name: 'Illegal Product',
          price: 100,
          category: activeCat1.id,
        }
      );

      assert.strictEqual(res.statusCode, 403);
    });

    // 23. Invalid product data rejection
    await test('23. Invalid product data rejection (negative price / bad category)', async () => {
      const resBadPrice = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Bad Price Dish',
          price: -50,
          category: activeCat1.id,
        }
      );
      assert.strictEqual(resBadPrice.statusCode, 400);

      // Inactive or invalid category reference
      const resBadCat = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Dish in Inactive Cat',
          price: 150,
          category: inactiveCat.id,
        }
      );
      assert.strictEqual(resBadCat.statusCode, 400);
    });

    // 24. Duplicate slug rejection
    await test('24. Duplicate slug rejection (409 Conflict)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Grilled Herb Paneer Bowl', // duplicate slug
          price: 250,
          category: activeCat1.id,
        }
      );

      assert.strictEqual(res.statusCode, 409);
    });

    // Create additional products for filtering, sorting and search tests
    await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Sprouted Moong Salad',
        description: 'Crisp green moong sprouts tossed with lemon and Himalayan pink salt',
        category: activeCat1.id,
        price: 149,
        dietaryTags: ['VEG', 'LOW_CARB'],
        mealTypes: ['BREAKFAST', 'SNACKS'],
        stockQuantity: 15,
        isAvailable: true,
      }
    );

    await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Roast Chicken Protein Box',
        description: 'Tender chicken breast with mashed sweet potato and asparagus',
        category: activeCat1.id,
        price: 349,
        dietaryTags: ['NON_VEG', 'HIGH_PROTEIN', 'KETO'],
        mealTypes: ['LUNCH', 'DINNER'],
        stockQuantity: 10,
        isAvailable: true,
      }
    );

    // Create an unavailable product (isAvailable: false)
    const unavailRes = await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Out of Stock Millet Upma',
        description: 'Wholesome breakfast upma',
        category: activeCat1.id,
        price: 120,
        stockQuantity: 0,
        isAvailable: false,
      }
    );
    unavailableProduct = unavailRes.body.data;

    // Create an inactive product (isActive: false)
    const inactProdRes = await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Discontinued Spinach Wrap',
        description: 'Wrap that is no longer sold',
        category: activeCat1.id,
        price: 199,
        isActive: false,
      }
    );
    inactiveProduct = inactProdRes.body.data;

    // 9. Public product listing
    await test('9. Public product listing (GET /api/v1/products)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination);
    });

    // 10. Product detail by slug
    await test('10. Product detail by slug (GET /api/v1/products/:slug)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/products/${activeProduct1.slug}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.name, 'Grilled Herb Paneer Bowl');
      assert.strictEqual(res.body.data.category.name, 'Gym & Fitness');

      // 404 for unknown slug
      const res404 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products/unknown-dish-slug-xyz',
        method: 'GET',
      });
      assert.strictEqual(res404.statusCode, 404);
    });

    // 11. Search functionality
    await test('11. Search functionality (GET /api/v1/products?search=Moong)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?search=Moong',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.length > 0);
      assert.ok(res.body.data.some((p) => p.name.includes('Moong')));
    });

    // 12. Category filtering
    await test('12. Category filtering (GET /api/v1/products?category=gym-fitness)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?category=gym-fitness',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.length >= 3);
    });

    // 13. Dietary tag filtering
    await test('13. Dietary tag filtering (GET /api/v1/products?dietaryTags=HIGH_PROTEIN)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?dietaryTags=HIGH_PROTEIN',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.every((p) => p.dietaryTags.includes('HIGH_PROTEIN')));
    });

    // 14. Meal type filtering
    await test('14. Meal type filtering (GET /api/v1/products?mealTypes=BREAKFAST)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?mealTypes=BREAKFAST',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.every((p) => p.mealTypes.includes('BREAKFAST')));
    });

    // 15. Price range filtering
    await test('15. Price range filtering (GET /api/v1/products?minPrice=200&maxPrice=300)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?minPrice=200&maxPrice=300',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.every((p) => p.price >= 200 && p.price <= 300));
    });

    // 16. Sorting
    await test('16. Sorting by price (GET /api/v1/products?sortBy=price_low_to_high)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?sortBy=price_low_to_high',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      const prices = res.body.data.map((p) => p.price);
      for (let i = 0; i < prices.length - 1; i++) {
        assert.ok(prices[i] <= prices[i + 1], 'Prices must be sorted in ascending order');
      }
    });

    // 17. Pagination
    await test('17. Pagination (GET /api/v1/products?page=1&limit=2)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?page=1&limit=2',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.length, 2);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.ok(res.body.pagination.totalPages >= 2);
    });

    // 18. Inactive products excluded
    await test('18. Inactive products excluded from public customer browsing', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'GET',
      });

      const found = res.body.data.find((p) => p.slug === 'discontinued-spinach-wrap');
      assert.strictEqual(found, undefined, 'Inactive product must be excluded from public listing');
    });

    // 19. Unavailable products excluded from normal browsing
    await test('19. Unavailable products excluded from normal browsing', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products',
        method: 'GET',
      });

      const found = res.body.data.find((p) => p.slug === 'out-of-stock-millet-upma');
      assert.strictEqual(found, undefined, 'Unavailable product must be excluded by default');
    });

    // 20. Featured products endpoint
    await test('20. Featured products endpoint (GET /api/v1/products/featured)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products/featured',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.data));
      const paneer = res.body.data.find((p) => p.slug === activeProduct1.slug);
      assert.ok(paneer, 'Featured paneer bowl should be returned in featured collection');
    });

    // 25. Product update
    await test('25. Product update (PATCH /api/v1/products/:id)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/products/${activeProduct1.id}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          price: 269,
          portionSize: '400g bowl',
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.price, 269);
      assert.strictEqual(res.body.data.portionSize, '400g bowl');
    });

    // 26. Product availability toggle
    await test('26. Product availability toggle (PATCH /api/v1/products/:id/availability)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/products/${activeProduct1.id}/availability`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isAvailable: false }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.isAvailable, false);

      // Re-enable availability
      await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/products/${activeProduct1.id}/availability`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isAvailable: true }
      );
    });

    // 27. Product stock update
    await test('27. Product stock update (PATCH /api/v1/products/:id/stock)', async () => {
      // Set stock to 0 -> should auto-mark as unavailable
      const resZero = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/products/${activeProduct1.id}/stock`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { stockQuantity: 0 }
      );

      assert.strictEqual(resZero.statusCode, 200);
      assert.strictEqual(resZero.body.data.stockQuantity, 0);
      assert.strictEqual(resZero.body.data.isAvailable, false);

      // Restore stock
      await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/products/${activeProduct1.id}/stock`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { stockQuantity: 30 }
      );
    });

    // 28. Soft deletion
    await test('28. Soft deletion (DELETE /api/v1/products/:id)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/products/${activeProduct1.id}`,
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);

      // Verify product is still in DB but marked inactive
      const dbProd = await Product.findById(activeProduct1.id);
      assert.ok(dbProd, 'Product record must not be hard deleted from database');
      assert.strictEqual(dbProd.isActive, false, 'Soft deletion must set isActive to false');
    });

    // 29. Invalid ObjectId handling
    await test('29. Invalid ObjectId handling returns 400 Bad Request', async () => {
      const resCat = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/categories/invalid-mongo-id-12345',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { name: 'X' }
      );
      assert.strictEqual(resCat.statusCode, 400);

      const resProd = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/products/invalid-mongo-id-12345',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { price: 100 }
      );
      assert.strictEqual(resProd.statusCode, 400);
    });

    // 30. Maximum pagination limit enforcement
    await test('30. Maximum pagination limit enforcement (capped at 50)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?limit=1000',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.pagination.limit, 50, 'Limit must be capped at 50');
    });
  } finally {
    // Cleanup temporary test records
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (customerUser) await User.deleteOne({ _id: customerUser._id });
    await Category.deleteMany({ slug: { $in: ['gym-fitness', 'seasonal-monsoon-specials'] } });
    await Product.deleteMany({
      slug: {
        $in: [
          'grilled-herb-paneer-bowl',
          'sprouted-moong-salad',
          'roast-chicken-protein-box',
          'out-of-stock-millet-upma',
          'discontinued-spinach-wrap',
        ],
      },
    });

    // Close server and DB connection
    await new Promise((resolve) => serverInstance.close(resolve));
    await mongoose.connection.close(false);
  }

  console.log('\n====================================================');
  console.log(`Phase 4 Verification Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Phase 4 test runner error:', err);
  process.exit(1);
});

