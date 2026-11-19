const assert = require('assert');
const mongoose = require('mongoose');
const { EventEmitter } = require('events');
const { app } = require('../server');
const { Order, User, DeliveryPartnerPresence, Notification } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { generateCsrfToken } = require('../app/middleware/csrfMiddleware');

// In-Memory Request Dispatcher for Express
function createMockReqRes({ method = 'GET', url = '/', headers = {}, cookies = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  req.rawHeaders = [];
  req.socket = {
    remoteAddress: '10.0.0.1',
    encrypted: true,
  };
  req.connection = req.socket;
  req.cookies = { ...cookies };
  req.body = body;

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.cookiesSet = [];
  res.cookiesCleared = [];

  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.removeHeader = (k) => {
    delete res.headers[k.toLowerCase()];
  };

  res.cookie = (name, val, options) => {
    res.cookiesSet.push({ name, val, options });
  };
  res.clearCookie = (name, options) => {
    res.cookiesCleared.push({ name, options });
  };

  let responseBody = '';
  res.write = (chunk) => {
    if (chunk) responseBody += chunk;
  };
  res.end = (chunk) => {
    if (chunk) responseBody += chunk;
    res.emit('finish');
  };

  return { req, res, getBody: () => responseBody };
}

async function handleRequest(appInstance, options) {
  return new Promise((resolve) => {
    const { req, res, getBody } = createMockReqRes(options);
    res.on('finish', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(getBody());
      } catch {
        parsed = getBody();
      }
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: parsed,
        cookiesSet: res.cookiesSet,
        cookiesCleared: res.cookiesCleared,
      });
    });
    appInstance(req, res);
  });
}

