process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const connectDB = require('../app/config/db');
const { app } = require('../server');
const {
  User,
  DeliveryPartnerPresence,
  Order,
  Notification,
  RefreshSession,
} = require('../app/models');
const NotificationDispatcher = require('../app/utils/notificationDispatcher');

function parseCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders || []) {
    const [cookiePart] = header.split(';');
    const [name, ...rest] = cookiePart.split('=');
    cookies[name.trim()] = rest.join('=');
  }
  return cookies;
}

function cookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        ...options,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data,
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function loginUser(server, email, password) {
  const csrfRes = await makeRequest(server, {
    path: '/api/v1/auth/csrf-token',
    method: 'GET',
  });
  const cookieJar = parseCookies(csrfRes.headers['set-cookie']);
  const csrfToken = csrfRes.data?.data?.csrfToken || cookieJar.bb_csrf_token;

  const loginRes = await makeRequest(
    server,
    {
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: cookieHeader(cookieJar),
      },
    },
    { identifier: email, password }
  );

  assert.equal(loginRes.statusCode, 200, `Login failed for ${email}: ${JSON.stringify(loginRes.data)}`);
  const loginCookies = parseCookies(loginRes.headers['set-cookie']);
  Object.assign(cookieJar, loginCookies);

  return {
    user: loginRes.data?.data?.user,
    cookieJar,
    csrfToken,
  };
}

