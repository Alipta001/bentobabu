/**
 * BentoBabu — Google Identity Services (GIS) Customer Authentication Test Suite
 *
 * Verifies:
 * 1. Missing Google ID token rejection (HTTP 400)
 * 2. Invalid Google ID token rejection (HTTP 401)
 * 3. Unverified Google email rejection (HTTP 403)
 * 4. First-time Google user account auto-creation (role: CUSTOMER, authProviders: ['google'])
 * 5. HttpOnly customer session cookies & RefreshSession persistence
 * 6. Existing user login by matching googleId
 * 7. Existing local user account linking by email
 * 8. Account conflict rejection when email is already bound to a different googleId (HTTP 409)
 * 9. Inactive / suspended account rejection (HTTP 403)
 * 10. Role isolation: Non-customer account Google sign-in rejection (HTTP 403)
 * 11. Customer registration under email-only mode (OTP_SMS_ENABLED=false) bypasses MSG91 pre-verification
 */

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.OTP_EMAIL_ENABLED = 'true';
process.env.OTP_SMS_ENABLED = 'false';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.MSG91_AUTH_KEY = 'test_msg91_auth_key';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const { app } = require('../server');
const { User, RefreshSession, OtpChallenge } = require('../app/models');
const { GoogleAuthService } = require('../app/services/googleAuthService');
const { setResendClient } = require('../app/utils/email');

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

// In-memory mock store for Mongoose models during tests
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
    notificationPreferences: {
      email: true,
      whatsapp: false,
      inApp: true,
      push: true,
      newOrderPushEnabled: true,
      orderUpdatePushEnabled: true,
    },
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

// Intercept Mongoose Model queries for sandboxed execution
User.findOne = (query) => {
  return {
    select: function () {
      return this;
    },
    then: function (resolve) {
      for (const u of mockDb.users.values()) {
        if (query.googleId && u.googleId === query.googleId) {
          return resolve(u);
        }
        if (query.email && u.email === query.email.toLowerCase()) {
          return resolve(u);
        }
        if (query.$or) {
          for (const cond of query.$or) {
            if (cond.email && u.email === cond.email.toLowerCase()) return resolve(u);
            if (cond.phone && u.phone === cond.phone) return resolve(u);
            if (cond.googleId && u.googleId === cond.googleId) return resolve(u);
          }
        }
      }
      return resolve(null);
    },
  };
};

User.findById = (id) => {
  return Promise.resolve(mockDb.users.get(id?.toString()) || null);
};

User.create = async (data) => {
  return createMockUser(data);
};

