/**
 * BentoBabu — 13 Phase 6 End-to-End Verification Scenarios
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://127.0.0.1:5000/api/v1';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_jwt_refresh_key_change_in_production';

class BrowserClient {
  constructor() {
    this.cookies = new Map();
    this.csrfTokenCache = null;
    this.refreshPromise = null;
    this.refreshCallCount = 0;
    this.authFailureCalled = false;
  }

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
        await this.refreshTokens();

        if (isMutating) {
          const freshCsrf = await this.getCsrfToken();
          if (freshCsrf) {
            headers['X-CSRF-Token'] = freshCsrf;
          }
        }

        headers.Cookie = this.getCookieHeader();

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

async function run13Scenarios() {
  console.log('================================================================');
  console.log('  BENTOBABU PHASE 6: 13 VERIFICATION SCENARIOS                   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(num, name, fn) {
    try {
      await fn();
      console.log(`✅ [SCENARIO ${num} PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [SCENARIO ${num} FAIL] ${name}`);
      console.error('   ', err.message);
      failed++;
    }
  }

  const client = new BrowserClient();
  const unique = Date.now().toString().slice(-6);
  const newEmail = `reg_customer_${unique}@bentobabu.in`;
  const newPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const newPassword = 'CustomerPassword@123';

  // SCENARIO 1: Register a customer
  await test(1, 'Register a customer', async () => {
    const res = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: `Registration Customer ${unique}`,
        email: newEmail,
        phone: newPhone,
        password: newPassword,
      }),
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, newEmail);
    assert.strictEqual(body.data.user.role, 'CUSTOMER');
  });

  // SCENARIO 3: Log in with incorrect credentials and verify 401 error message
  await test(3, 'Log in with incorrect credentials returns HTTP 401 with informative error message', async () => {
    const wrongClient = new BrowserClient();
    const res = await wrongClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'IncorrectPassword!999',
      }),
    });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes('Invalid credentials'));
  });

  // SCENARIO 2: Log in with correct credentials
  const demoClient = new BrowserClient();
  let loginSetCookie = [];
  await test(2, 'Log in with correct credentials (customer@bentobabu.in / CustomerPassword@123)', async () => {
    const res = await demoClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'CustomerPassword@123',
      }),
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    loginSetCookie = res.headers.getSetCookie();
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, 'customer@bentobabu.in');
  });

  // SCENARIO 4: Confirm both HttpOnly cookies are issued
  await test(4, 'Confirm both HttpOnly cookies (bb_access_token, bb_refresh_token) are issued', async () => {
    assert.ok(demoClient.cookies.has('bb_access_token'), 'bb_access_token must be present in client cookie jar');
    assert.ok(demoClient.cookies.has('bb_refresh_token'), 'bb_refresh_token must be present in client cookie jar');
    
    // Check HttpOnly flag in Set-Cookie header
    const accessHeader = loginSetCookie.find((c) => c.startsWith('bb_access_token='));
    const refreshHeader = loginSetCookie.find((c) => c.startsWith('bb_refresh_token='));
    assert.ok(accessHeader, 'Set-Cookie for bb_access_token must exist');
    assert.ok(refreshHeader, 'Set-Cookie for bb_refresh_token must exist');
    assert.ok(accessHeader.toLowerCase().includes('httponly'), 'bb_access_token must have HttpOnly');
    assert.ok(refreshHeader.toLowerCase().includes('httponly'), 'bb_refresh_token must have HttpOnly');
  });

  // SCENARIO 5: Call /auth/me immediately after login
  await test(5, 'Call /auth/me immediately after login succeeds without refresh', async () => {
    const res = await demoClient.request('/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.user.email, 'customer@bentobabu.in');
    assert.strictEqual(demoClient.refreshCallCount, 0, 'No refresh should occur immediately after login');
  });

  // SCENARIO 6: Wait 35 seconds
  console.log('\n⏳ [SCENARIO 6] Waiting 35 seconds for 30s access token to expire...');
  await sleep(35000);
  console.log('⏰ 35 seconds elapsed. Access token is expired.\n');

  // SCENARIO 7: Call /auth/me again and verify silent refresh
  await test(7, 'Call /auth/me after access-token expiry and verify silent refresh succeeds', async () => {
    const refreshBefore = demoClient.refreshCallCount;
    const res = await demoClient.request('/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.user.email, 'customer@bentobabu.in');
    assert.ok(res._retried, 'Request must be retried transparently');
    assert.strictEqual(demoClient.refreshCallCount, refreshBefore + 1, 'Exactly one refresh must have run');
  });

  // Expire token again to test address creation after expiry
  console.log('\n⏳ Waiting 35 seconds to expire access token before Save Address test...');
  await sleep(35000);
  console.log('⏰ 35 seconds elapsed.\n');

  // SCENARIO 8: Save a new address after access-token expiry
  let createdAddressId = '';
  await test(8, 'Save a new address after access-token expiry: 401 triggers refresh, retries POST /addresses, succeeds with 201', async () => {
    const refreshBefore = demoClient.refreshCallCount;
    const res = await demoClient.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Phase6 Tester',
        phone: '9876543210',
        addressLine: 'Flat 402, Lotus Residency, MG Road',
        landmark: 'Near City Mall',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
        addressType: 'HOME',
        isDefault: true,
      }),
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    const addr = body.data?.address || body.data;
    assert.ok(addr && (addr.id || addr._id));
    createdAddressId = addr.id || addr._id;
    assert.ok(res._retried, 'Address save must be retried after refresh');
    assert.strictEqual(demoClient.refreshCallCount, refreshBefore + 1, 'Refresh must trigger');
  });

  // Expire token again to test fetching addresses after expiry
  console.log('\n⏳ Waiting 35 seconds to expire access token before Fetch Addresses test...');
  await sleep(35000);
  console.log('⏰ 35 seconds elapsed.\n');

  // SCENARIO 9: Fetch existing addresses after access-token expiry
  await test(9, 'Fetch existing addresses after access-token expiry: transparent refresh and 200 OK', async () => {
    const refreshBefore = demoClient.refreshCallCount;
    const res = await demoClient.request('/addresses');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data?.addresses || body.data));
    assert.ok(res._retried, 'Fetch addresses must be retried after refresh');
    assert.strictEqual(demoClient.refreshCallCount, refreshBefore + 1);
  });

  // Expire token again to test five concurrent requests
  console.log('\n⏳ Waiting 35 seconds before concurrent 5-request test...');
  await sleep(35000);
  console.log('⏰ 35 seconds elapsed.\n');

  // SCENARIO 10: Send five concurrent protected API requests after access-token expiry; verify only one refresh operation occurs
  await test(10, 'Five concurrent requests after expiry: only ONE refresh operation runs and all succeed', async () => {
    const refreshBefore = demoClient.refreshCallCount;
    const endpoints = [
      '/auth/me',
      '/addresses',
      `/addresses/${createdAddressId}`,
      '/auth/me',
      '/addresses',
    ];

    const responses = await Promise.all(endpoints.map((ep) => demoClient.request(ep)));
    for (let i = 0; i < responses.length; i++) {
      assert.strictEqual(responses[i].status, 200, `Request ${i} (${endpoints[i]}) failed with status ${responses[i].status}`);
    }

    const refreshAfter = demoClient.refreshCallCount;
    assert.strictEqual(refreshAfter - refreshBefore, 1, `Expected 1 refresh operation, got ${refreshAfter - refreshBefore}`);
  });

  // SCENARIO 11: Verify invalid refresh token results in proper logout
  await test(11, 'Verify invalid refresh token results in 401 and proper auth failure / logout notification', async () => {
    const invalidClient = new BrowserClient();
    invalidClient.cookies.set('bb_access_token', 'expired_or_invalid_access');
    invalidClient.cookies.set('bb_refresh_token', 'completely_invalid_garbage_token');

    const res = await invalidClient.request('/auth/me');
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    assert.strictEqual(invalidClient.authFailureCalled, true, 'authFailure callback must be triggered');
  });

  // SCENARIO 12: Verify logout clears both cookies
  await test(12, 'Verify logout clears both cookies (bb_access_token and bb_refresh_token)', async () => {
    const res = await demoClient.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(demoClient.cookies.has('bb_access_token'), false, 'bb_access_token must be cleared');
    assert.strictEqual(demoClient.cookies.has('bb_refresh_token'), false, 'bb_refresh_token must be cleared');
  });

  // SCENARIO 13: Verify CSRF protection still rejects invalid tokens
  await test(13, 'Verify CSRF protection still rejects invalid / missing tokens with HTTP 403', async () => {
    // Re-login to get cookies
    const testClient = new BrowserClient();
    await testClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'CustomerPassword@123',
      }),
    });

    const res = await fetch(`${BASE_URL}/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: testClient.getCookieHeader(),
        'X-CSRF-Token': 'invalid_tampered_csrf_token',
      },
      body: JSON.stringify({ fullName: 'Malicious Actor' }),
    });

    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes('CSRF'));
  });

  console.log('\n================================================================');
  console.log(`PHASE 6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run13Scenarios().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