async function runHardeningTests() {
  console.log('\n================================================================');
  console.log('--- BentoBabu Reassignment OTP Hardening & Security Test Suite ---');
  console.log('================================================================\n');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const timestamp = Date.now();
  const password = 'Password@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const testResults = [];

  // 1. Create Test Users
  const adminUser = await User.create({
    name: 'Hardening Admin',
    email: `hdadmin_${timestamp}@bentobabu.com`,
    phone: `91${String(timestamp).slice(-8)}`,
    password: hashedPassword,
    role: 'ADMIN',
    isActive: true,
  });

  const customer = await User.create({
    name: 'Hardening Customer',
    email: `hdcust_${timestamp}@bentobabu.com`,
    phone: `90${String(timestamp).slice(-8)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
  });

  const rider1 = await User.create({
    name: 'Rider One',
    email: `hdrider1_${timestamp}@bentobabu.com`,
    phone: `89${String(timestamp).slice(-8)}`,
    password: hashedPassword,
    role: 'DELIVERY',
    isActive: true,
  });

  const rider2 = await User.create({
    name: 'Rider Two',
    email: `hdrider2_${timestamp}@bentobabu.com`,
    phone: `88${String(timestamp).slice(-8)}`,
    password: hashedPassword,
    role: 'DELIVERY',
    isActive: true,
  });

  const rider3 = await User.create({
    name: 'Rider Three',
    email: `hdrider3_${timestamp}@bentobabu.com`,
    phone: `87${String(timestamp).slice(-8)}`,
    password: hashedPassword,
    role: 'DELIVERY',
    isActive: true,
  });

  // 2. Setup Presences
  await DeliveryPartnerPresence.create({
    user: rider1._id,
    accountStatus: 'ACTIVE',
    availabilityStatus: 'ONLINE',
    intendedAvailability: 'ONLINE',
    currentOrderId: null,
    lastHeartbeat: new Date(),
  });

  await DeliveryPartnerPresence.create({
    user: rider2._id,
    accountStatus: 'ACTIVE',
    availabilityStatus: 'ONLINE',
    intendedAvailability: 'ONLINE',
    currentOrderId: null,
    lastHeartbeat: new Date(),
  });

  await DeliveryPartnerPresence.create({
    user: rider3._id,
    accountStatus: 'ACTIVE',
    availabilityStatus: 'ONLINE',
    intendedAvailability: 'OFFLINE', // Rider 3 prefers OFFLINE when free
    currentOrderId: null,
    lastHeartbeat: new Date(),
  });

  // Login sessions
  const adminAuth = await loginUser(server, adminUser.email, password);
  const rider1Auth = await loginUser(server, rider1.email, password);
  const rider2Auth = await loginUser(server, rider2.email, password);

  let orderCount = 1;
  async function createOrder(overrides = {}) {
    const num = `${timestamp}-${orderCount++}`;
    return Order.create({
      orderNumber: `ORD-HD-${num}`,
      user: customer._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          productName: 'Hardened Bento',
          unitPrice: 200,
          quantity: 1,
          subtotal: 200,
        },
      ],
      deliveryAddress: {
        fullName: 'Test Recipient',
        phone: '9999999999',
        addressLine: '123 Security Blvd',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      itemTotal: 200,
      deliveryCharge: 40,
      taxAmount: 10,
      grandTotal: 250,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: null,
      ...overrides,
    });
  }

  try {
    // -------------------------------------------------------------------------
    // Set up an active order claimed by Rider 1 (in OUT_FOR_DELIVERY)
    // -------------------------------------------------------------------------
    console.log('[Setup] Rider 1 claims Order into OUT_FOR_DELIVERY...');
    const activeOrder = await createOrder();
    const claimRes = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${activeOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookieJar),
        },
      },
      { status: 'OUT_FOR_DELIVERY' }
    );
    assert.equal(claimRes.statusCode, 200, 'Claim by rider 1 failed');

    const orderBefore = await Order.findById(activeOrder._id).select(
      '+deliveryOTP +deliveryOtpCode +failedOtpAttempts +deliveryOtpExpiresAt'
    );
    const initialPlainOtp = orderBefore.deliveryOtpCode;
    const initialOtpHash = orderBefore.deliveryOTP;
    const initialExpiry = orderBefore.deliveryOtpExpiresAt;

    // Simulate 2 failed OTP attempts prior to reassignment
    orderBefore.failedOtpAttempts = 2;
    await orderBefore.save();

    // -------------------------------------------------------------------------
    // SCENARIO 1: Reassignment during OUT_FOR_DELIVERY generates a new OTP
    // -------------------------------------------------------------------------
    console.log('[Scenario 1] Reassigning OUT_FOR_DELIVERY order from Rider 1 to Rider 2...');
    const reassignRes = await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${activeOrder._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider2._id, reassign: true }
    );

    assert.equal(reassignRes.statusCode, 200, `Reassignment failed: ${JSON.stringify(reassignRes.data)}`);

    const orderAfter = await Order.findById(activeOrder._id).select(
      '+deliveryOTP +deliveryOtpCode +failedOtpAttempts +deliveryOtpExpiresAt'
    );
    const newPlainOtp = orderAfter.deliveryOtpCode;
    const newOtpHash = orderAfter.deliveryOTP;
    const newExpiry = orderAfter.deliveryOtpExpiresAt;

    const otpChanged =
      newPlainOtp &&
      newPlainOtp.length === 6 &&
      newPlainOtp !== initialPlainOtp &&
      newOtpHash !== initialOtpHash;

    testResults.push({
      id: 1,
      scenario: 'Reassignment during OUT_FOR_DELIVERY generates a fresh secure OTP',
      expected: 'New 6-digit OTP generated, distinct from initial OTP',
      actual: otpChanged ? `Initial: [REDACTED], New: [REDACTED_CHANGED]` : 'FAILED - OTP did not change',
      passed: Boolean(otpChanged),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 2: Previous OTP is rejected
    // -------------------------------------------------------------------------
    console.log('[Scenario 2] Verifying delivery with previous (stale) OTP...');
    const staleVerifyRes = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${activeOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider2Auth.csrfToken,
          Cookie: cookieHeader(rider2Auth.cookieJar),
        },
      },
      { status: 'DELIVERED', otp: initialPlainOtp }
    );

    const passed2 =
      staleVerifyRes.statusCode === 400 &&
      staleVerifyRes.data?.message?.includes('Invalid delivery OTP');

    testResults.push({
      id: 2,
      scenario: 'Previous OTP is rejected after reassignment',
      expected: 'HTTP 400 Invalid delivery OTP',
      actual: `${staleVerifyRes.statusCode} - ${staleVerifyRes.data?.message}`,
      passed: Boolean(passed2),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 3: New OTP succeeds
    // -------------------------------------------------------------------------
    console.log('[Scenario 3] Verifying delivery with new fresh OTP...');
    const freshVerifyRes = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${activeOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider2Auth.csrfToken,
          Cookie: cookieHeader(rider2Auth.cookieJar),
        },
      },
      { status: 'DELIVERED', otp: newPlainOtp }
    );

    const orderDelivered = await Order.findById(activeOrder._id);
    const passed3 =
      freshVerifyRes.statusCode === 200 && orderDelivered.orderStatus === 'DELIVERED';

    testResults.push({
      id: 3,
      scenario: 'New fresh OTP succeeds in completing delivery',
      expected: 'HTTP 200 OK, orderStatus becomes DELIVERED',
      actual: `${freshVerifyRes.statusCode} - orderStatus: ${orderDelivered.orderStatus}`,
      passed: Boolean(passed3),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 4: Failed OTP attempts reset upon reassignment
    // -------------------------------------------------------------------------
    console.log('[Scenario 4] Checking failedOtpAttempts reset...');
    // We already checked orderAfter had failedOtpAttempts reset
    const passed4 = orderAfter.failedOtpAttempts === 0;
    testResults.push({
      id: 4,
      scenario: 'Failed OTP attempts reset to 0 upon reassignment',
      expected: 'failedOtpAttempts === 0',
      actual: `failedOtpAttempts was 2, reset to: ${orderAfter.failedOtpAttempts}`,
      passed: passed4,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 5: OTP expiry is refreshed
    // -------------------------------------------------------------------------
    console.log('[Scenario 5] Checking deliveryOtpExpiresAt refreshed...');
    const passed5 =
      newExpiry &&
      new Date(newExpiry).getTime() > Date.now() + 30 * 60 * 1000; // Refreshed to ~60 min future

    testResults.push({
      id: 5,
      scenario: 'OTP expiry timestamp is refreshed on reassignment',
      expected: 'deliveryOtpExpiresAt refreshed to future timestamp (~60m)',
      actual: `Expiry refreshed: ${newExpiry ? new Date(newExpiry).toISOString() : 'null'}`,
      passed: Boolean(passed5),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 6: Customer receives reassignment notification
    // -------------------------------------------------------------------------
    console.log('[Scenario 6] Checking customer reassignment notification...');
    const customerNotif = await Notification.findOne({
      user: customer._id,
      eventType: 'ORDER_REASSIGNED',
    });

    const passed6 =
      customerNotif &&
      customerNotif.subject.includes('Delivery Partner Updated') &&
      !customerNotif.message.includes(newPlainOtp); // Must NOT expose plaintext OTP

    testResults.push({
      id: 6,
      scenario: 'Customer receives reassignment notification (OTP omitted from text)',
      expected: 'Notification created with eventType ORDER_REASSIGNED, no OTP leakage',
      actual: customerNotif
        ? `Found notif: "${customerNotif.subject}" (Contains OTP: ${customerNotif.message.includes(newPlainOtp)})`
        : 'FAILED - notification not found',
      passed: Boolean(passed6),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 7: New rider receives reassignment notification
    // -------------------------------------------------------------------------
    console.log('[Scenario 7] Checking new rider assignment notification...');
    const rider2Notif = await Notification.findOne({
      user: rider2._id,
      eventType: 'DELIVERY_ASSIGNMENT',
    });

    const passed7 =
      rider2Notif && rider2Notif.subject.includes('New Delivery Assignment');

    testResults.push({
      id: 7,
      scenario: 'New delivery partner receives assignment notification',
      expected: 'Notification created with eventType DELIVERY_ASSIGNMENT',
      actual: rider2Notif
        ? `Found notif: "${rider2Notif.subject}"`
        : 'FAILED - notification not found',
      passed: Boolean(passed7),
    });

    // -------------------------------------------------------------------------
    // SCENARIO 8: Notification failure does not corrupt committed assignment
    // -------------------------------------------------------------------------
    console.log('[Scenario 8] Testing notification failure resilience...');
    const resilientOrder = await createOrder();
    // Move to OUT_FOR_DELIVERY with rider 1
    await DeliveryPartnerPresence.updateOne({ user: rider1._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });
    await DeliveryPartnerPresence.updateOne({ user: rider2._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });

    await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${resilientOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookieJar),
        },
      },
      { status: 'OUT_FOR_DELIVERY' }
    );

    // Temporarily mock dispatch to reject
    const originalDispatch = NotificationDispatcher.dispatch;
    NotificationDispatcher.dispatch = async () => {
      throw new Error('Simulated upstream notification dispatch catastrophic outage');
    };

    let dispatchFailedReassignRes = null;
    try {
      dispatchFailedReassignRes = await makeRequest(
        server,
        {
          path: `/api/v1/admin/orders/${resilientOrder._id}/assign-delivery`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': adminAuth.csrfToken,
            Cookie: cookieHeader(adminAuth.cookieJar),
          },
        },
        { deliveryPartnerId: rider2._id, reassign: true }
      );
    } finally {
      // Restore original dispatch
      NotificationDispatcher.dispatch = originalDispatch;
    }

    const orderResilientAfter = await Order.findById(resilientOrder._id);
    const passed8 =
      dispatchFailedReassignRes.statusCode === 200 &&
      orderResilientAfter.assignedDeliveryPartner.toString() === rider2._id.toString();

    testResults.push({
      id: 8,
      scenario: 'Notification failure does not corrupt or abort committed assignment',
      expected: 'HTTP 200 OK, order assigned to new rider despite dispatch error',
      actual: `Status: ${dispatchFailedReassignRes.statusCode}, Assigned: ${orderResilientAfter.assignedDeliveryPartner}`,
      passed: passed8,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 9: Previous rider presence restored according to intendedAvailability
    // -------------------------------------------------------------------------
    console.log('[Scenario 9] Testing previous rider presence restoration (intended OFFLINE)...');
    // Assign an order to rider 3 (who has intendedAvailability: 'OFFLINE')
    const orderRider3 = await createOrder();
    // Reset rider 3 presence to ONLINE temporarily to accept order
    await DeliveryPartnerPresence.updateOne(
      { user: rider3._id },
      { availabilityStatus: 'ONLINE', intendedAvailability: 'OFFLINE', currentOrderId: null }
    );

    // Admin assigns rider 3
    await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${orderRider3._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider3._id }
    );

    // Free rider 1 to receive reassignment
    await DeliveryPartnerPresence.updateOne(
      { user: rider1._id },
      { availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null }
    );

    // Admin reassigns from rider 3 to rider 1
    const reassignFrom3 = await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${orderRider3._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider1._id, reassign: true }
    );

    assert.equal(reassignFrom3.statusCode, 200);
    const presenceRider3 = await DeliveryPartnerPresence.findOne({ user: rider3._id });
    const passed9 =
      presenceRider3.availabilityStatus === 'OFFLINE' &&
      presenceRider3.currentOrderId === null;

    testResults.push({
      id: 9,
      scenario: 'Previous rider presence restored to intendedAvailability (OFFLINE)',
      expected: 'availabilityStatus restored to OFFLINE, currentOrderId === null',
      actual: `Rider 3 presence: ${presenceRider3.availabilityStatus}, currentOrderId: ${presenceRider3.currentOrderId}`,
      passed: passed9,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 10: New rider presence becomes BUSY
    // -------------------------------------------------------------------------
    console.log('[Scenario 10] Testing new rider presence becomes BUSY...');
    const presenceRider1 = await DeliveryPartnerPresence.findOne({ user: rider1._id });
    const passed10 =
      presenceRider1.availabilityStatus === 'BUSY' &&
      presenceRider1.currentOrderId.toString() === orderRider3._id.toString();

    testResults.push({
      id: 10,
      scenario: 'New rider presence becomes BUSY and linked to orderId',
      expected: 'availabilityStatus === BUSY, currentOrderId matches order',
      actual: `Rider 1 presence: ${presenceRider1.availabilityStatus}, currentOrderId: ${presenceRider1.currentOrderId}`,
      passed: passed10,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 11: Concurrent reassignment attempts are handled safely
    // -------------------------------------------------------------------------
    console.log('[Scenario 11] Testing concurrent admin reassignment race...');
    const raceOrder = await createOrder();
    await DeliveryPartnerPresence.updateOne({ user: rider1._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });
    await DeliveryPartnerPresence.updateOne({ user: rider2._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });

    // Initial assignment to rider 1
    await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${raceOrder._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider1._id }
    );

    // Free rider 2 and rider 3
    await DeliveryPartnerPresence.updateOne({ user: rider2._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });
    await DeliveryPartnerPresence.updateOne({ user: rider3._id }, { availabilityStatus: 'ONLINE', currentOrderId: null });

    // Race two admin reassignment requests to rider 2 and rider 3 simultaneously
    const [resRaceAdmin1, resRaceAdmin2] = await Promise.all([
      makeRequest(
        server,
        {
          path: `/api/v1/admin/orders/${raceOrder._id}/assign-delivery`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': adminAuth.csrfToken,
            Cookie: cookieHeader(adminAuth.cookieJar),
          },
        },
        { deliveryPartnerId: rider2._id, reassign: true }
      ),
      makeRequest(
        server,
        {
          path: `/api/v1/admin/orders/${raceOrder._id}/assign-delivery`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': adminAuth.csrfToken,
            Cookie: cookieHeader(adminAuth.cookieJar),
          },
        },
        { deliveryPartnerId: rider3._id, reassign: true }
      ),
    ]);

    const raceCodes = [resRaceAdmin1.statusCode, resRaceAdmin2.statusCode].sort();
    const passed11 = raceCodes[0] === 200 && raceCodes[1] === 409;

    testResults.push({
      id: 11,
      scenario: 'Concurrent admin reassignment race handled atomically',
      expected: 'Exactly one 200 OK and one 409 Conflict',
      actual: `Status codes: ${raceCodes[0]} & ${raceCodes[1]}`,
      passed: passed11,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 12: DELIVERED and CANCELLED orders cannot be reassigned
    // -------------------------------------------------------------------------
    console.log('[Scenario 12] Testing reassignment on DELIVERED and CANCELLED orders...');
    const deliveredOrder = await createOrder({ orderStatus: 'DELIVERED' });
    const cancelledOrder = await createOrder({ orderStatus: 'CANCELLED' });

    const resReassignDelivered = await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${deliveredOrder._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider1._id }
    );

    const resReassignCancelled = await makeRequest(
      server,
      {
        path: `/api/v1/admin/orders/${cancelledOrder._id}/assign-delivery`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { deliveryPartnerId: rider1._id }
    );

    const passed12 =
      resReassignDelivered.statusCode === 400 &&
      resReassignCancelled.statusCode === 400 &&
      resReassignDelivered.data?.message?.includes('already DELIVERED') &&
      resReassignCancelled.data?.message?.includes('already CANCELLED');

    testResults.push({
      id: 12,
      scenario: 'DELIVERED and CANCELLED orders cannot be reassigned',
      expected: 'Both rejected with HTTP 400 Bad Request',
      actual: `Delivered: ${resReassignDelivered.statusCode}, Cancelled: ${resReassignCancelled.statusCode}`,
      passed: passed12,
    });

    console.log('\n================================================================');
    console.log('--- Reassignment OTP Hardening Test Results ---');
    console.table(testResults);
    console.log('================================================================\n');

    const allPassed = testResults.every((t) => t.passed);
    console.log(`FINAL RESULT: ${allPassed ? 'ALL 12 SCENARIOS PASSED ✅' : 'FAILURES DETECTED ❌'}\n`);
    assert.equal(allPassed, true, 'One or more hardening test scenarios failed!');
  } finally {
    // Clean up test data safely
    await Order.deleteMany({ orderNumber: { $regex: `ORD-HD-${timestamp}` } });
    await DeliveryPartnerPresence.deleteMany({
      user: { $in: [rider1._id, rider2._id, rider3._id] },
    });
    await Notification.deleteMany({
      user: { $in: [customer._id, rider1._id, rider2._id, rider3._id] },
    });
    await User.deleteMany({
      _id: { $in: [adminUser._id, customer._id, rider1._id, rider2._id, rider3._id] },
    });
    await RefreshSession.deleteMany({
      user: { $in: [adminUser._id, customer._id, rider1._id, rider2._id, rider3._id] },
    });

    server.close();
    await mongoose.connection.close();
    const { getRedisClient } = require('../app/config/redis');
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.quit().catch(() => {});
    }
  }
}

runHardeningTests().catch((err) => {
  console.error('Hardening test suite execution failed:', err);
  process.exit(1);
});
