const http = require('http');
const assert = require('assert');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { app } = require('../server');
const connectDB = require('../app/config/db');
const { connectRedis } = require('../app/config/redis');
const { env } = require('../app/config/env');
const { User, SystemSetting } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.address().port,
        ...options,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (e) {
            parsed = data;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
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

function parseCookies(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return {};
  const jar = {};
  setCookie.forEach((str) => {
    const [pair] = str.split(';');
    const [name, val] = pair.split('=');
    jar[name.trim()] = val ? val.trim() : '';
  });
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function run() {
  console.log('--- Starting Central Kitchen Location Test Suite ---');
  await connectDB(process.env.MONGODB_URI);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Setup Admin Account
    const adminEmail = `admin_kitchen_${Date.now()}@bento.in`;
    const adminUser = await User.create({
      name: 'Kitchen Admin',
      email: adminEmail,
      phone: `987${Date.now().toString().slice(-7)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
    });

    const adminToken = generateAccessToken(adminUser);
    const adminCookieJar = {
      bb_access_token: adminToken,
    };

    // Fetch CSRF token for admin mutating requests
    const csrfRes = await makeRequest(server, {
      path: '/api/v1/auth/csrf-token',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminCookieJar) },
    });
    const parsedCsrfCookies = parseCookies(csrfRes);
    const adminCsrfToken = csrfRes.body?.data?.csrfToken;
    Object.assign(adminCookieJar, parsedCsrfCookies);

    // 2. Verify GET /api/v1/delivery/config returns verified kitchen location
    const deliveryConfigRes = await makeRequest(server, {
      path: '/api/v1/delivery/config',
      method: 'GET',
    });
    assert.equal(deliveryConfigRes.statusCode, 200);
    const kitchenData = deliveryConfigRes.body?.data?.centralKitchen;
    assert.ok(kitchenData, 'centralKitchen must exist in /delivery/config');
    assert.equal(kitchenData.name, 'BentoBabu Central Kitchen');
    assert.equal(kitchenData.landmark, 'Apollo Pharmacy / Apollo 24|7');
    assert.equal(kitchenData.pincode, '700122');
    assert.equal(kitchenData.latitude, 22.7666909);
    assert.equal(kitchenData.longitude, 88.3788318);
    assert.ok(kitchenData.address.includes('Chandanpukur'));
    assert.ok(kitchenData.address.includes('Barrackpore'));
    assert.ok(kitchenData.googleMapsDirectionsUrl.includes('22.7666909%2C88.3788318'));
    console.log('✅ [PASS] 1. GET /api/v1/delivery/config returns verified Barrackpore kitchen coordinates');

    // 3. Verify GET /api/v1/admin/delivery-operations/overview returns centralKitchen
    const overviewRes = await makeRequest(server, {
      path: '/api/v1/admin/delivery-operations/overview',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminCookieJar) },
    });
    assert.equal(overviewRes.statusCode, 200);
    const overviewKitchen = overviewRes.body?.data?.centralKitchen;
    assert.ok(overviewKitchen, 'centralKitchen must exist in delivery operations overview');
    assert.equal(overviewKitchen.latitude, 22.7666909);
    assert.equal(overviewKitchen.longitude, 88.3788318);
    assert.equal(overviewKitchen.name, 'BentoBabu Central Kitchen');
    console.log('✅ [PASS] 2. GET /api/v1/admin/delivery-operations/overview returns centralKitchen');

    // 4. Verify Admin Settings GET /api/v1/admin/settings
    const settingsGetRes = await makeRequest(server, {
      path: '/api/v1/admin/settings',
      method: 'GET',
      headers: { Cookie: cookieHeader(adminCookieJar) },
    });
    assert.equal(settingsGetRes.statusCode, 200);
    const settings = settingsGetRes.body?.data?.settings;
    assert.equal(settings.KITCHEN_NAME, 'BentoBabu Central Kitchen');
    assert.equal(settings.KITCHEN_LANDMARK, 'Apollo Pharmacy / Apollo 24|7');
    assert.equal(settings.KITCHEN_PINCODE, '700122');
    assert.equal(settings.KITCHEN_LATITUDE, 22.7666909);
    assert.equal(settings.KITCHEN_LONGITUDE, 88.3788318);
    console.log('✅ [PASS] 3. GET /api/v1/admin/settings returns central kitchen keys');

    // 5. Verify PUT /api/v1/admin/settings validation
    // 5a. Out-of-bounds latitude rejected
    const badLatRes = await makeRequest(
      server,
      {
        path: '/api/v1/admin/settings',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrfToken,
          Cookie: cookieHeader(adminCookieJar),
        },
      },
      { settings: { KITCHEN_LATITUDE: 105.0 } }
    );
    assert.equal(badLatRes.statusCode, 400);
    assert.ok(badLatRes.body.message.includes('between -90 and 90'));
    console.log('✅ [PASS] 4. Invalid latitude rejected by PUT /api/v1/admin/settings');

    // 5b. Out-of-bounds longitude rejected
    const badLngRes = await makeRequest(
      server,
      {
        path: '/api/v1/admin/settings',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrfToken,
          Cookie: cookieHeader(adminCookieJar),
        },
      },
      { settings: { KITCHEN_LONGITUDE: -200.0 } }
    );
    assert.equal(badLngRes.statusCode, 400);
    assert.ok(badLngRes.body.message.includes('between -180 and 180'));
    console.log('✅ [PASS] 5. Invalid longitude rejected by PUT /api/v1/admin/settings');

    // 5c. Invalid PIN code rejected
    const badPinRes = await makeRequest(
      server,
      {
        path: '/api/v1/admin/settings',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': adminCsrfToken,
          Cookie: cookieHeader(adminCookieJar),
        },
      },
      { settings: { KITCHEN_PINCODE: '123' } }
    );
    assert.equal(badPinRes.statusCode, 400);
    assert.ok(badPinRes.body.message.includes('6-digit Indian PIN code'));
    console.log('✅ [PASS] 6. Invalid PIN code rejected by PUT /api/v1/admin/settings');

    // 6. Cleanup
    await User.deleteMany({ _id: adminUser._id });

    console.log('\n🎉 ALL 6 Central Kitchen tests passed successfully!');
  } finally {
    server.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
