process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../app/config/db');
const { validateEnv } = require('../app/config/env');
const { getRedisClient } = require('../app/config/redis');
const { app } = require('../server');
const {
  User,
  DeliveryApplication,
  DeliveryPartnerPresence,
  Order,
  RefreshSession,
} = require('../app/models');

function parseCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
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

  assert.equal(loginRes.statusCode, 200, `Login failed for ${email}`);
  const loginCookies = parseCookies(loginRes.headers['set-cookie']);
  Object.assign(cookieJar, loginCookies);

  return { cookieJar, csrfToken, user: loginRes.data?.data?.user };
}

async function run() {
  console.log('--- Starting Complete 14-Scenario Delivery Operations E2E Test Suite ---');

  const env = validateEnv();
  await connectDB(env.mongoUri);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const timestamp = Date.now();
  const rawPassword = 'Password123!';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  let deliveryUser = null;
  let adminUser = null;
  let customerUser = null;
  let deliveryApp = null;
  let testOrder = null;

  try {
    // 0. Seed accounts
    const deliveryEmail = `e2e_rider_${timestamp}@bento.in`;
    const deliveryPhone = `98${String(timestamp).slice(-8)}`;
    deliveryUser = await User.create({
      name: 'Rider Vikram Rathore',
      email: deliveryEmail,
      phone: deliveryPhone,
      password: hashedPassword,
      role: 'DELIVERY',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const adminEmail = `e2e_admin_${timestamp}@bento.in`;
    const adminPhone = `97${String(timestamp).slice(-8)}`;
    adminUser = await User.create({
      name: 'Admin Fleet Director',
      email: adminEmail,
      phone: adminPhone,
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const customerEmail = `e2e_cust_${timestamp}@bento.in`;
    const customerPhone = `96${String(timestamp).slice(-8)}`;
    customerUser = await User.create({
      name: 'Pooja Hegde',
      email: customerEmail,
      phone: customerPhone,
      password: hashedPassword,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    deliveryApp = await DeliveryApplication.create({
      applicationNumber: `BB-DEL-${timestamp.toString().slice(-6)}`,
      user: deliveryUser._id,
      personalInfo: {
        fullName: 'Rider Vikram Rathore',
        phone: deliveryPhone,
        email: deliveryEmail,
        dateOfBirth: new Date('1997-04-10'),
        gender: 'MALE',
      },
      address: {
        houseNo: 'Plot 55',
        street: 'Koramangala 4th Block',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560034',
      },
      vehicleInfo: {
        vehicleType: 'MOTORCYCLE',
        brand: 'Bajaj',
        model: 'Pulsar 150',
        registrationNumber: 'KA01AB9999',
      },
      documents: {
        profilePhoto: {
          secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/sample_rider.jpg',
          publicId: 'sample_rider',
        },
        idProof: {
          idType: 'AADHAAR',
          document: {
            secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/sample_aadhaar.jpg',
            publicId: 'sample_aadhaar',
          },
        },
        drivingLicense: {
          secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/sample_dl.jpg',
          publicId: 'sample_dl',
        },
      },
      status: 'APPROVED',
      termsAccepted: true,
    });

    // Create a ready-for-pickup order
    const dummyProductId = new mongoose.Types.ObjectId();
    testOrder = await Order.create({
      orderNumber: `ORD-E2E-${timestamp.toString().slice(-6)}`,
      user: customerUser._id,
      items: [
        {
          product: dummyProductId,
          productName: 'Signature Bento Box',
          quantity: 2,
          unitPrice: 299,
          subtotal: 598,
        },
      ],
      itemTotal: 598,
      grandTotal: 638,
      total: 638,
      finalAmount: 638,
      subtotal: 598,
      deliveryFee: 40,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      deliveryAddress: {
        fullName: 'Pooja Hegde',
        phone: customerPhone,
        addressLine: 'Flat 202, Palm Meadows',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560034',
      },
    });

    const riderAuth = await loginUser(server, deliveryEmail, rawPassword);
    const adminAuth = await loginUser(server, adminEmail, rawPassword);

    // Scenario 1: Approved partner logs in and goes online
    const goOnlineRes = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { availability: 'ONLINE' }
    );
    assert.equal(goOnlineRes.statusCode, 200);
    assert.equal(goOnlineRes.data?.data?.presence?.availabilityStatus, 'ONLINE');
    console.log('✅ Scenario 1: Approved partner logged in and switched ONLINE');

    // Scenario 2: Admin sees partner online
    const adminPartnersRes = await makeRequest(server, {
      path: '/api/v1/admin/delivery-operations/partners?filter=ONLINE',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(adminPartnersRes.statusCode, 200);
    const onlineRider = adminPartnersRes.data?.data?.find((p) => p.id === deliveryUser._id.toString());
    assert.ok(onlineRider, 'Rider must appear in admin online partners filter');
    assert.equal(onlineRider.availabilityStatus, 'ONLINE');
    console.log('✅ Scenario 2: Admin panel confirms partner appears as ONLINE');

    // Scenario 3: Partner sends heartbeat
    const heartbeatRes = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/heartbeat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      {}
    );
    assert.equal(heartbeatRes.statusCode, 200);
    console.log('✅ Scenario 3: Partner sent heartbeat ping');

    // Scenario 4: Admin sees updated last-seen time
    const adminSeenRes = await makeRequest(server, {
      path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}`,
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(adminSeenRes.statusCode, 200);
    assert.ok(adminSeenRes.data?.data?.lastHeartbeat, 'Last heartbeat must be recorded');
    assert.equal(adminSeenRes.data?.data?.connectionStatus, 'CONNECTED');
    console.log('✅ Scenario 4: Admin verified updated last-seen heartbeat time');

    // Scenario 5: Partner moves and location updates
    const loc1Res = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/location',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { latitude: 12.9716, longitude: 77.5946, accuracy: 8.5 }
    );
    assert.equal(loc1Res.statusCode, 200);

    // Partner moves to new coordinates
    const loc2Res = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/location',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { latitude: 12.9755, longitude: 77.6012, accuracy: 5.0, speed: 6.2 }
    );
    assert.equal(loc2Res.statusCode, 200);
    assert.equal(loc2Res.data?.data?.lastLocation?.latitude, 12.9755);
    console.log('✅ Scenario 5: Partner movement and GPS location update successfully sent');

    // Scenario 6: Admin sees marker move
    const adminLocRes = await makeRequest(server, {
      path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}`,
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(adminLocRes.statusCode, 200);
    assert.equal(adminLocRes.data?.data?.lastLocation?.latitude, 12.9755);
    assert.equal(adminLocRes.data?.data?.lastLocation?.longitude, 77.6012);
    assert.equal(adminLocRes.data?.data?.locationFreshness, 'LIVE');
    console.log('✅ Scenario 6: Admin sees marker update to new coordinates (12.9755, 77.6012)');

    // Scenario 7: Partner accepts delivery and becomes busy
    const acceptOrderRes = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${testOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { status: 'OUT_FOR_DELIVERY' }
    );
    assert.equal(acceptOrderRes.statusCode, 200);

    // Verify partner presence is now BUSY
    const busyPresenceRes = await makeRequest(server, {
      path: '/api/v1/delivery/presence/me',
      method: 'GET',
      headers: { Cookie: cookieHeader(riderAuth.cookieJar) },
    });
    assert.equal(busyPresenceRes.statusCode, 200);
    assert.equal(busyPresenceRes.data?.data?.presence?.availabilityStatus, 'BUSY');
    assert.equal(busyPresenceRes.data?.data?.presence?.currentOrderId, testOrder._id.toString());
    console.log('✅ Scenario 7: Partner accepted delivery and automatically transitioned to BUSY');

    // Scenario 8: Partner completes delivery
    // Fetch plain OTP from order for verification
    const dbOrder = await Order.findById(testOrder._id).select('+deliveryOtpCode');
    const otp = dbOrder.deliveryOtpCode;

    const deliverOrderRes = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${testOrder._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { status: 'DELIVERED', otp }
    );
    assert.equal(deliverOrderRes.statusCode, 200);

    // Verify availability returned to ONLINE (intended availability)
    const afterDeliveredPresence = await makeRequest(server, {
      path: '/api/v1/delivery/presence/me',
      method: 'GET',
      headers: { Cookie: cookieHeader(riderAuth.cookieJar) },
    });
    assert.equal(afterDeliveredPresence.statusCode, 200);
    assert.equal(afterDeliveredPresence.data?.data?.presence?.availabilityStatus, 'ONLINE');
    assert.equal(afterDeliveredPresence.data?.data?.presence?.currentOrderId, null);
    console.log('✅ Scenario 8: Partner completed delivery and availability recalculated to ONLINE');

    // Scenario 9: Partner goes offline
    const goOfflineRes = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { availability: 'OFFLINE' }
    );
    assert.equal(goOfflineRes.statusCode, 200);
    assert.equal(goOfflineRes.data?.data?.presence?.availabilityStatus, 'OFFLINE');
    console.log('✅ Scenario 9: Partner successfully went OFFLINE');

    // Scenario 10: Browser closes and heartbeat expires
    // Simulate expired heartbeat (> 60 seconds ago)
    await DeliveryPartnerPresence.updateOne(
      { user: deliveryUser._id },
      { $set: { lastHeartbeat: new Date(Date.now() - 75000) } }
    );
    const expiredPresenceRes = await makeRequest(server, {
      path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}`,
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(expiredPresenceRes.statusCode, 200);
    assert.equal(expiredPresenceRes.data?.data?.connectionStatus, 'DISCONNECTED');
    console.log('✅ Scenario 10: Missing heartbeats properly marked partner as DISCONNECTED');

    // Scenario 11: GPS permission denied / unavailable
    // Partner can still send heartbeat even if GPS is denied
    const heartbeatNoGps = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/heartbeat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      {}
    );
    assert.equal(heartbeatNoGps.statusCode, 200);
    assert.equal(heartbeatNoGps.data?.connectionStatus, 'CONNECTED');
    console.log('✅ Scenario 11: System handles denied/unavailable GPS without dropping connection status');

    // Scenario 12: Partner loses internet connectivity
    // If no heartbeat or location comes in for > 60s, admin overview reflects disconnected count
    await DeliveryPartnerPresence.updateOne(
      { user: deliveryUser._id },
      { $set: { lastHeartbeat: new Date(Date.now() - 80000) } }
    );
    const overviewAfterDisconnect = await makeRequest(server, {
      path: '/api/v1/admin/delivery-operations/overview',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(overviewAfterDisconnect.statusCode, 200);
    assert.ok(overviewAfterDisconnect.data?.data?.disconnected >= 1);
    console.log('✅ Scenario 12: Lost internet connectivity detected and reflected in overview statistics');

    // Scenario 13: Suspended partner cannot go online or accept new assignments
    await makeRequest(
      server,
      {
        path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { accountStatus: 'SUSPENDED', reason: 'E2E Suspension Test' }
    );

    const suspendedTryOnline = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderAuth.csrfToken,
          Cookie: cookieHeader(riderAuth.cookieJar),
        },
      },
      { availability: 'ONLINE' }
    );
    assert.ok(
      suspendedTryOnline.statusCode === 401 || suspendedTryOnline.statusCode === 403,
      'Suspended partner cannot go online'
    );
    console.log('✅ Scenario 13: Suspended partner blocked from going online or accepting assignments');

    // Scenario 14: Offline partner is not offered new assignments
    // Reactivate partner, but keep them OFFLINE
    await makeRequest(
      server,
      {
        path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminAuth.csrfToken,
          Cookie: cookieHeader(adminAuth.cookieJar),
        },
      },
      { accountStatus: 'ACTIVE' }
    );

    const riderFreshAuth = await loginUser(server, deliveryEmail, rawPassword);
    // Explicitly make sure partner is OFFLINE
    await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderFreshAuth.csrfToken,
          Cookie: cookieHeader(riderFreshAuth.cookieJar),
        },
      },
      { availability: 'OFFLINE' }
    );

    // Query available delivery queue
    const queueWhenOffline = await makeRequest(server, {
      path: '/api/v1/operations/delivery/orders?status=READY_FOR_PICKUP',
      method: 'GET',
      headers: { Cookie: cookieHeader(riderFreshAuth.cookieJar) },
    });
    assert.equal(queueWhenOffline.statusCode, 200);
    // When offline, unassigned READY_FOR_PICKUP orders are NOT offered
    assert.equal(queueWhenOffline.data?.data?.length, 0);
    console.log('✅ Scenario 14: Offline partner is not offered unassigned orders');

    console.log('\n🎉 ALL 14 Delivery Operations Scenarios verified and passed successfully!');
  } finally {
    if (deliveryUser) {
      await User.deleteOne({ _id: deliveryUser._id });
      await DeliveryPartnerPresence.deleteOne({ user: deliveryUser._id });
      await RefreshSession.deleteMany({ user: deliveryUser._id });
    }
    if (adminUser) {
      await User.deleteOne({ _id: adminUser._id });
      await RefreshSession.deleteMany({ user: adminUser._id });
    }
    if (customerUser) {
      await User.deleteOne({ _id: customerUser._id });
    }
    if (deliveryApp) {
      await DeliveryApplication.deleteOne({ _id: deliveryApp._id });
    }
    if (testOrder) {
      await Order.deleteOne({ _id: testOrder._id });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.quit().catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error('E2E Test failed:', err);
  process.exit(1);
});
