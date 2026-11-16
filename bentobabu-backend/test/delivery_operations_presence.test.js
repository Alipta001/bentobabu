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
  console.log('--- Starting Delivery Partner Presence & Operations Test Suite ---');

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
  let deliveryApp = null;

  try {
    // 1. Create delivery partner user and admin user
    const deliveryEmail = `presence_rider_${timestamp}@bento.in`;
    const deliveryPhone = `98${String(timestamp).slice(-8)}`;
    deliveryUser = await User.create({
      name: 'Rider Arjun Verma',
      email: deliveryEmail,
      phone: deliveryPhone,
      password: hashedPassword,
      role: 'DELIVERY',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const adminEmail = `admin_ops_${timestamp}@bento.in`;
    const adminPhone = `97${String(timestamp).slice(-8)}`;
    adminUser = await User.create({
      name: 'Admin Operations Chief',
      email: adminEmail,
      phone: adminPhone,
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    // Create an approved DeliveryApplication for rider
    deliveryApp = await DeliveryApplication.create({
      applicationNumber: `BB-DEL-${timestamp.toString().slice(-6)}`,
      user: deliveryUser._id,
      personalInfo: {
        fullName: 'Rider Arjun Verma',
        phone: deliveryPhone,
        email: deliveryEmail,
        dateOfBirth: new Date('1998-05-15'),
        gender: 'MALE',
      },
      address: {
        houseNo: 'Flat 101',
        street: '100ft Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      vehicleInfo: {
        vehicleType: 'SCOOTER',
        brand: 'Honda',
        model: 'Activa 6G',
        registrationNumber: 'KA04EV1234',
        drivingLicenseNumber: 'DL-KA04-2020-00123',
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

    console.log('✅ 1. Seeded delivery partner and admin accounts');

    // 2. Login both users
    const riderAuth = await loginUser(server, deliveryEmail, rawPassword);
    const adminAuth = await loginUser(server, adminEmail, rawPassword);
    console.log('✅ 2. Successfully authenticated Rider and Admin sessions');

    // 3. Partner fetches own initial presence
    const initialPresenceRes = await makeRequest(server, {
      path: '/api/v1/delivery/presence/me',
      method: 'GET',
      headers: { Cookie: cookieHeader(riderAuth.cookieJar) },
    });
    assert.equal(initialPresenceRes.statusCode, 200);
    assert.equal(initialPresenceRes.data?.data?.presence?.availabilityStatus, 'OFFLINE');
    assert.equal(initialPresenceRes.data?.data?.presence?.accountStatus, 'ACTIVE');
    assert.equal(initialPresenceRes.data?.data?.presence?.connectionStatus, 'DISCONNECTED');
    console.log('✅ [PASS] 3. Partner gets initial presence (OFFLINE + DISCONNECTED)');

    // 4. Partner toggles ONLINE
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
    console.log('✅ [PASS] 4. Partner successfully toggled availability to ONLINE');

    // 5. Partner sends heartbeat
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
    assert.equal(heartbeatRes.data?.connectionStatus, 'CONNECTED');
    console.log('✅ [PASS] 5. Heartbeat ping confirmed partner as CONNECTED');

    // 6. Partner sends valid GPS coordinates
    const locationRes = await makeRequest(
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
      {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 12.5,
        heading: 180,
        speed: 4.5,
        batteryLevel: 88,
      }
    );
    assert.equal(locationRes.statusCode, 200);
    assert.equal(locationRes.data?.data?.locationFreshness, 'LIVE');
    assert.equal(locationRes.data?.data?.lastLocation?.latitude, 12.9716);
    console.log('✅ [PASS] 6. GPS location update succeeded with LIVE freshness');

    // 7. Coordinate validation: Reject invalid coordinates (out of bounds or NaN or Null Island)
    const invalidLocRes = await makeRequest(
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
      { latitude: 120.5, longitude: 77.5946 } // invalid latitude > 90
    );
    assert.equal(invalidLocRes.statusCode, 400);

    const nullIslandRes = await makeRequest(
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
      { latitude: 0, longitude: 0 }
    );
    assert.equal(nullIslandRes.statusCode, 400);
    console.log('✅ [PASS] 7. Coordinate validations correctly rejected invalid coordinates');

    // 8. Admin retrieves overview statistics
    const overviewRes = await makeRequest(server, {
      path: '/api/v1/admin/delivery-operations/overview',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(overviewRes.statusCode, 200);
    assert.ok(overviewRes.data?.data?.totalApproved >= 1);
    assert.ok(overviewRes.data?.data?.online >= 1);
    assert.ok(overviewRes.data?.data?.available >= 1);
    console.log('✅ [PASS] 8. Admin fetched real-time fleet overview statistics');

    // 9. Admin retrieves delivery partners list (table & map)
    const partnersListRes = await makeRequest(server, {
      path: '/api/v1/admin/delivery-operations/partners?filter=ALL',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(partnersListRes.statusCode, 200);
    const foundRider = partnersListRes.data?.data?.find((p) => p.id === deliveryUser._id.toString());
    assert.ok(foundRider, 'Rider must be returned in partners list');
    assert.equal(foundRider.availabilityStatus, 'ONLINE');
    assert.equal(foundRider.connectionStatus, 'CONNECTED');
    assert.equal(foundRider.locationFreshness, 'LIVE');
    assert.equal(foundRider.lastLocation?.latitude, 12.9716);
    console.log('✅ [PASS] 9. Admin partners list returned full presence, connection, and location data');

    // 10. Admin retrieves detailed partner view for Partner Details Drawer
    const partnerDetailRes = await makeRequest(server, {
      path: `/api/v1/admin/delivery-operations/partners/${deliveryUser._id}`,
      method: 'GET',
      headers: { Cookie: cookieHeader(adminAuth.cookieJar) },
    });
    assert.equal(partnerDetailRes.statusCode, 200);
    const detailData = partnerDetailRes.data?.data;
    assert.equal(detailData.name, 'Rider Arjun Verma');
    assert.equal(detailData.vehicleInfo?.vehicleType, 'SCOOTER');
    assert.equal(detailData.vehicleInfo?.registrationNumber, 'KA04EV1234');
    assert.ok(detailData.lastLocation?.latitude);
    // Security check: Verify sensitive identity documents are NOT exposed in monitoring endpoint
    assert.equal(detailData.documents, undefined);
    assert.equal(detailData.idProof, undefined);
    console.log('✅ [PASS] 10. Partner details drawer endpoint returned data securely without document leakage');

    // 11. Admin suspends delivery partner
    const suspendRes = await makeRequest(
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
      { accountStatus: 'SUSPENDED', reason: 'Audit investigation' }
    );
    assert.equal(suspendRes.statusCode, 200);
    assert.equal(suspendRes.data?.data?.accountStatus, 'SUSPENDED');

    // Suspended partner cannot go online
    const suspendedGoOnline = await makeRequest(
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
      suspendedGoOnline.statusCode === 401 || suspendedGoOnline.statusCode === 403,
      'Suspended partner must be blocked from going online'
    );
    console.log('✅ [PASS] 11. Admin suspension strictly prevents partner from going online');

    // 12. Admin reactivates partner
    const reactivateRes = await makeRequest(
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
    assert.equal(reactivateRes.statusCode, 200);

    // Partner logs in again (or uses active session) and can go online
    const riderReAuth = await loginUser(server, deliveryEmail, rawPassword);
    const reactivatedGoOnline = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderReAuth.csrfToken,
          Cookie: cookieHeader(riderReAuth.cookieJar),
        },
      },
      { availability: 'ONLINE' }
    );
    assert.equal(reactivatedGoOnline.statusCode, 200);
    console.log('✅ [PASS] 12. Reactivated partner can resume going online');

    // 13. Partner switches OFFLINE
    const goOfflineRes = await makeRequest(
      server,
      {
        path: '/api/v1/delivery/presence/availability',
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderReAuth.csrfToken,
          Cookie: cookieHeader(riderReAuth.cookieJar),
        },
      },
      { availability: 'OFFLINE' }
    );
    assert.equal(goOfflineRes.statusCode, 200);
    assert.equal(goOfflineRes.data?.data?.presence?.availabilityStatus, 'OFFLINE');
    console.log('✅ [PASS] 13. Partner successfully switched OFFLINE');

    console.log('\nAll 13 Delivery Presence & Operations tests passed successfully!');
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
    if (deliveryApp) {
      await DeliveryApplication.deleteOne({ _id: deliveryApp._id });
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
  console.error('Test failed:', err);
  process.exit(1);
});
