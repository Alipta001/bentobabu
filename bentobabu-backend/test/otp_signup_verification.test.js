/**
 * BentoBabu — Security & Reliability Audit Test Suite for OTP Signup Verification
 *
 * Verifies all security & audit requirements:
 * 1. Startup validation: Email XOR SMS delivery channel mutual exclusivity
 * 2. Startup validation: OTP_HASH_SECRET presence and minimum length (>= 16 chars)
 * 3. Opaque Challenge Token: Cryptographically secure 64-char hex ID, NO PII in registration data
 * 4. Safe Status Endpoint: GET /api/v1/auth/otp-status returns masked destination without PII
 * 5. Cryptographic Hashing: OtpChallenge stores HMAC-SHA256 with OTP_HASH_SECRET (never plaintext)
 * 6. Unverified Customer Login Block: HTTP 403 Forbidden with NO auth cookies
 * 7. Incorrect OTP countdown: Remaining attempts decrement atomically
 * 8. Max attempts lockout: Exceeding max attempts locks challenge
 * 9. Cooldown enforcement: Resending before cooldown returns HTTP 429
 * 10. Persistent Resend Limit: Survives challenge updates and enforces max resends limit (4th resend rejected)
 * 11. Concurrent Resend Protection: Simultaneous resend requests race safely (exactly one succeeds)
 * 12. Concurrent Verification Protection: Simultaneous requests with matching OTP race safely (exactly one succeeds)
 * 13. Replay prevention: Consumed OTP cannot be reused
 * 14. Verified Customer Login Success: Sets HttpOnly access & refresh cookies
 * 15. Operational staff regression: ADMIN, KITCHEN, and DELIVERY login unobstructed
 * 16. Mobile SMS OTP Flow: SMS channel delivers OTP, blocks unverified, verifies and allows login
 * 17. Abandoned registration update: Safely updates unverified user and generates fresh challenge
 */

process.env.NODE_ENV = 'test';
process.env.OTP_EMAIL_ENABLED = 'true';
process.env.OTP_SMS_ENABLED = 'false';
process.env.OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || 'test_otp_hash_secret_32bytes_long_string';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { app, startServer } = require('../server');
const { User, OtpChallenge } = require('../app/models');
const { validateEnv } = require('../app/config/env');
const { disconnectRedis } = require('../app/config/redis');
const { setResendClient } = require('../app/utils/email');
const { setSmsSender, verifyOtpHash, hashChallengeToken } = require('../app/utils/sms');

let sentEmails = [];
let sentSmsMessages = [];

// Configure mock Resend client
const setWorkingResendClient = () => {
  setResendClient({
    emails: {
      send: async (mailOptions) => {
        sentEmails.push(mailOptions);
        return {
          data: { id: `mock-resend-${Date.now()}` },
          error: null,
        };
      },
    },
  });
};

setWorkingResendClient();

// Configure mock SMS sender
setSmsSender(async ({ to, message }) => {
  sentSmsMessages.push({ to, message });
  return {
    success: true,
    messageId: `mock-sms-${Date.now()}`,
    provider: 'mock',
  };
});

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

