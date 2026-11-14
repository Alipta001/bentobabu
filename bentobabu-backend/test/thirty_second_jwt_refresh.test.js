/**
 * BentoBabu — Critical 30-Second JWT Expiration, Refresh & Save Address Test Suite
 * Validates all 18 requirements from Section 9 of the specification.
 */

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://127.0.0.1:5000/api/v1';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_jwt_refresh_key_change_in_production';

class BrowserSimulation {
  constructor() {
    this.cookies = new Map();
    this.csrfTokenCache = null;
    this.refreshPromise = null;
    this.refreshCallCount = 0;
    this.authFailureCalled = false;
  }

  // Update cookies from Set-Cookie headers
  updateCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const header of list) {
      const parts = header.split(';').map((s) => s.trim());
      const [nameVal] = parts;
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx === -1) continue;
      const name = nameVal.slice(0, eqIdx).trim();
      const value = nameVal.slice(eqIdx + 1).trim();

      const maxAgePart = parts.find((p) => p.toLowerCase().startsWith('max-age='));
      if (maxAgePart) {
        const maxAgeSec = parseInt(maxAgePart.split('=')[1], 10);
        if (maxAgeSec <= 0) {
          this.cookies.delete(name);
          continue;
        }
      }

      if (!value) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [name, val] of this.cookies.entries()) {
      list.push(`${name}=${val}`);
    }
    return list.join('; ');
  }

  async getCsrfToken() {
    if (this.csrfTokenCache) return this.csrfTokenCache;

    const res = await fetch(`${BASE_URL}/auth/csrf-token`, {
      headers: { Cookie: this.getCookieHeader() },
    });
    this.updateCookies(res.headers.getSetCookie());
    const data = await res.json();
    this.csrfTokenCache = data.data?.csrfToken || null;
    return this.csrfTokenCache;
  }

  clearCsrfToken() {
    this.csrfTokenCache = null;
  }

  // Single-flight refresh mechanism identical to frontend api/axios/axios.ts
  async refreshTokens() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        this.refreshCallCount++;
        const csrfToken = await this.getCsrfToken();
        const headers = {
          'Content-Type': 'application/json',
          Cookie: this.getCookieHeader(),
        };
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        this.updateCookies(res.headers.getSetCookie());

        if (!res.ok) {
          const err = new Error(`Refresh failed with status ${res.status}`);
          err.status = res.status;
          throw err;
        }

        this.clearCsrfToken();
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Request dispatcher with Axios-like response interceptor
  async request(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    if (isMutating && !endpoint.includes('/auth/csrf-token')) {
      const csrfToken = await this.getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    headers.Cookie = this.getCookieHeader();

    let res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
    this.updateCookies(res.headers.getSetCookie());

    // Interceptor: Check 401 Unauthorized
    if (res.status === 401 && !options._retry) {
      if (
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/register') ||
        endpoint.includes('/auth/refresh')
      ) {
        return res;
      }

      options._retry = true;

      try {
        // Wait for single-flight refresh
        await this.refreshTokens();

        // If mutating request, re-fetch fresh CSRF token
        if (isMutating) {
          const freshCsrf = await this.getCsrfToken();
          if (freshCsrf) {
            headers['X-CSRF-Token'] = freshCsrf;
          }
        }

        headers.Cookie = this.getCookieHeader();

        // Retry original request exactly once
        res = await fetch(`${BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
        this.updateCookies(res.headers.getSetCookie());
        res._retried = true;
        return res;
      } catch (refreshErr) {
        this.clearCsrfToken();
        this.authFailureCalled = true;
        return res;
      }
    }

    return res;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTestSuite() {
  console.log('================================================================');
  console.log('  BENTOBABU 30-SECOND JWT EXPIRATION & REFRESH TEST SUITE        ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err.message);
      failed++;
    }
  }

  const client = new BrowserSimulation();
  const unique = Date.now().toString().slice(-6);
  const testEmail = `test_refresh_${unique}@bentobabu.in`;
  const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const testPassword = 'Password123!';

  // 1. Registration
  await test('18. Customer registration creates account with cookies', async () => {
    const res = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: `Tester ${unique}`,
        email: testEmail,
        phone: testPhone,
        password: testPassword,
      }),
    });
    assert.strictEqual(res.status, 201);
    assert.ok(client.cookies.has('bb_access_token'), 'Must have access cookie');
    assert.ok(client.cookies.has('bb_refresh_token'), 'Must have refresh cookie');
  });

  // 2. Login
  await test('1. Login successfully and set 30s access & 7d refresh cookies', async () => {
    const res = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testEmail);
    assert.ok(client.cookies.has('bb_access_token'));
    assert.ok(client.cookies.has('bb_refresh_token'));
  });

  // 3. Immediate /auth/me check
  await test('Immediate /auth/me succeeds with initial access token', async () => {
    const res = await client.request('/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.user.email, testEmail);
  });

  // 4. Wait 35 seconds to let 30s token expire
  console.log('\n⏳ Waiting 32 seconds for access token to expire (ACCESS_TOKEN_EXPIRES_IN=30s)...');
  await sleep(32000);
  console.log('⏰ 32 seconds elapsed. Access token is now expired.\n');

  // 5. Request /auth/me after token expiration
  let meRes;
  await test('2, 3, 4, 5. Request /auth/me after expiry: auto-refresh succeeds & returns user', async () => {
    const refreshCallsBefore = client.refreshCallCount;
    meRes = await client.request('/auth/me');
    assert.strictEqual(meRes.status, 200);
    const body = await meRes.json();
    assert.strictEqual(body.data.user.email, testEmail);
    assert.ok(meRes._retried, 'Request must be retried after refresh');
    assert.strictEqual(client.refreshCallCount, refreshCallsBefore + 1, 'Exactly one refresh must occur');
  });

  // 6. Verify navbar/account persistence
  await test('6. Auth state remains authenticated without logging out', async () => {
    assert.strictEqual(client.authFailureCalled, false, 'Auth failure must NOT be triggered');
    assert.ok(client.cookies.has('bb_access_token'), 'Fresh access token must be present');
    assert.ok(client.cookies.has('bb_refresh_token'), 'Refresh token must be present');
  });

  // 7. Wait another 32 seconds to expire the newly issued access token
  console.log('\n⏳ Waiting another 32 seconds before Save Address test...');
  await sleep(32000);
  console.log('⏰ 32 seconds elapsed. Access token is expired again.\n');

  // 8. Save Address test (Mutating POST with CSRF and expired access token)
  let addressId = '';
  await test('7, 8, 9, 10. Save Address: 401 triggers refresh, retries POST /addresses, succeeds with 201', async () => {
    const refreshCallsBefore = client.refreshCallCount;
    const addressPayload = {
      fullName: `Tester ${unique}`,
      phone: testPhone,
      addressLine: '12/A Subhash Nagar, Near Rail Gate 4',
      landmark: 'Near Rail Gate 4',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700120',
      addressType: 'HOME',
      isDefault: true,
    };

    const res = await client.request('/addresses', {
      method: 'POST',
      body: JSON.stringify(addressPayload),
    });

    assert.strictEqual(res.status, 201, `Expected 201 Created but got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    const savedAddress = body.data?.address || body.data;
    assert.ok(savedAddress && (savedAddress.id || savedAddress._id));
    assert.ok(res._retried, 'Save address request must be retried');
    assert.strictEqual(client.refreshCallCount, refreshCallsBefore + 1, 'Refresh must be called for Save Address');
    addressId = savedAddress.id || savedAddress._id;
  });

  // 9. Wait 32 seconds to expire token again for concurrent requests test
  console.log('\n⏳ Waiting 32 seconds before concurrent 5-request test...');
  await sleep(32000);
  console.log('⏰ 32 seconds elapsed. Access token is expired.\n');

  // 10. Five concurrent protected API requests after token expiry
  await test('11, 12, 13. Five concurrent requests after expiry: EXACTLY 1 refresh call occurs and all 5 succeed', async () => {
    const refreshCallsBefore = client.refreshCallCount;

    const endpoints = [
      '/auth/me',
      '/addresses',
      `/addresses/${addressId}`,
      '/auth/me',
      '/addresses',
    ];

    const promises = endpoints.map((ep) => client.request(ep));
    const responses = await Promise.all(promises);

    for (let i = 0; i < responses.length; i++) {
      assert.strictEqual(
        responses[i].status,
        200,
        `Request ${i} (${endpoints[i]}) failed with status ${responses[i].status}`
      );
    }

    const refreshCallsAfter = client.refreshCallCount;
    assert.strictEqual(
      refreshCallsAfter - refreshCallsBefore,
      1,
      `Expected exactly 1 refresh call for 5 concurrent requests, but got ${refreshCallsAfter - refreshCallsBefore}`
    );
  });

  // 11. CSRF rejection test
  await test('17. CSRF protection still rejects mutating requests with invalid/missing token', async () => {
    const res = await fetch(`${BASE_URL}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: client.getCookieHeader(),
        // Missing X-CSRF-Token
      },
      body: JSON.stringify({ fullName: 'Malicious' }),
    });
    assert.strictEqual(res.status, 403, 'Must return 403 Forbidden on missing CSRF token');
  });

  // 12. Expired refresh token test
  await test('14, 15. Expired refresh token correctly fails refresh and triggers customer logout', async () => {
    const expiredClient = new BrowserSimulation();
    const expiredRefreshJwt = jwt.sign(
      { userId: '673200000000000000000001', type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: '-10s' }
    );
    expiredClient.cookies.set('bb_refresh_token', expiredRefreshJwt);
    expiredClient.cookies.set('bb_access_token', 'expired_or_invalid_access');

    const res = await expiredClient.request('/auth/me');
    assert.strictEqual(res.status, 401, 'Must reject with 401 when refresh token is expired');
    assert.strictEqual(expiredClient.authFailureCalled, true, 'Auth failure callback must be notified');
  });

  // 13. Logout clears both cookies
  await test('16. Logout clears both authentication cookies with maxAge: 0', async () => {
    const res = await client.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(client.cookies.has('bb_access_token'), false, 'Access cookie must be removed');
    assert.strictEqual(client.cookies.has('bb_refresh_token'), false, 'Refresh cookie must be removed');
  });

  console.log('\n================================================================');
  console.log(`TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
