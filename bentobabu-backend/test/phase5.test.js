/**
 * Comprehensive Phase 5 Test Suite: Address, Cart & Delivery Serviceability APIs
 * Verifies all 36 requirements:
 *
 * Address Tests:
 * 1. Customer creates address
 * 2. Invalid PIN code rejected
 * 3. Invalid phone rejected
 * 4. Customer retrieves own addresses
 * 5. Customer cannot retrieve another customer's address
 * 6. Customer updates own address
 * 7. Customer cannot update another customer's address
 * 8. Default address selection works
 * 9. Only one default address per customer
 * 10. Address deletion works
 * 11. Deleted default address is handled correctly
 *
 * Cart Tests:
 * 12. Customer retrieves empty cart
 * 13. Add product to cart
 * 14. Add existing product increases quantity
 * 15. Update cart quantity
 * 16. Remove cart item
 * 17. Clear cart
 * 18. Invalid product ID rejected
 * 19. Inactive product cannot be added
 * 20. Unavailable product cannot be added
 * 21. Insufficient stock rejected
 * 22. Quantity cannot exceed available stock
 * 23. Frontend-supplied price is ignored
 * 24. Cart totals use current database prices
 * 25. Customer cannot access another customer's cart
 * 26. Floating-point monetary calculation edge cases handled correctly
 *
 * Delivery Tests:
 * 27. Invalid PIN code rejected
 * 28. Serviceable PIN code returns correct zone information
 * 29. Unserviceable PIN code returns serviceable false
 * 30. Inactive delivery zones are excluded
 * 31. Available slots are returned
 * 32. Full slots are excluded
 * 33. Inactive slots are excluded
 * 34. Past slots are excluded
 * 35. Invalid date rejected
 * 36. Unserviceable PIN code cannot retrieve delivery slots
 *
 * + Class-based static async controller convention check
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { User, Category, Product, Address, Cart, DeliveryZone, DeliverySlot } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');

const AddressController = require('../app/controllers/addressController');
const CartController = require('../app/controllers/cartController');
const DeliveryController = require('../app/controllers/deliveryController');

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
  console.log('   BENTO BABU BACKEND - PHASE 5 VERIFICATION SUITE   ');
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

  let customer1 = null;
  let token1 = null;
  let customer2 = null;
  let token2 = null;

  let testCategory = null;
  let product1 = null;
  let product2 = null;
  let inactiveProduct = null;
  let unavailableProduct = null;

  let activeZone = null;
  let inactiveZone = null;

  let address1 = null;
  let address2 = null;

  try {
    // Controller convention check
    await test('Class-based static async controller convention verification', () => {
      assert.strictEqual(typeof AddressController, 'function');
      assert.strictEqual(typeof AddressController.createAddress, 'function');
      assert.strictEqual(AddressController.prototype.createAddress, undefined);

      assert.strictEqual(typeof CartController, 'function');
      assert.strictEqual(typeof CartController.getCart, 'function');
      assert.strictEqual(CartController.prototype.getCart, undefined);

      assert.strictEqual(typeof DeliveryController, 'function');
      assert.strictEqual(typeof DeliveryController.checkServiceability, 'function');
      assert.strictEqual(DeliveryController.prototype.checkServiceability, undefined);
    });

    // Setup Test Users
    const pwHash = await bcrypt.hash('Password123#', 12);
    customer1 = await User.create({
      name: 'Customer One',
      email: `cust5_1_${timestamp}@bento.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'CUSTOMER',
      isActive: true,
    });
    token1 = generateAccessToken(customer1);

    customer2 = await User.create({
      name: 'Customer Two',
      email: `cust5_2_${timestamp}@bento.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'CUSTOMER',
      isActive: true,
    });
    token2 = generateAccessToken(customer2);

    // Setup Test Category & Products
    testCategory = await Category.create({
      name: `Category ${timestamp}`,
      slug: `cat-${timestamp}`,
      isActive: true,
    });

    product1 = await Product.create({
      name: 'Paneer Protein Bowl',
      slug: `paneer-bowl-${timestamp}`,
      description: 'High protein fresh paneer with grains',
      category: testCategory._id,
      price: 249.99, // testing floating-point precision
      stockQuantity: 10,
      isAvailable: true,
      isActive: true,
    });

    product2 = await Product.create({
      name: 'Moong Sprout Salad',
      slug: `sprout-salad-${timestamp}`,
      description: 'Sprouted moong with vegetables',
      category: testCategory._id,
      price: 149.50,
      stockQuantity: 5,
      isAvailable: true,
      isActive: true,
    });

    inactiveProduct = await Product.create({
      name: 'Inactive Dish',
      slug: `inactive-dish-${timestamp}`,
      description: 'Test inactive',
      category: testCategory._id,
      price: 100,
      stockQuantity: 10,
      isAvailable: true,
      isActive: false,
    });

    unavailableProduct = await Product.create({
      name: 'Out of Stock Dish',
      slug: `out-of-stock-${timestamp}`,
      description: 'Test unavailable',
      category: testCategory._id,
      price: 120,
      stockQuantity: 0,
      isAvailable: false,
      isActive: true,
    });

    // Setup Test Delivery Zones
    await DeliveryZone.deleteMany({ pincodes: { $in: ['700120', '700121', '700199'] } });
    activeZone = await DeliveryZone.create({
      name: 'Barrackpore Station',
      pincodes: ['700120', '700121'],
      deliveryCharge: 30,
      minimumOrderAmount: 149,
      estimatedDeliveryMinutes: 35,
      isActive: true,
    });

    inactiveZone = await DeliveryZone.create({
      name: 'Shyamnagar Outskirts',
      pincodes: ['700199'],
      deliveryCharge: 50,
      minimumOrderAmount: 299,
      estimatedDeliveryMinutes: 60,
      isActive: false,
    });

    // ==========================================
    // 1. ADDRESS TESTS
    // ==========================================

    // 1. Customer creates address
    await test('1. Customer creates address (POST /api/v1/addresses)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/addresses',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          fullName: 'Customer One',
          phone: '9876543210',
          addressLine: '12 SN Banerjee Road, Anandapuri',
          landmark: 'Near Post Office',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700120',
          addressType: 'HOME',
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.pincode, '700120');
      assert.strictEqual(res.body.data.isDefault, true, 'First address must be set as default automatically');
      address1 = res.body.data;
    });

    // 2. Invalid PIN code rejected
    await test('2. Invalid PIN code rejected (400 Bad Request)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/addresses',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          fullName: 'Customer One',
          phone: '9876543210',
          addressLine: 'Test Address',
          pincode: '700', // invalid 3-digit pin
        }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 3. Invalid phone rejected
    await test('3. Invalid phone rejected (400 Bad Request)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/addresses',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          fullName: 'Customer One',
          phone: '12345', // invalid phone
          addressLine: 'Test Address',
          pincode: '700120',
        }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 4. Customer retrieves own addresses
    await test('4. Customer retrieves own addresses (GET /api/v1/addresses)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/addresses',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.data.length, 1);
    });

    // 5. Customer cannot retrieve another customer's address
    await test('5. Customer cannot retrieve another customer\'s address (404 Not Found)', async () => {
      // Customer 2 attempts to fetch Customer 1's address ID
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/addresses/${address1.id}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.success, false);
    });

    // 6. Customer updates own address
    await test('6. Customer updates own address (PATCH /api/v1/addresses/:id)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/addresses/${address1.id}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          landmark: 'Opposite Railway Hospital',
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.landmark, 'Opposite Railway Hospital');
    });

    // 7. Customer cannot update another customer's address
    await test('7. Customer cannot update another customer\'s address (404 Not Found)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/addresses/${address1.id}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token2}`, // token2 is not owner
          },
        },
        {
          fullName: 'Hacker Name',
        }
      );

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.success, false);
    });

    // 8. Default address selection works
    await test('8. Default address selection works (POST second address with isDefault)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/addresses',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          fullName: 'Customer One Office',
          phone: '9876543210',
          addressLine: '44 Station Road, Cantonment',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700121',
          addressType: 'WORK',
          isDefault: true,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.isDefault, true);
      address2 = res.body.data;
    });

    // 9. Only one default address per customer
    await test('9. Only one default address per customer', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/addresses',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      const defaultAddresses = res.body.data.filter((a) => a.isDefault);
      assert.strictEqual(defaultAddresses.length, 1, 'Customer must have exactly one default address');
      assert.strictEqual(defaultAddresses[0].id, address2.id);
    });

    // 10. Address deletion works
    await test('10. Address deletion works (DELETE /api/v1/addresses/:id)', async () => {
      // Create a temporary 3rd address to delete
      const tempRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/addresses',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          fullName: 'Temp Address',
          phone: '9876543210',
          addressLine: 'Temporary Lane',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700120',
          addressType: 'OTHER',
          isDefault: false,
        }
      );

      const tempId = tempRes.body.data.id;

      const delRes = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/addresses/${tempId}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(delRes.statusCode, 200);

      // Verify it's gone
      const verifyRes = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/addresses/${tempId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });
      assert.strictEqual(verifyRes.statusCode, 404);
    });

    // 11. Deleted default address is handled correctly
    await test('11. Deleted default address reassigns default to remaining address', async () => {
      // address2 is currently the default address. Delete it!
      const delRes = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/addresses/${address2.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
      assert.strictEqual(delRes.statusCode, 200);

      // address1 should now automatically be promoted to default
      const listRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/addresses',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(listRes.body.data.length, 1);
      assert.strictEqual(listRes.body.data[0].id, address1.id);
      assert.strictEqual(listRes.body.data[0].isDefault, true);
    });

    // ==========================================
    // 2. CART TESTS
    // ==========================================

    // 12. Customer retrieves empty cart
    await test('12. Customer retrieves empty cart (GET /api/v1/cart)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.itemCount, 0);
      assert.strictEqual(res.body.data.itemTotal, 0);
    });

    // 13. Add product to cart
    await test('13. Add product to cart (POST /api/v1/cart/items)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          productId: product1.id,
          quantity: 2,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);

      // Verify cart has item with correct subtotal
      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.itemCount, 1);
      assert.strictEqual(cartRes.body.data.items[0].quantity, 2);
      assert.strictEqual(cartRes.body.data.items[0].unitPrice, 249.99);
      assert.strictEqual(cartRes.body.data.items[0].subtotal, 499.98);
      assert.strictEqual(cartRes.body.data.itemTotal, 499.98);
    });

    // 14. Add existing product increases quantity
    await test('14. Add existing product increases quantity', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          productId: product1.id,
          quantity: 1,
        }
      );

      assert.strictEqual(res.statusCode, 200);

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.items[0].quantity, 3);
      assert.strictEqual(cartRes.body.data.items[0].subtotal, 749.97);
    });

    // 15. Update cart quantity
    await test('15. Update cart quantity (PATCH /api/v1/cart/items/:productId)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/cart/items/${product1.id}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          quantity: 4,
        }
      );

      assert.strictEqual(res.statusCode, 200);

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.items[0].quantity, 4);
      assert.strictEqual(cartRes.body.data.items[0].subtotal, 999.96);
    });

    // 16. Remove cart item
    await test('16. Remove cart item (DELETE /api/v1/cart/items/:productId)', async () => {
      // Add product2 first
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product2.id, quantity: 1 }
      );

      // Delete product1
      const delRes = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/cart/items/${product1.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(delRes.statusCode, 200);

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.itemCount, 1);
      assert.strictEqual(cartRes.body.data.items[0].product.id, product2.id);
    });

    // 17. Clear cart
    await test('17. Clear cart (DELETE /api/v1/cart)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(res.statusCode, 200);

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.itemCount, 0);
    });

    // 18. Invalid product ID rejected
    await test('18. Invalid product ID rejected (400 Bad Request)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: 'invalid-id-xyz', quantity: 1 }
      );

      assert.strictEqual(res.statusCode, 400);
    });

    // 19. Inactive product cannot be added
    await test('19. Inactive product cannot be added (404/400)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: inactiveProduct.id, quantity: 1 }
      );

      assert.strictEqual(res.statusCode, 404);
    });

    // 20. Unavailable product cannot be added
    await test('20. Unavailable product cannot be added (400 Bad Request)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: unavailableProduct.id, quantity: 1 }
      );

      assert.strictEqual(res.statusCode, 400);
    });

    // 21. Insufficient stock rejected
    await test('21. Insufficient stock rejected (400 Bad Request)', async () => {
      // product2 stock is 5
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product2.id, quantity: 10 }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('Insufficient stock'));
    });

    // 22. Quantity cannot exceed available stock
    await test('22. Quantity cannot exceed available stock via cumulative adds', async () => {
      // product2 stock is 5. Add 4.
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product2.id, quantity: 4 }
      );

      // Now attempt to add 2 more (total 6 > 5)
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product2.id, quantity: 2 }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('exceed available stock'));

      // Clean up cart
      await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
    });

    // 23. Frontend-supplied price is ignored
    await test('23. Frontend-supplied price is completely ignored', async () => {
      // Product1 DB price is 249.99. Client sends price: 1.00
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        {
          productId: product1.id,
          quantity: 1,
          price: 1.0, // malicious client price
          unitPrice: 1.0,
          total: 1.0,
        }
      );

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.items[0].unitPrice, 249.99, 'Unit price must be fetched from DB');
      assert.strictEqual(cartRes.body.data.items[0].subtotal, 249.99);
      assert.strictEqual(cartRes.body.data.itemTotal, 249.99);

      // Clean up cart
      await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
    });

    // 24. Cart totals use current database prices
    await test('24. Cart totals update automatically when DB product price changes', async () => {
      // Add product1 (249.99)
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product1.id, quantity: 2 }
      );

      // Update DB price directly from 249.99 to 299.00
      await Product.findByIdAndUpdate(product1.id, { price: 299.0 });

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.items[0].unitPrice, 299.0);
      assert.strictEqual(cartRes.body.data.items[0].subtotal, 598.0);
      assert.strictEqual(cartRes.body.data.itemTotal, 598.0);

      // Revert product price
      await Product.findByIdAndUpdate(product1.id, { price: 249.99 });

      // Clean up
      await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
    });

    // 25. Customer cannot access another customer's cart
    await test('25. Customer carts are strictly isolated by session', async () => {
      // Customer 1 adds product1
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product1.id, quantity: 1 }
      );

      // Customer 2 views cart -> must be empty
      const cart2Res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token2}` },
      });

      assert.strictEqual(cart2Res.body.data.itemCount, 0);

      // Clean up Customer 1's cart
      await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
    });

    // 26. Floating-point monetary calculation edge cases handled correctly
    await test('26. Integer paise calculation avoids floating-point precision issues', async () => {
      // Product1 is 249.99. 3 * 249.99 in naive JS float is 749.9700000000001
      await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/cart/items',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token1}`,
          },
        },
        { productId: product1.id, quantity: 3 }
      );

      const cartRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'GET',
        headers: { Authorization: `Bearer ${token1}` },
      });

      assert.strictEqual(cartRes.body.data.items[0].subtotal, 749.97);
      assert.strictEqual(cartRes.body.data.itemTotal, 749.97);

      // Clean up
      await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/cart',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token1}` },
      });
    });

    // ==========================================
    // 3. DELIVERY SERVICEABILITY & SLOTS TESTS
    // ==========================================

    // 27. Invalid PIN code rejected
    await test('27. Invalid PIN code rejected (400 Bad Request)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/delivery/serviceability?pincode=700ABC',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 28. Serviceable PIN code returns correct zone information
    await test('28. Serviceable PIN code returns correct zone information', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/delivery/serviceability?pincode=700120',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.serviceable, true);
      assert.strictEqual(res.body.data.zoneName, 'Barrackpore Station');
      assert.strictEqual(res.body.data.deliveryCharge, 30);
      assert.strictEqual(res.body.data.minimumOrderAmount, 149);
      assert.strictEqual(res.body.data.estimatedDeliveryMinutes, 35);
    });

    // 29. Unserviceable PIN code returns serviceable false
    await test('29. Unserviceable PIN code returns serviceable false', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/delivery/serviceability?pincode=700001', // Kolkata CBD, not configured
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.serviceable, false);
    });

    // 30. Inactive delivery zones are excluded
    await test('30. Inactive delivery zones are treated as unserviceable', async () => {
      // 700199 belongs to inactiveZone
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/delivery/serviceability?pincode=700199',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.serviceable, false);
    });

    // Setup delivery slots for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const tomorrowDate = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0, 0));

    const slotAvailable = await DeliverySlot.create({
      date: tomorrowDate,
      label: 'Lunch Window (12:30 PM - 1:30 PM)',
      startTime: '12:30',
      endTime: '13:30',
      capacity: 10,
      bookedCount: 2,
      isActive: true,
    });

    const slotFull = await DeliverySlot.create({
      date: tomorrowDate,
      label: 'Early Dinner (7:00 PM - 8:00 PM)',
      startTime: '19:00',
      endTime: '20:00',
      capacity: 5,
      bookedCount: 5, // full
      isActive: true,
    });

    const slotInactive = await DeliverySlot.create({
      date: tomorrowDate,
      label: 'Late Night (10:00 PM - 11:00 PM)',
      startTime: '22:00',
      endTime: '23:00',
      capacity: 10,
      bookedCount: 0,
      isActive: false, // inactive
    });

    // Setup past slot (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 12, 0, 0));

    await DeliverySlot.create({
      date: yesterdayDate,
      label: 'Yesterday Slot',
      startTime: '12:00',
      endTime: '13:00',
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    });

    // 31. Available slots are returned
    await test('31. Available slots are returned (GET /api/v1/delivery/slots)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/slots?pincode=700120&date=${tomorrowStr}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const lunch = res.body.data.find((s) => s.id === slotAvailable.id);
      assert.ok(lunch, 'Lunch slot should be returned');
      assert.strictEqual(lunch.remainingCapacity, 8);
    });

    // 32. Full slots are excluded
    await test('32. Full slots are excluded from available slots', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/slots?pincode=700120&date=${tomorrowStr}`,
        method: 'GET',
      });

      const full = res.body.data.find((s) => s.id === slotFull.id);
      assert.strictEqual(full, undefined, 'Full slot must be excluded');
    });

    // 33. Inactive slots are excluded
    await test('33. Inactive slots are excluded', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/slots?pincode=700120&date=${tomorrowStr}`,
        method: 'GET',
      });

      const inact = res.body.data.find((s) => s.id === slotInactive.id);
      assert.strictEqual(inact, undefined, 'Inactive slot must be excluded');
    });

    // 34. Past slots are excluded
    await test('34. Past slots (yesterday) return empty list', async () => {
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/slots?pincode=700120&date=${yesterdayStr}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.length, 0, 'Past date slots must return empty array');
    });

    // 35. Invalid date rejected
    await test('35. Invalid date rejected (400 Bad Request)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/delivery/slots?pincode=700120&date=invalid-date-format',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 36. Unserviceable PIN code cannot retrieve delivery slots
    await test('36. Unserviceable PIN code cannot retrieve delivery slots (400 Bad Request)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/slots?pincode=700001&date=${tomorrowStr}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('not serviceable'));
    });
  } finally {
    // Clean up temporary test data
    if (customer1) await User.deleteOne({ _id: customer1._id });
    if (customer2) await User.deleteOne({ _id: customer2._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    await Product.deleteMany({ _id: { $in: [product1?._id, product2?._id, inactiveProduct?._id, unavailableProduct?._id].filter(Boolean) } });
    await Address.deleteMany({ user: { $in: [customer1?._id, customer2?._id].filter(Boolean) } });
    await Cart.deleteMany({ user: { $in: [customer1?._id, customer2?._id].filter(Boolean) } });
    await DeliveryZone.deleteMany({ _id: { $in: [activeZone?._id, inactiveZone?._id].filter(Boolean) } });
    await DeliverySlot.deleteMany({ label: { $in: ['Lunch Window (12:30 PM - 1:30 PM)', 'Early Dinner (7:00 PM - 8:00 PM)', 'Late Night (10:00 PM - 11:00 PM)', 'Yesterday Slot'] } });

    // Close server and DB connection
    await new Promise((resolve) => serverInstance.close(resolve));
    await mongoose.connection.close(false);
  }

  console.log('\n====================================================');
  console.log(`Phase 5 Verification Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Phase 5 test runner error:', err);
  process.exit(1);
});

