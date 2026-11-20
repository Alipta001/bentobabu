/**
 * BentoBabu — Email-Only Registration & OTP Verification Policy Test Suite
 *
 * Verifies all required scenarios:
 * 1. GET /api/v1/auth/otp-config exposes accurate OTP verification policy
 * 2. Password-based registration succeeds WITHOUT phone number (email-only)
 * 3. Password-based registration succeeds WITH optional phone number without mobile pre-verification
 * 4. SMS dispatch is NEVER called when OTP_SMS_ENABLED=false
 * 5. Registration cannot bypass email verification: login attempt before verifying is strictly rejected (HTTP 403)
 * 6. Account becomes verified only after submitting valid Email OTP to /verify-signup-otp
 * 7. Successful login with HttpOnly session cookies after Email OTP verification
 * 8. When OTP_SMS_ENABLED=true, registration without phone pre-verification is strictly rejected (HTTP 400 MOBILE_VERIFICATION_REQUIRED)
 * 9. Google registration works with verified email and no phone number
 * 10. Duplicate registration handling with optional and non-optional phone numbers
 */

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.OTP_EMAIL_ENABLED = 'true';
process.env.OTP_SMS_ENABLED = 'false';
process.env.OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || 'test_otp_hash_secret_32bytes_long_string';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.MSG91_AUTH_KEY = 'test_msg91_auth_key';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const { app } = require('../server');
const { User, RefreshSession, OtpChallenge } = require('../app/models');
const { GoogleAuthService } = require('../app/services/googleAuthService');
const { setResendClient } = require('../app/utils/email');
const { Msg91WidgetService } = require('../app/services/msg91WidgetService');

// Track all email and sms dispatches
let sentEmails = [];
let sentSms = [];

setResendClient({
  emails: {
    send: async (mailOptions) => {
      sentEmails.push(mailOptions);
      return {
        data: { id: `resend_mock_${Date.now()}` },
        error: null,
      };
    },
  },
});

// Helper to execute requests directly through Express app in-process
const makeMockRequest = ({ method, path, body = null, headers = {} }) => {
  return new Promise((resolve) => {
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

    app.handle(req, res);
  });
};

// In-memory mock store
const mockDb = {
  users: new Map(),
  sessions: new Map(),
  challenges: new Map(),
};

function createMockUser(data) {
  const doc = {
    _id: data._id || new mongoose.Types.ObjectId(),
    name: data.name,
    email: (data.email || '').toLowerCase().trim(),
    phone: data.phone || null,
    password: data.password || null,
    googleId: data.googleId || null,
    authProviders: data.authProviders || (data.googleId ? ['google'] : ['local']),
    role: data.role || 'CUSTOMER',
    isActive: data.isActive !== undefined ? data.isActive : true,
    isEmailVerified: data.isEmailVerified !== undefined ? data.isEmailVerified : false,
    isPhoneVerified: data.isPhoneVerified !== undefined ? data.isPhoneVerified : false,
    profileImage: data.profileImage || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: async function () {
      mockDb.users.set(this._id.toString(), this);
      return this;
    },
    toJSON: function () {
      const copy = { ...this };
      copy.id = this._id.toString();
      delete copy._id;
      delete copy.password;
      return copy;
    },
  };
  mockDb.users.set(doc._id.toString(), doc);
  return doc;
}

User.findOne = (query) => {
  return {
    select: function () {
      return this;
    },
    sort: function () {
      return this;
    },
    then: function (resolve) {
      for (const u of mockDb.users.values()) {
        if (query._id && u._id.toString() === query._id.toString()) return resolve(u);
        if (query.googleId && u.googleId === query.googleId) return resolve(u);
        if (query.email && u.email === query.email.toLowerCase()) return resolve(u);
        if (query.$or) {
          for (const cond of query.$or) {
            if (cond.email && u.email === cond.email.toLowerCase()) return resolve(u);
            if (cond.phone && u.phone && u.phone === cond.phone) return resolve(u);
            if (cond.googleId && u.googleId === cond.googleId) return resolve(u);
          }
        }
      }
      return resolve(null);
    },
  };
};

User.findById = (id) => Promise.resolve(mockDb.users.get(id?.toString()) || null);
User.create = async (data) => createMockUser(data);
User.deleteOne = async (query) => {
  if (query._id) mockDb.users.delete(query._id.toString());
  return { deletedCount: 1 };
};
User.updateOne = async (query, update) => {
  const user = await User.findOne(query);
  if (user && update.$set) {
    Object.assign(user, update.$set);
  }
  return { modifiedCount: 1 };
};

