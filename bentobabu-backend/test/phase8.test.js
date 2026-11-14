/**
 * Comprehensive Phase 8 Test Suite: Customer Notifications, Email & WhatsApp Integration
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
  Order,
  Notification,
} = require('../app/models');

const { setTransporter, getEmailTemplate, sendEmail } = require('../app/utils/email');
const { setWhatsAppSender, formatWhatsAppRecipient, sendWhatsApp } = require('../app/utils/whatsapp');
const NotificationDispatcher = require('../app/utils/notificationDispatcher');
const NotificationController = require('../app/controllers/notificationController');
const AdminNotificationController = require('../app/controllers/adminNotificationController');
const PaymentController = require('../app/controllers/paymentController');

// Mock Razorpay SDK orders.create so tests run offline safely
PaymentController.getRazorpayClient = () => ({
  orders: {
    create: async (params) => ({
      id: `order_mock_p8_${Date.now()}`,
      amount: params.amount,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      status: 'created',
    }),
  },
});

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

const waitForNotification = async (query, maxMs = 5000) => {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const doc = await Notification.findOne(query);
    if (doc) return doc;
    await new Promise((r) => setTimeout(r, 150));
  }
  return await Notification.findOne(query);
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 8 VERIFICATION SUITE  ');
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

  // Mocked state holders
  const sentEmails = [];
  const sentWhatsAppMessages = [];

  // Wire mock email transporter
  setTransporter({
    sendMail: async (mailOptions) => {
      sentEmails.push(mailOptions);
      return {
        messageId: `mock_email_${Date.now()}_${Math.random()}`,
        response: '250 OK: Mock message queued',
      };
    },
  });

  // Wire mock WhatsApp sender
  setWhatsAppSender(async ({ toPhone, eventType, parameters }) => {
    sentWhatsAppMessages.push({ toPhone, eventType, parameters });
    return {
      success: true,
      messageId: `mock_wa_${Date.now()}`,
    };
  });

  try {
    // 0. Class-based static async controller convention check
    await test('0. Class-based static async controller convention verification', () => {
      const controllers = [NotificationController, AdminNotificationController];

      for (const ctrl of controllers) {
        assert.strictEqual(typeof ctrl, 'function', `${ctrl.name} must be a constructor/class`);
        const methodNames = Object.getOwnPropertyNames(ctrl).filter(
          (prop) =>
            typeof ctrl[prop] === 'function' &&
            prop !== 'prototype' &&
            prop !== 'length' &&
            prop !== 'name'
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

    // Cleanup phase 8 test artifacts
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await DeliveryZone.deleteMany({});
    await DeliverySlot.deleteMany({});
    await Order.deleteMany({});
    await Cart.deleteMany({});
    await Notification.deleteMany({});

    // Seed test users
    const passwordHash = await bcrypt.hash('BentoPass@123', 12);

    const adminUser = await User.create({
      name: 'Admin Boss',
      email: 'phase8admin@bento.in',
      phone: '9876541001',
      password: passwordHash,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const customerUser = await User.create({
      name: 'Priya Sharma',
      email: 'priya.sharma@bento.in',
      phone: '9876541002',
      password: passwordHash,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      notificationPreferences: {
        email: true,
        whatsapp: false, // Default opt-out
        inApp: true,
      },
    });

    const customerWithWhatsApp = await User.create({
      name: 'Amit Ghosh',
      email: 'amit.ghosh@bento.in',
      phone: '9876541003',
      password: passwordHash,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      notificationPreferences: {
        email: true,
        whatsapp: true, // Explicit opt-in
        inApp: true,
      },
    });

    const deliveryUser = await User.create({
      name: 'Rider Babu',
      email: 'rider.babu@bento.in',
      phone: '9876541004',
      password: passwordHash,
      role: 'DELIVERY',
      isActive: true,
    });

    const kitchenUser = await User.create({
      name: 'Chef Babu',
      email: 'chef.babu@bento.in',
      phone: '9876541005',
      password: passwordHash,
      role: 'KITCHEN',
      isActive: true,
    });

    const adminToken = generateAccessToken(adminUser);
    const customerToken = generateAccessToken(customerUser);
    const customerWaToken = generateAccessToken(customerWithWhatsApp);
    const deliveryToken = generateAccessToken(deliveryUser);
    const kitchenToken = generateAccessToken(kitchenUser);

    // Seed test category, product, address, zone, slot
    const testCategory = await Category.create({
      name: 'Phase 8 Diet Bentos',
      slug: `phase8-diet-bentos-${Date.now()}`,
      isActive: true,
    });

    const testProduct = await Product.create({
      name: 'High Protein Keto Bento',
      slug: `phase8-keto-bento-${Date.now()}`,
      description: 'Healthy and fresh',
      price: 350,
      category: testCategory._id,
      stockQuantity: 50,
      lowStockThreshold: 5,
      isAvailable: true,
      isActive: true,
    });

    const testZone = await DeliveryZone.create({
      name: 'Phase 8 Barrackpore Zone',
      pincodes: ['700120'],
      deliveryCharge: 30,
      minimumOrderAmount: 0,
      estimatedDeliveryMinutes: 30,
      isActive: true,
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const testSlot = await DeliverySlot.create({
      date: tomorrow,
      label: 'Phase 8 Lunch Slot',
      startTime: '12:00',
      endTime: '13:00',
      capacity: 25,
      bookedCount: 0,
      isActive: true,
    });

    const customerAddress = await Address.create({
      user: customerUser._id,
      fullName: 'Priya Sharma',
      phone: '9876541002',
      addressLine: '14 River Road',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700120',
      addressType: 'HOME',
    });

    // 1. Notification Model Validations & Unique Idempotency
    await test('1. Notification model validates channels, events, and unique idempotency keys', async () => {
      // Valid record
      const notif = await Notification.create({
        user: customerUser._id,
        channel: 'EMAIL',
        eventType: 'ORDER_PLACED',
        recipient: 'priya.sharma@bento.in',
        subject: 'Order Received',
        message: 'Your order was received',
        idempotencyKey: 'idemp_key_test_1',
      });
      assert.strictEqual(notif.status, 'PENDING');
      assert.strictEqual(notif.channel, 'EMAIL');

      // Duplicate idempotencyKey rejection (unique constraint)
      let duplicateThrew = false;
      try {
        await Notification.create({
          user: customerUser._id,
          channel: 'EMAIL',
          eventType: 'ORDER_PLACED',
          recipient: 'priya.sharma@bento.in',
          subject: 'Order Received Duplicate',
          message: 'Your order was received',
          idempotencyKey: 'idemp_key_test_1',
        });
      } catch (err) {
        duplicateThrew = true;
        assert.strictEqual(err.code, 11000);
      }
      assert.ok(duplicateThrew, 'Duplicate idempotency key must throw unique constraint error');
    });

    // 2. Email Utility: Template Rendering for All 10 Events
    await test('2. Email utility renders responsive templates with branding for all 10 events', () => {
      const sampleEvents = [
        'ORDER_PLACED',
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'ORDER_CONFIRMED',
        'ORDER_PREPARING',
        'ORDER_READY',
        'OUT_FOR_DELIVERY',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
        'ORDER_EXPIRED',
      ];

      for (const ev of sampleEvents) {
        const tpl = getEmailTemplate(ev, {
          orderNumber: 'BB-TEST-001',
          grandTotal: 380,
          customerName: 'Priya',
          items: [{ productName: 'High Protein Keto Bento', quantity: 1, subtotal: 350 }],
          deliveryAddress: { addressLine: '14 River Road', city: 'Barrackpore', pincode: '700120' },
          reason: 'Customer requested',
        });

        assert.ok(tpl.subject.includes('BentoBabu'));
        assert.ok(tpl.html.includes('🍱 BentoBabu'));
        assert.ok(tpl.html.includes('bentobabuofficial@gmail.com'));
        assert.ok(tpl.text.includes('BentoBabu'));
      }
    });

    // 3. Email Utility: Missing SMTP configuration skips gracefully
    await test('3. Missing SMTP transporter configuration skips delivery safely without throwing', async () => {
      setTransporter(null); // Simulate unconfigured SMTP
      const res = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
      assert.ok(res.error.includes('SMTP host is not configured'));

      // Restore mock transporter
      setTransporter({
        sendMail: async (mailOptions) => {
          sentEmails.push(mailOptions);
          return { messageId: `mock_email_${Date.now()}` };
        },
      });
    });

    // 4. WhatsApp Utility: Phone number formatting & template mapping
    await test('4. WhatsApp utility formats 10-digit Indian mobile numbers accurately', () => {
      assert.strictEqual(formatWhatsAppRecipient('9876541002'), '919876541002');
      assert.strictEqual(formatWhatsAppRecipient('+91 98765 41002'), '919876541002');
      assert.strictEqual(formatWhatsAppRecipient('invalid_phone'), null);
    });

    // 5. WhatsApp Consent Enforcement: Non-opted customer notifications are SKIPPED
    await test('5. WhatsApp notifications for customers without explicit consent are marked SKIPPED', async () => {
      // customerUser has whatsapp: false
      const res = await NotificationDispatcher.dispatch({
        userId: customerUser._id,
        eventType: 'ORDER_PLACED',
        metadata: { orderNumber: 'BB-WA-TEST-01', grandTotal: 350 },
      });

      assert.strictEqual(res.success, true);
      const waNotif = await Notification.findOne({
        user: customerUser._id,
        channel: 'WHATSAPP',
        eventType: 'ORDER_PLACED',
      });
      assert.ok(waNotif);
      assert.strictEqual(waNotif.status, 'SKIPPED');
      assert.ok(waNotif.lastError.includes('consented'));
    });

    // 6. WhatsApp Delivery for Opted-in Customer
    await test('6. WhatsApp notifications for opted-in customers are dispatched successfully', async () => {
      // customerWithWhatsApp has whatsapp: true
      const res = await NotificationDispatcher.dispatch({
        userId: customerWithWhatsApp._id,
        eventType: 'ORDER_PLACED',
        metadata: { orderNumber: 'BB-WA-OPTIN-01', grandTotal: 350 },
      });

      assert.strictEqual(res.success, true);
      const waNotif = await Notification.findOne({
        user: customerWithWhatsApp._id,
        channel: 'WHATSAPP',
        eventType: 'ORDER_PLACED',
      });
      assert.ok(waNotif);
      assert.strictEqual(waNotif.status, 'SENT');
      assert.ok(waNotif.providerMessageId.startsWith('mock_wa_'));
    });

    // 7. Customer APIs: Access protection (401 without token)
    await test('7. GET /api/v1/notifications requires customer authentication (401)', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications',
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 8. Customer APIs: Customer only sees their own notifications
    await test('8. Customer notification list is strictly scoped to authenticated user', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.notifications));
      assert.ok(
        res.body.data.notifications.every(
          (n) => n.user.toString() === customerUser._id.toString()
        )
      );
    });

    // 9. Customer APIs: Unread count, Mark Single as Read, Mark All Read
    await test('9. Customer unread count, read-single, and read-all endpoints work accurately', async () => {
      // Get initial unread count
      const countRes1 = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications/unread-count',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(countRes1.status, 200);
      const initialUnread = countRes1.body.data.unreadCount;
      assert.ok(initialUnread > 0);

      // Find an unread in-app notification for Priya
      const inAppNotif = await Notification.findOne({
        user: customerUser._id,
        channel: 'IN_APP',
        isRead: false,
      });
      assert.ok(inAppNotif);

      // Mark single notification as read
      const readOneRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/notifications/${inAppNotif._id}/read`,
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(readOneRes.status, 200);
      assert.strictEqual(readOneRes.body.data.notification.isRead, true);

      // Verify unread count decreased by 1
      const countRes2 = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications/unread-count',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(countRes2.body.data.unreadCount, initialUnread - 1);

      // Mark all as read
      const readAllRes = await makeRequest({
        method: 'PATCH',
        path: '/api/v1/notifications/read-all',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(readAllRes.status, 200);

      // Verify unread count is now 0
      const countRes3 = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications/unread-count',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(countRes3.body.data.unreadCount, 0);
    });

    // 10. Customer cannot mark another customer's notification as read
    await test('10. Customer cannot mark another customer notification as read (404 Not Found)', async () => {
      const amitNotif = await Notification.findOne({ user: customerWithWhatsApp._id });
      assert.ok(amitNotif);

      // Priya attempts to read Amit's notification
      const res = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/notifications/${amitNotif._id}/read`,
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
    });

    // 11. Customer Notification Preferences: GET and PATCH
    await test('11. Customer can manage and toggle WhatsApp and Email preferences', async () => {
      // 1. Get preferences
      const getRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/notifications/preferences',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.data.preferences.whatsapp, false);

      // 2. Opt-in to WhatsApp
      const patchRes = await makeRequest({
        method: 'PATCH',
        path: '/api/v1/notifications/preferences',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { whatsapp: true },
      });
      assert.strictEqual(patchRes.status, 200);
      assert.strictEqual(patchRes.body.data.preferences.whatsapp, true);

      // 3. Reject invalid non-boolean value
      const badRes = await makeRequest({
        method: 'PATCH',
        path: '/api/v1/notifications/preferences',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { email: 'yes_please' },
      });
      assert.strictEqual(badRes.status, 400);

      // Restore Priya's whatsapp preference
      await makeRequest({
        method: 'PATCH',
        path: '/api/v1/notifications/preferences',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { whatsapp: false },
      });
    });

    // 12. Admin Notification APIs: Non-ADMIN gets 403 Forbidden
    await test('12. Non-ADMIN user receives 403 Forbidden on admin notification endpoints', async () => {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/notifications',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    // 13. Admin Notification APIs: List with filtering and stats
    await test('13. Admin can query notification audit logs and aggregate statistics', async () => {
      // Stats
      const statsRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/notifications/stats',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(statsRes.status, 200);
      assert.strictEqual(statsRes.body.success, true);
      assert.ok(statsRes.body.data.totalNotifications > 0);
      assert.ok(statsRes.body.data.statusBreakdown.SENT > 0);

      // List with filter
      const listRes = await makeRequest({
        method: 'GET',
        path: '/api/v1/admin/notifications?channel=EMAIL',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body.data.notifications));
      assert.ok(listRes.body.data.notifications.every((n) => n.channel === 'EMAIL'));
    });

    // 14. Admin Notification Retry: Safe retry for FAILED notifications
    await test('14. Admin retry of FAILED notification succeeds and prevents concurrent retries', async () => {
      // Create a FAILED notification
      const failedNotif = await Notification.create({
        user: customerUser._id,
        channel: 'EMAIL',
        eventType: 'ORDER_PLACED',
        recipient: 'priya.sharma@bento.in',
        subject: 'Retry Test',
        message: 'Order message for retry',
        status: 'FAILED',
        idempotencyKey: `email_retry_test_${Date.now()}`,
        attempts: 1,
        maxAttempts: 3,
        lastError: 'Simulated connection timeout',
      });

      // Admin triggers retry
      const retryRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/admin/notifications/${failedNotif._id}/retry`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(retryRes.status, 200);
      assert.strictEqual(retryRes.body.data.notification.status, 'SENT');
      assert.strictEqual(retryRes.body.data.notification.attempts, 2);

      // Attempting to retry an already SENT notification is rejected (concurrency guard)
      const retryAgainRes = await makeRequest({
        method: 'POST',
        path: `/api/v1/admin/notifications/${failedNotif._id}/retry`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(retryAgainRes.status, 400);
      assert.ok(retryAgainRes.body.message.includes('not eligible for retry'));
    });

    // 15. Business Event Trigger: Order Placement (ORDER_PLACED & ORDER_CONFIRMED for COD)
    let placedOrder = null;
    let placedOrderId = null;
    await test('15. Order placement triggers ORDER_PLACED and ORDER_CONFIRMED notifications', async () => {
      await Cart.findOneAndUpdate(
        { user: customerUser._id },
        { items: [{ product: testProduct._id, quantity: 1 }] },
        { upsert: true }
      );

      const placeRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          addressId: customerAddress._id.toString(),
          deliverySlotId: testSlot._id.toString(),
          paymentMethod: 'COD',
        },
      });

      assert.strictEqual(placeRes.status, 201);
      placedOrder = placeRes.body.data;
      placedOrderId = placedOrder.id || placedOrder._id;

      // Verify ORDER_PLACED notification was created
      const placedNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'ORDER_PLACED',
        channel: 'IN_APP',
      });
      assert.ok(placedNotif);
      assert.strictEqual(placedNotif.status, 'SENT');

      // Verify ORDER_CONFIRMED notification was created for COD
      const confirmedNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'ORDER_CONFIRMED',
        channel: 'IN_APP',
      });
      assert.ok(confirmedNotif);
    });

    // 16. Business Event Trigger: Kitchen Status Transitions (PREPARING & READY_FOR_PICKUP)
    await test('16. Kitchen transitions trigger ORDER_PREPARING and ORDER_READY notifications', async () => {
      // 1. Move to PREPARING
      const prepRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/operations/kitchen/orders/${placedOrderId}/status`,
        headers: { Authorization: `Bearer ${kitchenToken}` },
        body: { status: 'PREPARING' },
      });
      assert.strictEqual(prepRes.status, 200);

      const prepNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'ORDER_PREPARING',
        channel: 'IN_APP',
      });
      assert.ok(prepNotif);

      // 2. Move to READY_FOR_PICKUP
      const readyRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/operations/kitchen/orders/${placedOrderId}/status`,
        headers: { Authorization: `Bearer ${kitchenToken}` },
        body: { status: 'READY_FOR_PICKUP' },
      });
      assert.strictEqual(readyRes.status, 200);

      const readyNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'ORDER_READY',
        channel: 'IN_APP',
      });
      assert.ok(readyNotif);
    });

    // 17. Business Event Trigger: Delivery Dispatch (OUT_FOR_DELIVERY) & Delivery (ORDER_DELIVERED)
    await test('17. Delivery operations trigger OUT_FOR_DELIVERY and ORDER_DELIVERED notifications', async () => {
      // 1. Dispatch order OUT_FOR_DELIVERY
      const dispatchRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${placedOrderId}/status`,
        headers: { Authorization: `Bearer ${deliveryToken}` },
        body: { status: 'OUT_FOR_DELIVERY' },
      });
      assert.strictEqual(dispatchRes.status, 200);

      const outNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'OUT_FOR_DELIVERY',
        channel: 'IN_APP',
      });
      assert.ok(outNotif);

      // 2. Fetch OTP from customer order view
      const orderViewRes = await makeRequest({
        method: 'GET',
        path: `/api/v1/orders/${placedOrderId}`,
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert.strictEqual(orderViewRes.status, 200);
      const deliveryOtp = orderViewRes.body.data.deliveryOtp;
      assert.ok(deliveryOtp);

      // 3. Complete delivery with OTP
      const deliverRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${placedOrderId}/status`,
        headers: { Authorization: `Bearer ${deliveryToken}` },
        body: { status: 'DELIVERED', otp: deliveryOtp },
      });
      assert.strictEqual(deliverRes.status, 200);

      const deliveredNotif = await waitForNotification({
        order: placedOrderId,
        eventType: 'ORDER_DELIVERED',
        channel: 'IN_APP',
      });
      assert.ok(deliveredNotif);
    });

    // 18. Business Event Trigger: Order Cancellation (ORDER_CANCELLED)
    await test('18. Order cancellation triggers ORDER_CANCELLED notification', async () => {
      // Create new PENDING COD order to cancel
      await Cart.findOneAndUpdate(
        { user: customerUser._id },
        { items: [{ product: testProduct._id, quantity: 1 }] },
        { upsert: true }
      );

      const placeRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          addressId: customerAddress._id.toString(),
          deliverySlotId: testSlot._id.toString(),
          paymentMethod: 'COD',
        },
      });
      const orderToCancel = placeRes.body.data;
      const orderToCancelId = orderToCancel.id || orderToCancel._id;

      const cancelRes = await makeRequest({
        method: 'PATCH',
        path: `/api/v1/orders/${orderToCancelId}/cancel`,
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { reason: 'Changed mind about dinner plans' },
      });
      assert.strictEqual(cancelRes.status, 200);

      const cancelNotif = await waitForNotification({
        order: orderToCancelId,
        eventType: 'ORDER_CANCELLED',
        channel: 'IN_APP',
      });
      assert.ok(cancelNotif);
      assert.ok(cancelNotif.message.includes('Changed mind about dinner plans'));
    });

    // 19. Business Event Trigger: Payment Expiry (ORDER_EXPIRED)
    await test('19. Expiring pending orders triggers ORDER_EXPIRED notification', async () => {
      // Create order with PENDING status
      const unpaidOrder = await Order.create({
        orderNumber: `P8-EXPIRE-${Date.now()}`,
        user: customerUser._id,
        items: [
          {
            product: testProduct._id,
            productName: testProduct.name,
            quantity: 1,
            unitPrice: 350,
            subtotal: 350,
          },
        ],
        deliveryAddress: {
          fullName: 'Priya Sharma',
          phone: '9876541002',
          addressLine: '14 River Road',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700120',
          addressType: 'HOME',
        },
        itemTotal: 350,
        deliveryCharge: 30,
        taxAmount: 0,
        grandTotal: 380,
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      });

      // Trigger expiry
      const expireRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders/expire-pending',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { maxAgeMinutes: 15 },
      });

      assert.strictEqual(expireRes.status, 200);
      assert.ok(expireRes.body.data.expiredOrderIds.some((id) => id.toString() === unpaidOrder._id.toString()));

      const expiredNotif = await waitForNotification({
        order: unpaidOrder._id,
        eventType: 'ORDER_EXPIRED',
        channel: 'IN_APP',
      });
      assert.ok(expiredNotif);
    });

    // 20. Notification Failure Isolation: Notification failure does not break order placement
    await test('20. Notification failures are safely isolated and do not crash or roll back orders', async () => {
      // Temporarily simulate failing transporter
      setTransporter({
        sendMail: async () => {
          throw new Error('Simulated fatal SMTP socket connection timeout');
        },
      });

      await Cart.findOneAndUpdate(
        { user: customerUser._id },
        { items: [{ product: testProduct._id, quantity: 1 }] },
        { upsert: true }
      );

      const placeRes = await makeRequest({
        method: 'POST',
        path: '/api/v1/orders',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          addressId: customerAddress._id.toString(),
          deliverySlotId: testSlot._id.toString(),
          paymentMethod: 'COD',
        },
      });

      // Order placement MUST succeed despite SMTP failure
      assert.strictEqual(placeRes.status, 201);
      assert.strictEqual(placeRes.body.success, true);

      // The email notification record was captured as FAILED
      const failedEmailNotif = await waitForNotification({
        order: placeRes.body.data.id || placeRes.body.data._id,
        channel: 'EMAIL',
        eventType: 'ORDER_PLACED',
        status: 'FAILED',
      });
      assert.ok(failedEmailNotif);
      assert.strictEqual(failedEmailNotif.status, 'FAILED');
      assert.ok(failedEmailNotif.lastError.includes('Simulated fatal SMTP socket'));

      // Restore working mock transporter
      setTransporter({
        sendMail: async (mailOptions) => {
          sentEmails.push(mailOptions);
          return { messageId: `mock_email_${Date.now()}` };
        },
      });
    });

    console.log('\n====================================================');
    console.log(`Phase 8 Verification Summary: ${passed}/${total} passed`);
    console.log('====================================================\n');
  } finally {
    // Teardown
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await DeliveryZone.deleteMany({});
    await DeliverySlot.deleteMany({});
    await Order.deleteMany({});
    await Cart.deleteMany({});
    await Notification.deleteMany({});
    if (serverInstance && serverInstance.close) {
      serverInstance.close();
    }
    await mongoose.connection.close();
  }
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error running Phase 8 tests:', err);
    process.exit(1);
  });
