/**
 * BentoBabu — MSG91 OTP Widget Verification Automated Test Suite
 *
 * Verifies all 12 required test scenarios:
 * 1. Successful token verification with MSG91 mock
 * 2. Invalid token rejection (HTTP 400)
 * 3. Expired token rejection
 * 4. MSG91 API timeout (handles gracefully, HTTP 504/502)
 * 5. MSG91 API unavailable (5xx response)
 * 6. Malformed JSON response from provider
 * 7. Missing backend Auth Key (HTTP 500, no secrets leaked)
 * 8. Mobile number mismatch (MSG91 verified number != customer registration number)
 * 9. Replayed token rejection (already consumed token)
 * 10. Email OTP verification continues to function normally
 * 11. Unverified mobile / account restrictions (HTTP 403)
 * 12. Existing customer login and session integrity
 */

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.OTP_EMAIL_ENABLED = 'true';
process.env.OTP_SMS_ENABLED = 'false';
process.env.OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || 'test_otp_hash_secret_32bytes_long_string';
process.env.MSG91_AUTH_KEY = 'test_msg91_secret_auth_key';
process.env.MSG91_WIDGET_ID = '366b746e3258343539303835';

const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { app } = require('../server');
const { User, OtpChallenge, RefreshSession } = require('../app/models');
const { setCustomVerifier, Msg91WidgetService } = require('../app/services/msg91WidgetService');
const { setResendClient } = require('../app/utils/email');

