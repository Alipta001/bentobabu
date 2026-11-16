process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const { User, OtpChallenge, DeliveryApplication } = require('../app/models');
const { validateEnv } = require('../app/config/env');
const {
  configureCloudinary,
  setMockCloudinary,
  uploadBuffer,
} = require('../app/config/cloudinary');
const { uploadDocumentToCloudinary } = require('../app/utils/documentUploader');
const { startServer } = require('../server');

let serverInstance = null;
let host = '127.0.0.1';
let port = 0;

const makeMultipartRequest = (options, boundary, parts) => {
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

    for (const part of parts) {
      req.write(`--${boundary}\r\n`);
      if (part.filename) {
        req.write(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
        );
        req.write(`Content-Type: ${part.contentType || 'application/octet-stream'}\r\n\r\n`);
        req.write(part.data);
        req.write('\r\n');
      } else {
        req.write(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`);
        req.write(part.value);
        req.write('\r\n');
      }
    }
    req.write(`--${boundary}--\r\n`);
    req.end();
  });
};

const makeJsonRequest = (options, postData = null) => {
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
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('================================================================');
  console.log('   BENTO BABU — CLOUDINARY UPLOAD & ERROR HANDLING VERIFICATION ');
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

  try {
    serverInstance = await startServer(0, host);
    port = serverInstance.address().port;

    // 1. Cloudinary configuration check
    await test('1. Cloudinary configuration loads credentials without throwing ReferenceError', () => {
      const client = configureCloudinary();
      assert.ok(client);
      const config = client.config();
      assert.ok(typeof config.cloud_name === 'string');
      assert.ok(typeof config.api_key === 'string');
      assert.ok(typeof config.api_secret === 'string');
      // Ensure credentials are not empty
      assert.ok(config.cloud_name.length > 0);
      assert.ok(config.api_key.length > 0);
    });

    // 2. Error handling: Invalid cloud name does NOT throw ReferenceError and preserves original details
    await test('2. uploadBuffer cleanly maps "Invalid cloud_name" without ReferenceError', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                cb(new Error('Invalid cloud_name bentobabu'));
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.name, 'CloudinaryUploadError');
        assert.strictEqual(err.code, 'CLOUDINARY_INVALID_CLOUD_NAME');
        assert.strictEqual(err.statusCode, 400);
        assert.ok(err.message.includes('CLOUDINARY_CLOUD_NAME'));
        assert.strictEqual(err.originalMessage, 'Invalid cloud_name bentobabu');
      }
    });

    // 3. Error handling: Invalid credentials
    await test('3. uploadBuffer cleanly maps "Invalid credentials / 401"', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                const e = new Error('Invalid credentials');
                e.http_code = 401;
                cb(e);
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.name, 'CloudinaryUploadError');
        assert.strictEqual(err.code, 'CLOUDINARY_INVALID_CREDENTIALS');
        assert.strictEqual(err.statusCode, 401);
        assert.strictEqual(err.originalMessage, 'Invalid credentials');
      }
    });

    // 4. Error handling: Invalid signature
    await test('4. uploadBuffer cleanly maps "Invalid Signature"', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                cb(new Error('Invalid Signature 12345 for upload'));
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.code, 'CLOUDINARY_INVALID_SIGNATURE');
        assert.strictEqual(err.statusCode, 401);
      }
    });

    // 5. Error handling: File size limit exceeded
    await test('5. uploadBuffer cleanly maps file size limit exceeded', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                cb(new Error('File size larger than maximum allowed (10485760)'));
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.code, 'CLOUDINARY_SIZE_LIMIT_EXCEEDED');
        assert.strictEqual(err.statusCode, 400);
      }
    });

    // 6. Error handling: Unsupported format
    await test('6. uploadBuffer cleanly maps unsupported format', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                cb(new Error('Unsupported file format executable'));
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.code, 'CLOUDINARY_UNSUPPORTED_FORMAT');
        assert.strictEqual(err.statusCode, 400);
      }
    });

    // 7. Error handling: Network failure
    await test('7. uploadBuffer cleanly maps network failure (ENOTFOUND)', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'test_cloud' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                const e = new Error('getaddrinfo ENOTFOUND api.cloudinary.com');
                e.code = 'ENOTFOUND';
                cb(e);
              },
            };
            return stream;
          },
        },
      });

      try {
        await uploadBuffer(Buffer.from('sample buffer'));
        assert.fail('Should have rejected');
      } catch (err) {
        assert.strictEqual(err.code, 'CLOUDINARY_NETWORK_FAILURE');
        assert.strictEqual(err.statusCode, 503);
      }
    });

    // 8. Server remains running when Cloudinary upload fails
    await test('8. POST /api/v1/delivery/onboarding/upload-document returns 400 on Cloudinary error and server stays alive', async () => {
      setMockCloudinary({
        config: () => ({ cloud_name: 'bentobabu' }),
        uploader: {
          upload_stream: (opts, cb) => {
            const stream = {
              end: () => {
                cb(new Error('Invalid cloud_name bentobabu'));
              },
            };
            return stream;
          },
        },
      });

      const boundary = '----WebKitFormBoundaryTest123';
      const parts = [
        {
          name: 'category',
          value: 'idProof',
        },
        {
          name: 'document',
          filename: 'aadhaar_card.pdf',
          contentType: 'application/pdf',
          data: Buffer.from('%PDF-1.4 mock pdf content for testing'),
        },
      ];

      const res = await makeMultipartRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/upload-document',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        },
        boundary,
        parts
      );

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'CLOUDINARY_INVALID_CLOUD_NAME');
      assert.ok(res.body.message.includes('CLOUDINARY_CLOUD_NAME'));

      // Confirm server is still alive
      const ping = await makeJsonRequest({
        hostname: host,
        port,
        path: '/',
        method: 'GET',
      });
      assert.strictEqual(ping.statusCode, 200);
      assert.strictEqual(ping.body.success, true);
    });

    // 9. Actual document upload succeeds with valid response
    let uploadedProfile = null;
    let uploadedAadhaar = null;
    let uploadedLicense = null;

    await test('9. POST /api/v1/delivery/onboarding/upload-document succeeds with Cloudinary result', async () => {
      let uploadCallCount = 0;

      setMockCloudinary({
        config: () => ({ cloud_name: 'bentobabu_valid' }),
        uploader: {
          upload_stream: (opts, cb) => {
            uploadCallCount++;
            const stream = {
              end: (buf) => {
                cb(null, {
                  secure_url: `https://res.cloudinary.com/bentobabu_valid/image/upload/v12345/bentobabu/delivery-documents/doc_${uploadCallCount}.webp`,
                  public_id: `bentobabu/delivery-documents/doc_${uploadCallCount}`,
                  format: opts.resource_type === 'auto' ? 'pdf' : 'webp',
                  bytes: buf.length,
                  created_at: new Date().toISOString(),
                });
              },
            };
            return stream;
          },
        },
      });

      const boundary = '----WebKitFormBoundaryTest456';
      const parts = [
        { name: 'category', value: 'profilePhoto' },
        {
          name: 'document',
          filename: 'selfie.jpg',
          contentType: 'image/jpeg',
          data: Buffer.from('mock jpeg photo bytes'),
        },
      ];

      const res = await makeMultipartRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/upload-document',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        },
        boundary,
        parts
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.secureUrl.includes('cloudinary.com'));
      assert.ok(res.body.data.publicId.includes('delivery-documents'));
      assert.strictEqual(res.body.data.fileName, 'selfie.jpg');
      assert.strictEqual(res.body.data.mimeType, 'image/jpeg');

      uploadedProfile = res.body.data;
    });

    // 10. Verify uploaded document URL & public_id are correctly stored in MongoDB
    await test('10. Uploaded document URL and public_id are persisted correctly in MongoDB DeliveryApplication', async () => {
      // Clean up previous test applications for this test email
      const testEmail = 'delivery.doc.test@bentobabu.in';
      const testPhone = '9876543210';
      await DeliveryApplication.deleteMany({ 'personalInfo.email': testEmail });
      await User.deleteMany({ email: testEmail });

      // Build sample document metadata
      const profilePhoto = uploadedProfile || {
        secureUrl: 'https://res.cloudinary.com/bentobabu_valid/image/upload/v1/profile.webp',
        publicId: 'bentobabu/delivery-documents/profile_01',
        fileName: 'profile.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      };

      const idProof = {
        idType: 'AADHAAR',
        document: {
          secureUrl: 'https://res.cloudinary.com/bentobabu_valid/image/upload/v1/aadhaar.pdf',
          publicId: 'bentobabu/delivery-documents/aadhaar_01',
          fileName: 'aadhaar.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        },
      };

      const drivingLicense = {
        secureUrl: 'https://res.cloudinary.com/bentobabu_valid/image/upload/v1/license.jpg',
        publicId: 'bentobabu/delivery-documents/license_01',
        fileName: 'license.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1536,
      };

      const submitPayload = {
        personalInfo: {
          fullName: 'Test Driver',
          phone: testPhone,
          email: testEmail,
          password: 'Password123!',
          dateOfBirth: '1995-01-01',
          gender: 'MALE',
        },
        address: {
          houseNo: 'House 123',
          street: 'Test Street',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
        },
        vehicleInfo: {
          vehicleType: 'MOTORCYCLE',
          brand: 'Honda',
          model: 'Activa',
          registrationNumber: 'KA01AB1234',
          drivingLicenseNumber: 'KA0120200012345',
        },
        documents: {
          profilePhoto,
          idProof,
          drivingLicense,
        },
        termsAccepted: true,
      };

      const res = await makeJsonRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/delivery/onboarding/submit',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        submitPayload
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.applicationNumber);

      // Query database directly to confirm documents are saved
      const savedApp = await DeliveryApplication.findOne({
        applicationNumber: res.body.data.applicationNumber,
      });

      assert.ok(savedApp);
      assert.strictEqual(savedApp.documents.profilePhoto.secureUrl, profilePhoto.secureUrl);
      assert.strictEqual(savedApp.documents.profilePhoto.publicId, profilePhoto.publicId);
      assert.strictEqual(savedApp.documents.idProof.document.secureUrl, idProof.document.secureUrl);
      assert.strictEqual(savedApp.documents.idProof.document.publicId, idProof.document.publicId);
      assert.strictEqual(savedApp.documents.drivingLicense.secureUrl, drivingLicense.secureUrl);
      assert.strictEqual(savedApp.documents.drivingLicense.publicId, drivingLicense.publicId);

      // Cleanup
      await DeliveryApplication.deleteOne({ _id: savedApp._id });
      await User.deleteOne({ email: testEmail });
    });
  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    const { disconnectRedis } = require('../app/config/redis');
    await disconnectRedis();
    await mongoose.disconnect();
  }

  console.log(`\nTests completed: ${passed}/${total} passed.`);
  process.exit(passed === total ? 0 : 1);
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
