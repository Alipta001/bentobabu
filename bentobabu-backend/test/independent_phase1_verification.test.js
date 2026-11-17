process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../app/config/db');
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

  assert.equal(loginRes.statusCode, 200);
  const loginCookies = parseCookies(loginRes.headers['set-cookie']);
  Object.assign(cookieJar, loginCookies);

  return {
    user: loginRes.data?.data?.user,
    cookieJar,
    csrfToken,
  };
}

async function runIndependentVerification() {
  console.log('\n================================================================');
  console.log('--- BentoBabu Phase 1 Independent Concurrency & Edge-Case Verification ---');
  console.log('================================================================\n');

  await connectDB();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const timestamp = Date.now();
  const password = 'Password@123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Users
  const rider1 = await User.create({
    name: 'Solo Rider',
    email: `solo_rider_${timestamp}@bento.in`,
    phone: `81${timestamp.toString().slice(-8)}`,
    password: hashedPassword,
    role: 'DELIVERY',
    isActive: true,
  });

  await DeliveryPartnerPresence.create({
    user: rider1._id,
    accountStatus: 'ACTIVE',
    availabilityStatus: 'ONLINE',
    intendedAvailability: 'ONLINE',
    currentOrderId: null,
    lastHeartbeat: new Date(),
  });

  const customer = await User.create({
    name: 'Verification Customer',
    email: `vcust_${timestamp}@bento.in`,
    phone: `82${timestamp.toString().slice(-8)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
  });

  const riderSession = await loginUser(server, rider1.email, password);

  const results = [];

  try {
    // -------------------------------------------------------------
    // Verification Scenario 1:
    // Can a SINGLE rider concurrently claim TWO different orders?
    // -------------------------------------------------------------
    console.log('[Scenario 1] Testing single rider claiming two distinct orders concurrently...');
    const orderA = await Order.create({
      orderNumber: `ORD-IND-${timestamp}-A`,
      user: customer._id,
      items: [{ product: new mongoose.Types.ObjectId(), productName: 'Item A', quantity: 1, unitPrice: 100, subtotal: 100 }],
      deliveryAddress: { fullName: 'User A', phone: '9999999999', addressLine: 'St A', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 100,
      deliveryCharge: 30,
      taxAmount: 10,
      grandTotal: 140,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: null,
    });

    const orderB = await Order.create({
      orderNumber: `ORD-IND-${timestamp}-B`,
      user: customer._id,
      items: [{ product: new mongoose.Types.ObjectId(), productName: 'Item B', quantity: 1, unitPrice: 100, subtotal: 100 }],
      deliveryAddress: { fullName: 'User B', phone: '9999999999', addressLine: 'St B', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 100,
      deliveryCharge: 30,
      taxAmount: 10,
      grandTotal: 140,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: null,
    });

    // Fire simultaneous claims for Order A and Order B by rider1
    const [resA, resB] = await Promise.all([
      makeRequest(
        server,
        {
          path: `/api/v1/operations/delivery/orders/${orderA._id}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': riderSession.csrfToken,
            Cookie: cookieHeader(riderSession.cookieJar),
          },
        },
        { status: 'OUT_FOR_DELIVERY', note: 'Claim Order A' }
      ),
      makeRequest(
        server,
        {
          path: `/api/v1/operations/delivery/orders/${orderB._id}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': riderSession.csrfToken,
            Cookie: cookieHeader(riderSession.cookieJar),
          },
        },
        { status: 'OUT_FOR_DELIVERY', note: 'Claim Order B' }
      ),
    ]);

    const orderAfterA = await Order.findById(orderA._id);
    const orderAfterB = await Order.findById(orderB._id);
    const bothClaimed =
      orderAfterA.assignedDeliveryPartner?.toString() === rider1._id.toString() &&
      orderAfterB.assignedDeliveryPartner?.toString() === rider1._id.toString();

    console.log(`  Order A Status Code: ${resA.statusCode}, Assigned: ${orderAfterA.assignedDeliveryPartner}`);
    console.log(`  Order B Status Code: ${resB.statusCode}, Assigned: ${orderAfterB.assignedDeliveryPartner}`);
    console.log(`  Both Orders Claimed by Same Partner? ${bothClaimed ? 'YES (RACE CONDITION DETECTED)' : 'NO'}`);

    results.push({
      scenario: 'Single Partner Simultaneous Multi-Order Claim',
      expected: 'One claim succeeds (200), second claim fails (400)',
      actual: `Status codes: [${resA.statusCode}, ${resB.statusCode}], Both claimed: ${bothClaimed}`,
      vulnerable: bothClaimed,
    });

    // -------------------------------------------------------------
    // Verification Scenario 2:
    // Can cash collection be executed while order is in READY_FOR_PICKUP?
    // -------------------------------------------------------------
    console.log('\n[Scenario 2] Testing cash collection on non-in-transit order (READY_FOR_PICKUP)...');
    const orderUnpicked = await Order.create({
      orderNumber: `ORD-IND-${timestamp}-UNPICKED`,
      user: customer._id,
      items: [{ product: new mongoose.Types.ObjectId(), productName: 'Item C', quantity: 1, unitPrice: 200, subtotal: 200 }],
      deliveryAddress: { fullName: 'User C', phone: '9999999999', addressLine: 'St C', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 10,
      grandTotal: 240,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: rider1._id,
    });

    const resCollectUnpicked = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${orderUnpicked._id}/collect-cash`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderSession.csrfToken,
          Cookie: cookieHeader(riderSession.cookieJar),
        },
      },
      { note: 'Attempting cash collection before pickup' }
    );

    console.log(`  Status Code: ${resCollectUnpicked.statusCode}, Message: ${resCollectUnpicked.data?.message}`);
    assert.equal(resCollectUnpicked.statusCode, 400);

    results.push({
      scenario: 'Cash Collection on READY_FOR_PICKUP Order',
      expected: 'HTTP 400 Bad Request',
      actual: `HTTP ${resCollectUnpicked.statusCode} (${resCollectUnpicked.data?.message})`,
      vulnerable: false,
    });

    // -------------------------------------------------------------
    // Verification Scenario 3:
    // Can cash collection be executed while order is OUT_FOR_DELIVERY (before DELIVERED)?
    // -------------------------------------------------------------
    console.log('\n[Scenario 3] Testing cash collection while order is OUT_FOR_DELIVERY (before DELIVERED)...');
    const resCollectOutForDelivery = await makeRequest(
      server,
      {
        path: `/api/v1/operations/delivery/orders/${orderAfterA._id}/collect-cash`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': riderSession.csrfToken,
          Cookie: cookieHeader(riderSession.cookieJar),
        },
      },
      { note: 'Collecting cash before OTP' }
    );

    console.log(`  Status Code: ${resCollectOutForDelivery.statusCode}, Permitted during OUT_FOR_DELIVERY: ${resCollectOutForDelivery.statusCode === 200}`);

    results.push({
      scenario: 'Cash Collection during OUT_FOR_DELIVERY (Before Delivery OTP)',
      expected: 'Permitted per current implementation, but note policy question: should it be post-delivery only?',
      actual: `HTTP ${resCollectOutForDelivery.statusCode}`,
      vulnerable: false,
    });

    // -------------------------------------------------------------
    // Verification Scenario 4:
    // Identity Document Index Inspection: Does MongoDB prevent duplicate DL on insert?
    // -------------------------------------------------------------
    console.log('\n[Scenario 4] Testing database-level enforcement of Driving License uniqueness...');
    const duplicateDl = `DL-TEST-UNIQUE-${timestamp}`;
    const app1 = await DeliveryApplication.create({
      applicationNumber: `BBD-APP1-${timestamp}`,
      user: rider1._id,
      personalInfo: { fullName: 'Applicant 1', phone: '9000000001', email: `app1_${timestamp}@bento.in`, dateOfBirth: new Date('1990-01-01'), gender: 'MALE' },
      address: { houseNo: '1', street: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      vehicleInfo: { vehicleType: 'MOTORCYCLE', registrationNumber: `KA-01-A-${timestamp.toString().slice(-4)}`, drivingLicenseNumber: duplicateDl },
      documents: {
        profilePhoto: { secureUrl: 'https://example.com/p.jpg', publicId: 'p1' },
        idProof: { idType: 'AADHAAR', idNumber: `ID1-${timestamp}`, document: { secureUrl: 'https://example.com/id.jpg', publicId: 'id1' } },
        drivingLicense: { secureUrl: 'https://example.com/dl.jpg', publicId: 'dl1' },
      },
      status: 'APPROVED',
      termsAccepted: true,
    });

    let app2Created = false;
    let app2Error = null;
    try {
      const app2 = await DeliveryApplication.create({
        applicationNumber: `BBD-APP2-${timestamp}`,
        user: customer._id,
        personalInfo: { fullName: 'Applicant 2', phone: '9000000002', email: `app2_${timestamp}@bento.in`, dateOfBirth: new Date('1992-01-01'), gender: 'FEMALE' },
        address: { houseNo: '2', street: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
        vehicleInfo: { vehicleType: 'MOTORCYCLE', registrationNumber: `KA-01-B-${timestamp.toString().slice(-4)}`, drivingLicenseNumber: duplicateDl },
        documents: {
          profilePhoto: { secureUrl: 'https://example.com/p2.jpg', publicId: 'p2' },
          idProof: { idType: 'AADHAAR', idNumber: `ID2-${timestamp}`, document: { secureUrl: 'https://example.com/id2.jpg', publicId: 'id2' } },
          drivingLicense: { secureUrl: 'https://example.com/dl2.jpg', publicId: 'dl2' },
        },
        status: 'PENDING_APPROVAL',
        termsAccepted: true,
      });
      app2Created = !!app2;
    } catch (err) {
      app2Error = err.message;
    }

    console.log(`  Application 2 created with duplicate Driving License? ${app2Created ? 'YES (Database allowed duplicate DL)' : 'NO'}`);
    if (app2Error) console.log(`  Error received: ${app2Error}`);

    results.push({
      scenario: 'Database Uniqueness for Driving License Number',
      expected: 'Database rejects duplicate DL on insert (E11000)',
      actual: app2Created ? 'Database ALLOWED duplicate DL (Index is sparse non-unique)' : 'Database rejected duplicate DL',
      vulnerable: app2Created,
    });

    console.log('\n================================================================');
    console.log('--- Verification Summary Table ---');
    console.table(results);
    console.log('================================================================\n');

  } finally {
    // Cleanup
    await Order.deleteMany({ orderNumber: { $regex: `ORD-IND-${timestamp}` } });
    await DeliveryApplication.deleteMany({ applicationNumber: { $regex: `BBD-APP` } });
    await DeliveryPartnerPresence.deleteMany({ user: rider1._id });
    await User.deleteMany({ _id: { $in: [rider1._id, customer._id] } });
    await RefreshSession.deleteMany({ user: { $in: [rider1._id, customer._id] } });

    server.close();
    await mongoose.connection.close();
    const { getRedisClient } = require('../app/config/redis');
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.quit().catch(() => {});
    }
    process.exit(0);
  }
}

runIndependentVerification().catch((err) => {
  console.error('Verification suite failed:', err);
  process.exit(1);
});