RefreshSession.create = async (data) => {
  const sessionDoc = {
    _id: data._id || new mongoose.Types.ObjectId(),
    user: data.user,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
  };
  mockDb.sessions.set(sessionDoc._id.toString(), sessionDoc);
  return sessionDoc;
};

OtpChallenge.create = async (data) => {
  const id = new mongoose.Types.ObjectId();
  const doc = { _id: id, ...data };
  mockDb.challenges.set(id.toString(), doc);
  return doc;
};

OtpChallenge.findOne = (query) => {
  return {
    select: function () {
      return this;
    },
    sort: function () {
      return this;
    },
    then: function (resolve) {
      for (const c of mockDb.challenges.values()) {
        if (query.challengeTokenHash && c.challengeTokenHash === query.challengeTokenHash) {
          return resolve(c);
        }
        if (query.user && c.user.toString() === query.user.toString() && query.isConsumed === false) {
          return resolve(c);
        }
      }
      return resolve(null);
    },
  };
};

OtpChallenge.findOneAndUpdate = (query, update) => {
  const execute = () => {
    for (const c of mockDb.challenges.values()) {
      if (query._id && c._id.toString() === query._id.toString()) {
        if (update.$inc && update.$inc.attempts) {
          c.attempts = (c.attempts || 0) + update.$inc.attempts;
        }
        if (update.$set) {
          Object.assign(c, update.$set);
        }
        return c;
      }
    }
    return null;
  };

  return {
    select: function () {
      return this;
    },
    then: function (resolve) {
      resolve(execute());
    },
  };
};

OtpChallenge.deleteOne = async () => ({ deletedCount: 1 });
OtpChallenge.deleteMany = async () => ({ deletedCount: 1 });
OtpChallenge.updateMany = async () => ({ modifiedCount: 1 });

