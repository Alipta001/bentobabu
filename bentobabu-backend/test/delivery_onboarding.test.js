process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const { User, OtpChallenge, DeliveryApplication } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const { setResendClient } = require('../app/utils/email');
const { app, startServer } = require('../server');

const env = validateEnv();
let serverInstance = null;
let host = '127.0.0.1';
let port = 0;

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

const runDeliveryOnboardingAudit = async () => {
  console.log('================================================================');
  console.log('   BENTO BABU — DELIVERY PARTNER ONBOARDING TEST SUITE          ');
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
      console.error(`    Error: ${err.message}\n`, err.stack);
    }
  };

  let adminUser = null;
  let adminToken = '';
  let adminCookie = '';
  let lastSentOtp = null;
  let lastChallengeToken = null;
  let submittedApplicationNumber = null;
  let submittedApplicationId = null;

  const applicantPhone = '9876500001';
  const applicantEmail = 'applicant.test@bentobabu.in';
  const applicantPassword = 'Password123!';

  try {
    serverInstance = await startServer(0, host);
    port = serverInstance.address().port;

    // Mock Resend client to capture generated email OTP
    setResendClient({
      emails: {
        send: async ({ from, to, subject, html, text }) => {
          const match = `${subject} ${html} ${text}`.match(/\b\d{6}\b/);
          if (match) {
            lastSentOtp = match[0];
          }
          return { data: { id: 'mock_resend_email_id' }, error: null };
        },
      },
    });

    // Cleanup old test data
    await User.deleteMany({
      $or: [{ email: applicantEmail }, { phone: applicantPhone }, { email: 'admin.delivery.test@bentobabu.in' }],
    });
    await DeliveryApplication.deleteMany({
      $or: [{ 'personalInfo.email': applicantEmail }, { 'personalInfo.phone': applicantPhone }],
    });
    await OtpChallenge.deleteMany({ identifier: applicantEmail });

    // Create Admin User for authorization tests
    adminUser = await User.create({
      name: 'Delivery Operations Admin',
      email: 'admin.delivery.test@bentobabu.in',
      phone: '9876500099',
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    const rawAdminToken = generateAccessToken(adminUser);
    adminToken = rawAdminToken;
    adminCookie = `${env.accessTokenCookieName}=${adminToken}`;

    await test('1. POST /api/v1/delivery/onboarding/otp/send - sends email OTP and returns challenge token', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/otp/send',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { email: applicantEmail }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.challengeToken, 'Challenge token should be returned');
      assert.strictEqual(res.body.data.channel, 'email');
      assert(res.body.data.destination.includes('@bentobabu.in'), 'Masked email returned');
      assert(lastSentOtp && lastSentOtp.length === 6, 'Mock email captured 6-digit OTP');

      lastChallengeToken = res.body.data.challengeToken;
    });

    await test('2. POST /api/v1/delivery/onboarding/otp/verify - rejects incorrect OTP', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/otp/verify',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          challengeToken: lastChallengeToken,
          otp: '000000',
        }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert(res.body.message.includes('Incorrect verification code'));
    });

    await test('3. POST /api/v1/delivery/onboarding/otp/verify - verifies valid OTP and consumes challenge', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/otp/verify',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          challengeToken: lastChallengeToken,
          otp: lastSentOtp,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.verified, true);
      assert.strictEqual(res.body.data.email, applicantEmail);
    });

    await test('4. POST /api/v1/delivery/onboarding/submit - rejects if terms not accepted', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/submit',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          termsAccepted: false,
        }
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert(res.body.message.includes('Terms & Conditions'));
    });

    await test('5. POST /api/v1/delivery/onboarding/submit - successfully submits full application with emailVerificationToken', async () => {
      const payload = {
        personalInfo: {
          fullName: 'Vikram Singh',
          phone: applicantPhone,
          email: applicantEmail,
          password: applicantPassword,
          dateOfBirth: '1998-05-15',
          gender: 'MALE',
        },
        address: {
          houseNo: 'Flat 402, Lotus Tower',
          street: 'MG Road, Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
          landmark: 'Near Metro Pillar 120',
        },
        vehicleInfo: {
          vehicleType: 'MOTORCYCLE',
          brand: 'Hero',
          model: 'Splendor Plus',
          registrationNumber: 'KA03HA1234',
          drivingLicenseNumber: 'KA0320180005678',
        },
        documents: {
          profilePhoto: {
            secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/v1/profile_sample.jpg',
            publicId: 'profile_sample',
            fileName: 'profile.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 102400,
          },
          idProof: {
            idType: 'AADHAAR',
            document: {
              secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/v1/aadhaar_sample.pdf',
              publicId: 'aadhaar_sample',
              fileName: 'aadhaar.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 204800,
            },
          },
          drivingLicense: {
            secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/v1/dl_sample.jpg',
            publicId: 'dl_sample',
            fileName: 'dl.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 153600,
          },
          registrationCertificate: {
            secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/v1/rc_sample.jpg',
            publicId: 'rc_sample',
            fileName: 'rc.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 153600,
          },
        },
        termsAccepted: true,
        emailVerificationToken: lastChallengeToken,
      };

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/submit',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        payload
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.applicationNumber.startsWith('BBD-'), 'Application number format check');
      assert.strictEqual(res.body.data.status, 'PENDING_APPROVAL');

      submittedApplicationNumber = res.body.data.applicationNumber;

      // Verify user account exists with role DELIVERY, isEmailVerified: true, and isActive: false
      const createdUser = await User.findOne({ email: applicantEmail });
      assert(createdUser, 'User account should be created');
      assert.strictEqual(createdUser.role, 'DELIVERY');
      assert.strictEqual(createdUser.isEmailVerified, true, 'Email must be marked verified');
      assert.strictEqual(createdUser.isActive, false, 'User must remain inactive until admin approval');
    });

    await test('6. POST /api/v1/auth/login - blocks pending delivery partner with descriptive 403', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: applicantEmail,
          password: applicantPassword,
        }
      );

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert(res.body.data.requiresOnboardingReview, 'Should identify onboarding review requirement');
      assert.strictEqual(res.body.data.applicationStatus, 'PENDING_APPROVAL');
      assert.strictEqual(res.body.data.applicationNumber, submittedApplicationNumber);
    });

    await test('7. GET /api/v1/delivery/onboarding/status - returns application status by application number', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/onboarding/status?identifier=${submittedApplicationNumber}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.applicationNumber, submittedApplicationNumber);
      assert.strictEqual(res.body.data.status, 'PENDING_APPROVAL');
      assert.strictEqual(res.body.data.applicantName, 'Vikram Singh');
    });

    await test('8. GET /api/v1/delivery/onboarding/status - returns application status by email', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/delivery/onboarding/status?identifier=${applicantEmail}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.applicationNumber, submittedApplicationNumber);
    });

    await test('9. GET /api/v1/admin/delivery-applications - lists applications with stats and filters for admin', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/delivery-applications?status=PENDING_APPROVAL',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.data), 'Returns applications array');
      assert(res.body.stats.pending >= 1, 'Stats include pending applications');

      const appRecord = res.body.data.find((a) => a.applicationNumber === submittedApplicationNumber);
      assert(appRecord, 'Submitted application should appear in admin listing');
      submittedApplicationId = appRecord._id;
    });

    await test('10. POST /api/v1/admin/delivery-applications/:id/request-corrections - requests corrections', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/delivery-applications/${submittedApplicationId}/request-corrections`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          corrections: 'Please upload a clearer image of your vehicle registration certificate.',
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'CORRECTIONS_REQUESTED');
      assert(res.body.data.requestedCorrections.includes('clearer image'));
    });

    await test('11. POST /api/v1/admin/delivery-applications/:id/approve - approves partner and activates user account', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/delivery-applications/${submittedApplicationId}/approve`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          note: 'All identity and vehicle documents verified.',
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'APPROVED');

      // Verify user account is now active
      const activeUser = await User.findOne({ email: applicantEmail });
      assert.strictEqual(activeUser.isActive, true, 'User must now be active');
      assert.strictEqual(activeUser.role, 'DELIVERY');
    });

    await test('12. POST /api/v1/auth/login - allows approved delivery partner to log in', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          identifier: applicantEmail,
          password: applicantPassword,
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.role, 'DELIVERY');
      assert(res.headers['set-cookie'], 'HttpOnly auth cookies set');
    });

  } finally {
    // Cleanup created test records
    try {
      await User.deleteMany({
        $or: [{ email: applicantEmail }, { phone: applicantPhone }, { email: 'admin.delivery.test@bentobabu.in' }],
      });
      await DeliveryApplication.deleteMany({
        $or: [{ 'personalInfo.email': applicantEmail }, { 'personalInfo.phone': applicantPhone }],
      });
      await OtpChallenge.deleteMany({ identifier: applicantEmail });
    } catch {}

    if (serverInstance) {
      await new Promise((res) => serverInstance.close(res));
    }
  }

  console.log(`\nResults: ${passed} / ${total} tests passed`);
  if (passed !== total) {
    process.exit(1);
  }
};

runDeliveryOnboardingAudit()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
