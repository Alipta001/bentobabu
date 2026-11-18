process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const connectDB = require('../app/config/db');
const { isDeliveryOtpRequired } = require('../app/config/env');
const { getRedisClient } = require('../app/config/redis');
const { app } = require('../server');
const {
  User,
  Order,
  DeliveryPartnerPresence,
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
    method: 'GET',
    path: '/api/v1/auth/csrf-token',
  });
  const csrfCookies = parseCookies(csrfRes.headers['set-cookie'] || []);
  const csrfToken = csrfRes.data?.data?.csrfToken || csrfCookies.bb_csrf_token;

  const loginRes = await makeRequest(
    server,
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: cookieHeader(csrfCookies),
      },
    },
    { email, password }
  );

  const authCookies = {
    ...csrfCookies,
    ...parseCookies(loginRes.headers['set-cookie'] || []),
  };

  return {
    user: loginRes.data?.data?.user,
    cookies: authCookies,
    csrfToken: authCookies.bb_csrf_token || csrfToken,
  };
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('  BentoBabu — Configurable Delivery OTP Requirement Test Suite');
  console.log('===============================================================\n');

  // --- UNIT TESTS: isDeliveryOtpRequired() ---
  console.log('>>> 1. Testing isDeliveryOtpRequired() Configuration Parser...');

  const originalEnv = process.env.DELIVERY_OTP_REQUIRED;

  try {
    delete process.env.DELIVERY_OTP_REQUIRED;
    assert.equal(isDeliveryOtpRequired(), true, 'Missing env var must default to true');

    process.env.DELIVERY_OTP_REQUIRED = '';
    assert.equal(isDeliveryOtpRequired(), true, 'Empty string must default to true');

    process.env.DELIVERY_OTP_REQUIRED = 'invalid';
    assert.equal(isDeliveryOtpRequired(), true, 'Invalid string must default to true');

    process.env.DELIVERY_OTP_REQUIRED = '1';
    assert.equal(isDeliveryOtpRequired(), true, '"1" must default to true');

    process.env.DELIVERY_OTP_REQUIRED = 'true';
    assert.equal(isDeliveryOtpRequired(), true, '"true" must evaluate to true');

    process.env.DELIVERY_OTP_REQUIRED = 'TRUE';
    assert.equal(isDeliveryOtpRequired(), true, '"TRUE" must evaluate to true');

    process.env.DELIVERY_OTP_REQUIRED = 'false';
    assert.equal(isDeliveryOtpRequired(), false, '"false" must evaluate to false');

    process.env.DELIVERY_OTP_REQUIRED = '  FALSE  ';
    assert.equal(isDeliveryOtpRequired(), false, '"  FALSE  " with spaces must evaluate to false');

    console.log('✓ Configuration parser correctly handles all missing, valid, and edge cases');
  } finally {
    if (originalEnv !== undefined) {
      process.env.DELIVERY_OTP_REQUIRED = originalEnv;
    } else {
      delete process.env.DELIVERY_OTP_REQUIRED;
    }
  }

  // --- INTEGRATION TESTS ---
  await connectDB();
  const redis = getRedisClient();
  if (redis && redis.status !== 'ready') {
    try {
      await redis.connect();
    } catch {}
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test HTTP server listening on port ${port}`);

  try {
    // 2. Test GET /api/v1/delivery/config
    console.log('\n>>> 2. Testing GET /api/v1/delivery/config otpRequired Flag...');
    process.env.DELIVERY_OTP_REQUIRED = 'true';
    let cfgRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/delivery/config',
    });
    assert.equal(cfgRes.statusCode, 200);
    assert.equal(cfgRes.data?.data?.otpRequired, true, 'Config endpoint must return otpRequired: true');

    process.env.DELIVERY_OTP_REQUIRED = 'false';
    cfgRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/delivery/config',
    });
    assert.equal(cfgRes.statusCode, 200);
    assert.equal(cfgRes.data?.data?.otpRequired, false, 'Config endpoint must return otpRequired: false');
    console.log('✓ Public delivery config accurately reflects DELIVERY_OTP_REQUIRED environment setting');

    // Create test users
    const uniqueSuffix = Date.now();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const customerUser = await User.create({
      name: `Customer ${uniqueSuffix}`,
      email: `customer_${uniqueSuffix}@bentobabu.test`,
      password: passwordHash,
      phone: `9999${String(uniqueSuffix).slice(-6)}`,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const partnerUser1 = await User.create({
      name: `Delivery Agent 1 ${uniqueSuffix}`,
      email: `rider1_${uniqueSuffix}@bentobabu.test`,
      password: passwordHash,
      phone: `8888${String(uniqueSuffix).slice(-6)}`,
      role: 'DELIVERY',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const partnerUser2 = await User.create({
      name: `Delivery Agent 2 ${uniqueSuffix}`,
      email: `rider2_${uniqueSuffix}@bentobabu.test`,
      password: passwordHash,
      phone: `7777${String(uniqueSuffix).slice(-6)}`,
      role: 'DELIVERY',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    await DeliveryPartnerPresence.create({
      user: partnerUser1._id,
      accountStatus: 'ACTIVE',
      availabilityStatus: 'ONLINE',
      intendedAvailability: 'ONLINE',
      lastHeartbeat: new Date(),
    });

    await DeliveryPartnerPresence.create({
      user: partnerUser2._id,
      accountStatus: 'ACTIVE',
      availabilityStatus: 'ONLINE',
      intendedAvailability: 'ONLINE',
      lastHeartbeat: new Date(),
    });

    const rider1Auth = await loginUser(server, partnerUser1.email, 'Password123!');
    const rider2Auth = await loginUser(server, partnerUser2.email, 'Password123!');
    const customerAuth = await loginUser(server, customerUser.email, 'Password123!');

    // --- TEST SUITE: OTP REQUIRED = TRUE ---
    console.log('\n>>> 3. Testing Delivery Flow when DELIVERY_OTP_REQUIRED=true (Mandatory OTP)...');
    process.env.DELIVERY_OTP_REQUIRED = 'true';

    const testOtp1 = '654321';
    const otpHash1 = crypto.createHash('sha256').update(testOtp1).digest('hex');

    const dummyProductId = new mongoose.Types.ObjectId();

    const order1 = await Order.create({
      orderNumber: `BB-TEST-OTP-${uniqueSuffix}`,
      user: customerUser._id,
      items: [
        {
          product: dummyProductId,
          productName: 'Chicken Teriyaki Bento',
          quantity: 1,
          unitPrice: 299,
          subtotal: 299,
        },
      ],
      deliveryAddress: {
        fullName: 'Test Customer',
        phone: customerUser.phone,
        addressLine: '123 Test St',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      itemTotal: 299,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 329,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash1,
      deliveryOtpCode: testOtp1,
      deliveryOtpExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // 3a. Missing OTP when required -> 400
    let res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order1._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED' }
    );
    assert.equal(res.statusCode, 400, 'Must reject missing OTP when DELIVERY_OTP_REQUIRED=true');
    assert.match(res.data?.message, /Delivery OTP is required/i);
    console.log('✓ Correctly rejects completion without OTP when DELIVERY_OTP_REQUIRED=true');

    // 3b. Invalid OTP -> 400
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order1._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: '111111' }
    );
    assert.equal(res.statusCode, 400, 'Must reject invalid OTP');
    assert.match(res.data?.message, /Invalid delivery OTP/i);
    console.log('✓ Correctly rejects wrong OTP verification');

    // 3c. Unauthorized rider (partnerUser2 on partnerUser1 order) -> 403
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order1._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider2Auth.csrfToken,
          Cookie: cookieHeader(rider2Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: testOtp1 }
    );
    assert.equal(res.statusCode, 403, 'Must reject unauthorized partner');
    console.log('✓ Correctly forbids unauthorized delivery partner');

    // 3d. Expired OTP -> 400
    const expiredOrder = await Order.create({
      orderNumber: `BB-TEST-EXPIRED-${uniqueSuffix}`,
      user: customerUser._id,
      items: [{ product: dummyProductId, productName: 'Bento', quantity: 1, unitPrice: 200, subtotal: 200 }],
      deliveryAddress: { fullName: 'User', phone: '9999999999', addressLine: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 230,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash1,
      deliveryOtpExpiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
    });

    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${expiredOrder._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: testOtp1 }
    );
    assert.equal(res.statusCode, 400, 'Must reject expired OTP');
    assert.match(res.data?.message, /Delivery OTP has expired/i);
    console.log('✓ Correctly rejects expired delivery OTP');

    // 3e. Exceeded attempt limit (lockout) -> 429
    const lockedOrder = await Order.create({
      orderNumber: `BB-TEST-LOCKED-${uniqueSuffix}`,
      user: customerUser._id,
      items: [{ product: dummyProductId, productName: 'Bento', quantity: 1, unitPrice: 200, subtotal: 200 }],
      deliveryAddress: { fullName: 'User', phone: '9999999999', addressLine: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 230,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash1,
      failedOtpAttempts: 5, // Lockout reached
      deliveryOtpExpiresAt: new Date(Date.now() + 60000),
    });

    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${lockedOrder._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: testOtp1 }
    );
    assert.equal(res.statusCode, 429, 'Must reject locked order with 429');
    assert.match(res.data?.message, /Maximum delivery OTP verification attempts exceeded/i);
    console.log('✓ Correctly rejects delivery when OTP verification attempt limit (5/5) is exceeded');

    // 3f. Order not OUT_FOR_DELIVERY when OTP enabled -> 400
    const readyOrder = await Order.create({
      orderNumber: `BB-TEST-READY-${uniqueSuffix}`,
      user: customerUser._id,
      items: [{ product: dummyProductId, productName: 'Bento', quantity: 1, unitPrice: 200, subtotal: 200 }],
      deliveryAddress: { fullName: 'User', phone: '9999999999', addressLine: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 230,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash1,
    });

    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${readyOrder._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: testOtp1 }
    );
    assert.equal(res.statusCode, 400, 'Must reject DELIVERED from non-OUT_FOR_DELIVERY');
    console.log('✓ Correctly rejects DELIVERED when order is not in OUT_FOR_DELIVERY');

    // 3g. Valid OTP with authorized rider -> 200 DELIVERED
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order1._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: testOtp1 }
    );
    assert.equal(res.statusCode, 200, 'Must succeed with valid OTP');
    assert.equal(res.data?.data?.orderStatus, 'DELIVERED');
    assert.equal(res.data?.data?.deliveryOTP, undefined, 'Delivery OTP hash must be cleared');
    console.log('✓ Correctly marks DELIVERED and invalidates OTP when valid code supplied');

    // --- TEST SUITE: OTP REQUIRED = FALSE ---
    console.log('\n>>> 4. Testing Delivery Flow when DELIVERY_OTP_REQUIRED=false (OTP Verification Skipped)...');
    process.env.DELIVERY_OTP_REQUIRED = 'false';

    const testOtp2 = '789012';
    const otpHash2 = crypto.createHash('sha256').update(testOtp2).digest('hex');

    const order2 = await Order.create({
      orderNumber: `BB-TEST-NOOTP-${uniqueSuffix}`,
      user: customerUser._id,
      items: [
        {
          product: dummyProductId,
          productName: 'Veggie Deluxe Bento',
          quantity: 1,
          unitPrice: 249,
          subtotal: 249,
        },
      ],
      deliveryAddress: {
        fullName: 'Test Customer 2',
        phone: customerUser.phone,
        addressLine: '456 Test Lane',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      itemTotal: 249,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 279,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash2,
      deliveryOtpCode: testOtp2,
      deliveryOtpExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // 4a. Unauthorized partner still rejected -> 403
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order2._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider2Auth.csrfToken,
          Cookie: cookieHeader(rider2Auth.cookies),
        },
      },
      { status: 'DELIVERED' }
    );
    assert.equal(res.statusCode, 403, 'Must reject unauthorized partner even when OTP is disabled');
    console.log('✓ Unauthorized delivery partner rejected even when OTP is disabled (security preserved)');

    // 4b. Customer role cannot call delivery status -> 403
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order2._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': customerAuth.csrfToken,
          Cookie: cookieHeader(customerAuth.cookies),
        },
      },
      { status: 'DELIVERED' }
    );
    assert.equal(res.statusCode, 403, 'Customer role must be forbidden');
    console.log('✓ Customer accounts cannot bypass or call delivery completion');

    // 4c. Order not in OUT_FOR_DELIVERY status rejected -> 400
    const orderNotOut = await Order.create({
      orderNumber: `BB-TEST-WRONGSTATUS-${uniqueSuffix}`,
      user: customerUser._id,
      items: [{ product: dummyProductId, productName: 'Meal', quantity: 1, unitPrice: 200, subtotal: 200 }],
      deliveryAddress: { fullName: 'User', phone: '9999999999', addressLine: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 230,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'READY_FOR_PICKUP',
      assignedDeliveryPartner: partnerUser1._id,
    });
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${orderNotOut._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED' }
    );
    assert.equal(res.statusCode, 400, 'Order not OUT_FOR_DELIVERY must be rejected');
    console.log('✓ Status transition validation preserved (order must be OUT_FOR_DELIVERY)');

    // 4d. Authorized assigned partner completes WITHOUT OTP -> 200 DELIVERED
    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order2._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', note: 'Doorstep contactless delivery' }
    );
    assert.equal(res.statusCode, 200, 'Authorized partner completes delivery without OTP');
    assert.equal(res.data?.data?.orderStatus, 'DELIVERED');
    assert.equal(res.data?.data?.deliveryOTP, undefined, 'Delivery OTP fields cleared');
    console.log('✓ Authorized partner successfully marks DELIVERED without OTP when disabled');

    // 4e. COD cash collection still functions as expected
    res = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/operations/delivery/orders/${order2._id}/collect-cash`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { note: 'Cash collected at door' }
    );
    assert.equal(res.statusCode, 200, 'COD cash collection must succeed after delivery');
    console.log('✓ COD cash collection workflow functions seamlessly after delivery');

    // 4f. Test gracefully accepting delivery if an OTP is sent anyway when OTP is disabled
    const order3 = await Order.create({
      orderNumber: `BB-TEST-EXTRAOTP-${uniqueSuffix}`,
      user: customerUser._id,
      items: [{ product: dummyProductId, productName: 'Salmon Roll', quantity: 1, unitPrice: 350, subtotal: 350 }],
      deliveryAddress: { fullName: 'User', phone: '9999999999', addressLine: 'St', city: 'BLR', state: 'KA', pincode: '560038' },
      itemTotal: 350,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 380,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      assignedDeliveryPartner: partnerUser1._id,
      deliveryOTP: otpHash2,
    });

    res = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/operations/delivery/orders/${order3._id}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': rider1Auth.csrfToken,
          Cookie: cookieHeader(rider1Auth.cookies),
        },
      },
      { status: 'DELIVERED', otp: 'any_or_dummy_otp' }
    );
    assert.equal(res.statusCode, 200, 'Delivery succeeds even if redundant OTP is supplied when disabled');
    assert.equal(res.data?.data?.orderStatus, 'DELIVERED');
    console.log('✓ Gracefully handles redundant OTP if supplied while OTP verification is disabled');

    // Clean up created test entities
    await Order.deleteMany({
      _id: { $in: [order1._id, order2._id, orderNotOut._id, order3._id, expiredOrder._id, lockedOrder._id, readyOrder._id] },
    });
    await User.deleteMany({ _id: { $in: [customerUser._id, partnerUser1._id, partnerUser2._id] } });
    await DeliveryPartnerPresence.deleteMany({ user: { $in: [partnerUser1._id, partnerUser2._id] } });

    console.log('\n===============================================================');
    console.log('  ALL CONFIGURABLE DELIVERY OTP TESTS PASSED SUCCESSFULLY! ✓');
    console.log('===============================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    const r = getRedisClient();
    if (r && r.status === 'ready') {
      await r.quit();
    }
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
