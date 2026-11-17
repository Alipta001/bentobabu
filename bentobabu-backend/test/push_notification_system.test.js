process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Notification,
  DeviceToken,
  Order,
} = require('../app/models');
const PushNotificationController = require('../app/controllers/pushNotificationController');
const NotificationController = require('../app/controllers/notificationController');
const NotificationDispatcher = require('../app/utils/notificationDispatcher');
const { setMessagingMock } = require('../app/config/firebase');

function createMockReq(overrides = {}) {
  return {
    user: null,
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    get(header) {
      return this.headers[header.toLowerCase()] || '';
    },
    ...overrides,
  };
}

function createMockRes() {
  const res = {
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
  return res;
}

async function runTests() {
  console.log('\n================================================================');
  console.log(' Starting Push Notification System Complete 22-Scenario Suite   ');
  console.log('================================================================\n');

  await connectDB();

  const timestamp = Date.now();
  let adminUser, kitchenUser, customerUser, deliveryUser, inactiveAdminUser;
  let mockFcmCalls = [];

  // Mock FCM Messaging instance
  const mockMessaging = {
    send: async (payload) => {
      mockFcmCalls.push(payload);
      if (payload.token && payload.token.includes('dead-token')) {
        const err = new Error('The registration token is not registered.');
        err.code = 'messaging/registration-token-not-registered';
        throw err;
      }
      return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    },
    sendEachForMulticast: async (payload) => {
      mockFcmCalls.push(payload);
      const responses = payload.tokens.map((token) => {
        if (token.includes('dead-token')) {
          return {
            success: false,
            error: {
              code: 'messaging/registration-token-not-registered',
              message: 'The registration token is not registered.',
            },
          };
        }
        return {
          success: true,
          messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        };
      });

      const successCount = responses.filter((r) => r.success).length;
      const failureCount = responses.filter((r) => !r.success).length;

      return {
        responses,
        successCount,
        failureCount,
      };
    },
  };

  setMessagingMock(mockMessaging);

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users (ADMIN, KITCHEN, CUSTOMER, DELIVERY)...');

    adminUser = await User.create({
      name: `Admin Staff ${timestamp}`,
      email: `admin_${timestamp}@test.bentobabu.in`,
      phone: `98765${String(timestamp).slice(-5)}`,
      password: 'SecurePassword123!',
      role: 'ADMIN',
      isActive: true,
      notificationPreferences: {
        push: true,
        newOrderPushEnabled: true,
        orderUpdatePushEnabled: true,
      },
    });

    kitchenUser = await User.create({
      name: `Kitchen Staff ${timestamp}`,
      email: `kitchen_${timestamp}@test.bentobabu.in`,
      phone: `98764${String(timestamp).slice(-5)}`,
      password: 'SecurePassword123!',
      role: 'KITCHEN',
      isActive: true,
      notificationPreferences: {
        push: true,
        newOrderPushEnabled: true,
        orderUpdatePushEnabled: true,
      },
    });

    customerUser = await User.create({
      name: `Customer User ${timestamp}`,
      email: `cust_${timestamp}@test.bentobabu.in`,
      phone: `98763${String(timestamp).slice(-5)}`,
      password: 'SecurePassword123!',
      role: 'CUSTOMER',
      isActive: true,
    });

    deliveryUser = await User.create({
      name: `Delivery Rider ${timestamp}`,
      email: `rider_${timestamp}@test.bentobabu.in`,
      phone: `98762${String(timestamp).slice(-5)}`,
      password: 'SecurePassword123!',
      role: 'DELIVERY',
      isActive: true,
    });

    inactiveAdminUser = await User.create({
      name: `Inactive Admin ${timestamp}`,
      email: `inactive_admin_${timestamp}@test.bentobabu.in`,
      phone: `98761${String(timestamp).slice(-5)}`,
      password: 'SecurePassword123!',
      role: 'ADMIN',
      isActive: false,
    });

    console.log('[Setup] Users initialized successfully.\n');

    // ----------------------------------------------------
    // TEST 1: ADMIN can register a device
    // ----------------------------------------------------
    console.log('--- TEST 1: ADMIN can register a device ---');
    const adminToken = `fcm_token_admin_desktop_${timestamp}`;
    const req1 = createMockReq({
      user: adminUser,
      body: {
        token: adminToken,
        deviceName: 'MacBook Pro Admin',
        browser: 'Chrome 120',
        platform: 'macOS',
      },
    });
    const res1 = createMockRes();
    await PushNotificationController.registerDevice(req1, res1);
    assert.strictEqual(res1.statusCode, 200, 'Expected 200 OK');
    assert.strictEqual(res1.data.success, true);
    assert(res1.data.data.device, 'Should return device info');
    assert.strictEqual(res1.data.data.device.platform, 'WEB');
    const dbToken1 = await DeviceToken.findOne({ token: adminToken });
    assert(dbToken1, 'DeviceToken should exist in DB');
    assert.strictEqual(dbToken1.user.toString(), adminUser._id.toString());
    assert.strictEqual(dbToken1.role, 'ADMIN');
    assert.strictEqual(dbToken1.isActive, true);
    console.log('✓ Passed: ADMIN device registered successfully.\n');

    // ----------------------------------------------------
    // TEST 2: KITCHEN can register a device
    // ----------------------------------------------------
    console.log('--- TEST 2: KITCHEN can register a device ---');
    const kitchenToken = `fcm_token_kitchen_tablet_${timestamp}`;
    const req2 = createMockReq({
      user: kitchenUser,
      body: {
        token: kitchenToken,
        deviceName: 'Kitchen iPad Display',
        browser: 'Safari',
        platform: 'iOS',
      },
    });
    const res2 = createMockRes();
    await PushNotificationController.registerDevice(req2, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.data.success, true);
    const dbToken2 = await DeviceToken.findOne({ token: kitchenToken });
    assert(dbToken2);
    assert.strictEqual(dbToken2.user.toString(), kitchenUser._id.toString());
    assert.strictEqual(dbToken2.role, 'KITCHEN');
    console.log('✓ Passed: KITCHEN device registered successfully.\n');

    // ----------------------------------------------------
    // TEST 3: CUSTOMER cannot register for staff order alerts
    // ----------------------------------------------------
    console.log('--- TEST 3: CUSTOMER cannot register for staff order alerts ---');
    const req3 = createMockReq({
      user: customerUser,
      body: {
        token: `fcm_token_customer_${timestamp}`,
        deviceName: 'Customer Phone',
      },
    });
    const res3 = createMockRes();
    await PushNotificationController.registerDevice(req3, res3);
    assert.strictEqual(res3.statusCode, 403, 'Should reject CUSTOMER with 403 Forbidden');
    assert.strictEqual(res3.data.success, false);
    console.log('✓ Passed: CUSTOMER registration correctly rejected.\n');

    // ----------------------------------------------------
    // TEST 4: DELIVERY cannot register for staff alerts
    // ----------------------------------------------------
    console.log('--- TEST 4: DELIVERY cannot register for staff alerts ---');
    const req4 = createMockReq({
      user: deliveryUser,
      body: {
        token: `fcm_token_rider_${timestamp}`,
      },
    });
    const res4 = createMockRes();
    await PushNotificationController.registerDevice(req4, res4);
    assert.strictEqual(res4.statusCode, 403, 'Should reject DELIVERY with 403 Forbidden');
    console.log('✓ Passed: DELIVERY registration correctly rejected.\n');

    // ----------------------------------------------------
    // TEST 5: Unauthenticated requests are rejected
    // ----------------------------------------------------
    console.log('--- TEST 5: Unauthenticated requests are rejected ---');
    const req5 = createMockReq({
      user: null,
      body: { token: 'some_token' },
    });
    const res5 = createMockRes();
    await PushNotificationController.registerDevice(req5, res5);
    assert.strictEqual(res5.statusCode, 401, 'Should reject unauthenticated with 401');
    console.log('✓ Passed: Unauthenticated request rejected.\n');

    // ----------------------------------------------------
    // TEST 6: Invalid tokens are rejected
    // ----------------------------------------------------
    console.log('--- TEST 6: Invalid tokens are rejected ---');
    const req6 = createMockReq({
      user: adminUser,
      body: { token: '   ' },
    });
    const res6 = createMockRes();
    await PushNotificationController.registerDevice(req6, res6);
    assert.strictEqual(res6.statusCode, 400, 'Should reject whitespace token with 400');

    const req6b = createMockReq({
      user: adminUser,
      body: { token: 12345 },
    });
    const res6b = createMockRes();
    await PushNotificationController.registerDevice(req6b, res6b);
    assert.strictEqual(res6b.statusCode, 400, 'Should reject non-string token with 400');
    console.log('✓ Passed: Malformed tokens rejected.\n');

    // ----------------------------------------------------
    // TEST 7: User cannot unregister another user's device
    // ----------------------------------------------------
    console.log('--- TEST 7: User cannot unregister another user device ---');
    const req7 = createMockReq({
      user: kitchenUser, // Kitchen user trying to unregister Admin's token
      body: { token: adminToken },
    });
    const res7 = createMockRes();
    await PushNotificationController.unregisterDevice(req7, res7);
    assert.strictEqual(res7.statusCode, 404, 'Should return 404 for unowned device token');
    // Ensure admin token is still active
    const adminTokenDoc = await DeviceToken.findOne({ token: adminToken });
    assert.strictEqual(adminTokenDoc.isActive, true, 'Admin token must remain active');
    console.log('✓ Passed: Device unregistration is user-scoped and secure.\n');

    // ----------------------------------------------------
    // TEST 8: Multiple devices per user supported
    // ----------------------------------------------------
    console.log('--- TEST 8: Multiple devices per user supported ---');
    const adminPhoneToken = `fcm_token_admin_phone_${timestamp}`;
    const req8 = createMockReq({
      user: adminUser,
      body: {
        token: adminPhoneToken,
        deviceName: 'Admin iPhone',
        platform: 'iOS',
      },
    });
    const res8 = createMockRes();
    await PushNotificationController.registerDevice(req8, res8);
    assert.strictEqual(res8.statusCode, 200);

    const activeAdminTokens = await DeviceToken.find({ user: adminUser._id, isActive: true });
    assert.strictEqual(activeAdminTokens.length, 2, 'Admin should have 2 active devices');
    console.log('✓ Passed: Multiple devices per user supported.\n');

    // ----------------------------------------------------
    // TEST 9: Duplicate token registration is idempotent & reassigns properly
    // ----------------------------------------------------
    console.log('--- TEST 9: Duplicate token registration is idempotent & reassigns properly ---');
    const sharedTabletToken = `fcm_token_shared_tablet_${timestamp}`;

    // Admin registers tablet
    const req9a = createMockReq({
      user: adminUser,
      body: { token: sharedTabletToken, deviceName: 'Countertop Tablet' },
    });
    const res9a = createMockRes();
    await PushNotificationController.registerDevice(req9a, res9a);
    assert.strictEqual(res9a.statusCode, 200);
    let doc9 = await DeviceToken.findOne({ token: sharedTabletToken });
    assert.strictEqual(doc9.user.toString(), adminUser._id.toString());

    // Kitchen logs in on same device
    const req9b = createMockReq({
      user: kitchenUser,
      body: { token: sharedTabletToken, deviceName: 'Countertop Tablet (Kitchen shift)' },
    });
    const res9b = createMockRes();
    await PushNotificationController.registerDevice(req9b, res9b);
    assert.strictEqual(res9b.statusCode, 200);
    doc9 = await DeviceToken.findOne({ token: sharedTabletToken });
    assert.strictEqual(doc9.user.toString(), kitchenUser._id.toString(), 'Token must be reassigned to kitchen');
    assert.strictEqual(doc9.role, 'KITCHEN');
    console.log('✓ Passed: Reassignment handled gracefully and idempotently.\n');

    // ----------------------------------------------------
    // TEST 10: New order creates persistent in-app notifications and dispatches push for ADMIN & KITCHEN
    // ----------------------------------------------------
    console.log('--- TEST 10: New order dispatches push and creates in-app notifications ---');
    mockFcmCalls = [];
    const testOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: `BB-${timestamp}`,
      pricing: { finalPayable: 450 },
      payment: { method: 'COD', status: 'PENDING' },
      items: [
        {
          name: 'Bento Box Classic',
          quantity: 2,
          price: 200,
        },
      ],
      user: customerUser._id,
      address: {
        name: 'John Customer',
        city: 'Kolkata',
      },
    };

    const pushResult = await NotificationDispatcher.dispatchStaffOrderPush(testOrder);
    assert.strictEqual(pushResult.success, true);
    assert(pushResult.targetedStaffCount >= 2, 'Should target at least admin and kitchen');
    assert(mockFcmCalls.length > 0, 'FCM sendEachForMulticast should have been invoked');

    const lastCall = mockFcmCalls[mockFcmCalls.length - 1];
    assert(lastCall.notification.body.includes(testOrder.orderNumber) || lastCall.data.orderNumber === testOrder.orderNumber);
    assert.strictEqual(lastCall.data.orderId, testOrder._id.toString());
    assert.strictEqual(lastCall.data.eventType, 'ORDER_CREATED');

    // Verify in-app notifications created in DB
    const inAppNotifications = await Notification.find({
      order: testOrder._id,
      eventType: 'ORDER_CREATED',
    });
    assert(inAppNotifications.length >= 2, 'Should create in-app notifications for staff');
    console.log('✓ Passed: Staff order push and in-app notifications created successfully.\n');

    // ----------------------------------------------------
    // TEST 11: Inactive staff accounts excluded
    // ----------------------------------------------------
    console.log('--- TEST 11: Inactive staff accounts excluded ---');
    // Register token for inactive admin
    const inactiveToken = `fcm_token_inactive_admin_${timestamp}`;
    await DeviceToken.create({
      user: inactiveAdminUser._id,
      token: inactiveToken,
      role: 'ADMIN',
      isActive: true,
    });

    const targetedTokens = await NotificationDispatcher.getStaffDeviceTokens();
    const hasInactiveToken = targetedTokens.some((t) => t.token === inactiveToken);
    assert.strictEqual(hasInactiveToken, false, 'Inactive staff token must be excluded');
    console.log('✓ Passed: Inactive staff accounts strictly excluded.\n');

    // ----------------------------------------------------
    // TEST 12: Staff with newOrderPushEnabled: false excluded
    // ----------------------------------------------------
    console.log('--- TEST 12: Staff with newOrderPushEnabled: false excluded ---');
    await User.findByIdAndUpdate(kitchenUser._id, {
      'notificationPreferences.newOrderPushEnabled': false,
    });

    const targetedTokens2 = await NotificationDispatcher.getStaffDeviceTokens();
    const hasKitchenToken = targetedTokens2.some((t) => t.user._id.toString() === kitchenUser._id.toString());
    assert.strictEqual(hasKitchenToken, false, 'Opted-out staff must be excluded from new order push');

    // Restore kitchenUser preference
    await User.findByIdAndUpdate(kitchenUser._id, {
      'notificationPreferences.newOrderPushEnabled': true,
    });
    console.log('✓ Passed: Staff opt-out preference honored.\n');

    // ----------------------------------------------------
    // TEST 13: Invalid/dead FCM tokens are marked inactive
    // ----------------------------------------------------
    console.log('--- TEST 13: Invalid/dead FCM tokens are marked inactive ---');
    const deadToken = `fcm_dead-token_${timestamp}`;
    await DeviceToken.create({
      user: adminUser._id,
      token: deadToken,
      role: 'ADMIN',
      isActive: true,
    });

    const deadOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: `BB-DEAD-${timestamp}`,
      pricing: { finalPayable: 150 },
      payment: { method: 'ONLINE', status: 'COMPLETED' },
      items: [{ name: 'Test Meal', quantity: 1, price: 150 }],
      user: customerUser._id,
    };

    await NotificationDispatcher.dispatchStaffOrderPush(deadOrder);
    const updatedDeadToken = await DeviceToken.findOne({ token: deadToken });
    assert.strictEqual(updatedDeadToken.isActive, false, 'Dead token must be marked isActive: false');
    assert.strictEqual(updatedDeadToken.deactivationReason, 'UNREGISTERED');
    console.log('✓ Passed: Dead FCM token automatically deactivated.\n');

    // ----------------------------------------------------
    // TEST 14: Test notification endpoint works for user's own devices
    // ----------------------------------------------------
    console.log('--- TEST 14: Test notification endpoint works for user devices ---');
    const req14 = createMockReq({
      user: adminUser,
    });
    const res14 = createMockRes();
    await PushNotificationController.sendTestNotification(req14, res14);
    assert.strictEqual(res14.statusCode, 200);
    assert.strictEqual(res14.data.success, true);
    assert(res14.data.data.tokensTargeted >= 1);
    console.log('✓ Passed: Test notification endpoint works.\n');

    // ----------------------------------------------------
    // TEST 15: Device listing returns masked tokens, device name, and metadata
    // ----------------------------------------------------
    console.log('--- TEST 15: Device listing returns masked tokens and metadata ---');
    const req15 = createMockReq({
      user: adminUser,
    });
    const res15 = createMockRes();
    await PushNotificationController.getRegisteredDevices(req15, res15);
    assert.strictEqual(res15.statusCode, 200);
    assert.strictEqual(res15.data.success, true);
    assert(Array.isArray(res15.data.data.devices));
    const firstDevice = res15.data.data.devices[0];
    assert(firstDevice.maskedToken, 'Device must include masked token');
    assert(!firstDevice.token, 'Raw token must not be exposed');
    assert(firstDevice.deviceName, 'Must include device name');
    console.log('✓ Passed: Device listing securely masks tokens.\n');

    // ----------------------------------------------------
    // TEST 16: Preferences endpoint allows updating push settings
    // ----------------------------------------------------
    console.log('--- TEST 16: Preferences endpoint allows updating push settings ---');
    const req16 = createMockReq({
      user: adminUser,
      body: {
        newOrderPushEnabled: false,
        orderUpdatePushEnabled: true,
      },
    });
    const res16 = createMockRes();
    await NotificationController.updatePreferences(req16, res16);
    assert.strictEqual(res16.statusCode, 200);
    const updatedAdmin = await User.findById(adminUser._id);
    assert.strictEqual(updatedAdmin.notificationPreferences.newOrderPushEnabled, false);
    assert.strictEqual(updatedAdmin.notificationPreferences.orderUpdatePushEnabled, true);
    console.log('✓ Passed: Notification preferences updated successfully.\n');

    // ----------------------------------------------------
    // TEST 17: Customer cannot update staff push preferences
    // ----------------------------------------------------
    console.log('--- TEST 17: Customer cannot update staff push preferences ---');
    const req17 = createMockReq({
      user: customerUser,
      body: {
        newOrderPushEnabled: false,
        role: 'ADMIN', // malicious elevation attempt
      },
    });
    const res17 = createMockRes();
    await NotificationController.updatePreferences(req17, res17);
    assert.strictEqual(res17.statusCode, 403, 'Should reject customer attempting staff push config with 403');
    const untouchedCustomer = await User.findById(customerUser._id);
    assert.strictEqual(untouchedCustomer.role, 'CUSTOMER', 'Role must remain CUSTOMER');
    console.log('✓ Passed: Customer prevented from setting staff push flags or elevating role.\n');

    // ----------------------------------------------------
    // TEST 18: Notification model records channel PUSH & eventType ORDER_CREATED
    // ----------------------------------------------------
    console.log('--- TEST 18: Notification model records channel PUSH ---');
    const pushNotification = await Notification.create({
      user: adminUser._id,
      channel: 'PUSH',
      eventType: 'ORDER_CREATED',
      recipient: 'fcm_token_test_123',
      idempotencyKey: `idemp_push_${timestamp}`,
      subject: 'New Order BB-TEST',
      message: 'New order received',
      status: 'SENT',
    });
    assert.strictEqual(pushNotification.channel, 'PUSH');
    assert.strictEqual(pushNotification.eventType, 'ORDER_CREATED');
    console.log('✓ Passed: Notification schema supports PUSH channel.\n');

    // ----------------------------------------------------
    // TEST 19: Notification dispatcher handles FCM failures gracefully
    // ----------------------------------------------------
    console.log('--- TEST 19: Notification dispatcher handles FCM failures gracefully ---');
    // Temporarily mock failing FCM
    setMessagingMock({
      send: async () => {
        throw new Error('FCM Network Timeout Simulated');
      },
      sendEachForMulticast: async () => {
        throw new Error('FCM Network Timeout Simulated');
      },
    });

    const errorOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: `BB-ERR-${timestamp}`,
      pricing: { finalPayable: 200 },
      payment: { method: 'COD', status: 'PENDING' },
      items: [{ name: 'Snack', quantity: 1, price: 200 }],
      user: customerUser._id,
    };

    const failResult = await NotificationDispatcher.dispatchStaffOrderPush(errorOrder);
    assert(failResult.failureCount > 0 || failResult.success === false, 'Should gracefully record failure without crashing');
    // Restore working mock
    setMessagingMock(mockMessaging);
    console.log('✓ Passed: FCM failures handled gracefully without unhandled rejections.\n');

    // ----------------------------------------------------
    // TEST 20: Idempotency check prevents duplicate push for same order
    // ----------------------------------------------------
    console.log('--- TEST 20: Idempotency check prevents duplicate push ---');
    mockFcmCalls = [];
    const idempOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: `BB-IDEMP-${timestamp}`,
      pricing: { finalPayable: 300 },
      payment: { method: 'COD', status: 'PENDING' },
      items: [{ name: 'Combo', quantity: 1, price: 300 }],
      user: customerUser._id,
    };

    // First call
    const firstCall = await NotificationDispatcher.dispatchStaffOrderPush(idempOrder);
    assert.strictEqual(firstCall.success, true);
    const callsAfterFirst = mockFcmCalls.length;

    // Second call with same order
    const secondCall = await NotificationDispatcher.dispatchStaffOrderPush(idempOrder);
    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.alreadyProcessed, true, 'Second call should be flagged as alreadyProcessed');
    assert.strictEqual(mockFcmCalls.length, callsAfterFirst, 'No additional FCM calls should be made');
    console.log('✓ Passed: Idempotency prevents duplicate push dispatches.\n');

    // ----------------------------------------------------
    // TEST 21: Concurrent registrations for the same user handle upsert safely
    // ----------------------------------------------------
    console.log('--- TEST 21: Concurrent registrations handle upsert safely ---');
    const concurrentToken = `fcm_token_concurrent_${timestamp}`;
    const p1 = DeviceToken.findOneAndUpdate(
      { token: concurrentToken },
      {
        user: adminUser._id,
        role: 'ADMIN',
        deviceName: 'Device A',
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const p2 = DeviceToken.findOneAndUpdate(
      { token: concurrentToken },
      {
        user: adminUser._id,
        role: 'ADMIN',
        deviceName: 'Device A Updated',
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Promise.all([p1, p2]);
    const finalDocs = await DeviceToken.find({ token: concurrentToken });
    assert.strictEqual(finalDocs.length, 1, 'Should result in exactly 1 document for unique token');
    console.log('✓ Passed: Concurrent registrations handled safely.\n');

    // ----------------------------------------------------
    // TEST 22: Unregistering a device marks it inactive
    // ----------------------------------------------------
    console.log('--- TEST 22: Unregistering a device marks it inactive ---');
    const unregReq = createMockReq({
      user: adminUser,
      body: { token: adminToken },
    });
    const unregRes = createMockRes();
    await PushNotificationController.unregisterDevice(unregReq, unregRes);
    assert.strictEqual(unregRes.statusCode, 200);
    assert.strictEqual(unregRes.data.success, true);

    const checkDoc = await DeviceToken.findOne({ token: adminToken });
    assert.strictEqual(checkDoc.isActive, false, 'Device must be deactivated');
    assert.strictEqual(checkDoc.deactivationReason, 'USER_REVOKED');
    console.log('✓ Passed: Device successfully unregistered and deactivated.\n');

    console.log('================================================================');
    console.log(' ALL 22 TEST SCENARIOS PASSED SUCCESSFULLY!                      ');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  } finally {
    // Teardown test documents
    console.log('[Teardown] Cleaning up test fixtures...');
    try {
      await User.deleteMany({ email: { $regex: String(timestamp) } });
      await DeviceToken.deleteMany({ token: { $regex: String(timestamp) } });
      await Notification.deleteMany({ 'data.orderNumber': { $regex: String(timestamp) } });
    } catch (cleanupErr) {
      console.warn('[Teardown Warning]', cleanupErr.message);
    }
    await mongoose.connection.close();
    console.log('[Teardown] MongoDB connection closed.');
    process.exit(0);
  }
}

runTests();