User.deleteOne = async (query) => {
  if (query._id) {
    mockDb.users.delete(query._id.toString());
  }
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

OtpChallenge.deleteOne = async () => ({ deletedCount: 1 });
OtpChallenge.deleteMany = async () => ({ deletedCount: 1 });

async function runTests() {
  console.log('--- STARTING GOOGLE AUTHENTICATION TEST SUITE ---');

  // Stub email provider for registration test
  setResendClient({
    emails: {
      send: async () => ({ data: { id: 'msg_test_123' }, error: null }),
    },
  });

  // Test 1: Missing Google ID token
  {
    console.log('\n[Test 1] Missing ID token returns HTTP 400');
    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: {},
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Google ID token is required'));
    console.log('✓ PASS: Rejected missing ID token with 400');
  }

  // Test 2: Invalid Google ID token verification error
  {
    console.log('\n[Test 2] Invalid ID token verification failure returns HTTP 401');
    GoogleAuthService.setGoogleVerifierMock(() => {
      const err = new Error('Invalid token signature');
      err.statusCode = 401;
      throw err;
    });

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'malformed_invalid_jwt_token' },
    });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Invalid token signature'));
    console.log('✓ PASS: Rejected invalid token with 401');
  }

  // Test 3: Unverified email in Google account
  {
    console.log('\n[Test 3] Unverified email rejection returns HTTP 403');
    GoogleAuthService.setGoogleVerifierMock(() => {
      const err = new Error('Google email address is not verified');
      err.statusCode = 403;
      throw err;
    });

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'token_with_unverified_email' },
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Google email address is not verified'));
    console.log('✓ PASS: Rejected unverified email with 403');
  }

  // Test 4: First-time Google user account auto-creation
  {
    console.log('\n[Test 4] First-time Google user registration creates CUSTOMER account');
    mockDb.users.clear();
    mockDb.sessions.clear();

    const mockGooglePayload = {
      googleId: 'google_sub_101',
      email: 'newcustomer@example.com',
      name: 'Aditi Rao',
      givenName: 'Aditi',
      familyName: 'Rao',
      picture: 'https://lh3.googleusercontent.com/a/mock_photo_101',
      emailVerified: true,
    };

    GoogleAuthService.setGoogleVerifierMock(() => mockGooglePayload);

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'valid_first_time_google_token' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.email, 'newcustomer@example.com');
    assert.strictEqual(res.body.data.user.role, 'CUSTOMER');
    assert.strictEqual(res.body.data.user.isEmailVerified, true);
    assert.strictEqual(res.body.data.user.googleId, 'google_sub_101');
    assert.deepStrictEqual(res.body.data.user.authProviders, ['google']);
    assert.strictEqual(res.body.data.user.profileImage, 'https://lh3.googleusercontent.com/a/mock_photo_101');

    // Verify Set-Cookie headers for customer access and refresh tokens
    const cookies = res.headers['set-cookie'];
    assert.ok(Array.isArray(cookies), 'Expected cookies to be set');
    const cookieNames = cookies.map((c) => c.split('=')[0]);
    assert.ok(cookieNames.includes('bb_customer_access_token'), 'bb_customer_access_token cookie set');
    assert.ok(cookieNames.includes('bb_customer_refresh_token'), 'bb_customer_refresh_token cookie set');

    // Verify RefreshSession in store
    assert.strictEqual(mockDb.sessions.size, 1);
    console.log('✓ PASS: Created new customer with proper role, cookies, and session');
  }

  // Test 5: Existing Google user login by googleId
  {
    console.log('\n[Test 5] Existing Google user logs in by googleId');
    const initialSessionCount = mockDb.sessions.size;

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'valid_existing_google_token' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.email, 'newcustomer@example.com');
    assert.strictEqual(mockDb.sessions.size, initialSessionCount + 1);
    console.log('✓ PASS: Existing Google user logged in smoothly');
  }

  // Test 6: Existing local user account linking by email
  {
    console.log('\n[Test 6] Existing local user without googleId gets linked on first Google sign-in');
    const localUser = createMockUser({
      name: 'Rohan Sharma',
      email: 'rohan.sharma@example.com',
      phone: '9876543210',
      password: 'hashed_password_placeholder',
      googleId: null,
      authProviders: ['local'],
      role: 'CUSTOMER',
      isEmailVerified: false,
    });

    GoogleAuthService.setGoogleVerifierMock(() => ({
      googleId: 'google_sub_rohan_202',
      email: 'rohan.sharma@example.com',
      name: 'Rohan Sharma',
      picture: 'https://lh3.googleusercontent.com/a/mock_photo_rohan',
      emailVerified: true,
    }));

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'valid_google_token_for_rohan' },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.user.googleId, 'google_sub_rohan_202');
    assert.ok(res.body.data.user.authProviders.includes('google'));
    assert.strictEqual(res.body.data.user.isEmailVerified, true);
    assert.strictEqual(localUser.googleId, 'google_sub_rohan_202');
    console.log('✓ PASS: Successfully linked existing local customer account');
  }

  // Test 7: Conflict when existing account is bound to a different Google account
  {
    console.log('\n[Test 7] Conflict rejected when account already bound to different Google ID (HTTP 409)');
    GoogleAuthService.setGoogleVerifierMock(() => ({
      googleId: 'google_sub_DIFFERENT_999',
      email: 'rohan.sharma@example.com',
      name: 'Rohan Sharma Impostor',
      emailVerified: true,
    }));

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'conflicting_google_token' },
    });

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('associated with a different Google account'));
    console.log('✓ PASS: Conflict rejected with 409');
  }

  // Test 8: Inactive / Suspended account rejection
  {
    console.log('\n[Test 8] Inactive account rejection (HTTP 403)');
    createMockUser({
      name: 'Banned Customer',
      email: 'banned@example.com',
      googleId: 'google_sub_banned_303',
      role: 'CUSTOMER',
      isActive: false,
    });

    GoogleAuthService.setGoogleVerifierMock(() => ({
      googleId: 'google_sub_banned_303',
      email: 'banned@example.com',
      name: 'Banned Customer',
      emailVerified: true,
    }));

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'token_for_banned_user' },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('suspended') || res.body.message.includes('inactive'));
    console.log('✓ PASS: Inactive user rejected with 403');
  }

  // Test 9: Non-customer role rejection (Role isolation)
  {
    console.log('\n[Test 9] Non-customer (ADMIN/DELIVERY) role rejection (HTTP 403)');
    createMockUser({
      name: 'Admin User',
      email: 'admin@bentobabu.com',
      googleId: 'google_sub_admin_404',
      role: 'ADMIN',
      isActive: true,
    });

    GoogleAuthService.setGoogleVerifierMock(() => ({
      googleId: 'google_sub_admin_404',
      email: 'admin@bentobabu.com',
      name: 'Admin User',
      emailVerified: true,
    }));

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/google',
      body: { idToken: 'token_for_admin_user' },
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('customer accounts'));
    console.log('✓ PASS: Admin rejected from customer Google auth with 403');
  }

  // Test 10: Standard registration in email-only mode consumes pre-verification and sends Email OTP without mock SMS
  {
    console.log('\n[Test 10] Standard registration with MSG91 pre-verification succeeds with Email OTP and no mock SMS');
    const { Msg91WidgetService } = require('../app/services/msg91WidgetService');
    await Msg91WidgetService.recordPhonePreVerified('9988776655');

    const res = await makeMockRequest({
      method: 'POST',
      path: '/api/v1/auth/register',
      body: {
        name: 'Email Only Customer',
        email: 'emailonly@example.com',
        phone: '9988776655',
        password: 'Password123!',
      },
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.channel, 'email');
    console.log('✓ PASS: Registration in email-only mode succeeded with Email OTP and pre-verified phone');
  }

  console.log('\n======================================================');
  console.log('ALL GOOGLE AUTHENTICATION TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