// Helper to execute requests directly through Express app in-process (sandboxed)
const makeMockRequest = ({ method, path, body = null, headers = {} }) => {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage({ on: () => {}, once: () => {}, emit: () => {} });
    req.method = method;
    req.url = path;
    req.originalUrl = path;
    req.ip = '127.0.0.1';
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };
    req.connection = { remoteAddress: '127.0.0.1' };
    req.headers = {
      host: 'localhost:4000',
      'content-type': 'application/json',
      ...headers,
    };
    req.body = body;

    let statusCode = 200;
    const resHeaders = {};

    const res = new http.ServerResponse(req);
    res.status = (code) => {
      statusCode = code;
      return res;
    };

    res.get = (k) => resHeaders[k.toLowerCase()];
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.getHeaders = () => resHeaders;

    res.setHeader = (k, v) => {
      resHeaders[k.toLowerCase()] = v;
    };

    res.set = (k, v) => {
      if (typeof k === 'object' && k !== null) {
        for (const [key, val] of Object.entries(k)) {
          resHeaders[key.toLowerCase()] = val;
        }
      } else if (typeof k === 'string') {
        resHeaders[k.toLowerCase()] = v;
      }
      return res;
    };

    res.append = (k, v) => {
      const key = k.toLowerCase();
      const prev = resHeaders[key];
      if (!prev) {
        resHeaders[key] = Array.isArray(v) ? v : [v];
      } else if (Array.isArray(prev)) {
        resHeaders[key] = prev.concat(v);
      } else {
        resHeaders[key] = [prev].concat(v);
      }
      return res;
    };

    res.cookie = (name, val, options = {}) => {
      const parts = [`${name}=${val}`];
      if (options.httpOnly) parts.push('HttpOnly');
      if (options.path) parts.push(`Path=${options.path}`);
      if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
      const cookieStr = parts.join('; ');
      res.append('Set-Cookie', cookieStr);
      return res;
    };

    res.clearCookie = (name, options = {}) => {
      res.cookie(name, '', { ...options, expires: new Date(0) });
      return res;
    };

    res.json = (data) => {
      resolve({ statusCode, headers: resHeaders, body: data });
    };

    res.end = (chunk) => {
      let parsed = chunk;
      try {
        if (typeof chunk === 'string') parsed = JSON.parse(chunk);
      } catch (e) {
        // ignore
      }
      resolve({ statusCode, headers: resHeaders, body: parsed });
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

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🚀 Starting BentoBabu MSG91 OTP Widget Verification Suite');
  console.log('======================================================\n');

  // Setup Mock Resend & Mock SMS Sender
  let sentEmails = [];
  setResendClient({
    emails: {
      send: async (mailOptions) => {
        sentEmails.push(mailOptions);
        return { data: { id: `mock-email-${Date.now()}` }, error: null };
      },
    },
  });

  const { setSmsSender } = require('../app/utils/sms');
  let sentSmsList = [];
  setSmsSender(async (smsOptions) => {
    sentSmsList.push(smsOptions);
    return { success: true, messageId: `mock-sms-${Date.now()}` };
  });

  // In-memory data store for tests
  const usersStore = [];
  const challengesStore = [];

  // Mock RefreshSession
  const origRefreshCreate = RefreshSession.create;
  RefreshSession.create = async () => ({ _id: new mongoose.Types.ObjectId() });

  // Mock User model methods
  const origUserFindOne = User.findOne;
  const origUserCreate = User.create;
  const origUserUpdateOne = User.updateOne;
  const origUserFindById = User.findById;

  User.findOne = (query) => {
    let matched = null;
    if (query.$or) {
      for (const cond of query.$or) {
        matched = usersStore.find((u) => {
          if (cond.email && u.email === cond.email) return true;
          if (cond.phone && u.phone === cond.phone) return true;
          return false;
        });
        if (matched) break;
      }
    } else if (query.phone) {
      matched = usersStore.find((u) => u.phone === query.phone);
    } else if (query.email) {
      matched = usersStore.find((u) => u.email === query.email);
    } else if (query._id) {
      matched = usersStore.find((u) => String(u._id) === String(query._id));
    }

    const doc = matched ? {
      ...matched,
      save: async function () {
        const idx = usersStore.findIndex((u) => String(u._id) === String(this._id));
        if (idx !== -1) usersStore[idx] = { ...usersStore[idx], ...this };
        return this;
      },
      toJSON: function () {
        const copy = { ...this };
        delete copy.password;
        return copy;
      },
    } : null;

    return {
      select: () => doc,
      then: (resolve) => resolve(doc),
      exec: async () => doc,
    };
  };

  User.findById = (id) => {
    const matched = usersStore.find((u) => String(u._id) === String(id));
    return Promise.resolve(matched ? {
      ...matched,
      save: async function () {
        const idx = usersStore.findIndex((u) => String(u._id) === String(this._id));
        if (idx !== -1) usersStore[idx] = { ...usersStore[idx], ...this };
        return this;
      },
      toJSON: function () {
        const copy = { ...this };
        delete copy.password;
        return copy;
      },
    } : null);
  };

  User.create = async (userData) => {
    const newDoc = {
      _id: new mongoose.Types.ObjectId(),
      role: 'CUSTOMER',
      isActive: true,
      isEmailVerified: false,
      isPhoneVerified: false,
      ...userData,
      save: async function () {
        const idx = usersStore.findIndex((u) => String(u._id) === String(this._id));
        if (idx !== -1) usersStore[idx] = { ...usersStore[idx], ...this };
        return this;
      },
      toJSON: function () {
        const copy = { ...this };
        delete copy.password;
        return copy;
      },
    };
    usersStore.push(newDoc);
    return newDoc;
  };

  User.updateOne = async (filter, update) => {
    let matched = null;
    if (filter._id) {
      matched = usersStore.find((u) => String(u._id) === String(filter._id));
    } else if (filter.phone) {
      matched = usersStore.find((u) => u.phone === filter.phone);
    }
    if (matched && update.$set) {
      Object.assign(matched, update.$set);
    }
    return { matchedCount: matched ? 1 : 0, modifiedCount: matched ? 1 : 0 };
  };

  User.deleteOne = async (filter) => {
    const idx = usersStore.findIndex((u) => String(u._id) === String(filter._id));
    if (idx !== -1) usersStore.splice(idx, 1);
    return { deletedCount: idx !== -1 ? 1 : 0 };
  };

  // Mock OtpChallenge model methods
  const origChallengeFindOne = OtpChallenge.findOne;
  const origChallengeCreate = OtpChallenge.create;
  const origChallengeFindOneAndUpdate = OtpChallenge.findOneAndUpdate;
  const origChallengeUpdateMany = OtpChallenge.updateMany;
  const origChallengeDeleteMany = OtpChallenge.deleteMany;

  OtpChallenge.deleteOne = async (filter) => {
    const idx = challengesStore.findIndex((c) => c.challengeTokenHash === filter.challengeTokenHash);
    if (idx !== -1) challengesStore.splice(idx, 1);
    return { deletedCount: idx !== -1 ? 1 : 0 };
  };

  OtpChallenge.create = async (challengeData) => {
    const doc = {
      _id: `challenge_${Date.now()}`,
      attempts: 0,
      resendCount: 0,
      isConsumed: false,
      createdAt: new Date(),
      ...challengeData,
    };
    challengesStore.push(doc);
    return doc;
  };

  OtpChallenge.findOne = (query) => {
    let matched = null;
    if (query.challengeTokenHash) {
      matched = challengesStore.find((c) => c.challengeTokenHash === query.challengeTokenHash);
    } else if (query.user) {
      matched = challengesStore.filter((c) => String(c.user) === String(query.user)).pop();
    }

    return {
      select: () => matched,
      sort: () => ({
        select: () => matched,
        then: (resolve) => resolve(matched),
      }),
      then: (resolve) => resolve(matched),
    };
  };

  OtpChallenge.findOneAndUpdate = (filter, update) => {
    const matched = challengesStore.find((c) => {
      if (filter._id && String(c._id) !== String(filter._id)) return false;
      if (filter.isConsumed !== undefined && c.isConsumed !== filter.isConsumed) return false;
      return true;
    });

    if (matched) {
      if (update.$inc && update.$inc.attempts) {
        matched.attempts = (matched.attempts || 0) + update.$inc.attempts;
      }
      if (update.$set) {
        Object.assign(matched, update.$set);
      }
    }

    return {
      select: () => matched,
      then: (resolve) => resolve(matched),
      exec: async () => matched,
    };
  };

  OtpChallenge.updateMany = async (filter, update) => {
    const list = challengesStore.filter((c) => {
      if (filter.user && String(c.user) !== String(filter.user)) return false;
      if (filter.isConsumed !== undefined && c.isConsumed !== filter.isConsumed) return false;
      return true;
    });
    for (const item of list) {
      if (update.$set) Object.assign(item, update.$set);
    }
    return { modifiedCount: list.length };
  };

  OtpChallenge.deleteMany = async () => {
    challengesStore.length = 0;
    return { deletedCount: 0 };
  };

  let passedCount = 0;
  const testNumber = () => ++passedCount;

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Successful token verification with MSG91 mock
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 1: Successful token verification with MSG91 mock`);
    setCustomVerifier(async ({ accessToken, expectedMobile }) => {
      return {
        type: 'success',
        message: `91${expectedMobile}`,
      };
    });

    const res1 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'valid_mock_jwt_access_token_scenario_1',
      },
    });

    assert.strictEqual(res1.statusCode, 200, `Expected 200, got ${res1.statusCode}: ${JSON.stringify(res1.body)}`);
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.data.verified, true);
    assert.strictEqual(res1.body.data.phone, '8584085669');
    console.log('  ✓ Successfully verified token with MSG91 mock and returned clean response');

    // -------------------------------------------------------------------------
    // Scenario 2: Invalid token rejection (HTTP 400)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 2: Invalid token rejection (HTTP 400)`);
    setCustomVerifier(async () => {
      const err = new Error('Invalid or unrecognized access token');
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    });

    const res2 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'invalid_malformed_token_xyz',
      },
    });

    assert.strictEqual(res2.statusCode, 400);
    assert.strictEqual(res2.body.success, false);
    assert.strictEqual(res2.body.code, 'INVALID_TOKEN');
    console.log('  ✓ Invalid token properly rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // Scenario 3: Expired token rejection (HTTP 400)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 3: Expired token rejection (HTTP 400)`);
    setCustomVerifier(async () => {
      const err = new Error('Verification token has expired');
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    });

    const res3 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'expired_token_scenario_3',
      },
    });

    assert.strictEqual(res3.statusCode, 400);
    assert.strictEqual(res3.body.success, false);
    console.log('  ✓ Expired token rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // Scenario 4: MSG91 API timeout (handles gracefully, HTTP 504)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 4: MSG91 API timeout (HTTP 504)`);
    setCustomVerifier(async () => {
      const err = new Error('SMS verification service timed out.');
      err.code = 'TIMEOUT';
      err.statusCode = 504;
      throw err;
    });

    const res4 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'timeout_token_scenario_4',
      },
    });

    assert.strictEqual(res4.statusCode, 504);
    assert.strictEqual(res4.body.success, false);
    assert.strictEqual(res4.body.code, 'TIMEOUT');
    console.log('  ✓ Upstream provider timeout handled with HTTP 504');

    // -------------------------------------------------------------------------
    // Scenario 5: MSG91 API unavailable (5xx response -> HTTP 502)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 5: MSG91 API unavailable (HTTP 502)`);
    setCustomVerifier(async () => {
      const err = new Error('SMS verification service is temporarily unavailable. Please try again.');
      err.code = 'PROVIDER_ERROR';
      err.statusCode = 502;
      throw err;
    });

    const res5 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'server_error_token_scenario_5',
      },
    });

    assert.strictEqual(res5.statusCode, 502);
    assert.strictEqual(res5.body.success, false);
    assert.strictEqual(res5.body.code, 'PROVIDER_ERROR');
    console.log('  ✓ Provider 5xx error mapped safely to HTTP 502');

    // -------------------------------------------------------------------------
    // Scenario 6: Malformed JSON response from provider (HTTP 502)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 6: Malformed JSON response from provider`);
    setCustomVerifier(async () => {
      const err = new Error('Received malformed response from SMS verification service.');
      err.code = 'MALFORMED_RESPONSE';
      err.statusCode = 502;
      throw err;
    });

    const res6 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'malformed_json_token_scenario_6',
      },
    });

    assert.strictEqual(res6.statusCode, 502);
    assert.strictEqual(res6.body.success, false);
    assert.strictEqual(res6.body.code, 'MALFORMED_RESPONSE');
    console.log('  ✓ Malformed provider response handled safely with HTTP 502');

    // -------------------------------------------------------------------------
    // Scenario 7: Missing backend Auth Key (HTTP 500, no secrets leaked)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 7: Missing backend Auth Key (HTTP 500, no secrets leaked)`);
    setCustomVerifier(null); // Remove mock to test real service validation
    const originalAuthKey = process.env.MSG91_AUTH_KEY;
    delete process.env.MSG91_AUTH_KEY;

    const res7 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: 'any_valid_looking_token_12345678',
      },
    });

    assert.strictEqual(res7.statusCode, 500);
    assert.strictEqual(res7.body.success, false);
    assert.strictEqual(res7.body.code, 'CONFIG_MISSING');
    assert.ok(!JSON.stringify(res7.body).includes('secret'), 'Must not leak secret names or keys');
    process.env.MSG91_AUTH_KEY = originalAuthKey;
    console.log('  ✓ Missing auth key returns HTTP 500 with safe message and zero leaked secrets');

    // -------------------------------------------------------------------------
    // Scenario 8: Mobile number mismatch (MSG91 verified number != customer registration number)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 8: Mobile number mismatch`);
    setCustomVerifier(async () => {
      return {
        type: 'success',
        message: '919876543210', // Different number!
      };
    });

    const res8 = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669', // Expected number
        accessToken: 'token_for_different_phone_scenario_8',
      },
    });

    assert.strictEqual(res8.statusCode, 400);
    assert.strictEqual(res8.body.success, false);
    assert.strictEqual(res8.body.code, 'MOBILE_MISMATCH');
    console.log('  ✓ Token binding mismatch correctly rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // Scenario 9: Replayed token rejection (already consumed token)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 9: Replayed token rejection`);
    setCustomVerifier(async ({ expectedMobile }) => {
      return {
        type: 'success',
        message: `91${expectedMobile}`,
      };
    });

    const replayToken = 'unique_replay_test_token_scenario_9_abcdef12345';
    // First verification succeeds
    const firstAttempt = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: replayToken,
      },
    });
    assert.strictEqual(firstAttempt.statusCode, 200);

    // Second verification with identical token must fail
    const replayAttempt = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: '8584085669',
        accessToken: replayToken,
      },
    });
    assert.strictEqual(replayAttempt.statusCode, 400);
    assert.strictEqual(replayAttempt.body.success, false);
    assert.strictEqual(replayAttempt.body.code, 'TOKEN_ALREADY_USED');
    console.log('  ✓ Replay attempt blocked; consumed token cannot be reused');

    // -------------------------------------------------------------------------
    // Scenario 9b: Concurrent race condition duplicate token prevention
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 9b: Concurrent race condition duplicate token prevention`);
    const concurrentToken = `concurrent_race_test_token_${Date.now()}_xyz12345`;
    const [raceRes1, raceRes2] = await Promise.all([
      makeMockRequest({
        method: 'POST',
        path: '/api/v1/auth/verify-mobile-widget',
        body: { mobile: '8584085669', accessToken: concurrentToken },
      }),
      makeMockRequest({
        method: 'POST',
        path: '/api/v1/auth/verify-mobile-widget',
        body: { mobile: '8584085669', accessToken: concurrentToken },
      }),
    ]);

    const statuses = [raceRes1.statusCode, raceRes2.statusCode].sort();
    assert.deepStrictEqual(statuses, [200, 400], 'Exactly one concurrent request must succeed and one must be rejected');
    console.log('  ✓ Concurrent requests race safely: exactly one succeeded (200) and one failed (400)');

    // -------------------------------------------------------------------------
    // Scenario 9c: Registration pre-verification single-use consumption
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 9c: Registration pre-verification is single-use`);
    const preVerifiedPhone = '8584085660';
    // 1. Verify mobile
    setCustomVerifier(async () => ({ type: 'success', message: `91${preVerifiedPhone}` }));
    await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: { mobile: preVerifiedPhone, accessToken: `single_use_token_${Date.now()}` },
    });

    // 2. Consume in first registration
    const consumedFirst = await Msg91WidgetService.consumePhonePreVerification(preVerifiedPhone);
    assert.strictEqual(consumedFirst, true, 'First registration should consume pre-verification');

    // 3. Second check must return false
    const consumedSecond = await Msg91WidgetService.consumePhonePreVerification(preVerifiedPhone);
    assert.strictEqual(consumedSecond, false, 'Pre-verification must not be reusable after first consumption');
    console.log('  ✓ Pre-verification cannot be reused; single-use guarantee verified');

    // -------------------------------------------------------------------------
    // Scenario 10: Email OTP verification for MSG91 pre-verified mobile (No SMS dispatch)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 10: Verified MSG91 mobile does not trigger mock SMS and sends Email OTP`);
    const emailCustomer = `customer_${Date.now()}@test-msg91.com`;
    const verifiedCustomerPhone = '9876543211';

    // 1. Mobile verification via MSG91 widget
    setCustomVerifier(async () => ({ type: 'success', message: `91${verifiedCustomerPhone}` }));
    await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: verifiedCustomerPhone,
        accessToken: `widget_token_scenario_10_${Date.now()}`,
      },
    });

    // Reset dispatched tracking
    sentSmsList = [];
    sentEmails = [];

    // 2. Customer submits registration
    const regRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Rohan Sharma',
        email: emailCustomer,
        phone: verifiedCustomerPhone,
        password: 'Password123!',
      },
    });

    assert.strictEqual(regRes.statusCode, 201, `Registration failed: ${JSON.stringify(regRes.body)}`);
    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.data.requiresVerification, true);
    assert.strictEqual(regRes.body.data.channel, 'email');

    // Assert: Backend does NOT independently generate or dispatch a second SMS OTP
    assert.strictEqual(sentSmsList.length, 0, 'Backend must NOT dispatch legacy SMS OTP during registration when mobile is verified via widget');
    assert.ok(sentEmails.length > 0, 'Backend must dispatch Email OTP for account verification');

    const challengeId = regRes.body.data.challengeId;
    assert.ok(challengeId, 'Expected challengeId in registration response');

    // Find challenge in DB and get plain OTP from sent emails
    const lastEmail = sentEmails[sentEmails.length - 1];
    const otpMatch = lastEmail.html ? lastEmail.html.match(/\b\d{6}\b/) : null;
    assert.ok(otpMatch, 'Expected 6-digit OTP in email content');
    const otp = otpMatch[0];

    // Verify signup OTP
    const verifyOtpRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-signup-otp',
      body: {
        challengeId,
        otp,
      },
    });
    assert.strictEqual(verifyOtpRes.statusCode, 200, `OTP verification failed: ${JSON.stringify(verifyOtpRes.body)}`);
    assert.strictEqual(verifyOtpRes.body.success, true);

    const userInDb = usersStore.find((u) => u.email === emailCustomer);
    assert.strictEqual(userInDb.isEmailVerified, true, 'User should be marked as email verified');
    assert.strictEqual(userInDb.isPhoneVerified, true, 'User should be marked as phone verified');
    console.log('  ✓ Verified MSG91 mobile does NOT trigger legacy SMS dispatch and successfully completes Email OTP');

    // -------------------------------------------------------------------------
    // Scenario 10b: Unverified mobile registration rejection (HTTP 400 MOBILE_VERIFICATION_REQUIRED)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 10b: Unverified mobile registration is strictly rejected`);
    sentSmsList = [];
    sentEmails = [];
    const unverifiedPhone = '9876543299';
    const unverifiedRegRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Unverified Mobile User',
        email: `unverified_mobile_${Date.now()}@test-msg91.com`,
        phone: unverifiedPhone,
        password: 'Password123!',
      },
    });

    assert.strictEqual(unverifiedRegRes.statusCode, 400, 'Unverified mobile registration must return HTTP 400');
    assert.strictEqual(unverifiedRegRes.body.success, false);
    assert.strictEqual(unverifiedRegRes.body.code, 'MOBILE_VERIFICATION_REQUIRED');
    assert.strictEqual(sentSmsList.length, 0, 'Must not dispatch any SMS OTP when mobile is unverified');
    assert.strictEqual(sentEmails.length, 0, 'Must not dispatch any Email OTP when mobile is unverified');
    console.log('  ✓ Unverified mobile registration strictly rejected with HTTP 400 MOBILE_VERIFICATION_REQUIRED');

    // -------------------------------------------------------------------------
    // Scenario 10c: Failed email dispatch does not strand customer (restores pre-verification)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 10c: Failed email dispatch restores mobile pre-verification for retry`);
    const retryTestPhone = '9876543219';
    const retryTestEmail = `email_retry_${Date.now()}@test-msg91.com`;
    const retryToken = `token_retry_flow_${Date.now()}`;

    // 1. Verify mobile with matching custom verifier
    setCustomVerifier(async () => ({ type: 'success', message: `91${retryTestPhone}` }));
    await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: retryTestPhone,
        accessToken: retryToken,
      },
    });

    // 2. Simulate transient Resend failure
    setResendClient({
      emails: {
        send: async () => {
          return { data: null, error: { message: 'Upstream email provider outage' } };
        },
      },
    });

    const failedReg = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Retry Test User',
        email: retryTestEmail,
        phone: retryTestPhone,
        password: 'Password123!',
      },
    });
    assert.strictEqual(failedReg.statusCode, 502, 'Email failure must return HTTP 502');

    // 3. Restore Resend mock client
    setResendClient({
      emails: {
        send: async (mailOptions) => {
          sentEmails.push(mailOptions);
          return { data: { id: `mock-email-${Date.now()}` }, error: null };
        },
      },
    });

    // 4. Retry registration with same phone without re-verifying mobile
    const retriedReg = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Retry Test User',
        email: retryTestEmail,
        phone: retryTestPhone,
        password: 'Password123!',
      },
    });
    assert.strictEqual(retriedReg.statusCode, 201, 'Retried registration must succeed because pre-verification was restored');
    assert.strictEqual(retriedReg.body.success, true);
    console.log('  ✓ Transient email failure safely restores mobile pre-verification; customer is never stranded');

    // -------------------------------------------------------------------------
    // Scenario 11: Unverified mobile / account restrictions (HTTP 403)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 11: Unverified mobile / account restrictions`);
    const unverifiedCustomer = `unverified_${Date.now()}@test-msg91.com`;
    const hashedPassword = await bcrypt.hash('SecretPass123!', 10);

    usersStore.push({
      _id: new mongoose.Types.ObjectId(),
      name: 'Unverified User',
      email: unverifiedCustomer,
      phone: '9123456789',
      password: hashedPassword,
      role: 'CUSTOMER',
      isEmailVerified: false,
      isPhoneVerified: false,
      isActive: true,
      toJSON: function () {
        const copy = { ...this };
        delete copy.password;
        return copy;
      },
    });

    const loginUnverified = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: unverifiedCustomer,
        password: 'SecretPass123!',
      },
    });

    assert.strictEqual(loginUnverified.statusCode, 403, 'Unverified customer must receive HTTP 403 Forbidden');
    assert.strictEqual(loginUnverified.body.success, false);
    assert.strictEqual(loginUnverified.body.data.requiresVerification, true);
    console.log('  ✓ Unverified customer account is strictly blocked with HTTP 403 Forbidden');

    // -------------------------------------------------------------------------
    // Scenario 12: Existing customer login and session integrity
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 12: Existing customer login and session integrity`);
    // Customer verifies phone via widget
    const phoneCustomer = `mobileverified_${Date.now()}@test-msg91.com`;
    const mobileNum = '8584085669';

    // Pre-verify mobile
    setCustomVerifier(async () => ({ type: 'success', message: `91${mobileNum}` }));
    await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-mobile-widget',
      body: {
        mobile: mobileNum,
        accessToken: `token_for_login_scenario_12_${Date.now()}`,
      },
    });

    // Create user with verified phone
    usersStore.push({
      _id: new mongoose.Types.ObjectId(),
      name: 'Phone Verified User',
      email: phoneCustomer,
      phone: mobileNum,
      password: hashedPassword,
      role: 'CUSTOMER',
      isEmailVerified: false,
      isPhoneVerified: true, // Mobile verified via MSG91 widget
      isActive: true,
      toJSON: function () {
        const copy = { ...this };
        delete copy.password;
        return copy;
      },
    });

    const loginVerified = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: phoneCustomer,
        password: 'SecretPass123!',
      },
    });

    assert.strictEqual(loginVerified.statusCode, 200, `Expected 200, got ${loginVerified.statusCode}: ${JSON.stringify(loginVerified.body)}`);
    assert.strictEqual(loginVerified.body.success, true);
    assert.strictEqual(loginVerified.body.data.user.phone, mobileNum);

    // Verify auth cookies are set
    const setCookie = loginVerified.headers['set-cookie'];
    assert.ok(setCookie, 'Expected Set-Cookie headers on successful login');
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    assert.ok(
      cookieStr.includes('bb_customer_access_token=') || cookieStr.includes('bb_access_token='),
      'Expected access token cookie'
    );
    assert.ok(cookieStr.includes('HttpOnly'), 'Access token must be HttpOnly');
    console.log('  ✓ Phone verified customer logs in seamlessly with HttpOnly session cookies');

    // -------------------------------------------------------------------------
    // Scenario 13: Production mode fails closed when Redis is unavailable (no silent fallback)
    // -------------------------------------------------------------------------
    console.log(`[Test ${testNumber()}] Scenario 13: Production mode fails closed when Redis is unavailable (no silent fallback)`);
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      // In production with REDIS_ENABLED=false / Redis unavailable:
      // Msg91WidgetService.acquireTokenAtomic must fail closed (throw 503 REDIS_UNAVAILABLE)
      let threwExpectedError = false;
      try {
        await Msg91WidgetService.acquireTokenAtomic('dummy_hash_for_scenario_13', '8584085669');
      } catch (err) {
        if (err.statusCode === 503 && err.code === 'REDIS_UNAVAILABLE') {
          threwExpectedError = true;
        }
      }
      assert.strictEqual(
        threwExpectedError,
        true,
        'acquireTokenAtomic must throw 503 REDIS_UNAVAILABLE in production when Redis is unavailable'
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
    console.log('  ✓ Production mode strictly fails closed with 503 REDIS_UNAVAILABLE when Redis is unavailable (zero silent fallback)');

    console.log('\n======================================================');
    console.log(`🎉 ALL ${passedCount} TEST SCENARIOS PASSED SUCCESSFULLY!`);
    console.log('======================================================\n');
  } finally {
    // Restore mocks
    RefreshSession.create = origRefreshCreate;
    User.findOne = origUserFindOne;
    User.create = origUserCreate;
    User.updateOne = origUserUpdateOne;
    User.findById = origUserFindById;
    OtpChallenge.findOne = origChallengeFindOne;
    OtpChallenge.create = origChallengeCreate;
    OtpChallenge.findOneAndUpdate = origChallengeFindOneAndUpdate;
    OtpChallenge.updateMany = origChallengeUpdateMany;
    OtpChallenge.deleteMany = origChallengeDeleteMany;
    setSmsSender(undefined);
  }
};

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
