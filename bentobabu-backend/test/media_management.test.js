process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const sharp = require('sharp');

const { User, Product, Category, Media } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const connectDB = require('../app/config/db');
const { setMockCloudinary, getDeliveryUrl } = require('../app/config/cloudinary');
const { setMockR2Client, getPublicUrl } = require('../app/config/r2');
const { optimizeImage } = require('../app/utils/imageOptimizer');
const { app, startServer } = require('../server');

const env = validateEnv();
let serverInstance = null;
let host = '127.0.0.1';
let port = 0;

// Helper to make multipart or JSON requests
const makeRequest = (options, postData = null, isMultipart = false) => {
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
      if (isMultipart || Buffer.isBuffer(postData)) {
        req.write(postData);
      } else if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
};

// Helper to create a multipart/form-data body buffer
const createMultipartBody = (boundary, fields, files) => {
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  for (const { fieldName, filename, contentType, buffer } of files) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`
      )
    );
    chunks.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    chunks.push(buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
};

const runMediaAudit = async () => {
  console.log('================================================================');
  console.log('   BENTO BABU — MEDIA MANAGEMENT TEST SUITE                    ');
  console.log('   Cloudinary (Images) + Cloudflare R2 (Videos) Integration    ');
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
      console.error(`    Error: ${err.message}\n`);
    }
  };

  try {
    serverInstance = await startServer(0, host);
    port = serverInstance.address().port;

    // 1. Ensure an Admin user exists for authentication
    let admin = await User.findOne({ role: 'ADMIN' });
    if (!admin) {
      admin = await User.create({
        name: 'Test Media Admin',
        email: `media-admin-${Date.now()}@bentobabu.test`,
        password: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'ADMIN',
        isEmailVerified: true,
      });
    }
    const adminToken = generateAccessToken(admin);

    // 2. Ensure a regular customer exists to test unauthorized rejection
    let customer = await User.findOne({ role: 'CUSTOMER' });
    if (!customer) {
      customer = await User.create({
        name: 'Test Customer',
        email: `media-customer-${Date.now()}@bentobabu.test`,
        password: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'CUSTOMER',
        isEmailVerified: true,
      });
    }
    const customerToken = generateAccessToken(customer);

    // Set up mock Cloudinary & R2 clients
    const destroyedAssets = [];
    const uploadedCloudinaryAssets = [];
    setMockCloudinary({
      uploader: {
        upload_stream: (options, callback) => {
          const stream = new (require('stream').Writable)({
            write(chunk, encoding, next) {
              next();
            },
          });
          stream.on('finish', () => {
            const result = {
              public_id: `bentobabu/test/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              secure_url: `https://res.cloudinary.com/bentobabu-test/image/upload/v123456/bentobabu/test/sample.webp`,
              format: 'webp',
              bytes: 12450,
              width: 800,
              height: 600,
            };
            uploadedCloudinaryAssets.push(result);
            callback(null, result);
          });
          return stream;
        },
        destroy: async (publicId) => {
          destroyedAssets.push(publicId);
          return { result: 'ok' };
        },
      },
      api: {
        usage: async () => ({
          storage: { usage: 1048576, limit: 104857600 },
          bandwidth: { usage: 524288, limit: 104857600 },
          transformations: { usage: 42, limit: 25000 },
        }),
      },
      url: (publicId, opts) => {
        const trans = opts?.transformation?.[0]?.width || 640;
        return `https://res.cloudinary.com/bentobabu-test/image/upload/w_${trans},c_limit,q_auto/${publicId}`;
      },
    });

    const deletedR2Objects = [];
    const mockR2Objects = new Map();
    setMockR2Client({
      generatePresignedUploadUrl: async ({ objectKey, contentType }) => {
        return `https://media.bentobabu.com/upload-mock/${objectKey}?signature=test-sig`;
      },
      verifyObject: async (objectKey) => {
        if (mockR2Objects.has(objectKey)) {
          const obj = mockR2Objects.get(objectKey);
          return { exists: true, sizeBytes: obj.sizeBytes, contentType: obj.contentType, eTag: '"mock-etag"' };
        }
        return { exists: false, sizeBytes: 0, contentType: '', eTag: '' };
      },
      deleteObject: async (objectKey) => {
        deletedR2Objects.push(objectKey);
        mockR2Objects.delete(objectKey);
        return true;
      },
      getUsage: async () => ({
        objectCount: mockR2Objects.size,
        totalSizeBytes: 10 * 1024 * 1024,
        estimatedGB: 0.01,
        freeTierLimitGB: 10,
        usagePercent: 0.1,
      }),
    });

    // -----------------------------------------------------------------
    // TEST 1: Sharp Image Optimization Pipeline
    // -----------------------------------------------------------------
    await test('Sharp Pipeline converts sample PNG to WebP and enforces dimensions', async () => {
      // Create a test 2000x1500 PNG buffer
      const testPngBuffer = await sharp({
        create: {
          width: 2000,
          height: 1500,
          channels: 3,
          background: { r: 53, g: 75, b: 53 },
        },
      })
        .png()
        .toBuffer();

      const { buffer, info } = await optimizeImage(testPngBuffer);
      assert.strictEqual(info.format, 'webp', 'Image should be converted to WebP');
      assert.strictEqual(info.width, 1800, 'Width should be scaled down to max 1800px');
      assert.strictEqual(info.height, 1350, 'Aspect ratio should be preserved (2000:1500 -> 1800:1350)');
      assert(info.sizeBytes > 0, 'Buffer should have positive byte size');
    });

    await test('Sharp Pipeline rejects corrupted or non-image buffers', async () => {
      const corruptBuffer = Buffer.from('This is not a real image binary file payload.');
      let threw = false;
      try {
        await optimizeImage(corruptBuffer);
      } catch (err) {
        threw = true;
        assert(err.message.includes('Corrupted') || err.message.includes('invalid'), 'Should identify invalid file');
      }
      assert.strictEqual(threw, true, 'Should reject corrupt image buffer');
    });

    // -----------------------------------------------------------------
    // TEST 2: Authorization Checks on Media Routes
    // -----------------------------------------------------------------
    await test('Unauthenticated request to media upload is rejected (401)', async () => {
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const body = createMultipartBody(boundary, { folder: 'bentobabu/products' }, []);

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/images/upload',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        body,
        true
      );
      assert.strictEqual(res.statusCode, 401, 'Should return 401 for missing token');
    });

    await test('Customer role request to media upload is rejected with 403 Forbidden', async () => {
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const body = createMultipartBody(boundary, { folder: 'bentobabu/products' }, []);

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/images/upload',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${customerToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        body,
        true
      );
      assert.strictEqual(res.statusCode, 403, `Should return 403 for non-admin token, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    });

    // -----------------------------------------------------------------
    // TEST 3: Admin Image Upload via Cloudinary
    // -----------------------------------------------------------------
    let uploadedMediaId = null;
    let uploadedPublicId = null;

    await test('Admin successfully uploads and optimizes an image to Cloudinary', async () => {
      const sampleBuffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 245, g: 240, b: 230 },
        },
      })
        .jpeg()
        .toBuffer();

      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const body = createMultipartBody(
        boundary,
        { folder: 'bentobabu/products' },
        [{ fieldName: 'file', filename: 'fresh-bento.jpg', contentType: 'image/jpeg', buffer: sampleBuffer }]
      );

      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/images/upload',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        body,
        true
      );

      assert.strictEqual(res.statusCode, 201, `Upload should succeed with 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.media, 'Should return media metadata');
      assert.strictEqual(res.body.data.media.provider, 'CLOUDINARY');
      assert.strictEqual(res.body.data.media.mediaType, 'IMAGE');
      assert.strictEqual(res.body.data.media.status, 'ACTIVE');
      assert(res.body.data.deliveryUrls?.card, 'Should return fixed delivery preset URLs');

      uploadedMediaId = res.body.data.media._id;
      uploadedPublicId = res.body.data.media.publicId;
    });

    // -----------------------------------------------------------------
    // TEST 4: Cloudflare R2 Video Direct Upload Flow
    // -----------------------------------------------------------------
    let videoMediaId = null;
    let videoObjectKey = null;

    await test('Admin initializes direct video upload and receives presigned PUT URL', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/videos/initialize',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          filename: 'chef-special-prep.mp4',
          contentType: 'video/mp4',
          sizeBytes: 15 * 1024 * 1024, // 15 MB
          durationSeconds: 45,
        }
      );

      assert.strictEqual(res.statusCode, 200, `Video init should return 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.uploadUrl, 'Should return presigned upload URL');
      assert(res.body.data.objectKey, 'Should return unique objectKey');
      assert(res.body.data.mediaId, 'Should create pending Media record');

      videoMediaId = res.body.data.mediaId;
      videoObjectKey = res.body.data.objectKey;

      const mediaRecord = await Media.findById(videoMediaId);
      assert.strictEqual(mediaRecord.status, 'PENDING', 'Media record should be PENDING before confirmation');
    });

    await test('Video confirmation fails if object was not actually uploaded to R2', async () => {
      // Object is not in mockR2Objects map, so verifyObject returns exists: false
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/videos/confirm',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        { mediaId: videoMediaId }
      );

      assert.strictEqual(res.statusCode, 400, 'Should reject unverified upload');
      assert.strictEqual(res.body.success, false);

      const mediaRecord = await Media.findById(videoMediaId);
      assert.strictEqual(mediaRecord.status, 'FAILED', 'Media should be marked FAILED');
    });

    await test('Admin confirms valid video upload and attaches to product', async () => {
      // Re-initialize video
      const initRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/videos/initialize',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          filename: 'teriyaki-showcase.mp4',
          contentType: 'video/mp4',
          sizeBytes: 12 * 1024 * 1024,
          durationSeconds: 30,
        }
      );

      const newMediaId = initRes.body.data.mediaId;
      const newObjectKey = initRes.body.data.objectKey;

      // Mock that the browser successfully PUT the file to R2
      mockR2Objects.set(newObjectKey, {
        sizeBytes: 12 * 1024 * 1024,
        contentType: 'video/mp4',
      });

      // Create a test product
      const cat = await Category.findOne();
      const testProduct = await Product.create({
        name: `Video Bento Test ${Date.now()}`,
        slug: `video-bento-${Date.now()}`,
        description: 'Nutritious chef prepared bento',
        price: 349,
        category: cat._id,
      });

      // Confirm upload
      const confirmRes = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/media/videos/confirm',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          mediaId: newMediaId,
          productId: testProduct._id.toString(),
          posterUrl: 'https://res.cloudinary.com/bentobabu-test/image/upload/sample-poster.webp',
        }
      );

      assert.strictEqual(confirmRes.statusCode, 200);
      assert.strictEqual(confirmRes.body.success, true);

      const updatedProduct = await Product.findById(testProduct._id);
      assert(updatedProduct.video, 'Product should have video object');
      assert.strictEqual(updatedProduct.video.objectKey, newObjectKey);
      assert.strictEqual(updatedProduct.video.durationSeconds, 30);

      // Clean up test product
      await Product.findByIdAndDelete(testProduct._id);
      await Media.findByIdAndDelete(newMediaId);
    });

    // -----------------------------------------------------------------
    // TEST 5: Media Usage & Quota Monitoring
    // -----------------------------------------------------------------
    await test('Admin fetches media usage metrics and receives alert levels', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/admin/media/usage',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.cloudinary, 'Should return Cloudinary usage');
      assert(res.body.data.r2, 'Should return Cloudflare R2 usage');
      assert.strictEqual(res.body.data.r2.alertLevel, 'NORMAL', 'Alert level should be NORMAL under 70%');
    });

    // -----------------------------------------------------------------
    // TEST 6: Lifecycle Cleanup on Product Deletion
    // -----------------------------------------------------------------
    await test('Permanent product deletion cleans up both Cloudinary images and R2 video', async () => {
      const cat = await Category.findOne();
      const testProdKey = `bentobabu/products/test/${Date.now()}.mp4`;
      mockR2Objects.set(testProdKey, { sizeBytes: 5000, contentType: 'video/mp4' });

      const prod = await Product.create({
        name: `Permanent Delete Test ${Date.now()}`,
        slug: `perm-del-${Date.now()}`,
        description: 'Test product for deletion',
        price: 299,
        category: cat._id,
        imagesData: [
          {
            publicId: 'bentobabu/test/delete-me-1',
            secureUrl: 'https://res.cloudinary.com/bentobabu-test/image/upload/sample.webp',
          },
        ],
        video: {
          secureUrl: `https://media.bentobabu.com/${testProdKey}`,
          objectKey: testProdKey,
          mimeType: 'video/mp4',
        },
      });

      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/products/${prod._id}?permanent=true`,
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert(destroyedAssets.includes('bentobabu/test/delete-me-1'), 'Cloudinary image should be deleted');
      assert(deletedR2Objects.includes(testProdKey), 'R2 video should be deleted');

      const check = await Product.findById(prod._id);
      assert.strictEqual(check, null, 'Product should be removed from database');
    });

    // Clean up created test media
    if (uploadedMediaId) {
      await Media.findByIdAndDelete(uploadedMediaId);
    }
  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
  } finally {
    console.log(`\nMedia Management Audit Complete: ${passed}/${total} tests passed.\n`);
    if (serverInstance) {
      serverInstance.close();
    }
    await mongoose.disconnect();
    process.exit(passed === total ? 0 : 1);
  }
};

runMediaAudit();
