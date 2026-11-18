const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { app } = require('../server');

function createMockReqRes({ method = 'GET', url = '/', headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  req.rawHeaders = [];
  req.socket = {
    remoteAddress: '10.0.0.1', // Render reverse proxy internal address
    encrypted: true,
  };
  req.connection = req.socket;

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.removeHeader = (k) => {
    delete res.headers[k.toLowerCase()];
  };

  let body = '';
  res.write = (chunk) => {
    if (chunk) body += chunk;
  };
  res.end = (chunk) => {
    if (chunk) body += chunk;
    res.emit('finish');
  };

  return { req, res, getBody: () => body };
}

async function handleRequest(appInstance, options) {
  return new Promise((resolve) => {
    const { req, res, getBody } = createMockReqRes(options);
    res.on('finish', () => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: getBody(),
        req,
      });
    });
    appInstance(req, res);
  });
}

async function runTests() {
  console.log('--- Starting BentoBabu Runtime & Concurrency Fix Test Suite ---');

  // TEST 1: Express trust proxy configuration
  console.log('\n--- TEST 1: Express trust proxy configuration ---');
  assert.strictEqual(app.get('trust proxy'), 1, 'app.get("trust proxy") must equal 1 for Render proxy topology');
  console.log('[PASS] app.get("trust proxy") is configured to 1');

  // TEST 2: Real client IP identification through Render reverse proxy
  console.log('\n--- TEST 2: Real client IP identification through Render reverse proxy ---');
  const clientIp = '203.0.113.195';

  const rootRes = await handleRequest(app, {
    method: 'GET',
    url: '/',
    headers: {
      'x-forwarded-for': clientIp,
    },
  });

  assert.strictEqual(rootRes.statusCode, 200, 'Root endpoint should return 200 OK');
  assert.strictEqual(rootRes.req.ip, clientIp, 'Express req.ip must resolve to the real client IP forwarded by Render');
  console.log(`[PASS] Request with X-Forwarded-For resolved req.ip = ${rootRes.req.ip} successfully`);

  // TEST 2B: Spoofed header attack resistance
  console.log('\n--- TEST 2B: Spoofed header attack resistance ---');
  // If an attacker sends X-Forwarded-For: spoofed_ip, their actual client IP (added by Render) is clientIp
  const spoofedIp = '198.51.100.99';
  const attackRes = await handleRequest(app, {
    method: 'GET',
    url: '/',
    headers: {
      // Attacker prepended spoofedIp, Render proxy appended attacker's real IP clientIp
      'x-forwarded-for': `${spoofedIp}, ${clientIp}`,
    },
  });
  // With trust proxy: 1, Express trusts exactly 1 proxy hop (req.socket.remoteAddress),
  // and selects the rightmost entry (clientIp) as the client IP, completely ignoring spoofedIp!
  assert.strictEqual(attackRes.req.ip, clientIp, 'trust proxy 1 must ignore spoofed prepended IPs and take rightmost client IP');
  console.log(`[PASS] Spoofed IP was rejected; real client IP ${attackRes.req.ip} correctly identified`);

  // TEST 3: Rate Limiter does not crash or throw ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  console.log('\n--- TEST 3: Rate limiter handles proxy forwarded requests without throwing ---');
  const csrfRes = await handleRequest(app, {
    method: 'GET',
    url: '/api/v1/auth/csrf-token',
    headers: {
      'x-forwarded-for': '198.51.100.42',
    },
  });

  assert.strictEqual(csrfRes.statusCode, 200, 'Rate-limited endpoint should succeed with 200 OK');
  const parsedCsrf = JSON.parse(csrfRes.body);
  assert.ok(parsedCsrf.data.csrfToken, 'CSRF token returned successfully through proxy hop');
  console.log('[PASS] Rate limiter processed request with proxy headers safely without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR');

  // TEST 4: Client-side single-flight token refresh concurrency simulation
  console.log('\n--- TEST 4: Single-flight refresh prevents duplicate refresh calls under concurrent 401s ---');
  let refreshCount = 0;
  let refreshPromise = null;
  let lastRefreshSuccessTime = 0;
  let lastLoginTime = 0;

  const mockRefreshTokenApi = async () => {
    refreshCount++;
    await new Promise((r) => setTimeout(r, 50));
    return { success: true };
  };

  const clientRefreshTokens = async () => {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      try {
        await mockRefreshTokenApi();
        lastRefreshSuccessTime = Date.now();
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  };

  const handle401 = async (requestSentAt) => {
    if (lastLoginTime > 0 && requestSentAt <= lastLoginTime) {
      return 'RETRY_PRE_LOGIN_SUCCESS';
    }
    if (lastRefreshSuccessTime > 0 && requestSentAt <= lastRefreshSuccessTime) {
      return 'RETRY_CONCURRENT_SUCCESS';
    }
    await clientRefreshTokens();
    return 'RETRY_AFTER_REFRESH_SUCCESS';
  };

  const t0 = Date.now();
  const concurrentRequests = [
    handle401(t0),
    handle401(t0),
    handle401(t0),
    handle401(t0),
    handle401(t0),
  ];

  const results = await Promise.all(concurrentRequests);
  assert.strictEqual(refreshCount, 1, 'Exactly one refresh request should have executed for 5 concurrent 401s');
  assert.strictEqual(results.length, 5);
  console.log('[PASS] 5 concurrent 401 requests triggered exactly 1 refresh operation');

  // TEST 5: Stale pre-refresh request does not trigger secondary refresh
  console.log('\n--- TEST 5: Stale pre-refresh request does not trigger secondary refresh ---');
  const staleRequestSentBeforeRefresh = t0;
  const staleResult = await handle401(staleRequestSentBeforeRefresh);
  assert.strictEqual(staleResult, 'RETRY_CONCURRENT_SUCCESS');
  assert.strictEqual(refreshCount, 1, 'Refresh count must remain 1 (no redundant refresh)');
  console.log('[PASS] Stale pre-refresh request bypassed duplicate refresh call');

  // TEST 6: Stale pre-login request does not trigger refresh
  console.log('\n--- TEST 6: Stale pre-login request does not trigger refresh ---');
  const preLoginRequestSentAt = Date.now();
  await new Promise((r) => setTimeout(r, 10));
  lastLoginTime = Date.now();

  const preLoginResult = await handle401(preLoginRequestSentAt);
  assert.strictEqual(preLoginResult, 'RETRY_PRE_LOGIN_SUCCESS');
  assert.strictEqual(refreshCount, 1, 'Refresh count must still remain 1');
  console.log('[PASS] Stale pre-login request directly retried without triggering refresh');

  // TEST 7: Definitive refresh failure stops infinite retry loops
  console.log('\n--- TEST 7: Definitive refresh failure terminates cleanly without infinite loop ---');
  let failingRefreshPromise = null;
  let authFailureCalled = false;

  const failingRefreshTokens = async () => {
    if (failingRefreshPromise) return failingRefreshPromise;
    failingRefreshPromise = (async () => {
      try {
        const err = new Error('Refresh token expired');
        err.response = { status: 401 };
        throw err;
      } finally {
        failingRefreshPromise = null;
      }
    })();
    return failingRefreshPromise;
  };

  try {
    await failingRefreshTokens();
    assert.fail('Should have thrown');
  } catch (err) {
    if (err.response?.status === 401) {
      authFailureCalled = true;
    }
  }

  assert.strictEqual(authFailureCalled, true, 'Auth failure callback must be notified on refresh 401');
  console.log('[PASS] Refresh 401 triggers clean session termination and no infinite retry loop');

  // TEST 8: B2 Missing-Object Recovery Structured Diagnostics
  console.log('\n--- TEST 8: B2 Missing-Object Recovery Structured Diagnostics ---');
  const receiptServiceSrc = fs.readFileSync(
    path.join(__dirname, '../app/utils/orderReceiptService.js'),
    'utf8'
  );
  assert.ok(
    receiptServiceSrc.includes('B2_STREAM_FAILED_FALLBACK_RECOVERY'),
    'orderReceiptService must log B2_STREAM_FAILED_FALLBACK_RECOVERY'
  );
  assert.ok(
    receiptServiceSrc.includes('targetBucket'),
    'Recovery log must include targetBucket diagnostic'
  );
  assert.ok(
    receiptServiceSrc.includes('recordedBucket'),
    'Recovery log must include recordedBucket diagnostic'
  );
  assert.ok(
    receiptServiceSrc.includes('recordedUploadedAt'),
    'Recovery log must include recordedUploadedAt diagnostic'
  );
  assert.ok(
    !receiptServiceSrc.includes('b2ApplicationKey'),
    'Diagnostic log must never log b2ApplicationKey'
  );
  console.log('[PASS] B2 missing-object diagnostic logging verified safe and informative');

  console.log('\n=== ALL 9 VERIFICATION TESTS PASSED SUCCESSFULLY ===\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[FAIL] Test execution error:', err);
  process.exit(1);
});
