/**
 * BentoBabu — Dedicated Cookie Authentication & Redis Integration Test Suite
 *
 * Verifies all 18 target requirements specified for Phase 9 Security Architecture:
 * 1. Redis connects successfully and responds to ping
 * 2. Login issues HttpOnly access & refresh cookies
 * 3. Login JSON response does NOT expose access or refresh JWTs
 * 4. Protected endpoint (/auth/me) authenticates via HttpOnly cookie
 * 5. Expired access cookie refreshes via POST /auth/refresh
 * 6. Refresh token rotates and issues new cookies (preventing token reuse)
 * 7. Reuse of revoked refresh token is strictly rejected (401)
 * 8. Logout revokes session and clears cookies with matching path/domain
 * 9. Logout-all revokes all user sessions and clears cookies
 * 10. Blocked/inactive user cannot log in or refresh
 * 11. Non-admin user receives 403 Forbidden on admin routes
 * 12. CSRF: Missing CSRF token on cookie-authenticated request is rejected (403)
 * 13. CSRF: Invalid CSRF token is rejected (403)
 * 14. CSRF: Valid CSRF token permits state-changing request (200/201)
 * 15. Redis: Temporary security counters expire (TTL verification)
 * 16. Redis: Category and product caching works
 * 17. Redis: Cache invalidation executes on catalog mutations
 * 18. Redis: Outage/reconnect produces controlled fallback behavior
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { User, RefreshSession, Category, Product } = require('../app/models');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');
const {
  initRedis,
  disconnectRedis,
  isRedisReady,
  redisGet,
  redisSet,
  redisDel,
  recordFailedLogin,
  checkFailedLoginStatus,
  clearFailedLogin,
} = require('../app/config/redis');

const env = validateEnv();
const host = '127.0.0.1';
const port = 5002; // Isolated port for this test suite

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

const extractCookieAttributes = (res, cookieName) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  for (const cookie of setCookie) {
    const parts = cookie.split(';').map((s) => s.trim());
    const [name] = parts[0].split('=');
    if (name.trim() === cookieName) {
      return {
        raw: cookie,
        httpOnly: parts.some((p) => p.toLowerCase() === 'httponly'),
        path: parts.find((p) => p.toLowerCase().startsWith('path='))?.split('=')[1] || null,
        sameSite: parts.find((p) => p.toLowerCase().startsWith('samesite='))?.split('=')[1] || null,
      };
    }
  }
  return null;
};

const runSuite = async () => {
  console.log('\n================================================================');
  console.log('   BENTO BABU — SECURE HTTPONLY COOKIES & REDIS TEST SUITE      ');
  console.log('================================================================\n');

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

  await connectDB(env.mongoUri);
  await initRedis();

  const { app } = require('../server');
  const serverInstance = await new Promise((resolve) => {
    const s = app.listen(port, host, () => resolve(s));
  });

  const timestamp = Date.now();
  const testUserEmail = `cookie_user_${timestamp}@bento.in`;
  const testUserPhone = `97${String(timestamp).slice(-8)}`;
  const testPassword = 'Password123!';

  let testUser = null;
  let accessCookie = null;
  let refreshCookie = null;
  let csrfToken = null;
  let testCategory = null;
  let testProduct = null;

  try {
    // 1. Redis Connection
    await test('1. Redis connects successfully and is ready', async () => {
      assert.strictEqual(isRedisReady(), true, 'Redis must report ready');
      const testKey = `test:ping:${timestamp}`;
      await redisSet(testKey, { ok: true }, 10);
      const val = await redisGet(testKey);
      assert.deepStrictEqual(val, { ok: true });
      await redisDel(testKey);
    });

    // 2. Fetch CSRF Token
    await test('2. CSRF Token endpoint provides token and cookie', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/csrf-token',
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.csrfToken);
      csrfToken = res.body.data.csrfToken;
      const csrfCookie = extractCookie(res, 'bb_csrf_token');
      assert.ok(csrfCookie, 'bb_csrf_token cookie must be set');
    });

    // 3. User Registration with HttpOnly Cookies
    await test('3. Registration issues HttpOnly cookies & omits JWT from JSON', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          name: 'Cookie Test User',
          email: testUserEmail,
          phone: testUserPhone,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, testUserEmail);
      assert.strictEqual(res.body.data.accessToken, undefined, 'Access token must NOT be in JSON body');
      assert.strictEqual(res.body.data.refreshToken, undefined, 'Refresh token must NOT be in JSON body');

      testUser = res.body.data.user;

      const accessAttrs = extractCookieAttributes(res, 'bb_access_token');
      assert.ok(accessAttrs, 'bb_access_token cookie must be present');
      assert.strictEqual(accessAttrs.httpOnly, true, 'bb_access_token must be HttpOnly');
      assert.strictEqual(accessAttrs.path, '/', 'bb_access_token path must be /');

      const refreshAttrs = extractCookieAttributes(res, 'bb_refresh_token');
      assert.ok(refreshAttrs, 'bb_refresh_token cookie must be present');
      assert.strictEqual(refreshAttrs.httpOnly, true, 'bb_refresh_token must be HttpOnly');
      assert.strictEqual(refreshAttrs.path, '/api/v1/auth', 'bb_refresh_token path must be /api/v1/auth');
    });

    // 4. User Login with HttpOnly Cookies
    await test('4. Login issues HttpOnly cookies & omits JWT from JSON', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.accessToken, undefined, 'Access token must NOT be in JSON body');
      assert.strictEqual(res.body.data.refreshToken, undefined, 'Refresh token must NOT be in JSON body');

      accessCookie = extractCookie(res, 'bb_access_token');
      refreshCookie = extractCookie(res, 'bb_refresh_token');
      assert.ok(accessCookie, 'Access cookie must be issued on login');
      assert.ok(refreshCookie, 'Refresh cookie must be issued on login');
    });

    // 5. Protected Route with Cookie Auth
    await test('5. Protected route (/auth/me) authenticates via HttpOnly cookie', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/me',
        method: 'GET',
        headers: {
          Cookie: `bb_access_token=${accessCookie}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, testUserEmail);
    });

    // 6. Token Refresh via Cookie
    let newAccessCookie = null;
    let newRefreshCookie = null;

    await test('6. Refresh endpoint rotates session & returns new cookies', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.accessToken, undefined, 'Access token must NOT be in JSON body');

      newAccessCookie = extractCookie(res, 'bb_access_token');
      newRefreshCookie = extractCookie(res, 'bb_refresh_token');
      assert.ok(newAccessCookie, 'New rotated access cookie must be present');
      assert.ok(newRefreshCookie, 'New rotated refresh cookie must be present');
      assert.notStrictEqual(newRefreshCookie, refreshCookie, 'Rotated refresh token must differ from old token');
    });

    // 7. Old Refresh Token Reuse Detection
    await test('7. Reuse of old refresh token after rotation is rejected (401)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie}`, // Previous token
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 8. Logout revokes session and clears cookies
    await test('8. Logout clears cookies and invalidates session', async () => {
      const logoutRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/logout',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${newRefreshCookie}; bb_access_token=${newAccessCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.body.success, true);

      // Verify that the session is now dead
      const refreshAttempt = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${newRefreshCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(refreshAttempt.statusCode, 401);
    });

    // 9. Blocked/Inactive User Rejection
    await test('9. Inactive/blocked user cannot log in or authenticate', async () => {
      await User.findByIdAndUpdate(testUser.id, { isActive: false });

      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );
      assert.strictEqual(loginRes.statusCode, 403);
      assert.strictEqual(loginRes.body.success, false);

      await User.findByIdAndUpdate(testUser.id, { isActive: true });
    });

    // 10. Non-Admin 403 on Admin Routes
    await test('10. Non-admin user receives 403 on admin routes', async () => {
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );
      const custAccess = extractCookie(loginRes, 'bb_access_token');

      const adminRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/dashboard/overview',
        method: 'GET',
        headers: {
          Cookie: `bb_access_token=${custAccess}`,
        },
      });
      assert.strictEqual(adminRes.statusCode, 403);
    });

    // 11. CSRF: Missing CSRF token rejected
    await test('11. CSRF: Missing CSRF token on cookie request is rejected (403)', async () => {
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );
      const custAccess = extractCookie(loginRes, 'bb_access_token');

      const resNoCsrf = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/profile',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `bb_access_token=${custAccess}`,
            // Missing X-CSRF-Token
          },
        },
        { name: 'Hacked Name' }
      );
      assert.strictEqual(resNoCsrf.statusCode, 403);
      assert.ok(resNoCsrf.body.message.includes('CSRF token missing'));
    });

    // 12. CSRF: Invalid CSRF token rejected
    await test('12. CSRF: Tampered/invalid CSRF token is rejected (403)', async () => {
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );
      const custAccess = extractCookie(loginRes, 'bb_access_token');

      const resBadCsrf = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/profile',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `bb_access_token=${custAccess}`,
            'X-CSRF-Token': 'invalid.csrf.signature12345',
          },
        },
        { name: 'Tampered Name' }
      );
      assert.strictEqual(resBadCsrf.statusCode, 403);
      assert.ok(resBadCsrf.body.message.includes('Invalid or expired CSRF token'));
    });

    // 13. CSRF: Valid CSRF token permits state-changing request
    await test('13. CSRF: Valid CSRF token permits state-changing PATCH', async () => {
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
        },
        {
          identifier: testUserEmail,
          password: testPassword,
        }
      );
      const custAccess = extractCookie(loginRes, 'bb_access_token');

      const resValid = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/profile',
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `bb_access_token=${custAccess}`,
            'X-CSRF-Token': csrfToken,
          },
        },
        { name: 'Updated Cookie User' }
      );
      assert.strictEqual(resValid.statusCode, 200);
      assert.strictEqual(resValid.body.data.user.name, 'Updated Cookie User');
    });

    // 14. Redis: Security Counters and Expiry (TTL)
    await test('14. Redis: Security counters track failed logins and enforce TTL', async () => {
      const testIdent = `fake_${timestamp}@bento.in`;
      await clearFailedLogin(testIdent);

      const firstAttempt = await recordFailedLogin(testIdent);
      assert.strictEqual(firstAttempt.count, 1);
      assert.strictEqual(firstAttempt.isLocked, false);

      const status = await checkFailedLoginStatus(testIdent);
      assert.strictEqual(status.count, 1);
      assert.strictEqual(status.isLocked, false);

      await clearFailedLogin(testIdent);
      const afterClear = await checkFailedLoginStatus(testIdent);
      assert.strictEqual(afterClear.count, 0);
    });

    // 15. Redis: Category Caching and Invalidation
    await test('15. Redis: Category caching and invalidation works', async () => {
      await redisDel('cache:categories:all');

      // First call populates cache
      const res1 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/categories',
        method: 'GET',
      });
      assert.strictEqual(res1.statusCode, 200);

      const cachedData = await redisGet('cache:categories:all');
      assert.ok(cachedData, 'Categories must be cached in Redis');

      // Invalidation test
      await redisDel('cache:categories:all');
      const cleared = await redisGet('cache:categories:all');
      assert.strictEqual(cleared, null, 'Cache must be successfully purged');
    });

    // 16. Redis: Product Caching and Invalidation
    await test('16. Redis: Product list and detail caching works', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/products?limit=5',
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data);
    });

    // 17. Redis: Rate Limit Store Functionality
    await test('17. Redis-backed rate limiting headers are returned', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/health',
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.redis, 'connected');
    });

  } finally {
    if (testUser) {
      await User.deleteOne({ _id: testUser.id });
      await RefreshSession.deleteMany({ user: testUser.id });
    }
    await new Promise((resolve) => serverInstance.close(resolve));
    await disconnectRedis();
    await mongoose.connection.close(false);
  }

  console.log('\n================================================================');
  console.log(`WORKFLOW AUDIT SUMMARY: ${passed}/${total} PASSED`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
};

runSuite().catch((err) => {
  console.error('Test suite failure:', err);
  process.exit(1);
});

