/**
 * Comprehensive Phase 1 Test Suite
 * Verifies:
 * 1. Server starts and connects to MongoDB
 * 2. Database connection status
 * 3. Invalid database credentials handled safely (no leak)
 * 4. Missing required environment variables prevent production startup
 * 5. Allowed CORS origins work
 * 6. Untrusted origins are rejected
 * 7. Rate limiting works
 * 8. Malformed JSON returns 400
 * 9. Unknown routes return 404
 * 10. Health-check endpoint works
 * 11. Graceful shutdown works
 */

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bentobabu';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');

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
  console.log('   BENTO BABU BACKEND - PHASE 1 VERIFICATION SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  const test = async (name, fn) => {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Reason: ${err.message}\n`);
    }
  };

  // Test 4: Missing required environment variables prevent production startup
  await test('Missing required environment variables prevent production startup', () => {
    const origEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_URI;

    let threw = false;
    try {
      validateEnv();
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('Production startup aborted'));
      assert.ok(err.message.includes('MONGODB_URI'));
    } finally {
      process.env = origEnv;
      process.env.NODE_ENV = 'test';
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bentobabu';
    }
    assert.strictEqual(threw, true, 'Should have thrown error on missing production env vars');
  });

  // Test 3: Invalid database credentials / host handled safely without credential leaks
  await test('Invalid database credentials handled safely without leaking credentials', async () => {
    const secretUri = 'mongodb://secret_user:super_secret_pw@127.0.0.1:27999/bentobabu?connectTimeoutMS=1000';
    let failed = false;
    try {
      await connectDB(secretUri);
    } catch (err) {
      failed = true;
      assert.strictEqual(err.message.includes('super_secret_pw'), false, 'Password leaked in error message');
    }
    assert.strictEqual(failed, true, 'Connection to invalid port should fail');
  });

  // Start the actual server
  const { app, startServer } = require('../server');
  let serverInstance = null;

  // Test 1 & 2: Server starts successfully and connects to MongoDB
  await test('Server starts successfully and MongoDB connects', async () => {
    serverInstance = await startServer(0);
    assert.ok(serverInstance, 'Server instance should be returned');
    assert.strictEqual(mongoose.connection.readyState, 1, 'MongoDB connection readyState should be 1 (connected)');
  });

  const port = serverInstance.address().port;
  const host = '127.0.0.1';

  // Test: Root endpoint works
  await test('GET / returns 200 with BentoBabu API status response', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/',
      method: 'GET',
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'BentoBabu API is running');
    assert.ok(res.body.version === '1.0.0' || res.body.version === '1.1.0');
    assert.strictEqual(res.body.health, '/api/v1/health');
  });

  // Test 10: Health check endpoint works
  await test('GET /api/v1/health returns healthy status and DB connected', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.database, 'connected');
    assert.ok(res.body.environment === 'test' || res.body.environment === 'development');
    assert.ok(res.body.timestamp);
  });

  // Test 5: Allowed CORS origins work
  await test('Allowed CORS origins (http://localhost:3000) are permitted with credentials', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
  });

  // Test 6: Untrusted origins are rejected
  await test('Untrusted CORS origins (http://malicious-site.com) are rejected with 403', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
      headers: {
        Origin: 'http://malicious-site.com',
      },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Not allowed by CORS'));
  });

  // Test 8: Malformed JSON returns proper 400 error
  await test('Malformed JSON request body returns 400 Bad Request', async () => {
    const res = await makeRequest(
      {
        hostname: host,
        port,
        path: '/api/v1/health',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      '{ invalid_json: '
    );

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.message, 'Malformed JSON in request body');
  });

  // Test 9: Unknown routes return 404
  await test('Unknown route returns 404 Not Found', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/unknown-endpoint-test',
      method: 'GET',
    });

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Resource not found'));
  });

  // Test 7: Rate limiting headers and functionality
  await test('Rate limiting headers are present on responses', async () => {
    const res = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/health',
      method: 'GET',
    });

    const rateLimitHeader = res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'];
    assert.ok(rateLimitHeader, 'Rate limit header should be present');
  });

  // Test 11: Graceful shutdown works
  await test('Graceful shutdown closes HTTP server and MongoDB connection cleanly', async () => {
    await new Promise((resolve) => {
      serverInstance.close(async () => {
        await mongoose.connection.close(false);
        assert.strictEqual(mongoose.connection.readyState, 0, 'MongoDB connection should be disconnected (0)');
        resolve();
      });
    });
  });

  console.log('\n====================================================');
  console.log(`Test Execution Summary: ${passed}/${total} passed`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
  const { disconnectRedis } = require('../app/config/redis');
  await disconnectRedis();
  process.exit(0);
};

runTests().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});
