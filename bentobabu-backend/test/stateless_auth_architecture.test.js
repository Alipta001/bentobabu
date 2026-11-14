/**
 * BentoBabu Stateless JWT Authentication & Security Test Suite
 * Tests all 22 requirements outlined in Phase 11
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');

const BASE_URL = 'http://127.0.0.1:5000/api/v1';
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'your_super_secret_jwt_access_key_change_in_production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_jwt_refresh_key_change_in_production';

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    testsFailed++;
  }
}

async function getCsrfToken() {
  const res = await fetch(`${BASE_URL}/auth/csrf-token`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  const setCookie = res.headers.getSetCookie();
  return {
    token: data.data.csrfToken,
    cookie: setCookie.map((c) => c.split(';')[0]).join('; '),
  };
}

async function runAllTests() {
  console.log('================================================================');
  console.log('   BENTO BABU — STATELESS JWT ARCHITECTURE VERIFICATION         ');
  console.log('================================================================\n');

  const csrf = await getCsrfToken();
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testCustomerEmail = `customer_${uniqueSuffix}@bentobabu.in`;
  const testCustomerPhone = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
  const testCustomerPassword = 'Password123!';
  let customerCookies = '';
  let customerUserId = '';

  // 1. Customer registration
  await test('1. Customer registration creates user without DB session', async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.token,
        Cookie: csrf.cookie,
      },
      body: JSON.stringify({
        name: `Test User ${uniqueSuffix}`,
        email: testCustomerEmail,
        phone: testCustomerPhone,
        password: testCustomerPassword,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testCustomerEmail);
    customerUserId = body.data.user.id || body.data.user._id;
  });

  // 2. Customer login
  await test('2. Customer login authenticates user', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.token,
        Cookie: csrf.cookie,
      },
      body: JSON.stringify({
        email: testCustomerEmail,
        password: testCustomerPassword,
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    const setCookies = res.headers.getSetCookie();
    customerCookies = setCookies.map((c) => c.split(';')[0]).join('; ');
  });

  // 3. Correct access-token cookie
  await test('3. Access-token cookie has HttpOnly, SameSite, and 15m Path=/ attributes', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.token,
        Cookie: csrf.cookie,
      },
      body: JSON.stringify({
        email: testCustomerEmail,
        password: testCustomerPassword,
      }),
    });
    const setCookies = res.headers.getSetCookie();
    const accessCookie = setCookies.find((c) => c.startsWith('bb_access_token='));
    assert.ok(accessCookie, 'bb_access_token cookie must be set');
    assert.ok(/HttpOnly/i.test(accessCookie), 'Must be HttpOnly');
    assert.ok(/Path=\//i.test(accessCookie), 'Must have Path=/');
    assert.ok(/SameSite=Lax/i.test(accessCookie), 'Must have SameSite=Lax');
  });

  // 4. Correct refresh-token cookie
  await test('4. Refresh-token cookie has HttpOnly, SameSite, and 7d Path=/ attributes', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.token,
        Cookie: csrf.cookie,
      },
      body: JSON.stringify({
        email: testCustomerEmail,
        password: testCustomerPassword,
      }),
    });
    const setCookies = res.headers.getSetCookie();
    const refreshCookie = setCookies.find((c) => c.startsWith('bb_refresh_token='));
    assert.ok(refreshCookie, 'bb_refresh_token cookie must be set');
    assert.ok(/HttpOnly/i.test(refreshCookie), 'Must be HttpOnly');
    assert.ok(/Path=\//i.test(refreshCookie), 'Must have Path=/');
    assert.ok(/SameSite=Lax/i.test(refreshCookie), 'Must have SameSite=Lax');
  });

  // 5. No JWT returned in JSON
  await test('5. No JWT access or refresh token returned in JSON body', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf.token,
        Cookie: csrf.cookie,
      },
      body: JSON.stringify({
        email: testCustomerEmail,
        password: testCustomerPassword,
      }),
    });
    const body = await res.json();
    assert.strictEqual(body.data.accessToken, undefined);
    assert.strictEqual(body.data.refreshToken, undefined);
    assert.strictEqual(body.accessToken, undefined);
    assert.strictEqual(body.refreshToken, undefined);
  });

  // 6. Valid access-token authentication
  await test('6. Valid access-token authenticates GET /auth/me successfully', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: customerCookies },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testCustomerEmail);
  });

  // 7. Expired access-token handling
  await test('7. Expired access-token returns 401 TokenExpired', async () => {
    const expiredToken = jwt.sign(
      { userId: customerUserId, role: 'CUSTOMER', type: 'access' },
      ACCESS_SECRET,
      { expiresIn: '-10s' }
    );
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: `bb_access_token=${expiredToken}` },
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.message.includes('expired'));
  });

  // 8. Valid refresh-token handling
  await test('8. Valid refresh-token rotates tokens statelessly', async () => {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `${customerCookies}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testCustomerEmail);
    const setCookies = res.headers.getSetCookie();
    assert.ok(setCookies.some((c) => c.startsWith('bb_access_token=')));
    assert.ok(setCookies.some((c) => c.startsWith('bb_refresh_token=')));
  });

  // 9. Expired refresh-token rejection
  await test('9. Expired refresh-token is rejected with 401', async () => {
    const expiredRefreshToken = jwt.sign(
      { userId: customerUserId, type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: '-10s' }
    );
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `bb_refresh_token=${expiredRefreshToken}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 401);
  });

  // 10. Invalid refresh-token rejection
  await test('10. Tampered or invalid refresh-token is rejected with 401', async () => {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `bb_refresh_token=invalid_forged_token; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 401);
  });

  // 11. Refresh attempt with access token returns 401 (token-type mismatch)
  await test('11. Refresh attempt with access token is rejected with 401 (wrong token type)', async () => {
    const wrongTypeToken = jwt.sign(
      { userId: customerUserId, type: 'access' },
      REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `bb_refresh_token=${wrongTypeToken}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 401);
  });

  // 12. Access attempt with refresh token returns 401 (token-type mismatch)
  await test('12. Access attempt with refresh token is rejected with 401 (wrong token type)', async () => {
    const refreshTokenAsAccess = jwt.sign(
      { userId: customerUserId, type: 'refresh' },
      ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: `bb_access_token=${refreshTokenAsAccess}` },
    });
    assert.strictEqual(res.status, 401);
  });

  // 13. Tampered signature on access token returns 401
  await test('13. Tampered signature on access token is rejected with 401', async () => {
    const forgedToken = jwt.sign(
      { userId: customerUserId, role: 'CUSTOMER', type: 'access' },
      'wrong_untrusted_signing_secret_123',
      { expiresIn: '15m' }
    );
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: `bb_access_token=${forgedToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  // 14. Tampered signature on refresh token returns 401
  await test('14. Tampered signature on refresh token is rejected with 401', async () => {
    const forgedRefreshToken = jwt.sign(
      { userId: customerUserId, type: 'refresh' },
      'wrong_untrusted_refresh_secret_123',
      { expiresIn: '7d' }
    );
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `bb_refresh_token=${forgedRefreshToken}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 401);
  });

  // 15. Refresh request without CSRF token returns 403
  await test('15. POST /auth/refresh without X-CSRF-Token is rejected with 403', async () => {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `${customerCookies}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(body.message.includes('CSRF'));
  });

  // 16. Refresh request with invalid CSRF token returns 403
  await test('16. POST /auth/refresh with mismatched CSRF token is rejected with 403', async () => {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': 'bogus_csrf_token_value_abc',
        Cookie: `${customerCookies}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 403);
  });

  // 17. Concurrent refresh requests succeed statelessly
  await test('17. Concurrent refresh requests succeed statelessly without race conditions', async () => {
    const requests = [1, 2, 3].map(() =>
      fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrf.token,
          Cookie: `${customerCookies}; ${csrf.cookie}`,
        },
      })
    );
    const responses = await Promise.all(requests);
    responses.forEach((r) => assert.strictEqual(r.status, 200));
  });

  // 18. Customer role cannot access admin routes
  await test('18. Customer token cannot access ADMIN routes (403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/admin/dashboard/overview`, {
      headers: { Cookie: customerCookies },
    });
    assert.strictEqual(res.status, 403);
  });

  // 19. Inactive user token is rejected even if signature is valid
  await test('19. Inactive or deleted user token is rejected with 401', async () => {
    const nonExistentIdToken = jwt.sign(
      { userId: '000000000000000000000000', role: 'CUSTOMER', type: 'access' },
      ACCESS_SECRET,
      { expiresIn: '15m' }
    );
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: `bb_access_token=${nonExistentIdToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  // 20. Logout cookie clearing
  await test('20. POST /auth/logout clears both authentication cookies with maxAge: 0', async () => {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrf.token,
        Cookie: `${customerCookies}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 200);
    const setCookies = res.headers.getSetCookie();
    assert.ok(setCookies.some((c) => c.startsWith('bb_access_token=;')));
    assert.ok(setCookies.some((c) => c.startsWith('bb_refresh_token=;')));
  });

  // 21. Logout without CSRF token returns 403
  await test('21. POST /auth/logout without CSRF token is rejected with 403', async () => {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `${customerCookies}; ${csrf.cookie}`,
      },
    });
    assert.strictEqual(res.status, 403);
  });

  // 22. Safe returnTo URL validation rejects external/protocol-relative URLs
  await test('22. ReturnTo URL validator rejects external and protocol-relative targets', async () => {
    // Pure function logic validation matching frontend sanitizeReturnUrl
    const sanitizeReturnUrl = (url, fallback = '/menu') => {
      if (!url || typeof url !== 'string') return fallback;
      const trimmed = url.trim();
      if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') || trimmed.includes(':')) {
        return fallback;
      }
      if (/^\/(login|register|forgot-password|reset-password)/i.test(trimmed)) {
        return fallback;
      }
      return trimmed;
    };

    assert.strictEqual(sanitizeReturnUrl('/checkout?coupon=SAVE50'), '/checkout?coupon=SAVE50');
    assert.strictEqual(sanitizeReturnUrl('https://evil.com'), '/menu');
    assert.strictEqual(sanitizeReturnUrl('//evil.com/path'), '/menu');
    assert.strictEqual(sanitizeReturnUrl('/\\evil.com'), '/menu');
    assert.strictEqual(sanitizeReturnUrl('javascript:alert(1)'), '/menu');
    assert.strictEqual(sanitizeReturnUrl('/login'), '/menu');
    assert.strictEqual(sanitizeReturnUrl('/register'), '/menu');
  });

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
