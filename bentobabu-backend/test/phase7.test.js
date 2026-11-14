/**
 * Comprehensive Phase 7 Test Suite: Admin Dashboard & Business Operations APIs
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../app/config/db');
const { startServer } = require('../server');
const { generateAccessToken } = require('../app/utils/token');
const {
  User,
  Category,
  Product,
  Address,
  Cart,
  DeliveryZone,
  DeliverySlot,
  Coupon,
  Order,
  SystemSetting,
  InventoryLog,
  RefreshSession,
} = require('../app/models');

const AdminDashboardController = require('../app/controllers/adminDashboardController');
const AdminUserController = require('../app/controllers/adminUserController');
const InventoryController = require('../app/controllers/inventoryController');
const AdminDeliveryController = require('../app/controllers/adminDeliveryController');
const AdminOrderController = require('../app/controllers/adminOrderController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');

const BASE_URL = 'http://127.0.0.1:5000';

const makeRequest = ({ method, path, headers = {}, body = null }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;

    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
      postData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    } else if (Buffer.isBuffer(body)) {
      postData = body;
      reqHeaders['Content-Length'] = body.length;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: rawData,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 7 VERIFICATION SUITE  ');
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
      throw err;
    }
  };

  await connectDB();
  const serverInstance = await startServer();

  try {
    // 0. Class-based static async controller convention check
    await test('0. Class-based static async controller convention verification', () => {
      const controllers = [
        AdminDashboardController,
        AdminUserController,
        InventoryController,
        AdminDeliveryController,
        AdminOrderController,
        AdminSettingsController,
      ];

      for (const ctrl of controllers) {
        assert.strictEqual(typeof ctrl, 'function', `${ctrl.name} must be a constructor/class`);
        const methodNames = Object.getOwnPropertyNames(ctrl).filter(
          (prop) => typeof ctrl[prop] === 'function' && prop !== 'prototype' && prop !== 'length' && prop !== 'name'
        );
        assert.ok(methodNames.length > 0, `${ctrl.name} must have static methods`);
        for (const m of methodNames) {
          assert.strictEqual(
            ctrl.prototype[m],
            undefined,
            `${m} in ${ctrl.name} must not be an instance method`
          );
        }
      }
    });

    // Cleanup test artifacts
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await DeliveryZone.deleteMany({});
    await DeliverySlot.deleteMany({});
    await Order.deleteMany({});
    await Cart.deleteMany({});
    await SystemSetting.deleteMany({});
    await InventoryLog.deleteMany({});

    // Seed test users
    const passwordHash = await bcrypt.hash('BentoAdmin@1234', 12);

    const adminUser = await User.create({
      name: 'Super Admin',
      email: 'phase7admin@bento.in',
      phone: '9876543001',
      password: passwordHash,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const secondAdmin = await User.create({
      name: 'Backup Admin',
      email: 'phase7admin2@bento.in',
      phone: '9876543002',
      password: passwordHash,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const customerUser = await User.create({
      name: 'Regular Customer',
      email: 'phase7customer@bento.in',
      phone: '9876543003',
      password: passwordHash,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const deliveryUser = await User.create({
      name: 'Rider Babu',
      email: 'phase7delivery@bento.in',
      phone: '9876543004',
      password: passwordHash,
      role: 'DELIVERY',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const kitchenUser = await User.create({
      name: 'Chef Babu',
      email: 'phase7kitchen@bento.in',
      phone: '9876543005',
      password: passwordHash,
      role: 'KITCHEN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const adminToken = generateAccessToken(adminUser);
    const customerToken = generateAccessToken(customerUser);

    // Seed test category and products
    const testCategory = await Category.create({
      name: 'Phase 7 Bento Bowls',
      slug: `phase7-bento-bowls-${Date.now()}`,
      isActive: true,
    });

    const productA = await Product.create({
      name: 'Nutri Bento Bowl A',
      slug: `phase7-bowl-a-${Date.now()}`,
      description: 'Healthy nutrient packed bowl A',
      price: 250,
      category: testCategory._id,
      stockQuantity: 15,
      lowStockThreshold: 5,
      isAvailable: true,
      isActive: true,
    });

    const productB = await Product.create({
      name: 'Keto Bento Bowl B',
      slug: `phase7-bowl-b-${Date.now()}`,
      description: 'Low carb high protein bowl B',
      price: 300,
      category: testCategory._id,
      stockQuantity: 3, // Low stock (3 <= 5)
      lowStockThreshold: 5,
      isAvailable: true,
      isActive: true,
    });

    const productC = await Product.create({
      name: 'Vegan Bento Bowl C',
      slug: `phase7-bowl-c-${Date.now()}`,
      description: 'Plant based bowl C',
      price: 200,
      category: testCategory._id,
      stockQuantity: 0, // Out of stock
      lowStockThreshold: 5,
      isAvailable: false,
      isActive: true,
    });

    // Seed test orders for analytics
    const pastOrder = await Order.create({
      orderNumber: `P7-HIST-${Date.now()}-1`,
      user: customerUser._id,
      items: [
        {
          product: productA._id,
          productName: productA.name,
          quantity: 2,
          unitPrice: 250,
          subtotal: 500,
        },
      ],
      deliveryAddress: {
        fullName: 'Customer One',
        phone: '9876543003',
        addressLine: 'Barrackpore Station Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
      },
      itemTotal: 500,
      deliveryCharge: 30,
      taxAmount: 0,
      couponDiscount: 50,
      grandTotal: 480,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      statusHistory: [
        { status: 'CONFIRMED', changedAt: new Date() },
        { status: 'DELIVERED', changedAt: new Date() },
      ],
    });

    const cancelledOrder = await Order.create({
      orderNumber: `P7-HIST-${Date.now()}-2`,
      user: customerUser._id,
      items: [
        {
          product: productB._id,
          productName: productB.name,
          quantity: 1,
          unitPrice: 300,
          subtotal: 300,
        },
      ],
      deliveryAddress: {
        fullName: 'Customer One',
        phone: '9876543003',
        addressLine: 'Barrackpore Station Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
      },
      itemTotal: 300,
      deliveryCharge: 30,
      taxAmount: 0,
      couponDiscount: 0,
      grandTotal: 330,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'CANCELLED',
    });

    // 1. Role-based authorization: Non-ADMIN gets 403 Forbidden
    await test('1. Non-ADMIN (CUSTOMER) receives 403 Forbidden on admin endpoints', async () => {
      const endpoints = [
        '/api/v1/admin/dashboard/overview',
        '/api/v1/admin/users',
        '/api/v1/admin/inventory',
        '/api/v1/admin/delivery/zones',
        '/api/v1/admin/orders',
        '/api/v1/admin/settings',
      ];

      for (const endpoint of endpoints) {
        const res = await makeRequest({
          method: 'GET',
          path: endpoint,
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        assert.strictEqual(
          res.status,
          403,
          `Expected 403 on ${endpoint} for non-admin, got ${res.status}`
        );
        assert.strictEqual(res.body.success, false);
      }
    });

    // 2. Admin Dashboard Overview
    await test('2. Admin Dashboard Overview returns valid business metrics', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/dashboard/overview',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;
      assert.ok(data.totalCustomers >= 1);
      assert.ok(data.totalActiveProducts >= 2);
      assert.ok(data.lowStockProductCount >= 1);
      assert.ok(data.totalOrders >= 2);
      assert.strictEqual(data.totalRevenue, 480); // Only PAID & non-cancelled order
      assert.strictEqual(data.deliveredOrders, 1);
      assert.strictEqual(data.cancelledOrders, 1);
    });

    // 3. Admin Dashboard Revenue with period filters
    await test('3. Admin Dashboard Revenue returns timeline and financial summary', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/dashboard/revenue?period=30d',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;
      assert.strictEqual(data.period, '30d');
      assert.strictEqual(data.summary.totalRevenue, 480);
      assert.strictEqual(data.summary.totalPaidOrders, 1);
      assert.strictEqual(data.summary.averageOrderValue, 480);
      assert.strictEqual(data.summary.totalDiscounts, 50);
      assert.strictEqual(data.summary.totalDeliveryFees, 30);
      assert.ok(Array.isArray(data.timeline));
    });

    // 4. Admin Dashboard Orders & Products
    await test('4. Admin Dashboard Orders & Products analytics aggregate historical data', async () => {
      const ordersRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/dashboard/orders',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(ordersRes.status, 200);
      assert.strictEqual(ordersRes.body.success, true);
      assert.ok(ordersRes.body.data.cancellationRate > 0);

      const prodsRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/dashboard/products',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(prodsRes.status, 200);
      assert.strictEqual(prodsRes.body.success, true);
      const pData = prodsRes.body.data;
      assert.ok(pData.bestSellingProducts.some((p) => p.name === productA.name));
      assert.ok(pData.lowStockProducts.some((p) => p.name === productB.name));
      assert.ok(pData.outOfStockProducts.some((p) => p.name === productC.name));
    });

    // 5. Admin Dashboard Customers
    await test('5. Admin Dashboard Customers returns customer activity and top spenders', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/dashboard/customers',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.totalCustomers >= 1);
      assert.ok(Array.isArray(res.body.data.topCustomers));
    });

    // 6. Admin User Management: List users with filters
    await test('6. Admin User Management lists users with pagination and search', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/users?role=CUSTOMER&limit=5',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.users));
      assert.ok(res.body.data.users.every((u) => u.role === 'CUSTOMER'));
      assert.strictEqual(res.body.data.users[0].password, undefined); // Password never leaked
    });

    // 7. Admin creates operational account (KITCHEN/DELIVERY)
    let createdKitchenUser = null;
    await test('7. Admin creates operational KITCHEN account', async () => {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/users',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Sous Chef Joy',
          email: 'phase7ops_kitchen@bento.in',
          phone: '9876543010',
          password: 'KitchenPass@123',
          role: 'KITCHEN',
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'KITCHEN');
      assert.strictEqual(res.body.data.user.password, undefined);
      createdKitchenUser = res.body.data.user;
    });

    // 8. Admin cannot directly create ADMIN account via user creation endpoint
    await test('8. Direct creation of ADMIN accounts is strictly rejected (400)', async () => {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/users',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Rogue Admin',
          email: 'phase7rogue@bento.in',
          phone: '9876543011',
          password: 'RoguePass@123',
          role: 'ADMIN',
        },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('ADMIN'));
    });

    // 9. Admin User Management: Self-deactivation prevention
    await test('9. Administrator cannot deactivate their own account (400 Bad Request)', async () => {
      const res = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/users/${adminUser._id}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: false },
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('own administrator account'));
    });

    // 10. Admin User Management: Last active admin protection
    await test('10. Cannot deactivate or demote the last active administrator (400 Bad Request)', async () => {
      // Deactivate secondAdmin first
      const deactRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/users/${secondAdmin._id}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: false },
      });
      assert.strictEqual(deactRes.status, 200);

      // Now attempt to demote the sole active admin
      const demoteRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/users/${adminUser._id}/role`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: 'CUSTOMER' },
      });
      assert.strictEqual(demoteRes.status, 400);
      assert.strictEqual(demoteRes.body.success, false);
      assert.ok(demoteRes.body.message.includes('last active administrator'));

      // Reactivate secondAdmin
      await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/users/${secondAdmin._id}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: true },
      });
    });

    // 11. Deactivating user account revokes active refresh sessions
    await test('11. Account deactivation invalidates all active sessions for the user', async () => {
      const targetUserId = createdKitchenUser._id || createdKitchenUser.id;

      // Create session for createdKitchenUser
      await RefreshSession.create({
        user: targetUserId,
        tokenHash: 'dummy_hash_for_test',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const sessionBefore = await RefreshSession.countDocuments({ user: targetUserId });
      assert.strictEqual(sessionBefore, 1);

      const res = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/users/${targetUserId}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: false },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.user.isActive, false);

      const sessionAfter = await RefreshSession.countDocuments({ user: targetUserId });
      assert.strictEqual(sessionAfter, 0); // Active sessions revoked
    });

    // 12. Inventory: List products and stock status
    await test('12. Inventory API lists stock quantities and thresholds', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/inventory',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.products.length >= 3);
    });

    // 13. Inventory: Low-stock and Out-of-stock endpoints
    await test('13. Inventory Low-stock and Out-of-stock filtering works accurately', async () => {
      const lowRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/inventory/low-stock',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(lowRes.status, 200);
      assert.ok(lowRes.body.data.products.some((p) => p._id.toString() === productB._id.toString()));

      const outRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/inventory/out-of-stock',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(outRes.status, 200);
      assert.ok(outRes.body.data.products.some((p) => p._id.toString() === productC._id.toString()));
    });

    // 14. Inventory: Atomic Stock Adjustment & Negative Stock Rejection
    await test('14. Inventory stock adjustments enforce non-negative constraint and log changes', async () => {
      // 1. Negative adjustment rejection
      const negRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/admin/inventory/${productA._id}/adjust`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          adjustmentType: 'REMOVE',
          quantity: 999, // More than stock (15)
          reason: 'Mass spoilage',
        },
      });
      assert.strictEqual(negRes.status, 400);
      assert.strictEqual(negRes.body.success, false);
      assert.ok(negRes.body.message.includes('negative'));

      // 2. Successful ADD adjustment
      const addRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/admin/inventory/${productA._id}/adjust`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          adjustmentType: 'ADD',
          quantity: 10,
          reason: 'Fresh kitchen batch arrival',
        },
      });
      assert.strictEqual(addRes.status, 200);
      assert.strictEqual(addRes.body.data.product.stockQuantity, 25); // 15 + 10
      assert.strictEqual(addRes.body.data.adjustment.previousStock, 15);
      assert.strictEqual(addRes.body.data.adjustment.newStock, 25);

      // Verify log was persisted
      const log = await InventoryLog.findOne({ product: productA._id });
      assert.ok(log);
      assert.strictEqual(log.quantity, 10);
      assert.strictEqual(log.adjustmentType, 'ADD');
      assert.strictEqual(log.admin.toString(), adminUser._id.toString());
    });

    // 15. Inventory: Preserves isActive flag on stock adjustments
    await test('15. Stock adjustment does not accidentally reactivate an inactive product', async () => {
      productA.isActive = false;
      await productA.save();

      const res = await makeRequest({
        method: 'POST',
        path: `/api/v1/admin/inventory/${productA._id}/adjust`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          adjustmentType: 'ADD',
          quantity: 5,
          reason: 'Restock test',
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.product.isActive, false); // Stays inactive!

      // Restore productA
      productA.isActive = true;
      await productA.save();
    });

    // 16. Inventory History endpoint
    await test('16. GET /api/v1/admin/inventory/:productId/history returns audit logs', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: `/api/v1/admin/inventory/${productA._id}/history`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.history.length >= 1);
      assert.strictEqual(res.body.data.history[0].adjustmentType, 'ADD');
    });

    // 17. Delivery Zones: Create zone & PIN code conflict check
    let createdZone = null;
    await test('17. Admin creates delivery zone & duplicate active PIN codes are rejected (409)', async () => {
      // Create first zone
      const res1 = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/zones',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Phase7 Barrackpore Cantonment',
          pincodes: ['700120', '700121'],
          deliveryCharge: 35,
          minimumOrderAmount: 100,
          estimatedDeliveryMinutes: 30,
          isActive: true,
        },
      });
      assert.strictEqual(res1.status, 201);
      assert.strictEqual(res1.body.success, true);
      createdZone = res1.body.data.zone;

      // Attempt to create second zone with overlapping active PIN code '700120'
      const conflictRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/zones',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Phase7 Overlapping Zone',
          pincodes: ['700120', '700122'],
          deliveryCharge: 40,
          minimumOrderAmount: 0,
          estimatedDeliveryMinutes: 45,
          isActive: true,
        },
      });
      assert.strictEqual(conflictRes.status, 409);
      assert.strictEqual(conflictRes.body.success, false);
      assert.ok(conflictRes.body.message.includes('700120'));
    });

    // 18. Delivery Zones: Update zone & toggle status
    await test('18. Admin updates delivery zone details and status', async () => {
      const updateRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/delivery/zones/${createdZone.id || createdZone._id}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          deliveryCharge: 45,
          minimumOrderAmount: 120,
        },
      });
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.data.zone.deliveryCharge, 45);

      const statusRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/delivery/zones/${createdZone.id || createdZone._id}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: false },
      });
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.zone.isActive, false);

      // Re-activate
      await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/delivery/zones/${createdZone.id || createdZone._id}/status`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { isActive: true },
      });
    });

    // 19. Delivery Slots: Create slot & validations
    let createdSlot = null;
    await test('19. Admin creates delivery slot with date/time validation', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      // 1. Past date rejection
      const pastDateRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/slots',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          date: '2020-01-01',
          label: 'Past Slot',
          startTime: '12:00',
          endTime: '13:00',
          capacity: 15,
        },
      });
      assert.strictEqual(pastDateRes.status, 400);

      // 2. Invalid time interval (endTime <= startTime)
      const invalidTimeRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/slots',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          date: dateStr,
          label: 'Phase 7 Lunch Slot',
          startTime: '13:00',
          endTime: '12:00', // Before start
          capacity: 15,
        },
      });
      assert.strictEqual(invalidTimeRes.status, 400);

      // 3. Valid creation
      const validRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/slots',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          date: dateStr,
          label: 'Phase 7 Lunch Slot 12-1 PM',
          startTime: '12:00',
          endTime: '13:00',
          capacity: 20,
          isActive: true,
        },
      });
      assert.strictEqual(validRes.status, 201);
      assert.strictEqual(validRes.body.success, true);
      createdSlot = validRes.body.data.slot;

      // 4. Duplicate interval rejection (409)
      const dupRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/admin/delivery/slots',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          date: dateStr,
          label: 'Duplicate Slot',
          startTime: '12:00',
          endTime: '13:00',
          capacity: 10,
        },
      });
      assert.strictEqual(dupRes.status, 409);
    });

    // 20. Delivery Slots: Capacity cannot be updated lower than bookedCount
    await test('20. Slot capacity cannot be updated below current bookedCount (400 Bad Request)', async () => {
      // Simulate 5 bookings
      await DeliverySlot.findByIdAndUpdate(createdSlot.id || createdSlot._id, { bookedCount: 5 });

      const res = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/delivery/slots/${createdSlot.id || createdSlot._id}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { capacity: 3 }, // Less than bookedCount 5
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('booked orders count'));
    });

    // 21. Admin Order Management: List and filter orders
    await test('21. Admin Order Management lists orders with operational filters', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/orders?orderStatus=DELIVERED',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.orders.length >= 1);
      assert.ok(res.body.data.orders.every((o) => o.orderStatus === 'DELIVERED'));
    });

    // 22. Admin Order Management: Assign delivery partner
    let pendingOrderForAssignment = null;
    await test('22. Admin assigns active DELIVERY user to order and rejects non-DELIVERY user', async () => {
      pendingOrderForAssignment = await Order.create({
        orderNumber: `P7-ASSIGN-${Date.now()}`,
        user: customerUser._id,
        items: [
          {
            product: productA._id,
            productName: productA.name,
            quantity: 1,
            unitPrice: 250,
            subtotal: 250,
          },
        ],
        deliveryAddress: {
          fullName: 'Customer One',
          phone: '9876543003',
          addressLine: 'Barrackpore Station Road',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700120',
          addressType: 'HOME',
        },
        itemTotal: 250,
        deliveryCharge: 30,
        taxAmount: 0,
        grandTotal: 280,
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
      });

      // 1. Attempt assigning a CUSTOMER user (should fail with 400)
      const invalidPartnerRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/orders/${pendingOrderForAssignment._id}/assign-delivery`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { deliveryPartnerId: customerUser._id.toString() },
      });
      assert.strictEqual(invalidPartnerRes.status, 400);
      assert.ok(invalidPartnerRes.body.message.includes('DELIVERY'));

      // 2. Assign valid delivery user
      const validAssignRes = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/orders/${pendingOrderForAssignment._id}/assign-delivery`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { deliveryPartnerId: deliveryUser._id.toString() },
      });
      assert.strictEqual(validAssignRes.status, 200);
      assert.strictEqual(validAssignRes.body.success, true);
      assert.strictEqual(
        validAssignRes.body.data.assignedDeliveryPartner.id.toString(),
        deliveryUser._id.toString()
      );
    });

    // 23. Admin cannot assign delivery partner to CANCELLED or DELIVERED order
    await test('23. Cannot assign delivery partner to a CANCELLED or DELIVERED order (400)', async () => {
      const res = await makeRequest({
        method: 'PUT',
        path: `/api/v1/admin/orders/${pastOrder._id}/assign-delivery`,
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { deliveryPartnerId: deliveryUser._id.toString() },
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('DELIVERED'));
    });

    // 24. Order status history timeline
    await test('24. GET /api/v1/admin/orders/:id/history returns full timeline', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: `/api/v1/admin/orders/${pendingOrderForAssignment._id}/history`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.statusHistory.length >= 1);
      assert.ok(res.body.data.statusHistory.some((h) => h.note && h.note.includes('Delivery partner assigned')));
    });

    // 25. Business Settings: Get defaults and update settings
    await test('25. Business Settings CRUD validates allowlisted keys and types', async () => {
      // 1. Get default settings
      const getRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.data.settings.BUSINESS_NAME, 'Bento Babu');
      assert.strictEqual(getRes.body.data.settings.ORDER_ACCEPTANCE_ENABLED, true);

      // 2. Reject unallowlisted key
      const badKeyRes = await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          UNAUTHORIZED_KEY: 'some_value',
        },
      });
      assert.strictEqual(badKeyRes.status, 400);
      assert.ok(badKeyRes.body.message.includes('Unrecognized setting key'));

      // 3. Update valid settings
      const updateRes = await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          BUSINESS_NAME: 'Bento Babu Express Barrackpore',
          SUPPORT_PHONE: '9876543210',
          DEFAULT_DELIVERY_FEE: 40,
        },
      });
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(
        updateRes.body.data.settings.BUSINESS_NAME,
        'Bento Babu Express Barrackpore'
      );
      assert.strictEqual(updateRes.body.data.settings.DEFAULT_DELIVERY_FEE, 40);
    });

    // 26. Coupling: MAINTENANCE_MODE blocks customer checkout with 503
    await test('26. Setting MAINTENANCE_MODE: true blocks checkout summary with 503', async () => {
      // Create address & cart for customer
      const custAddress = await Address.create({
        user: customerUser._id,
        fullName: 'Phase 7 Customer',
        phone: '9876543003',
        addressLine: '12 Anandamath',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
      });

      await Cart.findOneAndUpdate(
        { user: customerUser._id },
        {
          items: [{ product: productA._id, quantity: 1 }],
        },
        { upsert: true }
      );

      // Enable maintenance mode
      await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { MAINTENANCE_MODE: true },
      });

      const checkoutRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders/checkout-summary',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { addressId: custAddress._id.toString() },
      });

      assert.strictEqual(checkoutRes.status, 503);
      assert.strictEqual(checkoutRes.body.success, false);
      assert.ok(checkoutRes.body.message.includes('maintenance'));

      // Turn off maintenance mode
      await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { MAINTENANCE_MODE: false },
      });
    });

    // 27. Coupling: ORDER_ACCEPTANCE_ENABLED: false blocks checkout with 400
    await test('27. Setting ORDER_ACCEPTANCE_ENABLED: false blocks checkout with 400', async () => {
      const custAddress = await Address.findOne({ user: customerUser._id });

      // Disable order acceptance
      await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { ORDER_ACCEPTANCE_ENABLED: false },
      });

      const checkoutRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders/checkout-summary',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { addressId: custAddress._id.toString() },
      });

      assert.strictEqual(checkoutRes.status, 400);
      assert.strictEqual(checkoutRes.body.success, false);
      assert.ok(checkoutRes.body.message.includes('Order placement is currently disabled'));

      // Re-enable order acceptance
      await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { ORDER_ACCEPTANCE_ENABLED: true },
      });
    });

    // 28. Coupling: MINIMUM_ORDER_AMOUNT blocks small orders
    await test('28. Platform MINIMUM_ORDER_AMOUNT setting blocks sub-threshold checkout (400)', async () => {
      const custAddress = await Address.findOne({ user: customerUser._id });

      // Set platform minimum order amount to 500 (our cart has productA = 250)
      await makeRequest({
        method: 'PUT',
        path: '/api/v1/admin/settings',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { MINIMUM_ORDER_AMOUNT: 500 },
      });

      const checkoutRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders/checkout-summary',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { addressId: custAddress._id.toString() },
      });

      assert.strictEqual(checkoutRes.status, 400);
      assert.strictEqual(checkoutRes.body.success, false);
      assert.ok(checkoutRes.body.message.includes('Minimum order amount'));

      // Reset minimum order amount setting
      await SystemSetting.deleteOne({ key: 'MINIMUM_ORDER_AMOUNT' });
    });

    console.log('\n====================================================');
    console.log(`Phase 7 Verification Summary: ${passed}/${total} passed`);
    console.log('====================================================\n');
  } finally {
    // Teardown
    await User.deleteMany({ email: { $regex: /phase7.*@bento\.in/ } });
    await Category.deleteMany({ slug: { $regex: /phase7/ } });
    await Product.deleteMany({ slug: { $regex: /phase7/ } });
    await DeliveryZone.deleteMany({ name: { $regex: /Phase7/ } });
    await DeliverySlot.deleteMany({ label: { $regex: /Phase 7/ } });
    await SystemSetting.deleteMany({});
    await InventoryLog.deleteMany({});
    if (serverInstance && serverInstance.close) {
      serverInstance.close();
    }
    await mongoose.connection.close();
  }
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error running Phase 7 tests:', err);
    process.exit(1);
  });
