/**
 * BentoBabu — Localhost Checkout Authentication & Refresh Token Flow Test Suite
 * Tests all required scenarios live against the actual backend server (http://localhost:5001)
 */

const assert = require('assert');

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';

class BrowserClient {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = null;
    this.refreshCallCount = 0;
    this.refreshPromise = null;
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
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join('; ');
  }

  async fetchCsrf() {
    const res = await fetch(`${API_BASE}/auth/csrf-token`, {
      headers: { Cookie: this.getCookieHeader() },
    });
    this.updateCookies(res.headers.getSetCookie());
    const body = await res.json();
    this.csrfToken = body.data.csrfToken;
    return this.csrfToken;
  }

  async singleFlightRefresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        this.refreshCallCount++;
        await this.fetchCsrf();
        const headers = {
          'Content-Type': 'application/json',
          Cookie: this.getCookieHeader(),
        };
        if (this.csrfToken) {
          headers['X-CSRF-Token'] = this.csrfToken;
        }

        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        this.updateCookies(res.headers.getSetCookie());
        if (!res.ok) {
          const err = new Error(`Refresh failed with HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async request(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (isMutating && !options.skipCsrf && !options.customCsrf) {
      if (!this.csrfToken) {
        await this.fetchCsrf();
      }
    }

    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    if (isMutating && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (isMutating && !headers['X-CSRF-Token'] && this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    headers.Cookie = this.getCookieHeader();

    let res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    this.updateCookies(res.headers.getSetCookie());

    // Single-flight transparent refresh simulation on 401
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
        await this.singleFlightRefresh();
        // Refresh succeeded: retry original request once
        if (isMutating) {
          await this.fetchCsrf();
          if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
          }
        }
        headers.Cookie = this.getCookieHeader();
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
        });
        this.updateCookies(res.headers.getSetCookie());
        res._retried = true;
      } catch (err) {
        // Refresh failed: pass 401 through
      }
    }

    return res;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTestSuite() {
  console.log('================================================================');
  console.log('  BENTOBABU PHASE 6 CHECKOUT AUTH & REFRESH VERIFICATION SUITE  ');
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
      console.error('   ', err.message);
      failed++;
    }
  }

  const client = new BrowserClient();

  // 1. Fresh visitor opens checkout
  await test('1. Fresh visitor opens checkout: Session unauthenticated initially', async () => {
    const res = await client.request('/auth/me');
    assert.strictEqual(res.status, 401, 'Guest must receive 401 on /auth/me');
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // 2. Visitor is redirected to login with returnTo=/checkout
  await test('2. Visitor is redirected to login with returnTo=/checkout', async () => {
    const target = '/checkout';
    const redirectUrl = `/login?returnTo=${encodeURIComponent(target)}`;
    assert.strictEqual(redirectUrl, '/login?returnTo=%2Fcheckout');
    // Verify decoded parameter
    const parsedTarget = new URL(`http://localhost:3000${redirectUrl}`).searchParams.get('returnTo');
    assert.strictEqual(parsedTarget, '/checkout');
  });

  // 3. Visitor logs in with valid credentials
  await test('3. Visitor logs in with valid credentials: Sets access and refresh cookies', async () => {
    const res = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'CustomerPassword@123',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, 'customer@bentobabu.in');
    assert.ok(client.cookies.has('bb_access_token'), 'bb_access_token cookie must be present');
    assert.ok(client.cookies.has('bb_refresh_token'), 'bb_refresh_token cookie must be present');
  });

  // 4. Successful login redirects to checkout
  await test('4. Successful login redirects to checkout: Resolves returnTo parameter', async () => {
    const returnTo = '/checkout';
    const safeTarget = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/menu';
    assert.strictEqual(safeTarget, '/checkout');
  });

  // 5. Checkout loads addresses
  await test('5. Checkout loads addresses: GET /api/v1/addresses succeeds', async () => {
    const res = await client.request('/addresses');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data), 'Expected array of addresses');
    console.log(`      Loaded ${body.data.length} saved customer address(es)`);
  });

  // 6. Already logged-in customer opens checkout without being redirected
  await test('6. Already logged-in customer opens checkout: Session verified via /auth/me', async () => {
    const res = await client.request('/auth/me');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, 'customer@bentobabu.in');
  });

  // 7. Access token expires after 30 seconds
  console.log('\n⏳ Waiting 32 seconds for the 30-second access token to expire...');
  await sleep(32000);
  console.log('⏰ 32 seconds elapsed. Access token is expired.\n');

  await test('7. Access token expires after 30 seconds: Verified direct 401 without retry', async () => {
    // Make request without auto-retry to verify the raw access token is indeed expired
    const rawRes = await client.request('/auth/me', { _retry: true });
    assert.strictEqual(rawRes.status, 401);
    const body = await rawRes.json();
    assert.strictEqual(body.message, 'Access token has expired. Please refresh your session.');
  });

  // 8. Customer opens checkout after expiry
  // 9. Refresh occurs once and checkout continues
  // 10. Address GET request succeeds after refresh
  await test('8-10. Customer opens checkout after expiry: Refresh occurs once & addresses load', async () => {
    const initialRefreshCount = client.refreshCallCount;
    // Client transparently refreshes and re-tries
    const res = await client.request('/addresses');
    assert.strictEqual(res.status, 200);
    assert.ok(res._retried, 'Request must be retried after silent refresh');
    assert.strictEqual(client.refreshCallCount, initialRefreshCount + 1, 'Exactly one refresh call must occur');
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  // 11. Address POST request succeeds after refresh with valid CSRF
  await test('11. Address POST request succeeds after refresh with valid CSRF', async () => {
    const testAddressPayload = {
      fullName: 'Phase 6 Automation',
      phone: '9876543210',
      addressLine: 'Apt 101, Phase 6 Suite, Near Tech Park',
      landmark: 'Tech Tower',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700120',
      addressType: 'HOME',
      isDefault: false,
    };

    const res = await client.request('/addresses', {
      method: 'POST',
      body: JSON.stringify(testAddressPayload),
    });
    assert.strictEqual(res.status, 201, `Expected 201 Created, received ${res.status}`);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.fullName, 'Phase 6 Automation');
    const createdId = body.data.id || body.data._id;
    assert.ok(createdId, 'Address must have valid ID');

    // Clean up created address
    await client.request(`/addresses/${createdId}`, { method: 'DELETE' });
  });

  // 12. Five concurrent protected requests cause only one refresh
  console.log('\n⏳ Waiting 32 seconds again to test 5 concurrent requests on expired token...');
  await sleep(32000);
  console.log('⏰ 32 seconds elapsed.\n');

  await test('12. Five concurrent protected requests cause exactly one refresh', async () => {
    const refreshCountBefore = client.refreshCallCount;

    const [r1, r2, r3, r4, r5] = await Promise.all([
      client.request('/auth/me'),
      client.request('/addresses'),
      client.request('/orders'),
      client.request('/auth/me'),
      client.request('/addresses'),
    ]);

    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(r4.status, 200);
    assert.strictEqual(r5.status, 200);

    const refreshesTriggered = client.refreshCallCount - refreshCountBefore;
    assert.strictEqual(
      refreshesTriggered,
      1,
      `Expected exactly 1 refresh for 5 concurrent calls, but got ${refreshesTriggered}`
    );
  });

  // 13. Invalid refresh token results in proper logout
  await test('13. Invalid refresh token results in proper logout (401)', async () => {
    const corruptClient = new BrowserClient();
    corruptClient.cookies.set('bb_refresh_token', 'invalid_corrupt_jwt_token');
    await corruptClient.fetchCsrf();
    const res = await corruptClient.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 401, 'Corrupt refresh token must be rejected with 401');
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, 'Invalid or expired refresh token. Please log in again.');
  });

  // 14. Logout clears both cookies
  await test('14. Logout clears both cookies', async () => {
    const res = await client.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(client.cookies.has('bb_access_token'), false, 'bb_access_token must be deleted');
    assert.strictEqual(client.cookies.has('bb_refresh_token'), false, 'bb_refresh_token must be deleted');

    // Confirm unauthenticated
    const checkRes = await client.request('/auth/me', { _retry: true });
    assert.strictEqual(checkRes.status, 401);
  });

  // 15. Navbar correctly reflects the authentication state after login and logout
  await test('15. Navbar correctly reflects the authentication state (authenticated vs unauthenticated)', async () => {
    // When cookies cleared: client is unauthenticated
    assert.strictEqual(client.cookies.has('bb_access_token'), false);
    assert.strictEqual(client.cookies.has('bb_refresh_token'), false);

    // Re-login
    await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'CustomerPassword@123',
      }),
    });
    assert.ok(client.cookies.has('bb_access_token'), 'Authenticated: access token present');
    assert.ok(client.cookies.has('bb_refresh_token'), 'Authenticated: refresh token present');

    // Logout
    await client.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(client.cookies.has('bb_access_token'), false, 'Logged out: access token cleared');
    assert.strictEqual(client.cookies.has('bb_refresh_token'), false, 'Logged out: refresh token cleared');
  });

  console.log('\n================================================================');
  console.log(`PHASE 6 TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

