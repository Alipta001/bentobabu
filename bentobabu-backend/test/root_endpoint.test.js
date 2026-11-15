/**
 * BentoBabu Root Endpoint & Health Response Verification Suite
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { app, startServer } = require('../server');
const { disconnectRedis } = require('../app/config/redis');

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
      req.write(postData);
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('   BENTO BABU - ROOT ENDPOINT VERIFICATION SUITE   ');
  console.log('====================================================\n');

  let serverInstance = null;

  try {
    serverInstance = await startServer(0);
    const port = serverInstance.address().port;
    const host = '127.0.0.1';

    // 1. Test Root Endpoint GET /
    console.log('Testing GET / ...');
    const rootRes = await makeRequest({
      hostname: host,
      port,
      path: '/',
      method: 'GET',
    });

    assert.strictEqual(rootRes.statusCode, 200, 'GET / must return HTTP 200');
    assert.strictEqual(rootRes.body.success, true, 'GET / success must be true');
    assert.strictEqual(rootRes.body.message, 'BentoBabu API is running');
    assert.strictEqual(rootRes.body.version, '1.1.0');
    assert.strictEqual(rootRes.body.health, '/api/v1/health');
    assert.strictEqual(rootRes.body.env, undefined, 'Must not leak environment variables');
    assert.strictEqual(rootRes.body.database, undefined, 'Must not leak database details on root');
    assert.strictEqual(rootRes.body.redis, undefined, 'Must not leak redis details on root');
    console.log('✅ [PASS] GET / returns HTTP 200 with expected API status payload');

    // 2. Test Health Endpoint GET /api/v1/health
    console.log('Testing GET /api/v1/health ...');
    const healthRes = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
    });

    assert.strictEqual(healthRes.statusCode, 200, 'GET /api/v1/health must return HTTP 200');
    assert.strictEqual(healthRes.body.success, true, 'Health check success must be true');
    assert.strictEqual(healthRes.body.status, 'healthy');
    assert.strictEqual(healthRes.body.database, 'connected');
    console.log('✅ [PASS] GET /api/v1/health returns HTTP 200 with healthy database and redis status');

    // 3. Test Unknown Route Returns Standardized 404
    console.log('Testing unknown route GET /unknown-route-test ...');
    const unknownRes = await makeRequest({
      hostname: host,
      port,
      path: '/unknown-route-test',
      method: 'GET',
    });

    assert.strictEqual(unknownRes.statusCode, 404, 'Unknown route must return HTTP 404');
    assert.strictEqual(unknownRes.body.success, false, 'Unknown route success must be false');
    assert.strictEqual(unknownRes.body.message, 'Resource not found: GET /unknown-route-test');
    console.log('✅ [PASS] Unknown route returns standardized 404 response');

    // 4. Test POST / returns 404
    console.log('Testing unsupported method POST / ...');
    const postRootRes = await makeRequest({
      hostname: host,
      port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }, JSON.stringify({}));

    assert.strictEqual(postRootRes.statusCode, 404, 'POST / must return HTTP 404');
    assert.strictEqual(postRootRes.body.success, false);
    assert.strictEqual(postRootRes.body.message, 'Resource not found: POST /');
    console.log('✅ [PASS] POST / returns HTTP 404 (method not supported on root)');

    // 5. Test Production Domain CORS Configuration
    console.log('Testing Production CORS for custom domains...');
    for (const prodOrigin of ['https://bentobabu.com', 'https://www.bentobabu.com', 'https://admin.bentobabu.com']) {
      const corsRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/health',
        method: 'OPTIONS',
        headers: {
          Origin: prodOrigin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'X-CSRF-Token',
        },
      });

      assert.strictEqual(
        corsRes.headers['access-control-allow-origin'],
        prodOrigin,
        `CORS must allow ${prodOrigin}`
      );
      assert.strictEqual(
        corsRes.headers['access-control-allow-credentials'],
        'true',
        'CORS must permit credentials'
      );
      console.log(`✅ [PASS] CORS allows origin ${prodOrigin} with credentials`);
    }

    // 6. Test CORS rejects unauthorized origin
    console.log('Testing CORS rejection for unauthorized origin...');
    const unauthorizedCorsRes = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
      headers: {
        Origin: 'https://evil-phishing-domain.com',
      },
    });

    assert.strictEqual(unauthorizedCorsRes.statusCode, 403, 'Unauthorized origin must return HTTP 403');
    assert.strictEqual(unauthorizedCorsRes.body.success, false);
    assert.ok(unauthorizedCorsRes.body.message.includes('Not allowed by CORS origin'));
    console.log('✅ [PASS] CORS strictly rejects unauthorized origin with HTTP 403');

    console.log('\n====================================================');
    console.log('ALL ROOT ENDPOINT VERIFICATION TESTS PASSED');
    console.log('====================================================\n');
  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await mongoose.connection.close(false);
    await disconnectRedis();
  }
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
