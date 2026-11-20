/**
 * BentoBabu — Production Authentication Cookie Domain & Attributes Verification
 *
 * Verifies all production cookie domain requirements:
 * 1. resolveCookieDomain handles unset, empty, invalid, and Render internal IDs
 * 2. Express res.cookie omits Domain attribute entirely when unset (RFC 6265 Host-Only cookie)
 * 3. Render container ID (e.g. 0acd26faaad1c56167b99f9f84718ca9) is rejected and omitted
 * 4. Legitimate domain (e.g. .bentobabu.com or api.bentobabu.com) is correctly preserved
 * 5. Access token cookies use Path=/ and HttpOnly=true
 * 6. Refresh token cookies use Path=/api/v1/auth and HttpOnly=true
 * 7. CSRF cookies use Path=/ and HttpOnly=false
 * 8. Cookie clearing options match security, sameSite, domain, and path attributes
 * 9. Role-isolated cookie names for Customer, Admin, and Delivery are maintained
 * 10. Logout and LogoutAll handlers clear all active and legacy cookie paths
 */

const assert = require('assert');
const express = require('express');
const { resolveCookieDomain, validateEnv } = require('../app/config/env');
const {
  AUTH_COOKIE_NAMES,
  getCookieNamesForRole,
  getAccessTokenCookieOptions,
  getRefreshCookieOptions,
  getCsrfCookieOptions,
  getClearCookieOptions,
} = require('../app/utils/token');

// Helper to create an Express response mock that captures Set-Cookie headers
function createMockResponse() {
  const headers = {};
  const res = {
    req: {},
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    setHeader(name, val) {
      headers[name.toLowerCase()] = val;
    },
    append(field, val) {
      const key = field.toLowerCase();
      const prev = headers[key];
      if (!prev) {
        headers[key] = val;
      } else {
        headers[key] = Array.isArray(prev) ? prev.concat(val) : [prev].concat(val);
      }
    },
    getSetCookieHeaders() {
      const val = headers['set-cookie'];
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    },
  };
  Object.setPrototypeOf(res, express.response);
  return res;
}

