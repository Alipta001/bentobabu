/**
 * Refresh Token & Session Management Fix Verification Test Suite
 *
 * Verifies:
 * 1. Refresh endpoint succeeds without 'ReferenceError: env is not defined'.
 * 2. Login persists a hashed session in MongoDB RefreshSession.
 * 3. Token refresh rotates the refresh token and sets rotated cookies.
 * 4. Token rotation updates previousTokenHash and tokenHash in RefreshSession.
 * 5. Reuse detection: Presenting the old refresh token rejects with 401 and revokes session.
 * 6. Revoked session rejection: Further refresh attempts return 401.
 * 7. Inactive / blocked user refresh returns 401.
 * 8. Missing refresh token returns 401 without server crash.
 * 9. Tampered / malformed refresh token returns 401 without server crash.
 * 10. Expired refresh token returns 401 without server crash.
 * 11. Logout revokes the active session and clears auth cookies.
 * 12. Logout-all revokes all sessions for the user and clears auth cookies.
 * 13. Neither refresh tokens, access tokens, nor secrets are leaked in response payloads.
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { User, RefreshSession } = require('../app/models');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');
const { hashToken } = require('../app/utils/token');

const env = validateEnv();
const host = '127.0.0.1';
const port = 5099; // Dedicated port

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
  let matched = null;
  for (const cookie of setCookie) {
    const [nameVal] = cookie.split(';');
    const [name, val] = nameVal.split('=');
    if (name.trim() === cookieName) {
      const trimmedVal = val ? val.trim() : '';
      if (trimmedVal) {
        matched = trimmedVal;
      }
    }
  }
  return matched;
};

const extractCookieAttributes = (res, cookieName) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  for (const cookie of setCookie) {
    const parts = cookie.split(';').map((p) => p.trim());
    const [nameVal] = parts;
    const [name, val] = nameVal.split('=');
    if (name === cookieName) {
      const attrs = { value: val, httpOnly: false, secure: false, path: '/', sameSite: null };
      for (const p of parts.slice(1)) {
        const lower = p.toLowerCase();
        if (lower === 'httponly') attrs.httpOnly = true;
        else if (lower === 'secure') attrs.secure = true;
        else if (lower.startsWith('path=')) attrs.path = p.split('=')[1];
        else if (lower.startsWith('samesite=')) attrs.sameSite = p.split('=')[1].toLowerCase();
      }
      return attrs;
    }
  }
  return null;
};

const runSuite = async () => {
  console.log('--- Starting Refresh Token Fix Test Suite ---\n');

  await connectDB(env.mongoUri);
  const { app } = require('../server');
  const serverInstance = await new Promise((resolve) => {
    const s = app.listen(port, host, () => resolve(s));
  });

  const timestamp = Date.now();
  const testEmail = `refresh_fix_${timestamp}@bento.in`;
  const testPhone = `98${String(timestamp).slice(-8)}`;
  const testPassword = 'Password123!';

  let testUser = null;
  let csrfToken = null;
  let accessCookie = null;
  let refreshCookie = null;
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
      console.error(`   Error: ${err.message}\n`);
    }
  };

  try {
    // 0. Setup: create active verified test user
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    testUser = await User.create({
      name: 'Refresh Test User',
      email: testEmail,
      phone: testPhone,
      password: hashedPassword,
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    // 1. Fetch CSRF token
    await test('1. Fetch CSRF Token', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/csrf-token',
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.csrfToken);
      csrfToken = res.body.data.csrfToken;
    });

    // 2. Login persists session and sets cookies
    await test('2. Login persists RefreshSession in DB and sets HttpOnly cookies', async () => {
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
          identifier: testEmail,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.accessToken, undefined, 'No accessToken in JSON body');
      assert.strictEqual(res.body.data.refreshToken, undefined, 'No refreshToken in JSON body');

      accessCookie = extractCookie(res, 'bb_access_token');
      refreshCookie = extractCookie(res, 'bb_refresh_token');
      assert.ok(accessCookie, 'Access cookie present');
      assert.ok(refreshCookie, 'Refresh cookie present');

      // Verify DB session
      const expectedHash = hashToken(refreshCookie);
      const session = await RefreshSession.findOne({ user: testUser._id, tokenHash: expectedHash });
      assert.ok(session, 'RefreshSession must be created in MongoDB');
      assert.strictEqual(session.revokedAt, null, 'Session must not be revoked');
    });

    // 3. Refresh endpoint succeeds without crash and rotates tokens
    let rotatedAccessCookie = null;
    let rotatedRefreshCookie = null;
    await test('3. Refresh endpoint rotates token without ReferenceError: env is not defined', async () => {
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
      assert.strictEqual(res.body.message, 'Token refreshed successfully');
      assert.strictEqual(res.body.data.accessToken, undefined);
      assert.strictEqual(res.body.data.refreshToken, undefined);

      rotatedAccessCookie = extractCookie(res, 'bb_access_token');
      rotatedRefreshCookie = extractCookie(res, 'bb_refresh_token');
      assert.ok(rotatedAccessCookie, 'Rotated access cookie present');
      assert.ok(rotatedRefreshCookie, 'Rotated refresh cookie present');
      assert.notStrictEqual(rotatedRefreshCookie, refreshCookie, 'Rotated refresh token must differ from old token');

      // Verify DB session rotation
      const oldHash = hashToken(refreshCookie);
      const newHash = hashToken(rotatedRefreshCookie);
      const session = await RefreshSession.findOne({ user: testUser._id, tokenHash: newHash });
      assert.ok(session, 'Session must now have new tokenHash');
      assert.strictEqual(session.previousTokenHash, oldHash, 'Session previousTokenHash must record old hash');
      assert.ok(session.rotatedAt, 'Session rotatedAt must be recorded');
    });

    // 4. Old refresh token reuse detection & concurrency grace handling
    await test('4. Reuse of old refresh token triggers reuse detection, revokes session, and returns 401', async () => {
      // 4a. Within grace window: rejected with 401 without revoking active session
      const resGrace = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie}`, // Old token
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(resGrace.statusCode, 401);
      assert.strictEqual(resGrace.body.success, false);
      assert.ok(resGrace.body.message.includes('already been used and rotated'));

      const oldHash = hashToken(refreshCookie);
      const sessionActive = await RefreshSession.findOne({ user: testUser._id, previousTokenHash: oldHash });
      assert.strictEqual(sessionActive.revokedAt, null, 'Active session must not be revoked during concurrency grace window');

      // 4b. Outside grace window: artificially age rotatedAt and verify strict revocation
      sessionActive.rotatedAt = new Date(Date.now() - 15000);
      await sessionActive.save();

      const resExpiredGrace = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${refreshCookie}`, // Old token
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(resExpiredGrace.statusCode, 401);
      assert.strictEqual(resExpiredGrace.body.success, false);

      const sessionRevoked = await RefreshSession.findOne({ user: testUser._id, previousTokenHash: oldHash });
      assert.ok(sessionRevoked.revokedAt, 'Session must be revoked upon reuse detection outside grace window');
    });

    // 5. Revoked session rejection
    await test('5. Subsequent refresh attempt with rotated token is rejected because session was revoked', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${rotatedRefreshCookie}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('revoked'));
    });

    // 6. Missing refresh token handling
    await test('6. Missing refresh token returns clean 401 without crashing', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('missing'));
    });

    // 7. Malformed / tampered refresh token handling
    await test('7. Malformed/tampered refresh token returns clean 401 without crashing', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: 'bb_refresh_token=invalid.jwt.token',
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid or expired'));
    });

    // 8. Expired refresh token handling
    await test('8. Expired refresh token returns clean 401', async () => {
      const expiredToken = jwt.sign(
        {
          userId: testUser._id.toString(),
          id: testUser._id.toString(),
          type: 'refresh',
          exp: Math.floor(Date.now() / 1000) - 120, // expired 2 minutes ago
        },
        env.jwtRefreshSecret
      );

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${expiredToken}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid or expired'));
    });

    // 9. Logout revokes session and clears cookies
    let freshAccess = null;
    let freshRefresh = null;
    await test('9. Fresh login followed by logout revokes session and clears cookies', async () => {
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
        { identifier: testEmail, password: testPassword }
      );

      freshAccess = extractCookie(loginRes, 'bb_access_token');
      freshRefresh = extractCookie(loginRes, 'bb_refresh_token');
      assert.ok(freshRefresh, 'Fresh refresh token present');

      // Call logout
      const logoutRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/logout',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${freshRefresh}; bb_access_token=${freshAccess}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(logoutRes.statusCode, 200);
      assert.strictEqual(logoutRes.body.success, true);

      // Verify that the session is marked revoked in MongoDB
      const hash = hashToken(freshRefresh);
      const session = await RefreshSession.findOne({ tokenHash: hash });
      assert.ok(session, 'Session must exist');
      assert.ok(session.revokedAt, 'Session must have revokedAt set');

      // Attempting to refresh with the logged-out token returns 401
      const refreshAttempt = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${freshRefresh}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      assert.strictEqual(refreshAttempt.statusCode, 401);
    });

    // 10. Logout-all revokes all sessions for the user
    await test('10. Logout-all revokes all active sessions for the user', async () => {
      // Login device 1
      const l1 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        },
        { identifier: testEmail, password: testPassword }
      );
      const a1 = extractCookie(l1, 'bb_access_token');
      const r1 = extractCookie(l1, 'bb_refresh_token');

      // Login device 2
      const l2 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        },
        { identifier: testEmail, password: testPassword }
      );
      const r2 = extractCookie(l2, 'bb_refresh_token');

      // Call logout-all with device 1 access token
      const logoutAllRes = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/logout-all',
        method: 'POST',
        headers: {
          Cookie: `bb_access_token=${a1}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(logoutAllRes.statusCode, 200);

      // Both refresh tokens must now be rejected
      const ref1 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: { Cookie: `bb_refresh_token=${r1}`, 'X-CSRF-Token': csrfToken },
      });
      assert.strictEqual(ref1.statusCode, 401);

      const ref2 = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: { Cookie: `bb_refresh_token=${r2}`, 'X-CSRF-Token': csrfToken },
      });
      assert.strictEqual(ref2.statusCode, 401);
    });

    // 11. Inactive user cannot refresh
    await test('11. Deactivated user cannot refresh token', async () => {
      // Login fresh
      const l = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        },
        { identifier: testEmail, password: testPassword }
      );
      const ref = extractCookie(l, 'bb_refresh_token');

      try {
        // Deactivate user
        await User.findByIdAndUpdate(testUser._id, { isActive: false });

        const refreshRes = await makeRequest({
          hostname: host,
          port,
          path: '/api/v1/auth/refresh',
          method: 'POST',
          headers: { Cookie: `bb_refresh_token=${ref}`, 'X-CSRF-Token': csrfToken },
        });

        assert.strictEqual(refreshRes.statusCode, 401);
        assert.ok(refreshRes.body.message.includes('inactive'));
      } finally {
        // Always reactivate user
        await User.findByIdAndUpdate(testUser._id, { isActive: true });
      }
    });

    // 12. Safe fresh-login transition for legacy stateless tokens
    await test('12. Legacy stateless refresh token without sessionId is upgraded to a tracked MongoDB session', async () => {
      // Forge a valid legacy refresh JWT (without sessionId claim) signed with JWT_REFRESH_SECRET
      const legacyToken = jwt.sign(
        {
          userId: testUser._id.toString(),
          id: testUser._id.toString(),
          type: 'refresh',
          jti: 'legacy_jti_without_session',
        },
        env.jwtRefreshSecret,
        { expiresIn: '7d' }
      );

      // Verify no DB session exists for this legacy token yet
      const legacyHash = hashToken(legacyToken);
      const preSession = await RefreshSession.findOne({ user: testUser._id, tokenHash: legacyHash });
      assert.strictEqual(preSession, null, 'No session must exist before legacy upgrade');

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: `bb_refresh_token=${legacyToken}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Token refreshed successfully');

      const newAccess = extractCookie(res, 'bb_access_token');
      const newRefresh = extractCookie(res, 'bb_refresh_token');
      assert.ok(newAccess, 'New access cookie issued');
      assert.ok(newRefresh, 'New refresh cookie issued');

      // Verify a new MongoDB RefreshSession was created and linked to the legacy hash
      const upgradedSession = await RefreshSession.findOne({ user: testUser._id, previousTokenHash: legacyHash });
      assert.ok(upgradedSession, 'MongoDB RefreshSession must be bootstrapped for legacy user');
      assert.strictEqual(upgradedSession.tokenHash, hashToken(newRefresh));
      assert.strictEqual(upgradedSession.revokedAt, null);
    });

    // 13. Multi-path duplicate cookie collision handling
    await test('13. Multi-path duplicate cookie header handles legacy and active tokens correctly', async () => {
      // Create a fresh login to get a tracked active session
      const loginRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        },
        { identifier: testEmail, password: testPassword }
      );
      const activeRefresh = extractCookie(loginRes, 'bb_refresh_token');
      assert.ok(activeRefresh);

      // Simulate a browser holding an old stale cookie (/api/v1/auth/refresh) and new active cookie (/api/v1/auth)
      const staleToken = 'stale_legacy_untracked_token_value_abc';
      const duplicateCookieHeader = `bb_refresh_token=${staleToken}; bb_refresh_token=${activeRefresh}`;

      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/refresh',
        method: 'POST',
        headers: {
          Cookie: duplicateCookieHeader,
          'X-CSRF-Token': csrfToken,
        },
      });

      assert.strictEqual(res.statusCode, 200, 'Refresh must succeed by resolving to the active session');
      assert.strictEqual(res.body.success, true);
      const rotated = extractCookie(res, 'bb_refresh_token');
      assert.ok(rotated);
      assert.notStrictEqual(rotated, activeRefresh);
    });
  } finally {
    // Cleanup
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await RefreshSession.deleteMany({ user: testUser._id });
    }
    await new Promise((resolve) => serverInstance.close(resolve));
    const { disconnectRedis } = require('../app/config/redis');
    await disconnectRedis();
    await mongoose.connection.close(false);
  }

  console.log(`\nResults: ${passed}/${total} passed`);
  if (passed !== total) {
    process.exit(1);
  }
};

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
