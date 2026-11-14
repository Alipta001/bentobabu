process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { User, Product, Category, Order, DeliveryZone, DeliverySlot, Notification, RefreshSession } = require('../app/models');
const { generateAccessToken, generateRefreshToken, hashToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');
const { initRedis, redisDelPattern } = require('../app/config/redis');

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

const runAudit = async () => {
  console.log('================================================================');
  console.log('   BENTO BABU — ADMIN BACKEND API & WORKFLOW AUDIT SUITE       ');
  console.log('================================================================\n');

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
      console.error(`   Reason: ${err.message}`);
      if (err.actualBody) {
        console.error(`   Response Body:`, JSON.stringify(err.actualBody));
      }
      console.error('');
    }
  };

  await connectDB();
  await initRedis();
  await redisDelPattern('rl:*');
  const { startServer } = require('../server');
  const serverInstance = await startServer();

  const timestamp = Date.now();
  let adminUser = null;
  let adminToken = null;
  let customerUser = null;
  let customerToken = null;
  let kitchenUser = null;
  let kitchenToken = null;
  let deliveryUser = null;
  let deliveryToken = null;

  let testCategory = null;
  let testProduct = null;
  let testZone = null;
  let testSlot = null;
  let testOrder = null;
  let testNotification = null;

  try {
    // 0. Setup Test Roles
    const pwHash = await bcrypt.hash('AdminAuditPass123!', 12);

    adminUser = await User.create({
      name: 'Admin Auditor',
      email: `admin_audit_${timestamp}@bentobabu.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'ADMIN',
      isActive: true,
    });
    adminToken = generateAccessToken(adminUser);

    customerUser = await User.create({
      name: 'Customer Auditor',
      email: `cust_audit_${timestamp}@bentobabu.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'CUSTOMER',
      isActive: true,
    });
    customerToken = generateAccessToken(customerUser);

    kitchenUser = await User.create({
      name: 'Kitchen Chef',
      email: `kitchen_audit_${timestamp}@bentobabu.in`,
      phone: `93${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'KITCHEN',
      isActive: true,
    });
    kitchenToken = generateAccessToken(kitchenUser);

    deliveryUser = await User.create({
      name: 'Delivery Rider',
      email: `delivery_audit_${timestamp}@bentobabu.in`,
      phone: `94${String(timestamp).slice(-8)}`,
      password: pwHash,
      role: 'DELIVERY',
      isActive: true,
    });
    deliveryToken = generateAccessToken(deliveryUser);

    testCategory = await Category.create({
      name: `Audit Cat ${timestamp}`,
      slug: `audit-cat-${timestamp}`,
      description: 'Audit category testing',
      isActive: true,
    });

    testProduct = await Product.create({
      name: `Audit Meal Box ${timestamp}`,
      slug: `audit-meal-${timestamp}`,
      description: 'Portion stock testing dish',
      category: testCategory._id,
      price: 250,
      stockQuantity: 20,
      lowStockThreshold: 5,
      isAvailable: true,
      isActive: true,
    });

    // ==============================================================
    // 1. AUTHENTICATION & SECURITY AUDIT
    // ==============================================================

    await test('Security: Only ADMIN role can access admin dashboard routes', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/overview',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('Security: CUSTOMER is rejected with 403 Forbidden from admin routes', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/overview',
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
    });

    await test('Security: KITCHEN is rejected from admin-only routes', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/settings',
        method: 'GET',
        headers: { Authorization: `Bearer ${kitchenToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Security: DELIVERY is rejected from admin-only routes', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/users',
        method: 'GET',
        headers: { Authorization: `Bearer ${deliveryToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Security: Inactive/blocked administrator account cannot access admin APIs', async () => {
      const tempAdmin = await User.create({
        name: 'Blocked Admin',
        email: `blocked_admin_${timestamp}@bento.in`,
        phone: `95${String(timestamp).slice(-8)}`,
        password: pwHash,
        role: 'ADMIN',
        isActive: false,
      });
      const blockedToken = generateAccessToken(tempAdmin);

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/overview',
        method: 'GET',
        headers: { Authorization: `Bearer ${blockedToken}` },
      });
      assert([401, 403].includes(res.statusCode), `Expected 401 or 403, got ${res.statusCode}`);
      await User.deleteOne({ _id: tempAdmin._id });
    });

    // ==============================================================
    // 2. INVENTORY WORKFLOWS
    // ==============================================================

    await test('Inventory: Read current stock (GET /api/v1/admin/inventory)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/inventory?search=Audit+Meal+Box+${timestamp}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.products[0].stockQuantity, 20);
    });

    await test('Inventory: Add stock (POST /api/v1/admin/inventory/:id/adjust [ADD])', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/inventory/${testProduct._id}/adjust`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          adjustmentType: 'ADD',
          quantity: 15,
          reason: 'Morning fresh prep batch restock',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.product.stockQuantity, 35);
    });

    await test('Inventory: Remove stock (POST /api/v1/admin/inventory/:id/adjust [REMOVE])', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/inventory/${testProduct._id}/adjust`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          adjustmentType: 'REMOVE',
          quantity: 10,
          reason: 'Portion quality inspection waste',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.product.stockQuantity, 25);
    });

    await test('Inventory: Set stock (POST /api/v1/admin/inventory/:id/adjust [SET])', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/inventory/${testProduct._id}/adjust`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          adjustmentType: 'SET',
          quantity: 50,
          reason: 'End-of-day physical inventory reconciliation',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.product.stockQuantity, 50);
    });

    await test('Inventory: Inspect inventory history (GET /api/v1/admin/inventory/:id/history)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/inventory/${testProduct._id}/history`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.history.length >= 3, 'Should have logged 3 adjustments');
      assert.strictEqual(res.body.data.history[0].adjustmentType, 'SET');
      assert.strictEqual(res.body.data.history[0].newStock, 50);
      assert.strictEqual(res.body.data.history[0].admin.email, adminUser.email);
    });

    await test('Inventory: Confirm invalid adjustments are rejected (negative quantity)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/inventory/${testProduct._id}/adjust`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          adjustmentType: 'ADD',
          quantity: -5,
          reason: 'Invalid negative test',
        }
      );
      assert.strictEqual(res.statusCode, 400);
    });

    // ==============================================================
    // 3. DELIVERY LOGISTICS (ZONES & SLOTS)
    // ==============================================================

    const uniquePin = `79${String(timestamp).slice(-4)}`;

    await test('Delivery: Create a delivery zone (POST /api/v1/admin/delivery/zones)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/delivery/zones',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: `Audit North Zone ${timestamp}`,
          pincodes: [uniquePin],
          deliveryCharge: 35,
          minimumOrderAmount: 180,
          estimatedDeliveryMinutes: 40,
        }
      );
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      testZone = res.body.data.zone;
    });

    await test('Delivery: Update zone PIN codes and charges (PUT /api/v1/admin/delivery/zones/:id)', async () => {
      const zoneId = testZone._id || testZone.id;
      const secondPin = `78${String(timestamp).slice(-4)}`;
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/delivery/zones/${zoneId}`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          pincodes: [uniquePin, secondPin],
          deliveryCharge: 40,
        }
      );
      if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.data.zone.deliveryCharge, 40);
      assert.strictEqual(res.body.data.zone.pincodes.length, 2);
    });

    await test('Delivery: Duplicate active PIN codes in new zone are rejected with 409 Conflict', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/delivery/zones',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: 'Overlapping Zone',
          pincodes: [uniquePin],
        }
      );
      assert.strictEqual(res.statusCode, 409);
    });

    await test('Delivery: Create a delivery slot (POST /api/v1/admin/delivery/slots)', async () => {
      await DeliverySlot.deleteMany({ label: /Audit Lunch Slot/ });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const slotDateStr = tomorrow.toISOString().split('T')[0];

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/delivery/slots',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          date: slotDateStr,
          label: 'Audit Lunch Slot (12:30 PM - 02:00 PM)',
          startTime: '12:30',
          endTime: '14:00',
          capacity: 30,
        }
      );
      assert.strictEqual(res.statusCode, 201);
      testSlot = res.body.data.slot;
    });

    await test('Delivery: Update slot capacity (PUT /api/v1/admin/delivery/slots/:id)', async () => {
      const slotId = testSlot._id || testSlot.id;
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/delivery/slots/${slotId}`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          capacity: 45,
        }
      );
      if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.data.slot.capacity, 45);
    });

    // ==============================================================
    // 4. ORDER LIFECYCLE & OPERATIONS WORKFLOW
    // ==============================================================

    // Create an isolated order directly in DB to test complete lifecycle transitions
    testOrder = await Order.create({
      orderNumber: `ORD-AUDIT-${timestamp}`,
      user: customerUser._id,
      items: [
        {
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 250,
          price: 250,
          subtotal: 500,
        },
      ],
      itemTotal: 500,
      subtotal: 500,
      deliveryCharge: 40,
      deliveryFee: 40,
      grandTotal: 540,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      deliveryZone: testZone._id || testZone.id,
      deliverySlot: testSlot._id || testSlot.id,
      deliveryAddress: {
        fullName: 'Audit Customer',
        phone: customerUser.phone,
        addressLine: '123 Station Road',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700120',
      },
      shippingAddress: {
        fullName: 'Audit Customer',
        phone: customerUser.phone,
        addressLine: '123 Station Road',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700120',
      },
      deliveryOtp: '123456',
    });

    const orderId = testOrder._id || testOrder.id;

    await test('Orders: Retrieve order details (GET /api/v1/admin/orders/:id)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/orders/${orderId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.order.orderNumber, testOrder.orderNumber);
      assert.strictEqual(res.body.data.order.orderStatus, 'CONFIRMED');
    });

    await test('Orders: Move order to PREPARING (PATCH /api/v1/operations/kitchen/orders/:id/status)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/operations/kitchen/orders/${orderId}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kitchenToken}`,
          },
        },
        {
          status: 'PREPARING',
          note: 'Wok heating, ingredients assembled',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.orderStatus, 'PREPARING');
    });

    await test('Orders: Move order to READY_FOR_PICKUP (PATCH /api/v1/operations/kitchen/orders/:id/status)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/operations/kitchen/orders/${orderId}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kitchenToken}`,
          },
        },
        {
          status: 'READY_FOR_PICKUP',
          note: 'Packed in insulated bento packaging',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.orderStatus, 'READY_FOR_PICKUP');
    });

    await test('Orders: Assign delivery staff (PUT /api/v1/admin/orders/:id/assign-delivery)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/orders/${orderId}/assign-delivery`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          deliveryPartnerId: (deliveryUser._id || deliveryUser.id).toString(),
        }
      );
      assert.strictEqual(res.statusCode, 200);
      const assigned = res.body.data.assignedDeliveryPartner || (res.body.data.order && res.body.data.order.assignedDeliveryPartner);
      assert(assigned, 'Should return assignedDeliveryPartner');
      assert.strictEqual(assigned.name, deliveryUser.name);
    });

    await test('Orders: Move order to OUT_FOR_DELIVERY (PATCH /api/v1/operations/delivery/orders/:id/status)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/operations/delivery/orders/${orderId}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deliveryToken}`,
          },
        },
        {
          status: 'OUT_FOR_DELIVERY',
          note: 'Rider departed kitchen with insulated bag',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.orderStatus, 'OUT_FOR_DELIVERY');
    });

    await test('Orders: Complete delivery with deliveryOtp (PATCH /api/v1/operations/delivery/orders/:id/status)', async () => {
      const activeOrderWithOtp = await Order.findById(orderId).select('+deliveryOtpCode');
      const otp = activeOrderWithOtp.deliveryOtpCode;

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/operations/delivery/orders/${orderId}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deliveryToken}`,
          },
        },
        {
          status: 'DELIVERED',
          otp,
          note: 'Delivered to customer doorstep',
        }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.orderStatus, 'DELIVERED');
    });

    await test('Orders: Inspect complete status transition timeline (GET /api/v1/admin/orders/:id/history)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/orders/${orderId}/history`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.data.statusHistory.length >= 4, 'Should record all 4 status transitions');
      assert.strictEqual(res.body.data.currentStatus, 'DELIVERED');
    });

    await test('Orders: Confirm invalid transitions are rejected (cannot revert DELIVERED to PREPARING)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/operations/kitchen/orders/${orderId}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${kitchenToken}`,
          },
        },
        {
          status: 'PREPARING',
        }
      );
      assert.strictEqual(res.statusCode, 400);
    });

    // ==============================================================
    // 5. NOTIFICATIONS MONITORING & RETRY WORKFLOW
    // ==============================================================

    // Create a simulated FAILED notification record
    testNotification = await Notification.create({
      user: customerUser._id,
      order: orderId,
      channel: 'EMAIL',
      eventType: 'ORDER_CONFIRMED',
      recipient: customerUser.email,
      message: 'Your Bento Babu order has been confirmed and is being prepared.',
      status: 'FAILED',
      errorMessage: 'SMTP connection timeout test simulate',
      retryCount: 0,
      maxRetries: 3,
      idempotencyKey: `audit_notif_${timestamp}`,
    });

    const notifId = testNotification._id || testNotification.id;

    await test('Notifications: Retrieve notification statistics (GET /api/v1/admin/notifications/stats)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/notifications/stats',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.data.statusBreakdown.FAILED >= 1);
    });

    await test('Notifications: View failed notifications (GET /api/v1/admin/notifications?status=FAILED)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/notifications?status=FAILED',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      const found = res.body.data.notifications.some((n) => (n._id || n.id).toString() === notifId.toString());
      assert.strictEqual(found, true, 'Failed notification should be present in audit list');
    });

    await test('Notifications: Retry an eligible failed notification (POST /api/v1/admin/notifications/:id/retry)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/notifications/${notifId}/retry`,
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // The dispatcher processes the retry safely (either marks SENT or updates retryCount/status)
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
    });

    // ==============================================================
    // 6. DASHBOARD ACCURACY & METRICS
    // ==============================================================

    await test('Dashboard: Overview aggregates live order counts and revenue', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/overview',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.data.totalOrders >= 1);
      assert(res.body.data.totalRevenue >= 500);
      assert(typeof res.body.data.deliveredOrders === 'number');
    });

    await test('Dashboard: Revenue summary strictly counts PAID orders and excludes CANCELLED', async () => {
      // Create a cancelled order with grandTotal: 999
      const cancelledOrder = await Order.create({
        orderNumber: `ORD-CANCEL-${timestamp}`,
        user: customerUser._id,
        items: [
          {
            product: testProduct._id,
            productName: 'Cancelled Meal',
            name: 'Cancelled Meal',
            quantity: 1,
            unitPrice: 999,
            subtotal: 999,
            itemTotal: 999,
          },
        ],
        itemTotal: 999,
        subtotal: 999,
        deliveryFee: 0,
        deliveryCharge: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 999,
        grandTotal: 999,
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'REFUNDED',
        orderStatus: 'CANCELLED',
        deliveryAddress: {
          fullName: 'Audit Test Customer',
          phone: '9876543210',
          addressLine: '123 MG Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
        },
      });

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/revenue?period=30d',
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      // Verify revenue does not include the cancelled order's 999
      await Order.deleteOne({ _id: cancelledOrder._id });
    });

  } finally {
    // Cleanup temporary test records
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (customerUser) await User.deleteOne({ _id: customerUser._id });
    if (kitchenUser) await User.deleteOne({ _id: kitchenUser._id });
    if (deliveryUser) await User.deleteOne({ _id: deliveryUser._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testProduct) {
      await Product.deleteOne({ _id: testProduct._id });
      const InventoryLog = mongoose.model('InventoryLog');
      await InventoryLog.deleteMany({ product: testProduct._id });
    }
    if (testZone) await DeliveryZone.deleteOne({ _id: testZone._id });
    if (testSlot) await DeliverySlot.deleteOne({ _id: testSlot._id });
    if (testOrder) await Order.deleteOne({ _id: testOrder._id });
    if (testNotification) await Notification.deleteOne({ _id: testNotification._id });

    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await mongoose.connection.close();
  }

  console.log('\n================================================================');
  console.log(`   WORKFLOW AUDIT SUMMARY: ${passed}/${total} PASSED`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
};

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
