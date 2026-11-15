process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const { User, Product, Category, VideoContent } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { validateEnv } = require('../app/config/env');
const { parseAndValidateYouTubeUrl, isValidCustomThumbnailUrl } = require('../app/utils/youtube');
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

const runVideoAudit = async () => {
  console.log('================================================================');
  console.log('   BENTO BABU — YOUTUBE VIDEO LIBRARY & DISCOVERY TEST SUITE   ');
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

    // Ensure Admin & Customer users
    let admin = await User.findOne({ role: 'ADMIN' });
    if (!admin) {
      admin = await User.create({
        name: 'Video Admin',
        email: `video-admin-${Date.now()}@bentobabu.test`,
        password: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'ADMIN',
        isEmailVerified: true,
      });
    }
    const adminToken = generateAccessToken(admin);

    let customer = await User.findOne({ role: 'CUSTOMER' });
    if (!customer) {
      customer = await User.create({
        name: 'Video Customer',
        email: `video-customer-${Date.now()}@bentobabu.test`,
        password: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
        role: 'CUSTOMER',
        isEmailVerified: true,
      });
    }
    const customerToken = generateAccessToken(customer);

    // Clean up any old test videos
    await VideoContent.deleteMany({ title: /^Test Video/ });

    // -------------------------------------------------------------
    // 1. YouTube URL Parser & Validator Unit Tests
    // -------------------------------------------------------------
    await test('Validates standard watch URL and extracts 11-char ID', async () => {
      const parsed = parseAndValidateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.videoId, 'dQw4w9WgXcQ');
      assert.strictEqual(parsed.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      assert.strictEqual(parsed.defaultThumbnailUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    await test('Validates youtu.be short link', async () => {
      const parsed = parseAndValidateYouTubeUrl('https://youtu.be/M7lc1UVf-VE?feature=shared');
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.videoId, 'M7lc1UVf-VE');
    });

    await test('Validates YouTube Shorts URL', async () => {
      const parsed = parseAndValidateYouTubeUrl('https://youtube.com/shorts/lY2yjAdbvdQ');
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.videoId, 'lY2yjAdbvdQ');
    });

    await test('Validates YouTube Embed URL', async () => {
      const parsed = parseAndValidateYouTubeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      assert.strictEqual(parsed.isValid, true);
      assert.strictEqual(parsed.videoId, 'dQw4w9WgXcQ');
    });

    await test('Rejects non-YouTube and malicious domains', async () => {
      const p1 = parseAndValidateYouTubeUrl('https://vimeo.com/12345678');
      assert.strictEqual(p1.isValid, false);

      const p2 = parseAndValidateYouTubeUrl('https://malicious-site.com/watch?v=dQw4w9WgXcQ');
      assert.strictEqual(p2.isValid, false);

      const p3 = parseAndValidateYouTubeUrl('javascript:alert(1)');
      assert.strictEqual(p3.isValid, false);
    });

    await test('Rejects invalid video ID formats', async () => {
      const p = parseAndValidateYouTubeUrl('https://www.youtube.com/watch?v=shortID');
      assert.strictEqual(p.isValid, false);
      assert(p.error.includes('11 alphanumeric'));
    });

    // -------------------------------------------------------------
    // 2. Admin Video Management APIs
    // -------------------------------------------------------------
    let createdVideoId = null;
    let createdVideoSlug = null;

    await test('Customer role is rejected from POST /api/v1/admin/videos with 403', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/videos',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${customerToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          title: 'Unauthorized Video Attempt',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          category: 'Healthy Meals',
          contentType: 'Recipes',
        }
      );
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Admin successfully creates a new published video', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/videos',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          title: 'Test Video Chef Salmon Bento Prep',
          description: 'Step-by-step preparation of omega-3 rich salmon with steamed greens.',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          category: 'Healthy Meals',
          contentType: 'Food Preparation',
          preparationMethods: ['Steamed', 'Grilled'],
          dietaryTags: ['NON_VEG'],
          mealType: ['LUNCH', 'DINNER'],
          isFeatured: true,
          status: 'PUBLISHED',
        }
      );

      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.youtubeVideoId, 'dQw4w9WgXcQ');
      assert(res.body.data.slug.includes('test-video-chef-salmon-bento-prep'));
      assert(res.body.data.thumbnailUrl.includes('i.ytimg.com'));
      assert(res.body.data.publishedAt, 'Published video should have publishedAt timestamp');

      createdVideoId = res.body.data._id;
      createdVideoSlug = res.body.data.slug;
    });

    await test('Admin creates a draft video and slug collisions are resolved safely', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: '/api/v1/admin/videos',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          title: 'Test Video Chef Salmon Bento Prep', // Duplicate title to test collision handling
          description: 'Draft notes on cooking techniques.',
          youtubeUrl: 'https://youtu.be/M7lc1UVf-VE',
          category: 'Healthy Meals',
          contentType: 'Recipes',
          status: 'DRAFT',
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.notStrictEqual(res.body.data.slug, createdVideoSlug, 'Duplicate slug should have suffix');
      assert.strictEqual(res.body.data.status, 'DRAFT');
      assert.strictEqual(res.body.data.publishedAt, null, 'Draft should not have publishedAt');
    });

    await test('Admin updates video details and re-validates YouTube URL', async () => {
      const res = await makeRequest(
        {
          hostname: host,
          port,
          path: `/api/v1/admin/videos/${createdVideoId}`,
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
        {
          title: 'Test Video Chef Salmon Bento Prep (Updated)',
          youtubeUrl: 'https://www.youtube.com/shorts/lY2yjAdbvdQ',
          preparationMethods: ['Steamed', 'Grilled', 'Baked'],
        }
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.youtubeVideoId, 'lY2yjAdbvdQ');
      assert.strictEqual(res.body.data.title, 'Test Video Chef Salmon Bento Prep (Updated)');
      assert(res.body.data.preparationMethods.includes('Baked'));
    });

    await test('Admin lists videos with status and category filters', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/videos?status=all&category=${encodeURIComponent('Healthy Meals')}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.data));
      assert(res.body.data.length >= 2, 'Should list both published and draft videos');
    });

    // -------------------------------------------------------------
    // 3. Public Video Discovery APIs
    // -------------------------------------------------------------
    await test('Customer lists published videos (DRAFT videos hidden)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/videos?category=${encodeURIComponent('Healthy Meals')}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.data));
      const hasDraft = res.body.data.some((v) => v.status === 'DRAFT');
      assert.strictEqual(hasDraft, false, 'DRAFT videos must never appear in public listing');
    });

    await test('Customer retrieves featured videos', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/videos/featured',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.body.data));
      assert(res.body.data.length > 0);
      assert.strictEqual(res.body.data[0].isFeatured, true);
    });

    await test('Customer retrieves single video by slug with related videos', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/videos/${createdVideoSlug}`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      assert(res.body.data.video, 'Should return video payload');
      assert.strictEqual(res.body.data.video.slug, createdVideoSlug);
      assert(Array.isArray(res.body.data.relatedVideos), 'Should include related videos array');
    });

    await test('Customer cannot retrieve non-existent or unpublished video slug (404)', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: '/api/v1/videos/totally-unknown-video-slug',
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.success, false);
    });

    // -------------------------------------------------------------
    // 4. Admin Video Deletion
    // -------------------------------------------------------------
    await test('Admin deletes video record', async () => {
      const res = await makeRequest({
        hostname: host,
        port,
        path: `/api/v1/admin/videos/${createdVideoId}`,
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      const check = await VideoContent.findById(createdVideoId);
      assert.strictEqual(check, null, 'Video should be deleted from database');
    });

    // Final clean up of test records
    await VideoContent.deleteMany({ title: /^Test Video/ });
  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
  } finally {
    console.log(`\nVideo Content Audit Complete: ${passed}/${total} tests passed.\n`);
    if (serverInstance) {
      serverInstance.close();
    }
    await mongoose.disconnect();
    process.exit(passed === total ? 0 : 1);
  }
};

runVideoAudit();