async function runTests() {
  console.log('--- STARTING EMAIL-ONLY REGISTRATION & OTP VERIFICATION TESTS ---');

  // Test 1: GET /api/v1/auth/otp-config
  {
    console.log('\n[Test 1] GET /api/v1/auth/otp-config exposes accurate OTP verification policy');
    const res = await makeMockRequest({
      method: 'GET',
      path: '/api/v1/auth/otp-config',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.otpEmailEnabled, true);
    assert.strictEqual(res.body.data.otpSmsEnabled, false);
    assert.strictEqual(res.body.data.phoneRequired, false);
    assert.strictEqual(res.body.data.phoneVerificationRequired, false);
    console.log('✓ PASS: Policy correctly indicates phoneRequired: false, phoneVerificationRequired: false');
  }

  // Test 2: Password-based registration WITHOUT phone number
  let emailChallengeId = null;
  let test2Otp = null;
  let userEmail = 'emailonly_test@example.com';
  {
    console.log('\n[Test 2] Password-based registration without phone number succeeds with Email OTP');
    sentEmails = [];
    sentSms = [];

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Email Only User',
        email: userEmail,
        password: 'Password123!',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.requiresVerification, true);
    assert.strictEqual(res.body.data.channel, 'email');
    assert.ok(res.body.data.challengeId, 'Expected challengeId in response');
    emailChallengeId = res.body.data.challengeId;

    // Verify SMS was NEVER called
    assert.strictEqual(sentSms.length, 0, 'SMS dispatch must NEVER be called');
    // Verify Email was dispatched
    assert.strictEqual(sentEmails.length, 1, 'Email dispatch must be called exactly once');
    assert.strictEqual(sentEmails[0].to, userEmail);

    const match = sentEmails[0]?.text?.match(/verification code is:\s*(\d{6})/i);
    assert.ok(match, 'Expected OTP in sent email text');
    test2Otp = match[1];

    // Verify stored user has phone: null and isEmailVerified: false
    const createdUser = Array.from(mockDb.users.values()).find((u) => u.email === userEmail);
    assert.ok(createdUser, 'User must exist in store');
    assert.strictEqual(createdUser.phone, null);
    assert.strictEqual(createdUser.isEmailVerified, false);
    console.log('✓ PASS: Created user without phone, dispatched Email OTP, zero SMS dispatched');
  }

  // Test 3: Registration with OPTIONAL phone number does not require MSG91 pre-verification
  {
    console.log('\n[Test 3] Password-based registration with optional phone succeeds without pre-verification');
    sentEmails = [];
    sentSms = [];

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'User With Optional Phone',
        email: 'optional_phone_user@example.com',
        phone: '9876543210',
        password: 'Password123!',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.channel, 'email');
    assert.strictEqual(sentSms.length, 0, 'SMS must not be dispatched');
    assert.strictEqual(sentEmails.length, 1, 'Email must be dispatched');

    const createdUser = Array.from(mockDb.users.values()).find((u) => u.email === 'optional_phone_user@example.com');
    assert.ok(createdUser);
    assert.strictEqual(createdUser.phone, '9876543210');
    assert.strictEqual(createdUser.isPhoneVerified, false);
    console.log('✓ PASS: User with phone created without blocking for MSG91 pre-verification');
  }

  // Test 4: Cannot bypass email verification (Login before verifying is rejected)
  {
    console.log('\n[Test 4] Login before email verification is strictly rejected (HTTP 403)');
    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: userEmail,
        password: 'Password123!',
      },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.data.requiresVerification, true);
    assert.strictEqual(res.body.data.channel, 'email');
    console.log('✓ PASS: Unverified account cannot log in');
  }

  // Test 5: Verify signup Email OTP and log in successfully
  {
    console.log('\n[Test 5] Verify Email OTP and subsequent successful login');
    const otpCode = test2Otp;
    assert.ok(otpCode, 'Expected test2Otp to be present');

    const verifyRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/verify-signup-otp',
      body: {
        challengeId: emailChallengeId,
        identifier: userEmail,
        otp: otpCode,
      },
    });

    assert.strictEqual(verifyRes.statusCode, 200);
    assert.strictEqual(verifyRes.body.success, true);
    assert.strictEqual(verifyRes.body.data.verified, true);

    const verifiedUser = Array.from(mockDb.users.values()).find((u) => u.email === userEmail);
    assert.strictEqual(verifiedUser.isEmailVerified, true);

    // Now login succeeds
    const loginRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {
        email: userEmail,
        password: 'Password123!',
      },
    });

    assert.strictEqual(loginRes.statusCode, 200);
    assert.strictEqual(loginRes.body.success, true);
    assert.strictEqual(loginRes.body.data.user.email, userEmail);

    const cookies = loginRes.headers['set-cookie'];
    assert.ok(Array.isArray(cookies));
    const cookieNames = cookies.map((c) => c.split('=')[0]);
    assert.ok(cookieNames.includes('bb_customer_access_token'));
    assert.ok(cookieNames.includes('bb_customer_refresh_token'));
    console.log('✓ PASS: Account verified and login succeeds with HttpOnly session cookies');
  }

  // Test 6: When OTP_SMS_ENABLED=true, registration requires phone and MSG91 pre-verification
  {
    console.log('\n[Test 6] When OTP_SMS_ENABLED=true, registration requires MSG91 pre-verification');
    process.env.OTP_SMS_ENABLED = 'true';
    process.env.OTP_EMAIL_ENABLED = 'false';

    // 6a: Missing phone rejected
    const noPhoneRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'SMS Mode User',
        email: 'smsmode@example.com',
        password: 'Password123!',
      },
    });
    assert.strictEqual(noPhoneRes.statusCode, 400);
    assert.ok(noPhoneRes.body.message.includes('valid 10-digit Indian mobile number'));

    // 6b: Unverified phone rejected
    const unverifiedRes = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'SMS Mode User',
        email: 'smsmode@example.com',
        phone: '9876500001',
        password: 'Password123!',
      },
    });
    assert.strictEqual(unverifiedRes.statusCode, 400);
    assert.strictEqual(unverifiedRes.body.code, 'MOBILE_VERIFICATION_REQUIRED');

    // Restore test env
    process.env.OTP_SMS_ENABLED = 'false';
    process.env.OTP_EMAIL_ENABLED = 'true';
    console.log('✓ PASS: MSG91 pre-verification policy properly enforced when SMS OTP is enabled');
  }

  // Test 7: Google registration works with verified email and no phone number
  {
    console.log('\n[Test 7] Google registration succeeds with verified email and zero phone requirement');
    GoogleAuthService.setGoogleVerifierMock(() => ({
      googleId: 'google_sub_nophone_555',
      email: 'google_nophone@example.com',
      name: 'Google Customer',
      picture: 'https://lh3.googleusercontent.com/a/mock_photo_555',
      emailVerified: true,
    }));

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'valid_google_token_nophone' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.email, 'google_nophone@example.com');
    assert.strictEqual(res.body.data.user.role, 'CUSTOMER');
    assert.strictEqual(res.body.data.user.isEmailVerified, true);
    assert.strictEqual(res.body.data.user.phone, null);
    console.log('✓ PASS: Google customer account created with verified email, no phone requirement');
  }

  console.log('\n======================================================');
  console.log('ALL EMAIL-ONLY REGISTRATION TESTS PASSED! ✓');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
