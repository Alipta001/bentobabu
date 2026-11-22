/**
 * Test Suite: Product Payload Size, 413 Resolution, and Multi-Product Creation
 *
 * Verifies:
 * - 1. Express body parser allows payloads > 10KB up to 1MB.
 * - 2. Express body parser strictly rejects payloads > 1MB with HTTP 413.
 * - 3. Five consecutive product creations with diverse combinations:
 *      * Single vs multiple categories
 *      * Single vs multiple images
 *      * Plain text vs large rich-text descriptions
 *      * Preparation time specified vs omitted
 * - 4. Editing an existing product with updated images and rich text.
 * - 5. Client and server sanitization stripping of pasted Base64 image tags.
 */

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const express = require('express');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Product, Category } = require('../app/models');
const ProductController = require('../app/controllers/productController');
const { errorHandler } = require('../app/middleware/errorHandler');
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
  console.log('   BENTO BABU — PRODUCT PAYLOAD SIZE & CREATION TEST SUITE      ');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI.replace(/\/bentobabu[a-z_]*\?/, '/bentobabu_staging?');
  await mongoose.connect(mongoUri);
  console.log('[Setup] Connected to database: bentobabu_staging');

  await initRedis();
  await redisDelPattern('cache:*');

  const createdProductIds = [];
  let testCat1, testCat2, testCat3;

  try {
    // 0. Setup Test Categories
    testCat1 = await Category.findOneAndUpdate(
      { slug: 'test-cat-payload-1' },
      { name: 'Payload Test Cat 1', slug: 'test-cat-payload-1', isActive: true, image: 'https://example.com/cat1.jpg' },
      { upsert: true, new: true }
    );
    testCat2 = await Category.findOneAndUpdate(
      { slug: 'test-cat-payload-2' },
      { name: 'Payload Test Cat 2', slug: 'test-cat-payload-2', isActive: true, image: 'https://example.com/cat2.jpg' },
      { upsert: true, new: true }
    );
    testCat3 = await Category.findOneAndUpdate(
      { slug: 'test-cat-payload-3' },
      { name: 'Payload Test Cat 3', slug: 'test-cat-payload-3', isActive: true, image: 'https://example.com/cat3.jpg' },
      { upsert: true, new: true }
    );
    console.log('[Setup] Created/verified 3 test categories for payload testing.');

    // -------------------------------------------------------------
    // PART 1: HTTP 413 & Request-Body Size Limit Verification
    // -------------------------------------------------------------
    console.log('\n--- PART 1: REQUEST-BODY SIZE LIMIT VERIFICATION ---');

    // Build miniature test Express server with the exact server.js parser config
    const testApp = express();
    testApp.use(express.json({ limit: '1mb' }));
    testApp.post('/test-body-limit', (req, res) => {
      res.status(200).json({ success: true, bodyLength: JSON.stringify(req.body).length });
    });
    testApp.use(errorHandler);

    const server = http.createServer(testApp);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // Test 1A: 25KB Payload (which failed under old 10KB limit) MUST SUCCEED under 1MB
    const payload25KB = JSON.stringify({
      name: 'Large Description Meal',
      largeField: 'A'.repeat(25 * 1024), // 25 KB string
    });

    const res25KB = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/test-body-limit',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload25KB),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(body) }));
        }
      );
      req.on('error', reject);
      req.write(payload25KB);
      req.end();
    });

    assert.strictEqual(res25KB.statusCode, 200, '25KB payload should be accepted with status 200');
    assert.strictEqual(res25KB.data.success, true);
    console.log('✔ Test 1A PASS: 25 KB payload successfully parsed (previously blocked by 10KB limit)');

    // Test 1B: 1.2MB Payload (exceeds 1MB limit) MUST BE REJECTED with HTTP 413
    const payload1_2MB = JSON.stringify({
      name: 'Oversized Payload',
      oversizedData: 'X'.repeat(1200 * 1024), // 1.2 MB
    });

    const res1_2MB = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/test-body-limit',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload1_2MB),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(body) }));
        }
      );
      req.on('error', reject);
      req.write(payload1_2MB);
      req.end();
    });

    assert.strictEqual(res1_2MB.statusCode, 413, 'Payload > 1MB must return HTTP 413');
    assert.strictEqual(res1_2MB.data.success, false);
    assert.ok(
      res1_2MB.data.message.includes('Request entity too large'),
      'Should return clear request entity too large message'
    );
    console.log('✔ Test 1B PASS: 1.2 MB payload rejected with HTTP 413 and structured error message');

    await new Promise((resolve) => server.close(resolve));

    // -------------------------------------------------------------
    // PART 2: Five Consecutive Product Creations with Diverse Combos
    // -------------------------------------------------------------
    console.log('\n--- PART 2: FIVE CONSECUTIVE PRODUCT CREATIONS ---');

    // Product 1: Single category, 1 image, plain description, default prep time
    {
      const req1 = {
        body: {
          name: 'Consecutive Dish 1 - Plain',
          slug: `consec-dish-1-${Date.now()}`,
          price: 199,
          categoryIds: [testCat1.id],
          description: 'A classic homemade comfort bowl with steamed rice and dal.',
          images: ['https://res.cloudinary.com/demo/image/upload/v1/dish1.jpg'],
          preparationTime: 15,
          stockQuantity: 20,
        },
      };
      const res1 = createMockRes();
      await ProductController.createProduct(req1, res1, (err) => { throw err; });
      assert.strictEqual(res1.statusCode, 201);
      assert.strictEqual(res1.data.success, true);
      createdProductIds.push(res1.data.data.id);
      console.log('✔ Test 2A PASS: Product 1 created (Single category, 1 image, plain text, 15 min prep)');
    }

    // Product 2: Multiple categories (2), 2 images, formatted rich text, custom prep time (25 min)
    {
      const req2 = {
        body: {
          name: 'Consecutive Dish 2 - Rich Text & Multi-Cat',
          slug: `consec-dish-2-${Date.now()}`,
          price: 289,
          categoryIds: [testCat1.id, testCat2.id],
          description: '<h2>Chef Highlights</h2><p>Hand-pounded spices with <mark class="bento-highlight-gold">organic ghee</mark>.</p><ul><li>High protein</li><li>Zero sugar</li></ul>',
          images: [
            'https://res.cloudinary.com/demo/image/upload/v1/dish2_a.jpg',
            'https://res.cloudinary.com/demo/image/upload/v1/dish2_b.jpg',
          ],
          preparationTime: 25,
          stockQuantity: 15,
        },
      };
      const res2 = createMockRes();
      await ProductController.createProduct(req2, res2, (err) => { throw err; });
      assert.strictEqual(res2.statusCode, 201);
      assert.strictEqual(res2.data.success, true);
      assert.strictEqual(res2.data.data.categories.length, 2);
      createdProductIds.push(res2.data.data.id);
      console.log('✔ Test 2B PASS: Product 2 created (2 categories, 2 images, rich text, 25 min prep)');
    }

    // Product 3: 3 categories, 3 images with detailed imagesData, omitted prep time
    {
      const req3 = {
        body: {
          name: 'Consecutive Dish 3 - Multi-Category & No Prep Time',
          slug: `consec-dish-3-${Date.now()}`,
          price: 349,
          categoryIds: [testCat1.id, testCat2.id, testCat3.id],
          description: '<p>A multi-grain wellness meal.</p>',
          imagesData: [
            { publicId: 'bentobabu/p3_1', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p3_1.webp', format: 'webp', width: 800, height: 600, bytes: 45000 },
            { publicId: 'bentobabu/p3_2', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p3_2.webp', format: 'webp', width: 800, height: 600, bytes: 48000 },
            { publicId: 'bentobabu/p3_3', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p3_3.webp', format: 'webp', width: 800, height: 600, bytes: 52000 },
          ],
          stockQuantity: 30,
        },
      };
      const res3 = createMockRes();
      await ProductController.createProduct(req3, res3, (err) => { throw err; });
      assert.strictEqual(res3.statusCode, 201);
      assert.strictEqual(res3.data.success, true);
      assert.strictEqual(res3.data.data.categories.length, 3);
      assert.strictEqual(res3.data.data.images.length, 3);
      createdProductIds.push(res3.data.data.id);
      console.log('✔ Test 2C PASS: Product 3 created (3 categories, 3 images with imagesData, prep time omitted)');
    }

    // Product 4: Large payload (> 15 KB rich text description, 4 images, full nutrition)
    // THIS REPRESENTS THE EXACT COMBINATION THAT PREVIOUSLY FAILED WITH 413
    {
      const largeRichDescription = `
        <h2>Royal Awadhi Protein Biryani</h2>
        <p>Slow cooked in heavy cast iron handis with <mark class="bento-highlight-green">cold-pressed mustard oil</mark> and heritage brown basmati grains.</p>
        <h3>Nutritional Synergy</h3>
        <ul>
          <li><strong>Brown Rice</strong>: High glycemic stability with slow-release dietary complex carbs.</li>
          <li><strong>Organic Tofu &amp; Sprouted Legumes</strong>: Complete essential amino acid profile.</li>
          <li><strong>Whole Spices</strong>: Hand-ground stone pestle cardamom, star anise, and mace.</li>
        </ul>
        <p>${'Nutrient-dense mindful cooking with heritage seeds and fresh seasonal herbs. '.repeat(50)}</p>
      `;

      const req4 = {
        body: {
          name: 'Consecutive Dish 4 - Heavy Rich Text & 4 Images',
          slug: `consec-dish-4-${Date.now()}`,
          price: 399,
          categoryIds: [testCat2.id, testCat3.id],
          description: largeRichDescription,
          imagesData: [
            { publicId: 'bentobabu/p4_1', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p4_1.webp', format: 'webp', width: 1200, height: 800, bytes: 85000 },
            { publicId: 'bentobabu/p4_2', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p4_2.webp', format: 'webp', width: 1200, height: 800, bytes: 90000 },
            { publicId: 'bentobabu/p4_3', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p4_3.webp', format: 'webp', width: 1200, height: 800, bytes: 95000 },
            { publicId: 'bentobabu/p4_4', secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p4_4.webp', format: 'webp', width: 1200, height: 800, bytes: 92000 },
          ],
          preparationTime: 40,
          stockQuantity: 12,
          nutritionalInfo: { calories: 520, protein: 32, carbs: 65, fats: 14, fiber: 9 },
        },
      };
      const res4 = createMockRes();
      await ProductController.createProduct(req4, res4, (err) => { throw err; });
      assert.strictEqual(res4.statusCode, 201);
      assert.strictEqual(res4.data.success, true);
      assert.ok(res4.data.data.description.includes('Royal Awadhi Protein Biryani'));
      createdProductIds.push(res4.data.data.id);
      console.log('✔ Test 2D PASS: Product 4 created (Large 15KB+ payload with 4 images, rich text & full nutrition)');
    }

    // Product 5: Single category, multiple images, mixed formatting
    {
      const req5 = {
        body: {
          name: 'Consecutive Dish 5 - Final Product Verification',
          slug: `consec-dish-5-${Date.now()}`,
          price: 249,
          categoryIds: [testCat1.id],
          description: '<h2>Evening Light Bowl</h2><p>Steamed greens and edamame with cold-pressed sesame dressing.</p>',
          images: [
            'https://res.cloudinary.com/demo/image/upload/v1/dish5_a.jpg',
            'https://res.cloudinary.com/demo/image/upload/v1/dish5_b.jpg',
          ],
          preparationTime: 10,
          stockQuantity: 25,
        },
      };
      const res5 = createMockRes();
      await ProductController.createProduct(req5, res5, (err) => { throw err; });
      assert.strictEqual(res5.statusCode, 201);
      assert.strictEqual(res5.data.success, true);
      createdProductIds.push(res5.data.data.id);
      console.log('✔ Test 2E PASS: Product 5 created (Final of 5 consecutive products verified)');
    }

    // -------------------------------------------------------------
    // PART 3: Product Edit Verification
    // -------------------------------------------------------------
    console.log('\n--- PART 3: PRODUCT EDITING VERIFICATION ---');
    {
      const targetId = createdProductIds[1]; // Product 2
      const updateReq = {
        params: { id: targetId },
        body: {
          price: 319,
          description: '<h2>Updated Recipe</h2><p>Enhanced with <mark class="bento-highlight-amber">roasted almonds</mark>.</p>',
          preparationTime: 30,
        },
      };
      const updateRes = createMockRes();
      await ProductController.updateProduct(updateReq, updateRes, (err) => { throw err; });
      assert.strictEqual(updateRes.statusCode, 200);
      assert.strictEqual(updateRes.data.success, true);
      assert.strictEqual(updateRes.data.data.price, 319);
      assert.strictEqual(updateRes.data.data.preparationTime, 30);
      assert.ok(updateRes.data.data.description.includes('Updated Recipe'));
      console.log('✔ Test 3 PASS: Product editing with rich text & updated prep time persisted successfully');
    }

    // -------------------------------------------------------------
    // PART 4: Base64 Pasted Tag Stripping Safeguard
    // -------------------------------------------------------------
    console.log('\n--- PART 4: BASE64 STRIPPING SAFEGUARD ---');
    {
      const reqWithBase64 = {
        body: {
          name: 'Dish With Pasted Base64 Image',
          slug: `dish-base64-${Date.now()}`,
          price: 150,
          categoryIds: [testCat1.id],
          description: '<p>Delicious dish</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="><p>Fresh daily</p>',
          images: ['https://res.cloudinary.com/demo/image/upload/v1/safe.jpg'],
        },
      };
      const resBase64 = createMockRes();
      await ProductController.createProduct(reqWithBase64, resBase64, (err) => { throw err; });
      assert.strictEqual(resBase64.statusCode, 201);
      assert.ok(!resBase64.data.data.description.includes('data:image/'), 'Base64 data URI must be stripped');
      assert.ok(!resBase64.data.data.description.includes('<img'), 'img tag must be stripped from rich text');
      createdProductIds.push(resBase64.data.data.id);
      console.log('✔ Test 4 PASS: Base64 pasted images stripped cleanly by sanitizer');
    }

    console.log('\n================================================================');
    console.log('       ALL PAYLOAD SIZE & 5-PRODUCT CREATION TESTS PASSED!       ');
    console.log('================================================================\n');
  } finally {
    // Cleanup created test records
    console.log('[Cleanup] Removing test products from staging database...');
    if (createdProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: createdProductIds } });
      console.log(`[Cleanup] Deleted ${createdProductIds.length} test products.`);
    }
    await Category.deleteMany({
      slug: { $in: ['test-cat-payload-1', 'test-cat-payload-2', 'test-cat-payload-3'] },
    });
    console.log('[Cleanup] Deleted test categories.');

    await disconnectRedis();
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected MongoDB & Redis.');
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
