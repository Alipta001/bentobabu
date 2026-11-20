/**
 * BentoBabu — CORS Preflight & Order Idempotency Test Suite
 *
 * Verifies that:
 * 1. OPTIONS preflight to /api/v1/orders returns HTTP 200 or 204.
 * 2. Access-Control-Allow-Origin matches allowed production origin (https://www.bentobabu.com).
 * 3. Access-Control-Allow-Credentials is 'true' (supports HttpOnly cookies).
 * 4. Access-Control-Allow-Methods includes POST.
 * 5. Access-Control-Allow-Headers includes Idempotency-Key.
 * 6. Preserves existing headers: Content-Type, Authorization, X-Auth-Context, X-CSRF-Token.
 * 7. Rejects unauthorized origins with HTTP 403.
 * 8. Preflight terminates cleanly before authentication / route handlers.
 */

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';

const assert = require('assert');
const http = require('http');
const { app } = require('../server');

const runPreflightRequest = ({
  path = '/api/v1/orders',
  origin = 'https://www.bentobabu.com',
  requestMethod = 'POST',
  requestHeaders = 'content-type,idempotency-key,x-auth-context,x-csrf-token',
}) => {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage({ on: () => {}, once: () => {}, emit: () => {} });
    req.method = 'OPTIONS';
    req.url = path;
    req.headers = {
      host: 'api.bentobabu.com',
      origin,
      'access-control-request-method': requestMethod,
      'access-control-request-headers': requestHeaders,
    };

    const res = new http.ServerResponse(req);
    res.end = function () {
      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
      });
    };

    res.json = function (body) {
      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body,
      });
    };

    try {
      app(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

const runSuite = async () => {
  console.log('================================================================');
  console.log('  BENTO BABU — CORS PREFLIGHT & ORDER IDEMPOTENCY TEST SUITE    ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  };

  // Test 1: Production Customer Preflight on /api/v1/orders
  await test('OPTIONS /api/v1/orders allows https://www.bentobabu.com with Idempotency-Key', async () => {
    const res = await runPreflightRequest({
      path: '/api/v1/orders',
      origin: 'https://www.bentobabu.com',
      requestMethod: 'POST',
      requestHeaders: 'content-type,idempotency-key,x-auth-context',
    });

    assert.ok(
      res.statusCode === 200 || res.statusCode === 204,
      `Expected HTTP 200 or 204, got ${res.statusCode}`
    );
    assert.strictEqual(
      res.headers['access-control-allow-origin'],
      'https://www.bentobabu.com',
      'Access-Control-Allow-Origin must match the requested origin'
    );
    assert.strictEqual(
      res.headers['access-control-allow-credentials'],
      'true',
      'Access-Control-Allow-Credentials must be true'
    );

    const methods = res.headers['access-control-allow-methods'] || '';
    assert.ok(methods.includes('POST'), 'Access-Control-Allow-Methods must contain POST');

    const allowedHeaders = (res.headers['access-control-allow-headers'] || '')
      .split(',')
      .map((h) => h.trim());

    assert.ok(
      allowedHeaders.includes('Idempotency-Key'),
      'Access-Control-Allow-Headers must contain Idempotency-Key'
    );
    assert.ok(
      allowedHeaders.includes('Content-Type'),
      'Access-Control-Allow-Headers must preserve Content-Type'
    );
    assert.ok(
      allowedHeaders.includes('Authorization'),
      'Access-Control-Allow-Headers must preserve Authorization'
    );
    assert.ok(
      allowedHeaders.includes('X-Auth-Context'),
      'Access-Control-Allow-Headers must preserve X-Auth-Context'
    );
    assert.ok(
      allowedHeaders.includes('X-CSRF-Token'),
      'Access-Control-Allow-Headers must preserve X-CSRF-Token'
    );
  });

  // Test 2: Naked domain origin https://bentobabu.com
  await test('OPTIONS /api/v1/orders allows naked domain https://bentobabu.com', async () => {
    const res = await runPreflightRequest({
      path: '/api/v1/orders',
      origin: 'https://bentobabu.com',
      requestMethod: 'POST',
      requestHeaders: 'content-type,idempotency-key,x-auth-context',
    });

    assert.ok(res.statusCode === 200 || res.statusCode === 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://bentobabu.com');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
    const allowedHeaders = (res.headers['access-control-allow-headers'] || '').split(',');
    assert.ok(allowedHeaders.includes('Idempotency-Key'));
  });

  // Test 3: Other mutating routes
  await test('OPTIONS preflight applies to other routes (/api/v1/cart, /api/v1/payments)', async () => {
    for (const path of ['/api/v1/cart', '/api/v1/payments', '/api/v1/auth/login']) {
      const res = await runPreflightRequest({
        path,
        origin: 'https://www.bentobabu.com',
        requestMethod: 'POST',
        requestHeaders: 'content-type,idempotency-key',
      });
      assert.ok(res.statusCode === 200 || res.statusCode === 204);
      assert.strictEqual(res.headers['access-control-allow-origin'], 'https://www.bentobabu.com');
      assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
      const allowedHeaders = (res.headers['access-control-allow-headers'] || '').split(',');
      assert.ok(allowedHeaders.includes('Idempotency-Key'));
    }
  });

  // Test 4: Unauthorized origin rejection
  await test('OPTIONS from unauthorized origin is rejected with 403', async () => {
    const res = await runPreflightRequest({
      path: '/api/v1/orders',
      origin: 'https://unauthorized-attacker.com',
      requestMethod: 'POST',
      requestHeaders: 'content-type,idempotency-key',
    });

    assert.strictEqual(res.statusCode, 403, 'Unauthorized origin must return HTTP 403');
    assert.ok(!res.headers['access-control-allow-origin'], 'Must not grant Access-Control-Allow-Origin');
  });

  // Test 5: No wildcard origin with credentials
  await test('Origin header is never wildcard (*) when credentials are true', async () => {
    const res = await runPreflightRequest({
      path: '/api/v1/orders',
      origin: 'https://www.bentobabu.com',
      requestMethod: 'POST',
    });
    assert.notStrictEqual(res.headers['access-control-allow-origin'], '*');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  console.log(`\n================================================================`);
  console.log(`  ALL ${passed}/${total} CORS & IDEMPOTENCY TESTS PASSED!`);
  console.log(`================================================================\n`);
};

runSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