async function runDeliveryLifecycleTests() {
  console.log('========================================================================');
  console.log('  BentoBabu — Updated Delivery Lifecycle Verification Test Suite');
  console.log('========================================================================\n');

  // Set up Mock Data in memory
  const customerId = new mongoose.Types.ObjectId();
  const rider1Id = new mongoose.Types.ObjectId();
  const rider2Id = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();

  const customerToken = generateAccessToken({ id: customerId.toString(), role: 'CUSTOMER' });
  const rider1Token = generateAccessToken({ id: rider1Id.toString(), role: 'DELIVERY' });
  const rider2Token = generateAccessToken({ id: rider2Id.toString(), role: 'DELIVERY' });
  const adminToken = generateAccessToken({ id: adminId.toString(), role: 'ADMIN' });

  // In-memory simulated database documents
  let mockOrder = {
    _id: orderId,
    orderNumber: 'BB-TEST-1001',
    user: customerId,
    orderStatus: 'CONFIRMED',
    grandTotal: 499,
    paymentMethod: 'RAZORPAY',
    paymentStatus: 'PAID',
    assignedDeliveryPartner: null,
    statusHistory: [{ status: 'CONFIRMED', changedAt: new Date() }],
    deliveryOTP: null,
    deliveryOtpCode: null,
    failedOtpAttempts: 0,
    save: async function () { return this; },
    toJSON: function () { return { ...this, id: this._id.toString() }; },
  };

  const dispatchedNotifications = [];
  const NotificationDispatcher = require('../app/utils/notificationDispatcher');
  const originalDispatch = NotificationDispatcher.dispatch;
  NotificationDispatcher.dispatch = async (payload) => {
    dispatchedNotifications.push(payload);
    return { success: true };
  };

  // Mock Mongoose queries
  Order.findById = (id) => {
    const result = id && id.toString() === mockOrder._id.toString() ? mockOrder : null;
    const queryObj = {
      select: () => queryObj,
      populate: () => queryObj,
      session: () => queryObj,
      lean: () => Promise.resolve(result),
      then: (resolve) => resolve(result),
    };
    return queryObj;
  };

  Order.findOne = (query) => {
    let match = true;
    if (query._id && query._id.toString() !== mockOrder._id.toString()) match = false;
    if (query.user && query.user.toString() !== mockOrder.user.toString()) match = false;
    if (query.assignedDeliveryPartner && (!mockOrder.assignedDeliveryPartner || query.assignedDeliveryPartner.toString() !== mockOrder.assignedDeliveryPartner.toString())) match = false;
    if (query.orderStatus) {
      if (typeof query.orderStatus === 'string' && query.orderStatus !== mockOrder.orderStatus) match = false;
      if (query.orderStatus.$in && !query.orderStatus.$in.includes(mockOrder.orderStatus)) match = false;
    }
    const result = match ? mockOrder : null;
    const queryObj = {
      select: () => queryObj,
      populate: () => queryObj,
      session: () => queryObj,
      lean: () => Promise.resolve(result),
      then: (resolve) => resolve(result),
    };
    return queryObj;
  };

  Order.findOneAndUpdate = async (findQuery, updateOps) => {
    let match = true;
    if (findQuery._id && findQuery._id.toString() !== mockOrder._id.toString()) match = false;
    if (findQuery.orderStatus) {
      if (typeof findQuery.orderStatus === 'string' && findQuery.orderStatus !== mockOrder.orderStatus) match = false;
      if (findQuery.orderStatus.$in && !findQuery.orderStatus.$in.includes(mockOrder.orderStatus)) match = false;
    }
    if (findQuery.assignedDeliveryPartner === null && mockOrder.assignedDeliveryPartner !== null) match = false;
    if (findQuery.assignedDeliveryPartner && (!mockOrder.assignedDeliveryPartner || findQuery.assignedDeliveryPartner.toString() !== mockOrder.assignedDeliveryPartner.toString())) match = false;

    if (!match) return null;

    if (updateOps.$set) {
      Object.assign(mockOrder, updateOps.$set);
    }
    if (updateOps.$push && updateOps.$push.statusHistory) {
      mockOrder.statusHistory.push(updateOps.$push.statusHistory);
    }
    return mockOrder;
  };

  User.findById = (id) => {
    const idStr = id ? id.toString() : '';
    let role = 'CUSTOMER';
    if (idStr === adminId.toString()) role = 'ADMIN';
    else if (idStr === rider1Id.toString() || idStr === rider2Id.toString()) role = 'DELIVERY';
    const userDoc = {
      _id: id,
      id: idStr,
      isActive: true,
      role,
      name: role === 'ADMIN' ? 'Admin Test' : 'Rider Test',
    };
    return {
      lean: () => Promise.resolve(userDoc),
      then: (resolve) => resolve(userDoc),
    };
  };

  const mockPresences = new Map([
    [rider1Id.toString(), {
      user: rider1Id,
      accountStatus: 'ACTIVE',
      availabilityStatus: 'ONLINE',
      intendedAvailability: 'ONLINE',
      currentOrderId: null,
      save: async function () { return this; },
    }],
    [rider2Id.toString(), {
      user: rider2Id,
      accountStatus: 'ACTIVE',
      availabilityStatus: 'ONLINE',
      intendedAvailability: 'ONLINE',
      currentOrderId: null,
      save: async function () { return this; },
    }],
  ]);

  DeliveryPartnerPresence.find = (query) => ({
    lean: () => {
      const results = [];
      for (const p of mockPresences.values()) {
        if (query.accountStatus && p.accountStatus !== query.accountStatus) continue;
        if (query.availabilityStatus && p.availabilityStatus !== query.availabilityStatus) continue;
        if (query.currentOrderId === null && p.currentOrderId !== null) continue;
        results.push(p);
      }
      return Promise.resolve(results);
    },
  });

  DeliveryPartnerPresence.findOne = (query) => {
    const p = mockPresences.get(query.user?.toString());
    return {
      lean: () => Promise.resolve(p || null),
      session: () => Promise.resolve(p || null),
      then: (resolve) => resolve(p || null),
    };
  };

  DeliveryPartnerPresence.findOneAndUpdate = async (findQuery, updateOps) => {
    const p = mockPresences.get(findQuery.user?.toString());
    if (!p) return null;
    if (findQuery.accountStatus && p.accountStatus !== findQuery.accountStatus) return null;
    if (findQuery.availabilityStatus && p.availabilityStatus !== findQuery.availabilityStatus) return null;
    if (findQuery.currentOrderId === null && p.currentOrderId !== null) return null;

    if (updateOps.$set) {
      Object.assign(p, updateOps.$set);
    }
    return p;
  };

  // Mock Redis
  const redisModule = require('../app/config/redis');
  redisModule.redisDelPattern = async () => true;

  // --- TEST 1: Admin marks order as READY_FOR_DISPATCH (READY_FOR_PICKUP) ---
  console.log('--- TEST 1: Transition to READY_FOR_PICKUP / READY_FOR_DISPATCH notifies riders ---');
  {
    mockOrder.orderStatus = 'PREPARING';
    dispatchedNotifications.length = 0;

    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/kitchen/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_admin_access_token: adminToken,
      },
      body: {
        status: 'READY_FOR_DISPATCH',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockOrder.orderStatus, 'READY_FOR_PICKUP');

    // Verify ORDER_READY dispatched to customer
    const custNotif = dispatchedNotifications.find((n) => n.eventType === 'ORDER_READY');
    assert.ok(custNotif, 'Customer must receive ORDER_READY notification');

    // Allow promise tick for rider notifications
    await new Promise((r) => setTimeout(r, 50));
    const riderNotifs = dispatchedNotifications.filter((n) => n.eventType === 'DELIVERY_REQUEST_AVAILABLE');
    assert.ok(riderNotifs.length > 0, 'Available riders must be notified of delivery request');
    console.log('[PASS] Order is READY_FOR_PICKUP and available riders received DELIVERY_REQUEST_AVAILABLE');
  }

  // --- TEST 2: Rider accepts request -> RIDER_ACCEPTED (NOT OUT_FOR_DELIVERY) ---
  console.log('\n--- TEST 2: Rider accepts request -> Order transitions to RIDER_ACCEPTED ---');
  {
    dispatchedNotifications.length = 0;
    const csrf = generateCsrfToken();

    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${rider1Token}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_delivery_access_token: rider1Token,
      },
      body: {
        status: 'RIDER_ACCEPTED',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockOrder.orderStatus, 'RIDER_ACCEPTED', 'Order status must be RIDER_ACCEPTED');
    assert.strictEqual(mockOrder.assignedDeliveryPartner.toString(), rider1Id.toString(), 'Rider 1 must be assigned');
    assert.notStrictEqual(mockOrder.orderStatus, 'OUT_FOR_DELIVERY', 'Must NOT be OUT_FOR_DELIVERY');

    // Customer receives notification: "A rider has accepted your order and will pick it up shortly."
    const acceptedNotif = dispatchedNotifications.find((n) => n.eventType === 'RIDER_ACCEPTED');
    assert.ok(acceptedNotif, 'Customer must receive RIDER_ACCEPTED notification');

    // Rider presence must now be BUSY
    const rider1Presence = mockPresences.get(rider1Id.toString());
    assert.strictEqual(rider1Presence.availabilityStatus, 'BUSY');
    assert.strictEqual(rider1Presence.currentOrderId.toString(), orderId.toString());

    console.log('[PASS] Order status is RIDER_ACCEPTED, customer notified, rider 1 marked BUSY');
  }

  // --- TEST 3: Customer cannot see delivery OTP during RIDER_ACCEPTED ---
  console.log('\n--- TEST 3: Customer cannot retrieve delivery OTP while RIDER_ACCEPTED ---');
  {
    const res = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: {
        authorization: `Bearer ${customerToken}`,
      },
      cookies: {
        bb_customer_access_token: customerToken,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.orderStatus, 'RIDER_ACCEPTED');
    assert.strictEqual(res.body.data.deliveryOtp, undefined, 'Delivery OTP must be hidden while RIDER_ACCEPTED');
    console.log('[PASS] Delivery OTP remains secret until order is physically picked up');
  }

  // --- TEST 4: Another rider cannot confirm pickup ---
  console.log('\n--- TEST 4: Unauthorized rider cannot confirm pickup ---');
  {
    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${rider2Token}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_delivery_access_token: rider2Token,
      },
      body: {
        status: 'PICKED_UP',
      },
    });

    assert.strictEqual(res.statusCode, 403, 'Unassigned rider must be rejected with 403');
    console.log('[PASS] Unassigned rider rejected with 403 Forbidden');
  }

  // --- TEST 5: Assigned rider confirms pickup -> PICKED_UP ---
  console.log('\n--- TEST 5: Assigned rider clicks Confirm Pickup -> Order transitions to PICKED_UP ---');
  {
    dispatchedNotifications.length = 0;
    const csrf = generateCsrfToken();

    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${rider1Token}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_delivery_access_token: rider1Token,
      },
      body: {
        status: 'PICKED_UP',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockOrder.orderStatus, 'PICKED_UP', 'Order must be in PICKED_UP status');

    // Customer notification OUT_FOR_DELIVERY is triggered
    const outNotif = dispatchedNotifications.find((n) => n.eventType === 'OUT_FOR_DELIVERY');
    assert.ok(outNotif, 'OUT_FOR_DELIVERY customer notification must be dispatched upon physical pickup');
    console.log('[PASS] Order status is PICKED_UP and OUT_FOR_DELIVERY notification dispatched');
  }

  // --- TEST 6: Prevent duplicate pickup confirmations ---
  console.log('\n--- TEST 6: Prevent duplicate pickup confirmation ---');
  {
    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${rider1Token}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_delivery_access_token: rider1Token,
      },
      body: {
        status: 'PICKED_UP',
      },
    });

    assert.strictEqual(res.statusCode, 400, 'Duplicate pickup confirmation must return 400');
    assert.strictEqual(res.body.message, 'Order pickup has already been confirmed.');
    console.log('[PASS] Duplicate pickup rejected with 400 Bad Request');
  }

  // --- TEST 7: Customer CAN now retrieve delivery OTP when PICKED_UP ---
  console.log('\n--- TEST 7: Customer can now retrieve delivery OTP when PICKED_UP ---');
  {
    const res = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: {
        authorization: `Bearer ${customerToken}`,
      },
      cookies: {
        bb_customer_access_token: customerToken,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.orderStatus, 'PICKED_UP');
    assert.strictEqual(res.body.data.deliveryOtp, mockOrder.deliveryOtpCode, 'Delivery OTP exposed to customer when PICKED_UP');
    console.log('[PASS] Customer can view delivery OTP once order is PICKED_UP');
  }

  // --- TEST 8: Complete delivery -> DELIVERED ---
  console.log('\n--- TEST 8: Complete delivery to DELIVERED with OTP ---');
  {
    dispatchedNotifications.length = 0;
    const csrf = generateCsrfToken();

    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: {
        authorization: `Bearer ${rider1Token}`,
        'x-csrf-token': csrf,
      },
      cookies: {
        bb_csrf_token: csrf,
        bb_delivery_access_token: rider1Token,
      },
      body: {
        status: 'DELIVERED',
        otp: mockOrder.deliveryOtpCode,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockOrder.orderStatus, 'DELIVERED');

    // Customer receives ORDER_DELIVERED notification
    const deliveredNotif = dispatchedNotifications.find((n) => n.eventType === 'ORDER_DELIVERED');
    assert.ok(deliveredNotif, 'ORDER_DELIVERED notification must be dispatched');

    // Rider presence returns to ONLINE and currentOrderId is cleared
    const rider1Presence = mockPresences.get(rider1Id.toString());
    assert.strictEqual(rider1Presence.currentOrderId, null);
    assert.strictEqual(rider1Presence.availabilityStatus, 'ONLINE');
    console.log('[PASS] Order DELIVERED, rider 1 presence returned to ONLINE');
  }

  // Restore original dispatch
  NotificationDispatcher.dispatch = originalDispatch;

  console.log('\n========================================================================');
  console.log('  ALL 8 DELIVERY LIFECYCLE TESTS PASSED WITH ZERO DEFECTS');
  console.log('========================================================================\n');
  process.exit(0);
}

runDeliveryLifecycleTests().catch((err) => {
  console.error('[FAIL] Test execution error:', err);
  process.exit(1);
});
