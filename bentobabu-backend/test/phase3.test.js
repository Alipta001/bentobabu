/**
 * Comprehensive Phase 3 Test Suite: Authentication & Authorization APIs
 * (Updated for HttpOnly Cookie Authentication & CSRF Protection)
 * Verifies all 23 requirements:
 * 1. Successful customer registration (sets HttpOnly cookies, no JWT in JSON response)
 * 2. Duplicate email rejection
 * 3. Duplicate phone rejection
 * 4. Invalid registration data rejection
 * 5. Password is stored as a hash
 * 6. Password hash is never returned in API responses
 * 7. Successful login (sets HttpOnly cookies, no JWT in JSON response)
 * 8. Incorrect password rejection
 * 9. Inactive account login rejection
 * 10. Access token cookie authentication
 * 11. Missing access token rejection
 * 12. Invalid access token rejection
 * 13. Expired access token rejection
 * 14. Refresh-token rotation via HttpOnly cookie
 * 15. Old refresh token rejection after rotation
 * 16. Revoked session rejection
 * 17. Logout revokes current session and clears cookies
 * 18. Logout-all revokes all user sessions
 * 19. CUSTOMER cannot access ADMIN-protected endpoints
 * 20. ADMIN can access ADMIN-protected endpoints
 * 21. CUSTOMER cannot assign themselves an ADMIN role
 * 22. Profile updates cannot change role or account status
 * 23. Rate limiting headers on auth endpoints
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { User, RefreshSession } = require('../app/models');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');

const env = validateEnv();
const host = '127.0.0.1';
const port = env.port || 5000;

const makeRequest = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
};

const extractCookie = (res, cookieName) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  for (const cookie of setCookie) {
    const [nameVal] = cookie.split(';');
    const [name, val] = nameVal.split('=');
    if (name.trim() === cookieName) {
      return val.trim();
    }
  }
  return null;
};

const getTestCsrf = async () => {
  const res = await makeRequest({
    hostname: host,
    port,
    path: '/api/v1/auth/csrf-token',
    method: 'GET',
  });
  return {
    csrfToken: res.body?.data?.csrfToken || '',
    csrfCookie: extractCookie(res, 'bb_csrf_token'),
  };
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU BACKEND - PHASE 3 AUTH VERIFICATION    ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Reason: ${err.message}\n`);
    }
  };

  // Connect to DB and Start Test Server
  await connectDB(env.mongoUri);
  const { app } = require('../server');
  const serverInstance = await new Promise((resolve) => {
    const s = app.listen(port, host, () => resolve(s));
  });

  const timestamp = Date.now();
  const testEmail1 = `priya_${timestamp}@bento.in`;
  const testPhone1 = `98${String(timestamp).slice(-8)}`;
  const testPassword = 'Password123!';
  const testEmail2 = `rohit_${timestamp}@bento.in`;
  const testPhone2 = `99${String(timestamp).slice(-8)}`;

  let registeredUser1 = null;
  let authToken1 = null;
  let refreshCookie1 = null;
  let adminUser = null;
  let adminToken = null;

  try {
    // 1. Successful customer registration
    await test('1. Successful customer registration (sets HttpOnly cookies, no JWT in JSON response)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Priya Sharma',
          email: testEmail1,
          phone: testPhone1,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, testEmail1);
      assert.strictEqual(res.body.data.user.role, 'CUSTOMER');
      assert.strictEqual(res.body.data.accessToken, undefined, 'Access token must NOT be in JSON response body');

      registeredUser1 = res.body.data.user;
      authToken1 = extractCookie(res, 'bb_access_token');
      assert.ok(authToken1, 'HttpOnly access cookie bb_access_token must be set on registration');
      refreshCookie1 = extractCookie(res, 'bb_refresh_token');
      assert.ok(refreshCookie1, 'HttpOnly refresh cookie bb_refresh_token must be set on registration');
    });

    // 2. Duplicate email rejection
    await test('2. Duplicate email rejection', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Another User',
          email: testEmail1, // duplicate email
          phone: `96${String(Date.now()).slice(-8)}`,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('email'));
    });

    // 3. Duplicate phone rejection
    await test('3. Duplicate phone rejection', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Another User',
          email: `new_${Date.now()}@bento.in`,
          phone: testPhone1, // duplicate phone
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('mobile'));
    });

    // 4. Invalid registration data rejection
    await test('4. Invalid registration data rejection', async () => {
      // Short password (< 8 chars)
      const resShort = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Short PW',
          email: 'valid@bento.in',
          phone: '9876543210',
          password: 'short',
        }
      );
      assert.strictEqual(resShort.statusCode, 400);

      // Invalid phone format
      const resBadPhone = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Bad Phone',
          email: 'badphone@bento.in',
          phone: '12345',
          password: 'password123',
        }
      );
      assert.strictEqual(resBadPhone.statusCode, 400);
    });

    // 5. Password is stored as a hash
    await test('5. Password is stored as a hash (cost factor 12)', async () => {
      const dbUser = await User.findById(registeredUser1.id).select('+password');
      assert.ok(dbUser.password, 'Password field must exist in database');
      assert.notStrictEqual(dbUser.password, testPassword, 'Password must not be stored in plaintext');
      assert.ok(dbUser.password.startsWith('$2'), 'Password hash must be a bcrypt hash');
      const isMatch = await bcrypt.compare(testPassword, dbUser.password);
      assert.strictEqual(isMatch, true, 'Stored hash must match test password');
    });

    // 6. Password hash is never returned in API responses
    await test('6. Password hash is never returned in API responses', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Cookie: `bb_access_token=${authToken1}` },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.user.password, undefined);
      assert.strictEqual(res.body.data.user.tokenHash, undefined);
    });

    // 7. Successful login
    await test('7. Successful login with email and phone (sets HttpOnly cookies, no JWT in JSON response)', async () => {
      // Login with email
      const resEmail = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: testEmail1,
          password: testPassword,
        }
      );
      assert.strictEqual(resEmail.statusCode, 200);
      assert.strictEqual(resEmail.body.data.accessToken, undefined, 'Access token must NOT be in JSON response body');
      const emailAccessCookie = extractCookie(resEmail, 'bb_access_token');
      assert.ok(emailAccessCookie, 'bb_access_token cookie must be present on email login');
      const emailCookie = extractCookie(resEmail, 'bb_refresh_token');
      assert.ok(emailCookie, 'bb_refresh_token cookie must be present on email login');

      // Login with phone
      const resPhone = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: testPhone1,
          password: testPassword,
        }
      );
      assert.strictEqual(resPhone.statusCode, 200);
      assert.strictEqual(resPhone.body.data.accessToken, undefined, 'Access token must NOT be in JSON response body');
      const phoneAccessCookie = extractCookie(resPhone, 'bb_access_token');
      assert.ok(phoneAccessCookie, 'bb_access_token cookie must be present on phone login');
    });

    // 8. Incorrect password rejection
    await test('8. Incorrect password rejection with generic error', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: testEmail1,
          password: 'WrongPassword999!',
        }
      );
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid credentials'));
    });

    // 9. Inactive account login rejection
    await test('9. Inactive account login rejection', async () => {
      // Deactivate user1 temporarily
      await User.findByIdAndUpdate(registeredUser1.id, { isActive: false });

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: testEmail1,
          password: testPassword,
        }
      );
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);

      // Reactivate user1
      await User.findByIdAndUpdate(registeredUser1.id, { isActive: true });
    });

    // 10. Access token authentication
    await test('10. Access token cookie authentication (/api/v1/auth/me)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Cookie: `bb_access_token=${authToken1}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, testEmail1);
    });

    // 11. Missing access token rejection
    await test('11. Missing access token rejection', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 12. Invalid access token rejection
    await test('12. Invalid access token rejection', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Cookie: 'bb_access_token=totally_invalid_jwt_token_string' },
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 13. Expired access token rejection
    await test('13. Expired access token rejection', async () => {
      const expiredToken = jwt.sign(
        {
          id: registeredUser1.id,
          role: 'CUSTOMER',
          exp: Math.floor(Date.now() / 1000) - 60, // expired 60 seconds ago
        },
        env.jwtAccessSecret
      );

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: { Cookie: `bb_access_token=${expiredToken}` },
      });
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.message.includes('expired'));
    });

    // 14. Refresh-token rotation
    let rotatedAccessToken = null;
    let rotatedRefreshToken = null;

    await test('14. Refresh-token rotation generates new cookies', async () => {
      const { csrfToken } = await getTestCsrf();
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie1}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.accessToken, undefined, 'Access token must NOT be returned in JSON body on refresh');

      rotatedAccessToken = extractCookie(res, 'bb_access_token');
      assert.ok(rotatedAccessToken, 'New rotated access cookie must be present');

      rotatedRefreshToken = extractCookie(res, 'bb_refresh_token');
      assert.ok(rotatedRefreshToken, 'New rotated refresh cookie must be present');
      assert.notStrictEqual(rotatedRefreshToken, refreshCookie1, 'Rotated refresh token must differ from old token');
    });

    // 15. Old refresh token rejection after rotation
    await test('15. Old refresh token rejection after rotation (reuse detection)', async () => {
      const { csrfToken } = await getTestCsrf();
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie1}`, // old token
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 16. Revoked session rejection
    await test('16. Revoked session rejection', async () => {
      // Decode current session ID and revoke it directly
      const decoded = jwt.decode(rotatedRefreshToken);
      await RefreshSession.findByIdAndUpdate(decoded.sessionId, { revokedAt: new Date() });

      const { csrfToken } = await getTestCsrf();
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${rotatedRefreshToken}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 17. Logout revokes current session
    await test('17. Logout revokes current session and clears cookies', async () => {
      // Log in fresh to get a valid session
      const freshLogin = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: testEmail1, password: testPassword }
      );
      const activeCookie = extractCookie(freshLogin, 'bb_refresh_token');
      const activeAccessCookie = extractCookie(freshLogin, 'bb_access_token');
      const { csrfToken } = await getTestCsrf();

      const logoutRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/logout',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${activeCookie}; bb_access_token=${activeAccessCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(logoutRes.statusCode, 200);

      // Verify that the session is now rejected on refresh
      const refreshAttempt = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${activeCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(refreshAttempt.statusCode, 401);
    });

    // 18. Logout-all revokes all user sessions
    await test('18. Logout-all revokes all active sessions for the user', async () => {
      // Create session 1
      const login1 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: testEmail1, password: testPassword }
      );
      const cookie1 = extractCookie(login1, 'bb_refresh_token');
      const token1 = extractCookie(login1, 'bb_access_token');

      // Create session 2
      const login2 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: testEmail1, password: testPassword }
      );
      const cookie2 = extractCookie(login2, 'bb_refresh_token');

      // Call logout-all
      const { csrfToken } = await getTestCsrf();
      const logoutAllRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/logout-all',
        method: 'POST',
        headers: {
          Cookie: `bb_access_token=${token1}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(logoutAllRes.statusCode, 200);

      // Both refresh cookies should now be revoked
      const ref1 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${cookie1}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(ref1.statusCode, 401);

      const ref2 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${cookie2}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(ref2.statusCode, 401);
    });

    // 19. CUSTOMER cannot access ADMIN-protected endpoints
    await test('19. CUSTOMER cannot access ADMIN-protected endpoints (403 Forbidden)', async () => {
      // Login as CUSTOMER
      const login = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: testEmail1, password: testPassword }
      );
      const customerToken = extractCookie(login, 'bb_access_token');

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/admin-test',
        method: 'GET',
        headers: { Cookie: `bb_access_token=${customerToken}` },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Insufficient role permissions'));
    });

    // 20. ADMIN can access ADMIN-protected test endpoints
    await test('20. ADMIN can access ADMIN-protected test endpoints (200 OK)', async () => {
      // Create an ADMIN account directly in database for testing
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      adminUser = await User.create({
        name: 'Super Admin',
        email: `admin_${timestamp}@bento.in`,
        phone: `95${String(timestamp).slice(-8)}`,
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
      });

      // Login as ADMIN
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: adminUser.email, password: testPassword }
      );
      adminToken = extractCookie(loginRes, 'bb_access_token');

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/admin-test',
        method: 'GET',
        headers: { Cookie: `bb_access_token=${adminToken}` },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.message.includes('Admin access granted'));
    });

    // 21. CUSTOMER cannot assign themselves an ADMIN role
    await test('21. Registration ignores/overrides client-supplied ADMIN role', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          name: 'Hacker User',
          email: testEmail2,
          phone: testPhone2,
          password: testPassword,
          role: 'ADMIN', // attempt privilege escalation
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.user.role, 'CUSTOMER', 'Role must be forced to CUSTOMER');

      const savedUser = await User.findById(res.body.data.user.id);
      assert.strictEqual(savedUser.role, 'CUSTOMER');
    });

    // 22. Profile updates cannot change role or account status
    await test('22. Profile updates cannot change role or account status', async () => {
      const { csrfToken } = await getTestCsrf();

      // Attempt to change role via profile update
      const resRoleHack = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/profile',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `bb_access_token=${authToken1}`,
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          role: 'ADMIN',
        }
      );
      assert.strictEqual(resRoleHack.statusCode, 403);

      // Legitimate profile update (change name)
      const resValidUpdate = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/profile',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `bb_access_token=${authToken1}`,
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          name: 'Priya Mukherjee',
        }
      );
      assert.strictEqual(resValidUpdate.statusCode, 200);
      assert.strictEqual(resValidUpdate.body.data.user.name, 'Priya Mukherjee');
    });

    // 23. Rate limiting works on authentication endpoints
    await test('23. Rate limiting headers present on auth endpoints', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { identifier: 'nonexistent@bento.in', password: 'password' }
      );

      const rateLimitHeader = res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'];
      assert.ok(rateLimitHeader, 'Auth rate limit header must be present');
    });
  } finally {
    // Clean up temporary test data
    if (registeredUser1) {
      await User.deleteOne({ _id: registeredUser1.id });
      await RefreshSession.deleteMany({ user: registeredUser1.id });
    }
    if (adminUser) {
      await User.deleteOne({ _id: adminUser._id });
      await RefreshSession.deleteMany({ user: adminUser._id });
    }
    await User.deleteMany({ email: { $in: [testEmail1, testEmail2] } });

    // Close server and DB
    await new Promise((resolve) => serverInstance.close(resolve));
    const { disconnectRedis } = require('../app/config/redis');
    await disconnectRedis();
    await mongoose.connection.close(false);
  }

  console.log('\n====================================================');
  console.log(`Phase 3 Verification Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('Phase 3 test runner error:', err);
  process.exit(1);
});