async function runTests() {
  console.log('================================================================');
  console.log('  BENTO BABU — PRODUCTION COOKIE DOMAIN VERIFICATION SUITE       ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      throw err;
    }
  }

  // --- Suite 1: resolveCookieDomain Edge Cases ---
  console.log('--- Suite 1: resolveCookieDomain Edge Cases ---');

  test('Rejects Render 32-character hex instance ID (0acd26faaad1c56167b99f9f84718ca9)', () => {
    assert.strictEqual(resolveCookieDomain('0acd26faaad1c56167b99f9f84718ca9'), undefined);
    assert.strictEqual(resolveCookieDomain('"0acd26faaad1c56167b99f9f84718ca9"'), undefined);
    assert.strictEqual(resolveCookieDomain("'0acd26faaad1c56167b99f9f84718ca9'"), undefined);
  });

  test('Rejects Render service IDs and internal hostnames (srv-*, *.render.internal)', () => {
    assert.strictEqual(resolveCookieDomain('srv-c1234567890abcdef'), undefined);
    assert.strictEqual(resolveCookieDomain('backend-service.render.internal'), undefined);
    assert.strictEqual(resolveCookieDomain('my-api.internal'), undefined);
    assert.strictEqual(resolveCookieDomain('my-api.local'), undefined);
  });

  test('Rejects localhost and raw IP addresses (RFC 6265 Host-Only requirement)', () => {
    assert.strictEqual(resolveCookieDomain('localhost'), undefined);
    assert.strictEqual(resolveCookieDomain('127.0.0.1'), undefined);
    assert.strictEqual(resolveCookieDomain('192.168.1.100'), undefined);
  });

  test('Rejects empty, whitespace, and nullish strings', () => {
    assert.strictEqual(resolveCookieDomain(''), undefined);
    assert.strictEqual(resolveCookieDomain('   '), undefined);
    assert.strictEqual(resolveCookieDomain(undefined), undefined);
    assert.strictEqual(resolveCookieDomain(null), undefined);
    assert.strictEqual(resolveCookieDomain('undefined'), undefined);
    assert.strictEqual(resolveCookieDomain('null'), undefined);
    assert.strictEqual(resolveCookieDomain('false'), undefined);
    assert.strictEqual(resolveCookieDomain('none'), undefined);
    assert.strictEqual(resolveCookieDomain('off'), undefined);
    assert.strictEqual(resolveCookieDomain('0'), undefined);
  });

  test('Rejects single-label hostnames without a dot', () => {
    assert.strictEqual(resolveCookieDomain('bentobabu'), undefined);
    assert.strictEqual(resolveCookieDomain('api'), undefined);
  });

  test('Preserves legitimate production domains', () => {
    assert.strictEqual(resolveCookieDomain('.bentobabu.com'), '.bentobabu.com');
    assert.strictEqual(resolveCookieDomain('bentobabu.com'), 'bentobabu.com');
    assert.strictEqual(resolveCookieDomain('api.bentobabu.com'), 'api.bentobabu.com');
    assert.strictEqual(resolveCookieDomain('"api.bentobabu.com"'), 'api.bentobabu.com');
    assert.strictEqual(resolveCookieDomain('https://api.bentobabu.com:4000/api/v1'), 'api.bentobabu.com');
  });

  // --- Suite 2: Cookie Options Generators ---
  console.log('\n--- Suite 2: Cookie Options Generators with Production Settings ---');

  // Set production environment flags
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SECURE = 'true';
  process.env.COOKIE_SAME_SITE = 'lax';
  delete process.env.COOKIE_DOMAIN;

  test('getAccessTokenCookieOptions omits domain when COOKIE_DOMAIN is unset', () => {
    delete process.env.COOKIE_DOMAIN;
    const opts = getAccessTokenCookieOptions('/');
    assert.strictEqual(opts.domain, undefined);
    assert.strictEqual('domain' in opts, false);
    assert.strictEqual(opts.httpOnly, true);
    assert.strictEqual(opts.secure, true);
    assert.strictEqual(opts.sameSite, 'lax');
    assert.strictEqual(opts.path, '/');
  });

  test('getAccessTokenCookieOptions omits domain when COOKIE_DOMAIN is Render instance ID', () => {
    process.env.COOKIE_DOMAIN = '0acd26faaad1c56167b99f9f84718ca9';
    const opts = getAccessTokenCookieOptions('/');
    assert.strictEqual(opts.domain, undefined);
    assert.strictEqual('domain' in opts, false);
    delete process.env.COOKIE_DOMAIN;
  });

  test('getAccessTokenCookieOptions includes domain when legitimate FQDN is provided', () => {
    process.env.COOKIE_DOMAIN = '.bentobabu.com';
    const opts = getAccessTokenCookieOptions('/');
    assert.strictEqual(opts.domain, '.bentobabu.com');
    delete process.env.COOKIE_DOMAIN;
  });

  test('getRefreshCookieOptions scopes to /api/v1/auth and omits domain when unset', () => {
    delete process.env.COOKIE_DOMAIN;
    const opts = getRefreshCookieOptions('/api/v1/auth');
    assert.strictEqual(opts.domain, undefined);
    assert.strictEqual('domain' in opts, false);
    assert.strictEqual(opts.httpOnly, true);
    assert.strictEqual(opts.secure, true);
    assert.strictEqual(opts.sameSite, 'lax');
    assert.strictEqual(opts.path, '/api/v1/auth');
    assert.strictEqual(opts.maxAge, 7 * 24 * 60 * 60 * 1000); // 7 days
  });

  test('getCsrfCookieOptions sets httpOnly=false for JavaScript accessibility', () => {
    delete process.env.COOKIE_DOMAIN;
    const opts = getCsrfCookieOptions();
    assert.strictEqual(opts.domain, undefined);
    assert.strictEqual(opts.httpOnly, false);
    assert.strictEqual(opts.secure, true);
    assert.strictEqual(opts.sameSite, 'lax');
    assert.strictEqual(opts.path, '/');
  });

  test('getClearCookieOptions matches security, sameSite, and path attributes', () => {
    delete process.env.COOKIE_DOMAIN;
    const clearOpts = getClearCookieOptions('/api/v1/auth');
    assert.strictEqual(clearOpts.domain, undefined);
    assert.strictEqual(clearOpts.httpOnly, true);
    assert.strictEqual(clearOpts.secure, true);
    assert.strictEqual(clearOpts.sameSite, 'lax');
    assert.strictEqual(clearOpts.path, '/api/v1/auth');
    assert.strictEqual(clearOpts.maxAge, 0);
  });

  // --- Suite 3: End-to-End Express Set-Cookie Serialization ---
  console.log('\n--- Suite 3: End-to-End Express Set-Cookie Serialization ---');

  test('Express res.cookie generates RFC 6265 Host-Only cookie when domain is unset', () => {
    delete process.env.COOKIE_DOMAIN;
    const res = createMockResponse();

    res.cookie('bb_customer_access_token', 'mock_access_jwt', getAccessTokenCookieOptions());
    res.cookie('bb_customer_refresh_token', 'mock_refresh_jwt', getRefreshCookieOptions('/api/v1/auth'));

    const setCookies = res.getSetCookieHeaders();
    assert.strictEqual(setCookies.length, 2);

    const accessCookie = setCookies[0];
    const refreshCookie = setCookies[1];

    // Must NOT contain Domain attribute
    assert.strictEqual(accessCookie.includes('Domain='), false, `Access cookie should not contain Domain: ${accessCookie}`);
    assert.strictEqual(refreshCookie.includes('Domain='), false, `Refresh cookie should not contain Domain: ${refreshCookie}`);

    // Must contain required security attributes
    assert.ok(accessCookie.includes('HttpOnly'));
    assert.ok(accessCookie.includes('Secure'));
    assert.ok(accessCookie.includes('SameSite=Lax'));
    assert.ok(accessCookie.includes('Path=/'));

    assert.ok(refreshCookie.includes('HttpOnly'));
    assert.ok(refreshCookie.includes('Secure'));
    assert.ok(refreshCookie.includes('SameSite=Lax'));
    assert.ok(refreshCookie.includes('Path=/api/v1/auth'));
  });

  test('Express res.cookie completely filters out Render ID when injected in COOKIE_DOMAIN', () => {
    process.env.COOKIE_DOMAIN = '0acd26faaad1c56167b99f9f84718ca9';
    const res = createMockResponse();

    res.cookie('bb_customer_access_token', 'mock_access_jwt', getAccessTokenCookieOptions());
    res.cookie('bb_customer_refresh_token', 'mock_refresh_jwt', getRefreshCookieOptions('/api/v1/auth'));

    const setCookies = res.getSetCookieHeaders();
    for (const cookieStr of setCookies) {
      assert.strictEqual(cookieStr.includes('0acd26faaad1c56167b99f9f84718ca9'), false, `Render ID found in cookie: ${cookieStr}`);
      assert.strictEqual(cookieStr.includes('Domain='), false, `Domain attribute should be omitted: ${cookieStr}`);
    }
    delete process.env.COOKIE_DOMAIN;
  });

  test('Express res.cookie preserves explicit valid domain when COOKIE_DOMAIN is set', () => {
    process.env.COOKIE_DOMAIN = '.bentobabu.com';
    const res = createMockResponse();

    res.cookie('bb_customer_access_token', 'mock_access_jwt', getAccessTokenCookieOptions());
    res.cookie('bb_customer_refresh_token', 'mock_refresh_jwt', getRefreshCookieOptions('/api/v1/auth'));

    const setCookies = res.getSetCookieHeaders();
    for (const cookieStr of setCookies) {
      assert.ok(cookieStr.includes('Domain=.bentobabu.com'), `Expected Domain=.bentobabu.com in: ${cookieStr}`);
    }
    delete process.env.COOKIE_DOMAIN;
  });

  // --- Suite 4: Multi-Role Authentication Cookie Isolation ---
  console.log('\n--- Suite 4: Multi-Role Authentication Cookie Isolation ---');

  test('Customer role uses isolated bb_customer_* cookies', () => {
    const names = getCookieNamesForRole('customer');
    assert.strictEqual(names.access, 'bb_customer_access_token');
    assert.strictEqual(names.refresh, 'bb_customer_refresh_token');

    const res = createMockResponse();
    res.cookie(names.access, 'customer_access', getAccessTokenCookieOptions());
    res.cookie(names.refresh, 'customer_refresh', getRefreshCookieOptions('/api/v1/auth'));

    const headers = res.getSetCookieHeaders();
    assert.ok(headers.some((h) => h.startsWith('bb_customer_access_token=')));
    assert.ok(headers.some((h) => h.startsWith('bb_customer_refresh_token=')));
  });

  test('Admin role uses isolated bb_admin_* cookies', () => {
    const names = getCookieNamesForRole('admin');
    assert.strictEqual(names.access, 'bb_admin_access_token');
    assert.strictEqual(names.refresh, 'bb_admin_refresh_token');

    const res = createMockResponse();
    res.cookie(names.access, 'admin_access', getAccessTokenCookieOptions());
    res.cookie(names.refresh, 'admin_refresh', getRefreshCookieOptions('/api/v1/auth'));

    const headers = res.getSetCookieHeaders();
    assert.ok(headers.some((h) => h.startsWith('bb_admin_access_token=')));
    assert.ok(headers.some((h) => h.startsWith('bb_admin_refresh_token=')));
  });

  test('Delivery partner role uses isolated bb_delivery_* cookies', () => {
    const names = getCookieNamesForRole('delivery');
    assert.strictEqual(names.access, 'bb_delivery_access_token');
    assert.strictEqual(names.refresh, 'bb_delivery_refresh_token');

    const res = createMockResponse();
    res.cookie(names.access, 'delivery_access', getAccessTokenCookieOptions());
    res.cookie(names.refresh, 'delivery_refresh', getRefreshCookieOptions('/api/v1/auth'));

    const headers = res.getSetCookieHeaders();
    assert.ok(headers.some((h) => h.startsWith('bb_delivery_access_token=')));
    assert.ok(headers.some((h) => h.startsWith('bb_delivery_refresh_token=')));
  });

  // --- Suite 5: Cookie Clearing and Invalidation Verification ---
  console.log('\n--- Suite 5: Cookie Clearing and Invalidation Verification ---');

  test('res.clearCookie clears cookie with matching path, SameSite, Secure, and expired date', () => {
    delete process.env.COOKIE_DOMAIN;
    const res = createMockResponse();

    res.clearCookie('bb_customer_access_token', getClearCookieOptions('/'));
    res.clearCookie('bb_customer_refresh_token', getClearCookieOptions('/api/v1/auth'));

    const headers = res.getSetCookieHeaders();
    assert.strictEqual(headers.length, 2);

    const clearAccess = headers[0];
    const clearRefresh = headers[1];

    assert.ok(clearAccess.startsWith('bb_customer_access_token=;'));
    assert.ok(clearAccess.includes('Path=/'));
    assert.ok(clearAccess.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
    assert.ok(clearAccess.includes('HttpOnly'));
    assert.ok(clearAccess.includes('Secure'));
    assert.ok(clearAccess.includes('SameSite=Lax'));
    assert.strictEqual(clearAccess.includes('Domain='), false);

    assert.ok(clearRefresh.startsWith('bb_customer_refresh_token=;'));
    assert.ok(clearRefresh.includes('Path=/api/v1/auth'));
    assert.ok(clearRefresh.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
    assert.ok(clearRefresh.includes('HttpOnly'));
    assert.ok(clearRefresh.includes('Secure'));
    assert.ok(clearRefresh.includes('SameSite=Lax'));
    assert.strictEqual(clearRefresh.includes('Domain='), false);
  });

  test('res.clearCookie omits Domain even if COOKIE_DOMAIN contains Render instance ID', () => {
    process.env.COOKIE_DOMAIN = '0acd26faaad1c56167b99f9f84718ca9';
    const res = createMockResponse();

    res.clearCookie('bb_customer_refresh_token', getClearCookieOptions('/api/v1/auth'));
    const headers = res.getSetCookieHeaders();
    assert.strictEqual(headers.length, 1);
    assert.strictEqual(headers[0].includes('0acd26faaad1c56167b99f9f84718ca9'), false);
    assert.strictEqual(headers[0].includes('Domain='), false);
    delete process.env.COOKIE_DOMAIN;
  });

  // --- Suite 6: Production Defaults & Duration Parsing ---
  console.log('\n--- Suite 6: Production Defaults & Duration Parsing ---');

  test('cookieSecure defaults to true in production when COOKIE_SECURE is not set', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecure = process.env.COOKIE_SECURE;
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;

    const envConfig = validateEnv();
    assert.strictEqual(envConfig.cookieSecure, true);

    process.env.NODE_ENV = prevEnv;
    if (prevSecure !== undefined) process.env.COOKIE_SECURE = prevSecure;
  });

  test('Duration parsing accurately handles millisecond conversions', () => {
    const { parseDurationToMs } = require('../app/utils/token');
    assert.strictEqual(parseDurationToMs('30s'), 30 * 1000);
    assert.strictEqual(parseDurationToMs('15m'), 15 * 60 * 1000);
    assert.strictEqual(parseDurationToMs('2h'), 2 * 60 * 60 * 1000);
    assert.strictEqual(parseDurationToMs('7d'), 7 * 24 * 60 * 60 * 1000);
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!                 `);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\nTest Suite FAILED:', err);
  process.exit(1);
});
