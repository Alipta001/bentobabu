const assert = require('assert');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { app } = require('../server');
const { Order, User, DeliveryPartnerPresence, Notification, DeliveryApplication } = require('../app/models');
DeliveryApplication.findOne = () => ({
  lean: () => Promise.resolve({ status: 'APPROVED' }),
  then: (resolve) => resolve({ status: 'APPROVED' }),
});
const { generateAccessToken } = require('../app/utils/token');
const { generateCsrfToken } = require('../app/middleware/csrfMiddleware');

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

async function runProductionDeliveryAuditTests() {
  console.log('========================================================================');
  console.log('  BentoBabu — Delivery Lifecycle Production-Readiness Comprehensive Audit');
  console.log('========================================================================\n');

  // Identifiers
  const customerId = new mongoose.Types.ObjectId();
  const rider1Id = new mongoose.Types.ObjectId();
  const rider2Id = new mongoose.Types.ObjectId();
  const unauthorizedRiderId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();

  const customerToken = generateAccessToken({ id: customerId.toString(), role: 'CUSTOMER' });
  const rider1Token = generateAccessToken({ id: rider1Id.toString(), role: 'DELIVERY' });
  const rider2Token = generateAccessToken({ id: rider2Id.toString(), role: 'DELIVERY' });
  const unauthorizedRiderToken = generateAccessToken({ id: unauthorizedRiderId.toString(), role: 'DELIVERY' });
  const adminToken = generateAccessToken({ id: adminId.toString(), role: 'ADMIN' });

  // In-memory shared state
  let mockOrder = {
    _id: orderId,
    orderNumber: 'BB-AUDIT-9001',
    user: customerId,
    orderStatus: 'READY_FOR_PICKUP',
    grandTotal: 599,
    paymentMethod: 'RAZORPAY',
    paymentStatus: 'PAID',
    assignedDeliveryPartner: null,
    statusHistory: [{ status: 'CONFIRMED', changedAt: new Date() }, { status: 'READY_FOR_PICKUP', changedAt: new Date() }],
    deliveryOTP: null,
    deliveryOtpCode: null,
    failedOtpAttempts: 0,
    save: async function () { return this; },
    toJSON: function () {
      const copy = { ...this, id: this._id.toString() };
      delete copy.deliveryOTP;
      delete copy.deliveryOtpCode;
      delete copy.failedOtpAttempts;
      return copy;
    },
  };

  const dispatchedNotifications = [];
  const NotificationDispatcher = require('../app/utils/notificationDispatcher');
  const originalDispatch = NotificationDispatcher.dispatch;
  NotificationDispatcher.dispatch = async (payload) => {
    dispatchedNotifications.push(payload);
    return { success: true };
  };

  // Mock Mongoose models
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

  Order.findByIdAndUpdate = async (id, updateOps, options) => {
    if (!id || id.toString() !== mockOrder._id.toString()) return null;
    if (updateOps.$inc && typeof updateOps.$inc.failedOtpAttempts === 'number') {
      mockOrder.failedOtpAttempts = (mockOrder.failedOtpAttempts || 0) + updateOps.$inc.failedOtpAttempts;
    }
    if (updateOps.$set) {
      Object.assign(mockOrder, updateOps.$set);
    }
    return mockOrder;
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
    else if (idStr === rider1Id.toString() || idStr === rider2Id.toString() || idStr === unauthorizedRiderId.toString()) role = 'DELIVERY';
    const userDoc = {
      _id: id,
      id: idStr,
      isActive: true,
      role,
      name: role === 'ADMIN' ? 'Admin' : `Rider ${idStr.slice(-4)}`,
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
    [unauthorizedRiderId.toString(), {
      user: unauthorizedRiderId,
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
  redisModule.redisSet = async () => true;
  redisModule.redisGet = async () => null;

  // =======================================================================
  // AUDIT AREA 1: ATOMIC RIDER ASSIGNMENT (CONCURRENCY & RACE CONDITIONS)
  // =======================================================================
  console.log('--- AUDIT 1.1: Two riders simultaneously accept the same order ---');
  {
    mockOrder.orderStatus = 'READY_FOR_PICKUP';
    mockOrder.assignedDeliveryPartner = null;
    mockPresences.get(rider1Id.toString()).availabilityStatus = 'ONLINE';
    mockPresences.get(rider1Id.toString()).currentOrderId = null;
    mockPresences.get(rider2Id.toString()).availabilityStatus = 'ONLINE';
    mockPresences.get(rider2Id.toString()).currentOrderId = null;

    const csrf1 = generateCsrfToken();
    const csrf2 = generateCsrfToken();

    // Trigger concurrent requests using Promise.all
    const [resRider1, resRider2] = await Promise.all([
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf1 },
        cookies: { bb_csrf_token: csrf1, bb_delivery_access_token: rider1Token },
        body: { status: 'RIDER_ACCEPTED' },
      }),
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider2Token}`, 'x-csrf-token': csrf2 },
        cookies: { bb_csrf_token: csrf2, bb_delivery_access_token: rider2Token },
        body: { status: 'RIDER_ACCEPTED' },
      }),
    ]);

    const statuses = [resRider1.statusCode, resRider2.statusCode];
    assert.ok(statuses.includes(200), 'Exactly one request must succeed with 200');
    assert.ok(statuses.includes(409), 'Competing request must receive 409 Conflict');

    // Verify order has exactly one assigned delivery partner
    assert.strictEqual(mockOrder.orderStatus, 'RIDER_ACCEPTED');
    assert.ok(mockOrder.assignedDeliveryPartner !== null);

    // Verify that the losing rider is NOT left locked in BUSY
    const winnerId = mockOrder.assignedDeliveryPartner.toString();
    const loserId = winnerId === rider1Id.toString() ? rider2Id.toString() : rider1Id.toString();

    assert.strictEqual(mockPresences.get(winnerId).availabilityStatus, 'BUSY');
    assert.strictEqual(mockPresences.get(winnerId).currentOrderId.toString(), orderId.toString());
    assert.strictEqual(mockPresences.get(loserId).availabilityStatus, 'ONLINE');
    assert.strictEqual(mockPresences.get(loserId).currentOrderId, null);

    console.log(`[PASS] Exactly one rider (${winnerId.slice(-4)}) claimed the order; losing rider (${loserId.slice(-4)}) received 409 and presence safely rolled back to ONLINE.`);
  }

  console.log('\n--- AUDIT 1.2: Same rider sends duplicate acceptance requests ---');
  {
    // Reset order
    mockOrder.orderStatus = 'READY_FOR_PICKUP';
    mockOrder.assignedDeliveryPartner = null;
    const rider = mockPresences.get(rider1Id.toString());
    rider.availabilityStatus = 'ONLINE';
    rider.currentOrderId = null;

    const csrfA = generateCsrfToken();
    const csrfB = generateCsrfToken();

    const [resA, resB] = await Promise.all([
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrfA },
        cookies: { bb_csrf_token: csrfA, bb_delivery_access_token: rider1Token },
        body: { status: 'RIDER_ACCEPTED' },
      }),
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrfB },
        cookies: { bb_csrf_token: csrfB, bb_delivery_access_token: rider1Token },
        body: { status: 'RIDER_ACCEPTED' },
      }),
    ]);

    const codes = [resA.statusCode, resB.statusCode];
    assert.ok(codes.includes(200), 'First acceptance succeeds with 200');
    assert.ok(codes.includes(409), 'Duplicate concurrent acceptance fails with 409');
    console.log('[PASS] Duplicate concurrent acceptance prevented via atomic presence lock.');
  }

  console.log('\n--- AUDIT 1.3: Rider attempts to accept an already assigned order ---');
  {
    // Order already assigned to rider 1
    mockOrder.orderStatus = 'RIDER_ACCEPTED';
    mockOrder.assignedDeliveryPartner = rider1Id;
    mockPresences.get(rider2Id.toString()).availabilityStatus = 'ONLINE';
    mockPresences.get(rider2Id.toString()).currentOrderId = null;

    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider2Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider2Token },
      body: { status: 'RIDER_ACCEPTED' },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.ok(res.body.message.includes('already been assigned'));
    console.log('[PASS] Attempt to claim assigned order returned 409 Conflict.');
  }

  console.log('\n--- AUDIT 1.4: Order changes status (CANCELLED) while acceptance is attempted ---');
  {
    mockOrder.orderStatus = 'CANCELLED';
    mockOrder.assignedDeliveryPartner = null;
    mockPresences.get(rider1Id.toString()).availabilityStatus = 'ONLINE';
    mockPresences.get(rider1Id.toString()).currentOrderId = null;

    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'RIDER_ACCEPTED' },
    });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(mockPresences.get(rider1Id.toString()).availabilityStatus, 'ONLINE');
    console.log('[PASS] Status mismatch rejected with 400 Bad Request; rider presence left intact.');
  }

  // =======================================================================
  // AUDIT AREA 2: NOTIFICATION DUPLICATION & RELIABILITY
  // =======================================================================
  console.log('\n--- AUDIT 2.1: Lifecycle transitions generate correct notifications ---');
  {
    dispatchedNotifications.length = 0;

    // Transition 1: Kitchen marks READY_FOR_DISPATCH
    mockOrder.orderStatus = 'PREPARING';
    const csrfAdmin = generateCsrfToken();
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/kitchen/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${adminToken}`, 'x-csrf-token': csrfAdmin },
      cookies: { bb_csrf_token: csrfAdmin, bb_admin_access_token: adminToken },
      body: { status: 'READY_FOR_DISPATCH' },
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(dispatchedNotifications.find((n) => n.eventType === 'ORDER_READY'));
    assert.ok(dispatchedNotifications.find((n) => n.eventType === 'DELIVERY_REQUEST_AVAILABLE'));

    // Transition 2: Rider accepts
    dispatchedNotifications.length = 0;
    const csrfRider = generateCsrfToken();
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrfRider },
      cookies: { bb_csrf_token: csrfRider, bb_delivery_access_token: rider1Token },
      body: { status: 'RIDER_ACCEPTED' },
    });

    assert.strictEqual(dispatchedNotifications.length, 1);
    assert.strictEqual(dispatchedNotifications[0].eventType, 'RIDER_ACCEPTED');

    // Transition 3: Confirm pickup
    dispatchedNotifications.length = 0;
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrfRider },
      cookies: { bb_csrf_token: csrfRider, bb_delivery_access_token: rider1Token },
      body: { status: 'PICKED_UP' },
    });

    assert.strictEqual(dispatchedNotifications.length, 1);
    assert.strictEqual(dispatchedNotifications[0].eventType, 'OUT_FOR_DELIVERY');

    // Transition 4: Deliver with OTP
    dispatchedNotifications.length = 0;
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrfRider },
      cookies: { bb_csrf_token: csrfRider, bb_delivery_access_token: rider1Token },
      body: { status: 'DELIVERED', otp: mockOrder.deliveryOtpCode },
    });

    assert.strictEqual(dispatchedNotifications.length, 1);
    assert.strictEqual(dispatchedNotifications[0].eventType, 'ORDER_DELIVERED');

    console.log('[PASS] Every transition generated exactly one designated notification event.');
  }

  console.log('\n--- AUDIT 2.2: Notification dispatch failure does NOT abort business transition ---');
  {
    // Temporarily make dispatch reject
    NotificationDispatcher.dispatch = async () => {
      throw new Error('Simulated FCM / SMS Gateway network timeout');
    };

    mockOrder.orderStatus = 'READY_FOR_PICKUP';
    mockOrder.assignedDeliveryPartner = null;
    mockPresences.get(rider1Id.toString()).availabilityStatus = 'ONLINE';
    mockPresences.get(rider1Id.toString()).currentOrderId = null;

    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'RIDER_ACCEPTED' },
    });

    assert.strictEqual(res.statusCode, 200, 'Order update must succeed even if notification throws');
    assert.strictEqual(mockOrder.orderStatus, 'RIDER_ACCEPTED');
    console.log('[PASS] External notification service outage does not disrupt delivery status change.');

    // Restore mock dispatch
    NotificationDispatcher.dispatch = async (payload) => {
      dispatchedNotifications.push(payload);
      return { success: true };
    };
  }

  // =======================================================================
  // AUDIT AREA 3: RIDER AVAILABILITY & PRESENCE PERSISTENCE
  // =======================================================================
  console.log('\n--- AUDIT 3.1: Rider presence lifecycle (ONLINE -> BUSY -> BUSY -> ONLINE) ---');
  {
    const rider = mockPresences.get(rider1Id.toString());
    assert.strictEqual(rider.availabilityStatus, 'BUSY');
    assert.strictEqual(rider.currentOrderId.toString(), orderId.toString());

    // When pickup confirmed, status remains BUSY
    const csrf = generateCsrfToken();
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'PICKED_UP' },
    });
    assert.strictEqual(rider.availabilityStatus, 'BUSY');

    // Attempting to switch to ONLINE via availability API while active order exists
    const resSwitch = await handleRequest(app, {
      method: 'PATCH',
      url: '/api/v1/delivery/presence/availability',
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { availability: 'ONLINE' },
    });
    assert.strictEqual(resSwitch.statusCode, 200);
    assert.strictEqual(rider.availabilityStatus, 'BUSY', 'Must remain BUSY because order is active');

    // Deliver order -> presence automatically restores to ONLINE
    await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'DELIVERED', otp: mockOrder.deliveryOtpCode },
    });
    assert.strictEqual(rider.availabilityStatus, 'ONLINE');
    assert.strictEqual(rider.currentOrderId, null);

    console.log('[PASS] Rider availability accurately maintained as BUSY through pickup and cleared to ONLINE upon completion.');
  }

  console.log('\n--- AUDIT 3.2: App restart / session restoration restores BUSY presence ---');
  {
    // Simulate rider presence having drifted to OFFLINE after device shutdown while order was active
    mockOrder.orderStatus = 'PICKED_UP';
    mockOrder.assignedDeliveryPartner = rider1Id;
    const rider = mockPresences.get(rider1Id.toString());
    rider.availabilityStatus = 'OFFLINE';
    rider.currentOrderId = null;

    const csrf = generateCsrfToken();
    const resPresence = await handleRequest(app, {
      method: 'GET',
      url: '/api/v1/delivery/presence/me',
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
    });

    assert.strictEqual(resPresence.statusCode, 200);
    assert.strictEqual(rider.availabilityStatus, 'BUSY');
    assert.strictEqual(rider.currentOrderId.toString(), orderId.toString());
    console.log('[PASS] /presence/me automatically recovered active order and locked presence to BUSY.');
  }

  // =======================================================================
  // AUDIT AREA 4: OTP SECURITY & BRUTE-FORCE PROTECTION
  // =======================================================================
  console.log('\n--- AUDIT 4.1: Plaintext OTP inaccessible before PICKED_UP ---');
  {
    mockOrder.orderStatus = 'RIDER_ACCEPTED';
    mockOrder.deliveryOtpCode = '654321';
    mockOrder.deliveryOTP = crypto.createHash('sha256').update('654321').digest('hex');

    const csrfCust = generateCsrfToken();
    const resCust = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { authorization: `Bearer ${customerToken}`, 'x-csrf-token': csrfCust },
      cookies: { bb_csrf_token: csrfCust, bb_customer_access_token: customerToken },
    });

    assert.strictEqual(resCust.statusCode, 200);
    assert.strictEqual(resCust.body.data.deliveryOtp, undefined, 'Must not expose deliveryOtp in RIDER_ACCEPTED');
    console.log('[PASS] Delivery OTP remains hidden from customer API while in RIDER_ACCEPTED.');
  }

  console.log('\n--- AUDIT 4.2: Plaintext OTP exposed to customer when PICKED_UP ---');
  {
    mockOrder.orderStatus = 'PICKED_UP';

    const csrfCust = generateCsrfToken();
    const resCust = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { authorization: `Bearer ${customerToken}`, 'x-csrf-token': csrfCust },
      cookies: { bb_csrf_token: csrfCust, bb_customer_access_token: customerToken },
    });

    assert.strictEqual(resCust.statusCode, 200);
    assert.strictEqual(resCust.body.data.deliveryOtp, '654321');
    console.log('[PASS] Customer can view their delivery OTP once status is PICKED_UP.');
  }

  console.log('\n--- AUDIT 4.3: Unauthorized rider cannot verify OTP ---');
  {
    mockOrder.assignedDeliveryPartner = rider1Id;
    const csrf = generateCsrfToken();
    const resUnauth = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${unauthorizedRiderToken}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: unauthorizedRiderToken },
      body: { status: 'DELIVERED', otp: '654321' },
    });

    assert.strictEqual(resUnauth.statusCode, 403);
    assert.ok(resUnauth.body.message.includes('assigned to another'));
    console.log('[PASS] Unauthorized rider rejected with 403 Forbidden.');
  }

  console.log('\n--- AUDIT 4.4: Brute-force protection: invalid attempts increment and lock at 5/5 ---');
  {
    mockOrder.failedOtpAttempts = 0;
    const csrf = generateCsrfToken();

    // 4 invalid attempts
    for (let i = 1; i <= 4; i++) {
      const res = await handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
        cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
        body: { status: 'DELIVERED', otp: '000000' },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(mockOrder.failedOtpAttempts, i);
      assert.ok(res.body.message.includes(`${5 - i} attempts remaining`));
    }

    // 5th invalid attempt
    const res5 = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'DELIVERED', otp: '000000' },
    });
    assert.strictEqual(res5.statusCode, 400);
    assert.strictEqual(mockOrder.failedOtpAttempts, 5);

    // 6th attempt even with correct OTP must be blocked with 429
    const res6 = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'DELIVERED', otp: '654321' },
    });
    assert.strictEqual(res6.statusCode, 429);
    assert.ok(res6.body.message.includes('Maximum delivery OTP verification attempts exceeded'));

    console.log('[PASS] Brute-force protection strictly enforced: 5 invalid attempts locked verification with 429.');
  }

  console.log('\n--- AUDIT 4.5: Concurrent delivery completion requests cannot duplicate completion ---');
  {
    mockOrder.orderStatus = 'PICKED_UP';
    mockOrder.failedOtpAttempts = 0;
    mockOrder.deliveryOtpCode = '987654';
    mockOrder.deliveryOTP = crypto.createHash('sha256').update('987654').digest('hex');

    const csrf1 = generateCsrfToken();
    const csrf2 = generateCsrfToken();

    const [res1, res2] = await Promise.all([
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf1 },
        cookies: { bb_csrf_token: csrf1, bb_delivery_access_token: rider1Token },
        body: { status: 'DELIVERED', otp: '987654' },
      }),
      handleRequest(app, {
        method: 'PATCH',
        url: `/api/v1/operations/delivery/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf2 },
        cookies: { bb_csrf_token: csrf2, bb_delivery_access_token: rider1Token },
        body: { status: 'DELIVERED', otp: '987654' },
      }),
    ]);

    const codes = [res1.statusCode, res2.statusCode];
    assert.ok(codes.includes(200), 'One request must succeed with 200');
    assert.ok(codes.includes(409), 'Concurrent request must be rejected with 409 Conflict');
    assert.strictEqual(mockOrder.orderStatus, 'DELIVERED');
    console.log('[PASS] Atomic transition prevented concurrent delivery completion race condition.');
  }

  console.log('\n--- AUDIT 4.6: OTP cleared and inaccessible after DELIVERED ---');
  {
    assert.strictEqual(mockOrder.deliveryOTP, null);
    assert.strictEqual(mockOrder.deliveryOtpCode, null);

    const csrfCust = generateCsrfToken();
    const resCust = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { authorization: `Bearer ${customerToken}`, 'x-csrf-token': csrfCust },
      cookies: { bb_csrf_token: csrfCust, bb_customer_access_token: customerToken },
    });

    assert.strictEqual(resCust.statusCode, 200);
    assert.strictEqual(resCust.body.data.deliveryOtp, undefined);
    console.log('[PASS] Delivery OTP invalidated and inaccessible after order is DELIVERED.');
  }

  // =======================================================================
  // AUDIT AREA 5: LEGACY ORDER COMPATIBILITY
  // =======================================================================
  console.log('\n--- AUDIT 5.1: Legacy OUT_FOR_DELIVERY orders can still be completed with OTP ---');
  {
    mockOrder.orderStatus = 'OUT_FOR_DELIVERY';
    mockOrder.assignedDeliveryPartner = rider1Id;
    mockOrder.failedOtpAttempts = 0;
    mockOrder.deliveryOtpCode = '112233';
    mockOrder.deliveryOTP = crypto.createHash('sha256').update('112233').digest('hex');

    const csrf = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'PATCH',
      url: `/api/v1/operations/delivery/orders/${orderId}/status`,
      headers: { authorization: `Bearer ${rider1Token}`, 'x-csrf-token': csrf },
      cookies: { bb_csrf_token: csrf, bb_delivery_access_token: rider1Token },
      body: { status: 'DELIVERED', otp: '112233' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mockOrder.orderStatus, 'DELIVERED');
    console.log('[PASS] Legacy OUT_FOR_DELIVERY order completed successfully with OTP verification.');
  }

  console.log('\n--- AUDIT 5.2: Legacy OUT_FOR_DELIVERY exposes OTP to customer ---');
  {
    mockOrder.orderStatus = 'OUT_FOR_DELIVERY';
    mockOrder.deliveryOtpCode = '445566';
    mockOrder.deliveryOTP = crypto.createHash('sha256').update('445566').digest('hex');

    const csrfCust = generateCsrfToken();
    const res = await handleRequest(app, {
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { authorization: `Bearer ${customerToken}`, 'x-csrf-token': csrfCust },
      cookies: { bb_csrf_token: csrfCust, bb_customer_access_token: customerToken },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.deliveryOtp, '445566');
    console.log('[PASS] Legacy OUT_FOR_DELIVERY order correctly exposes OTP on customer tracking page.');
  }

  // Restore original dispatch
  NotificationDispatcher.dispatch = originalDispatch;

  console.log('\n========================================================================');
  console.log('  ALL 12 DEEP PRODUCTION READINESS AUDIT SCENARIOS PASSED WITH ZERO DEFECTS');
  console.log('========================================================================\n');
}

runProductionDeliveryAuditTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[FAIL] Audit execution error:', err);
    process.exit(1);
  });