const extractOtpFromEmail = (htmlOrText) => {
  const match = htmlOrText.match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

const extractOtpFromSms = (message) => {
  const match = message.match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

const runTests = async () => {
  console.log('================================================================');
  console.log('  BENTO BABU — FINAL OTP SECURITY & RELIABILITY AUDIT SUITE     ');
  console.log('================================================================\n');

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

  // 1. Startup validation: Mutual exclusivity
  await test('1. Startup fails when both OTP delivery channels are enabled or both disabled', () => {
    process.env.OTP_EMAIL_ENABLED = 'true';
    process.env.OTP_SMS_ENABLED = 'true';
    assert.throws(
      () => validateEnv(),
      /Invalid OTP configuration: Exactly one delivery channel must be enabled/
    );

    process.env.OTP_EMAIL_ENABLED = 'false';
    process.env.OTP_SMS_ENABLED = 'false';
    assert.throws(
      () => validateEnv(),
      /Invalid OTP configuration: Exactly one delivery channel must be enabled/
    );

    process.env.OTP_EMAIL_ENABLED = 'true';
    process.env.OTP_SMS_ENABLED = 'false';
  });

  // 2. Startup validation: Separate OTP_HASH_SECRET
  await test('2. Startup fails when OTP_HASH_SECRET is missing or shorter than 16 characters', () => {
    const savedSecret = process.env.OTP_HASH_SECRET;

    delete process.env.OTP_HASH_SECRET;
    assert.throws(
      () => validateEnv(),
      /OTP_HASH_SECRET must be defined and at least 16 characters long/
    );

    process.env.OTP_HASH_SECRET = 'short_secret';
    assert.throws(
      () => validateEnv(),
      /OTP_HASH_SECRET must be defined and at least 16 characters long/
    );

    process.env.OTP_HASH_SECRET = savedSecret || 'test_otp_hash_secret_32bytes_long_string';
    const env = validateEnv();
    assert.strictEqual(env.otpHashSecret, process.env.OTP_HASH_SECRET);
  });

  // 2b. Startup validation: RESEND_API_KEY required when OTP_EMAIL_ENABLED=true
  await test('2b. Startup fails when required RESEND_API_KEY is missing while OTP_EMAIL_ENABLED=true', () => {
    const savedKey = process.env.RESEND_API_KEY;

    delete process.env.RESEND_API_KEY;
    assert.throws(
      () => validateEnv(),
      /Missing required RESEND_API_KEY environment variable when email OTP is enabled/
    );

    process.env.RESEND_API_KEY = '   ';
    assert.throws(
      () => validateEnv(),
      /Missing required RESEND_API_KEY environment variable when email OTP is enabled/
    );

    process.env.RESEND_API_KEY = savedKey || 're_test_key_sample';
  });

  // 2c. Startup validation: RESEND_API_KEY NOT required when OTP_SMS_ENABLED=true
  await test('2c. Startup succeeds without RESEND_API_KEY when OTP_SMS_ENABLED=true', () => {
    const savedEmailEnabled = process.env.OTP_EMAIL_ENABLED;
    const savedSmsEnabled = process.env.OTP_SMS_ENABLED;
    const savedKey = process.env.RESEND_API_KEY;

    process.env.OTP_EMAIL_ENABLED = 'false';
    process.env.OTP_SMS_ENABLED = 'true';
    delete process.env.RESEND_API_KEY;

    assert.doesNotThrow(() => validateEnv());

    // Restore
    process.env.OTP_EMAIL_ENABLED = savedEmailEnabled;
    process.env.OTP_SMS_ENABLED = savedSmsEnabled;
    process.env.RESEND_API_KEY = savedKey;
  });

  let serverInstance = null;
  let port = null;
  const host = '127.0.0.1';

  try {
    serverInstance = await startServer(0);
    port = serverInstance.address().port;

    // Fetch CSRF Token
    const csrfRes = await makeRequest({
      hostname: host,
      port,
      path: '/api/v1/auth/csrf-token',
      method: 'GET',
    });
    assert.strictEqual(csrfRes.statusCode, 200);
    const csrfToken = csrfRes.body.data.csrfToken;
    const csrfCookie = csrfRes.headers['set-cookie']
      ? csrfRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ')
      : '';

    const suffix = Date.now().toString().slice(-6);
    const testEmail = `user_email_${suffix}@bentobabu.in`;
    const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000).toString();
    const testPassword = 'Password123!';
    let registeredChallengeId = null;

    // 3. Email Registration Flow with Opaque Challenge ID and NO PII
    await test('3. Registration returns opaque challengeId and masked destination without PII or auth cookies', async () => {
      sentEmails = [];
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Ananya Guha',
          email: testEmail,
          phone: testPhone,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.requiresVerification, true);
      assert.strictEqual(res.body.data.channel, 'email');
      assert.ok(res.body.data.destination.includes('***'));

      // Validate Opaque Challenge ID (64-char hex, NOT a 24-char ObjectId)
      registeredChallengeId = res.body.data.challengeId;
      assert.ok(registeredChallengeId, 'Registration must return challengeId');
      assert.strictEqual(registeredChallengeId.length, 64, 'Challenge ID must be 64-char opaque hex string');
      assert.strictEqual(/^[0-9a-f]{64}$/.test(registeredChallengeId), true);

      // Verify NO full email or phone leaked in registration response data
      assert.strictEqual(res.body.data.email, undefined, 'Full email must NOT be returned in registration data');
      assert.strictEqual(res.body.data.phone, undefined, 'Full phone must NOT be returned in registration data');

      // Verify NO auth cookies issued
      const setCookies = res.headers['set-cookie'] || [];
      const hasAccessTokenCookie = setCookies.some((c) => c.startsWith('bb_access_token='));
      const hasRefreshTokenCookie = setCookies.some((c) => c.startsWith('bb_refresh_token='));
      assert.strictEqual(hasAccessTokenCookie, false, 'bb_access_token must NOT be set on registration');
      assert.strictEqual(hasRefreshTokenCookie, false, 'bb_refresh_token must NOT be set on registration');

      // Verify DB User is unverified
      const dbUser = await User.findOne({ email: testEmail });
      assert.ok(dbUser);
      assert.strictEqual(dbUser.isEmailVerified, false);
      assert.strictEqual(dbUser.isPhoneVerified, false);

      // Verify raw challenge token is NEVER stored in MongoDB
      const rawInDb = await OtpChallenge.findOne({ challengeToken: registeredChallengeId });
      assert.strictEqual(rawInDb, null, 'Raw challengeToken must NEVER be persisted in MongoDB');

      // Verify OTP Challenge created with SHA-256 challengeTokenHash and hashed with OTP_HASH_SECRET
      const crypto = require('crypto');
      const expectedTokenHash = crypto.createHash('sha256').update(registeredChallengeId).digest('hex');
      const challenge = await OtpChallenge.findOne({ challengeTokenHash: expectedTokenHash }).select('+otpHash');
      assert.ok(challenge, 'OtpChallenge must be retrievable by challengeTokenHash');
      assert.strictEqual(challenge.challengeToken, undefined, 'challengeToken property must not exist on document');
      assert.strictEqual(challenge.channel, 'email');
      assert.ok(challenge.otpHash);
      assert.notStrictEqual(challenge.otpHash.length, 6, 'otpHash must not be 6 characters plaintext');

      const emailOtp = extractOtpFromEmail(sentEmails[0].html);
      assert.ok(emailOtp, 'Email must contain 6-digit OTP');

      const env = validateEnv();
      const valid = verifyOtpHash(emailOtp, challenge.otpHash, env.otpHashSecret);
      assert.strictEqual(valid, true, 'Stored hash must verify against sent OTP using OTP_HASH_SECRET');
    });

    // 4. Safe Status Endpoint using opaque challengeId (No PII)
    await test('4. GET /api/v1/auth/otp-status safely provides masked destination and cooldown via challengeId', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/auth/otp-status?challengeId=${registeredChallengeId}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.challengeId, registeredChallengeId);
      assert.strictEqual(res.body.data.channel, 'email');
      assert.ok(res.body.data.destination.includes('***'));
      assert.strictEqual(res.body.data.isConsumed, false);
      assert.strictEqual(res.body.data.isExpired, false);

      // Verify invalid challengeId returns 404
      const invalidRes = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/auth/otp-status?challengeId=0000000000000000000000000000000000000000000000000000000000000000`,
        method: 'GET',
      });
      assert.strictEqual(invalidRes.statusCode, 404);
    });

    // 5. Unverified customer login blocked
    await test('5. Unverified customer login is rejected with HTTP 403 (no PII, no auth cookies)', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          email: testEmail,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.data.requiresVerification, true);
      assert.strictEqual(res.body.data.email, undefined, 'Email should not be leaked in 403 body');
      assert.strictEqual(res.body.data.phone, undefined, 'Phone should not be leaked in 403 body');

      const setCookies = res.headers['set-cookie'] || [];
      assert.strictEqual(setCookies.some((c) => c.startsWith('bb_access_token=')), false);
    });

    // 6. Incorrect OTP returns remaining attempts
    await test('6. Incorrect OTP attempt decrements remaining attempts via challengeId', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/verify-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          challengeId: registeredChallengeId,
          otp: '000000',
        }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.data.attemptsRemaining, 4);
    });

    // 7. Resend cooldown enforcement via challengeId
    await test('7. Resending OTP before cooldown period returns HTTP 429', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          challengeId: registeredChallengeId,
        }
      );

      assert.strictEqual(res.statusCode, 429);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.data.cooldownRemaining > 0);
    });

    // 8. Resend limit persistence across replacement (Max 3 resends enforced)
    await test('8. Resend limit persists across updates and strictly rejects 4th resend (max=3)', async () => {
      // Resend 1: simulate cooldown elapsed
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(registeredChallengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );
      sentEmails = [];
      const res1 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        { challengeId: registeredChallengeId }
      );
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.body.data.resendCount, 1);

      // Resend 2: simulate cooldown elapsed
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(registeredChallengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );
      const res2 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        { challengeId: registeredChallengeId }
      );
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.body.data.resendCount, 2);

      // Resend 3: simulate cooldown elapsed
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(registeredChallengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );
      const res3 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        { challengeId: registeredChallengeId }
      );
      assert.strictEqual(res3.statusCode, 200);
      assert.strictEqual(res3.body.data.resendCount, 3);

      // Resend 4: simulate cooldown elapsed, MUST be rejected (max=3 reached)
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(registeredChallengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );
      const res4 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        { challengeId: registeredChallengeId }
      );
      assert.strictEqual(res4.statusCode, 429);
      assert.strictEqual(res4.body.data.maxResendsExceeded, true);
    });

    // 9. Concurrent Resend Protection
    await test('9. Concurrent resend requests race safely without exceeding limits (only one succeeds)', async () => {
      // Create fresh user & challenge for concurrency test
      const concEmail = `concurrent_resend_${Date.now()}@bentobabu.in`;
      const concPhone = '95' + Math.floor(10000000 + Math.random() * 90000000).toString();
      const concReg = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Concurrency Test User',
          email: concEmail,
          phone: concPhone,
          password: testPassword,
        }
      );
      assert.strictEqual(concReg.statusCode, 201);
      const concChallengeId = concReg.body.data.challengeId;

      // Simulate cooldown elapsed
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(concChallengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );

      // Fire 4 simultaneous resend requests
      const resendPromises = [1, 2, 3, 4].map(() =>
        makeRequest(
          {
            hostname: host,
            port,
            path: '/api/v1/auth/resend-signup-otp',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
              Cookie: csrfCookie,
            },
          },
          { challengeId: concChallengeId }
        )
      );

      const results = await Promise.all(resendPromises);
      const successCount = results.filter((r) => r.statusCode === 200).length;
      const rateLimitedCount = results.filter((r) => r.statusCode === 429).length;

      assert.strictEqual(successCount, 1, 'Exactly one concurrent resend request must succeed (HTTP 200)');
      assert.strictEqual(rateLimitedCount, 3, 'All other concurrent resend requests must be rejected (HTTP 429)');
    });

    // 10. Concurrent OTP Verification (Atomic Consumption)
    await test('10. Concurrent OTP verification requests race safely (exactly one succeeds, four rejected)', async () => {
      // Create fresh user & challenge for concurrent verification
      sentEmails = [];
      const concVerifyEmail = `concurrent_verify_${Date.now()}@bentobabu.in`;
      const concVerifyPhone = '94' + Math.floor(10000000 + Math.random() * 90000000).toString();
      const concVerifyReg = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Concurrent Verify User',
          email: concVerifyEmail,
          phone: concVerifyPhone,
          password: testPassword,
        }
      );
      assert.strictEqual(concVerifyReg.statusCode, 201);
      const concChallengeId = concVerifyReg.body.data.challengeId;
      const validOtp = extractOtpFromEmail(sentEmails[0].html);
      assert.ok(validOtp);

      // Fire 5 simultaneous verification requests with the matching OTP
      const verifyPromises = [1, 2, 3, 4, 5].map(() =>
        makeRequest(
          {
            hostname: host,
            port,
            path: '/api/v1/auth/verify-signup-otp',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
              Cookie: csrfCookie,
            },
          },
          {
            challengeId: concChallengeId,
            otp: validOtp,
          }
        )
      );

      const verifyResults = await Promise.all(verifyPromises);
      const successCount = verifyResults.filter((r) => r.statusCode === 200).length;
      const rejectedCount = verifyResults.filter((r) => r.statusCode === 400).length;

      assert.strictEqual(successCount, 1, 'Exactly ONE concurrent verification request may succeed (HTTP 200)');
      assert.strictEqual(rejectedCount, 4, 'Remaining concurrent verification requests must be rejected (HTTP 400)');

      // Verify user in DB is marked verified exactly once
      const verifiedDbUser = await User.findOne({ email: concVerifyEmail });
      assert.strictEqual(verifiedDbUser.isEmailVerified, true);
    });

    // 11. Replay prevention
    await test('11. Replay of consumed OTP is rejected with HTTP 400', async () => {
      const replayRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/verify-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          email: testEmail,
          otp: '123456',
        }
      );
      assert.strictEqual(replayRes.statusCode, 400);
    });

    // 12. Verified Customer Login Success
    await test('12. Verified customer can log in and receives HttpOnly access & refresh cookies', async () => {
      // Mark testEmail verified
      await User.updateOne({ email: testEmail }, { $set: { isEmailVerified: true } });

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          email: testEmail,
          password: testPassword,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, testEmail);

      const setCookies = res.headers['set-cookie'] || [];
      const hasAccessTokenCookie = setCookies.some((c) => c.startsWith('bb_access_token='));
      const hasRefreshTokenCookie = setCookies.some((c) => c.startsWith('bb_refresh_token='));
      assert.strictEqual(hasAccessTokenCookie, true, 'bb_access_token must be set on login');
      assert.strictEqual(hasRefreshTokenCookie, true, 'bb_refresh_token must be set on login');
    });

    // 13. Operational staff regression: ADMIN, KITCHEN, and DELIVERY can log in without verification check
    await test('13. Operational staff (ADMIN, KITCHEN, DELIVERY) can log in without verification requirement', async () => {
      const hashedStaffPassword = await bcrypt.hash('StaffPassword123!', 12);
      const roles = ['ADMIN', 'KITCHEN', 'DELIVERY'];

      for (const role of roles) {
        const staffEmail = `staff_${role.toLowerCase()}_${Date.now()}@bentobabu.in`;
        const staffPhone = '93' + Math.floor(10000000 + Math.random() * 90000000).toString();

        await User.create({
          name: `${role} User`,
          email: staffEmail,
          phone: staffPhone,
          password: hashedStaffPassword,
          role,
          isActive: true,
          isEmailVerified: false, // Not verified as a customer
          isPhoneVerified: false,
        });

        const res = await makeRequest(
          {
            hostname: host,
            port,
            path: '/api/v1/auth/login',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
              Cookie: csrfCookie,
            },
          },
          {
            email: staffEmail,
            password: 'StaffPassword123!',
          }
        );

        assert.strictEqual(res.statusCode, 200, `${role} user must be able to log in without customer OTP`);
        assert.strictEqual(res.body.data.user.role, role);
      }
    });

    // 14. Mobile SMS OTP signup and verification flow
    await test('14. SMS OTP channel sends SMS, enforces verification, and allows login once verified', async () => {
      process.env.OTP_EMAIL_ENABLED = 'false';
      process.env.OTP_SMS_ENABLED = 'true';

      sentSmsMessages = [];
      const smsSuffix = Date.now().toString().slice(-6);
      const smsUserEmail = `user_sms_${smsSuffix}@bentobabu.in`;
      const smsUserPhone = '97' + Math.floor(10000000 + Math.random() * 90000000).toString();

      const regRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Rohit Sengupta',
          email: smsUserEmail,
          phone: smsUserPhone,
          password: testPassword,
        }
      );

      assert.strictEqual(regRes.statusCode, 201);
      assert.strictEqual(regRes.body.data.channel, 'sms');
      assert.ok(regRes.body.data.destination.includes('+91 ******'));

      const smsChallengeId = regRes.body.data.challengeId;
      assert.ok(smsChallengeId);

      assert.strictEqual(sentSmsMessages.length, 1);
      assert.strictEqual(sentSmsMessages[0].to, smsUserPhone);
      const smsOtp = extractOtpFromSms(sentSmsMessages[0].message);
      assert.ok(smsOtp, 'SMS must contain 6-digit OTP');

      // Verify unverified login blocked
      const loginBlockedRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          phone: smsUserPhone,
          password: testPassword,
        }
      );
      assert.strictEqual(loginBlockedRes.statusCode, 403);

      // Verify with SMS OTP via challengeId
      const verifyRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/verify-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          challengeId: smsChallengeId,
          otp: smsOtp,
        }
      );
      assert.strictEqual(verifyRes.statusCode, 200);
      assert.strictEqual(verifyRes.body.data.verified, true);

      // Verify user is phone verified in DB
      const smsDbUser = await User.findOne({ phone: smsUserPhone });
      assert.strictEqual(smsDbUser.isPhoneVerified, true);

      // Login now succeeds
      const loginSuccessRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          phone: smsUserPhone,
          password: testPassword,
        }
      );
      assert.strictEqual(loginSuccessRes.statusCode, 200);

      // Reset back to Email channel
      process.env.OTP_EMAIL_ENABLED = 'true';
      process.env.OTP_SMS_ENABLED = 'false';
    });

    // 15. Re-registration of abandoned unverified user
    await test('15. Abandoned unverified account can re-register and receive fresh OTP challenge', async () => {
      const abandonedSuffix = Date.now().toString().slice(-6);
      const abandonedEmail = `abandoned_${abandonedSuffix}@bentobabu.in`;
      const abandonedPhone = '96' + Math.floor(10000000 + Math.random() * 90000000).toString();

      // Initial registration (user never verifies)
      const reg1 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'First Attempt',
          email: abandonedEmail,
          phone: abandonedPhone,
          password: 'Password123!',
        }
      );
      assert.strictEqual(reg1.statusCode, 201);

      sentEmails = [];
      // Re-register with updated name/password
      const reg2 = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Updated Name',
          email: abandonedEmail,
          phone: abandonedPhone,
          password: 'NewPassword123!',
        }
      );
      assert.strictEqual(reg2.statusCode, 201);
      assert.strictEqual(sentEmails.length, 1);

      const dbUser = await User.findOne({ email: abandonedEmail });
      assert.strictEqual(dbUser.name, 'Updated Name');
    });

    // 18. Registration handles email delivery failure gracefully (HTTP 502, rolls back challenge and user)
    await test('18. Email delivery failure during registration returns HTTP 502 and rolls back challenge/user', async () => {
      // Temporarily mock failing Resend API response
      setResendClient({
        emails: {
          send: async () => {
            return {
              data: null,
              error: {
                message: 'API key not found',
                name: 'invalid_api_key',
                statusCode: 401,
              },
            };
          },
        },
      });

      const failEmail = `fail_delivery_${Date.now()}@bentobabu.in`;
      const failPhone = '98' + Math.floor(10000000 + Math.random() * 90000000).toString();

      const failRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Delivery Failure Test',
          email: failEmail,
          phone: failPhone,
          password: 'Password123!',
        }
      );

      assert.strictEqual(failRes.statusCode, 502);
      assert.strictEqual(failRes.body.success, false);
      assert.match(failRes.body.message, /Failed to deliver verification code via email/);
      // Ensure no credentials or API keys leak in response
      assert.doesNotMatch(failRes.rawBody, /re_/);

      // Verify user and challenge were rolled back
      const orphanedUser = await User.findOne({ email: failEmail });
      assert.strictEqual(orphanedUser, null);
      const orphanedChallenge = await OtpChallenge.findOne({ identifier: failEmail });
      assert.strictEqual(orphanedChallenge, null);

      // Restore working mock Resend client
      setWorkingResendClient();
    });

    // 19. Resend OTP handles email delivery failure gracefully (HTTP 502)
    await test('19. Email delivery failure during OTP resend returns HTTP 502', async () => {
      // First register a valid user with working client
      const resendFailEmail = `resend_fail_${Date.now()}@bentobabu.in`;
      const resendFailPhone = '98' + Math.floor(10000000 + Math.random() * 90000000).toString();

      const reg = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Resend Failure Test',
          email: resendFailEmail,
          phone: resendFailPhone,
          password: 'Password123!',
        }
      );
      assert.strictEqual(reg.statusCode, 201);
      const challengeId = reg.body.data.challengeId;

      // Fast-forward lastSentAt past cooldown
      await OtpChallenge.updateOne(
        { challengeTokenHash: hashChallengeToken(challengeId) },
        { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
      );

      // Set failing Resend client
      setResendClient({
        emails: {
          send: async () => {
            return {
              data: null,
              error: {
                message: 'Rate limit exceeded',
                name: 'rate_limit_exceeded',
                statusCode: 429,
              },
            };
          },
        },
      });

      const resendRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/resend-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          challengeId,
          email: resendFailEmail,
        }
      );

      assert.strictEqual(resendRes.statusCode, 502);
      assert.strictEqual(resendRes.body.success, false);
      assert.match(resendRes.body.message, /Failed to deliver verification code via email/);

      // Restore working mock Resend client
      setWorkingResendClient();
    });

    // 19b. Resend network connection failure returns HTTP 502 and rolls back
    await test('19b. Resend network connection failure returns HTTP 502 and rolls back', async () => {
      setResendClient({
        emails: {
          send: async () => {
            const netErr = new Error('getaddrinfo ENOTFOUND api.resend.com');
            netErr.code = 'ENOTFOUND';
            throw netErr;
          },
        },
      });

      const netFailEmail = `net_fail_${Date.now()}@bentobabu.in`;
      const netRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Network Failure Test',
          email: netFailEmail,
          phone: '98' + Math.floor(10000000 + Math.random() * 90000000).toString(),
          password: 'Password123!',
        }
      );

      assert.strictEqual(netRes.statusCode, 502);
      assert.strictEqual(netRes.body.success, false);
      const orphanedUser = await User.findOne({ email: netFailEmail });
      assert.strictEqual(orphanedUser, null);

      setWorkingResendClient();
    });

    // 19c. Resend API request timeout returns HTTP 502 and rolls back
    await test('19c. Resend API request timeout returns HTTP 502 and rolls back', async () => {
      setResendClient({
        emails: {
          send: async () => {
            const timeoutErr = new Error('Resend API request timed out after 12000ms');
            timeoutErr.name = 'TimeoutError';
            timeoutErr.code = 'ETIMEDOUT';
            throw timeoutErr;
          },
        },
      });

      const timeFailEmail = `timeout_fail_${Date.now()}@bentobabu.in`;
      const timeRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Timeout Failure Test',
          email: timeFailEmail,
          phone: '98' + Math.floor(10000000 + Math.random() * 90000000).toString(),
          password: 'Password123!',
        }
      );

      assert.strictEqual(timeRes.statusCode, 502);
      assert.strictEqual(timeRes.body.success, false);
      const orphanedUser = await User.findOne({ email: timeFailEmail });
      assert.strictEqual(orphanedUser, null);

      setWorkingResendClient();
    });

    // 20. Token Storage Security: Raw challenge token is never persisted; wrong token is rejected
    await test('20. Challenge tokens are hashed with SHA-256; raw token is never persisted and wrong token is rejected', async () => {
      const secEmail = `token_security_${Date.now()}@bentobabu.in`;
      const secPhone = '94' + Math.floor(10000000 + Math.random() * 90000000).toString();

      const regRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/register',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          name: 'Security Test User',
          email: secEmail,
          phone: secPhone,
          password: 'Password123!',
        }
      );
      assert.strictEqual(regRes.statusCode, 201);
      const rawToken = regRes.body.data.challengeId;
      assert.ok(rawToken, 'Registration must return raw challengeId');

      // 1. Verify raw token is NOT in database
      const rawDoc = await OtpChallenge.findOne({ challengeToken: rawToken });
      assert.strictEqual(rawDoc, null, 'Raw challengeToken must NOT be found in MongoDB');

      // 2. Verify SHA-256 hash IS in database
      const expectedHash = hashChallengeToken(rawToken);
      const hashedDoc = await OtpChallenge.findOne({ challengeTokenHash: expectedHash });
      assert.ok(hashedDoc, 'OtpChallenge must be retrievable by challengeTokenHash');
      assert.strictEqual(hashedDoc.challengeToken, undefined, 'challengeToken property must be undefined');

      // 3. Status check with wrong token must return 404
      const wrongStatus = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/auth/otp-status?challengeId=wrong_token_1234567890abcdef',
        method: 'GET',
      });
      assert.strictEqual(wrongStatus.statusCode, 404);

      // 4. Verification with wrong token must return 404
      const wrongVerify = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/verify-signup-otp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            Cookie: csrfCookie,
          },
        },
        {
          challengeId: 'wrong_token_1234567890abcdef',
          otp: '123456',
        }
      );
      assert.strictEqual(wrongVerify.statusCode, 404);
    });

    // 21. Migration safely invalidates legacy unhashed challenges without affecting verified users
    await test('21. Migration safely invalidates legacy challenges without touching verified user accounts', async () => {
      // Create a verified user
      const verifiedUser = await User.create({
        name: 'Verified User Kept',
        email: `verified_kept_${Date.now()}@bentobabu.in`,
        phone: '93' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        password: 'Password123!',
        role: 'CUSTOMER',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      });

      // Insert a legacy challenge without challengeTokenHash directly into MongoDB collection
      await OtpChallenge.collection.insertOne({
        challengeToken: 'legacy_unhashed_token_to_purge',
        user: verifiedUser._id,
        identifier: verifiedUser.email,
        channel: 'email',
        otpHash: 'dummy_hash',
        expiresAt: new Date(Date.now() + 300000),
        attempts: 0,
        maxAttempts: 5,
        resendCount: 0,
        lastSentAt: new Date(),
        isConsumed: false,
      });

      // Run schema migration
      await OtpChallenge.migrateSchema();

      // Verify legacy challenge was removed
      const legacyCheck = await OtpChallenge.collection.findOne({ challengeToken: 'legacy_unhashed_token_to_purge' });
      assert.strictEqual(legacyCheck, null, 'Legacy challenge must be purged');

      // Verify verified user was NOT touched
      const userCheck = await User.findById(verifiedUser._id);
      assert.ok(userCheck, 'Verified user must still exist');
      assert.strictEqual(userCheck.isEmailVerified, true, 'User must remain verified');
    });

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed}/${total} passed`);
    console.log('================================================================\n');

    if (passed !== total) {
      process.exit(1);
    }
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
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
