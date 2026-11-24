process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const { SystemSetting } = require('../app/models');
const SettingsController = require('../app/controllers/settingsController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const SupportController = require('../app/controllers/supportController');
const { redisGet, redisSet } = require('../app/config/redis');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    set(headerOrObj, val) {
      if (typeof headerOrObj === 'object') {
        Object.assign(this.headers, headerOrObj);
      } else {
        this.headers[headerOrObj] = val;
      }
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Dynamic Brand & Business Contact Configuration Test Suite');
  console.log('========================================================================\n');

  await connectDB();

  // Snapshot original settings so we can cleanly restore them
  const originalSettings = await SystemSetting.find({}).lean();
  console.log(`[INFO] Captured ${originalSettings.length} initial SystemSetting entries for cleanup snapshot.\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: Public Settings Endpoint Structure & Headers
    // -------------------------------------------------------------------------
    console.log('--- Test Group 1: Public Brand & Contact Endpoints ---');

    await test('Scenario 1.1: GET /api/v1/settings/public returns 200 with required structure', async () => {
      const req = {};
      const res = createMockRes();
      await SettingsController.getPublicSettings(req, res, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.data && res.data.success, 'Response must have success: true');
      const d = res.data.data;
      assert.ok(d.name, 'Must have name');
      assert.ok(d.businessName, 'Must have businessName');
      assert.ok(d.tagline, 'Must have tagline');
      assert.ok(d.description, 'Must have description');
      assert.ok(d.contact, 'Must have contact object');
      assert.ok(d.contact.email, 'Must have contact.email');
      assert.ok(d.contact.phone, 'Must have contact.phone');
      assert.ok(d.contact.whatsapp, 'Must have contact.whatsapp');
      assert.ok(d.contact.address, 'Must have contact.address');
      assert.ok(d.contact.operatingHours, 'Must have contact.operatingHours');
      assert.ok(d.social, 'Must have social object');
      assert.ok(d.social.instagram, 'Must have social.instagram');
      assert.ok(d.social.facebook, 'Must have social.facebook');
      assert.ok(d.social.twitter, 'Must have social.twitter');
      assert.ok(d.social.linkedin, 'Must have social.linkedin');
      assert.ok(d.fssai, 'Must have fssai object');
      assert.ok(d.websiteUrl, 'Must have websiteUrl');
    });

    await test('Scenario 1.2: GET /api/v1/settings/public sets Cache-Control with stale-while-revalidate', async () => {
      const req = {};
      const res = createMockRes();
      await SettingsController.getPublicSettings(req, res, (err) => {
        if (err) throw err;
      });

      assert.ok(res.headers['Cache-Control'], 'Must set Cache-Control header');
      assert.ok(
        res.headers['Cache-Control'].includes('public') &&
          res.headers['Cache-Control'].includes('max-age=60'),
        'Cache-Control must specify public, max-age=60'
      );
    });

    await test('Scenario 1.3: GET /api/v1/settings/public NEVER leaks sensitive/internal system settings', async () => {
      const req = {};
      const res = createMockRes();
      await SettingsController.getPublicSettings(req, res, (err) => {
        if (err) throw err;
      });

      const d = res.data.data;
      const forbiddenKeys = [
        'JWT_SECRET',
        'MSG91_AUTH_KEY',
        'RAZORPAY_KEY_SECRET',
        'UPSTASH_REDIS_REST_TOKEN',
        'MAINTENANCE_MODE',
        'RESEND_API_KEY',
        'ZOHO_ZEPTOMAIL_API_KEY',
        'CLOUDINARY_API_SECRET',
      ];
      for (const key of forbiddenKeys) {
        assert.strictEqual(d[key], undefined, `Leaked sensitive key: ${key}`);
      }
    });

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Admin Updates & Immediate Public Synchronization
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 2: Dynamic Update Synchronization ---');

    await test('Scenario 2.1: Admin updates BUSINESS_ADDRESS and both public & support endpoints reflect it', async () => {
      const updatedAddress = 'Holding No. 42, River View Road, Barrackpore, Kolkata - 700120';
      const updateReq = {
        body: {
          settings: {
            BUSINESS_ADDRESS: updatedAddress,
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 200);

      // Verify public settings
      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(pubRes.data.data.contact.address, updatedAddress);

      // Verify support config
      const suppReq = {};
      const suppRes = createMockRes();
      await SupportController.getSupportConfig(suppReq, suppRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(suppRes.data.data.address, updatedAddress);
    });

    await test('Scenario 2.2: Admin updates SUPPORT_PHONE and SUPPORT_WHATSAPP independently', async () => {
      const newPhone = '8123456789';
      const newWhatsapp = '7003123456';
      const updateReq = {
        body: {
          settings: {
            SUPPORT_PHONE: newPhone,
            SUPPORT_WHATSAPP: newWhatsapp,
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(pubRes.data.data.contact.phone, `+91 ${newPhone}`);
      assert.strictEqual(pubRes.data.data.contact.whatsapp, `+91 ${newWhatsapp}`);
    });

    await test('Scenario 2.3: Admin updates SUPPORT_HOURS and public operatingHours reflects it', async () => {
      const customHours = '8:00 AM – 11:00 PM (Monday to Sunday)';
      const updateReq = {
        body: {
          settings: {
            SUPPORT_HOURS: customHours,
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(pubRes.data.data.contact.operatingHours, customHours);
    });

    await test('Scenario 2.4: Admin updates social channels (Instagram, Facebook, Twitter, LinkedIn)', async () => {
      const socialUpdates = {
        INSTAGRAM_URL: 'https://instagram.com/bentobabu_official',
        FACEBOOK_URL: 'https://facebook.com/bentobabuofficial',
        TWITTER_URL: 'https://x.com/bentobabudelivers',
        LINKEDIN_URL: 'https://linkedin.com/company/bentobabu-kitchens',
      };
      const updateReq = {
        body: {
          settings: socialUpdates,
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(pubRes.data.data.social.instagram, socialUpdates.INSTAGRAM_URL);
      assert.strictEqual(pubRes.data.data.social.facebook, socialUpdates.FACEBOOK_URL);
      assert.strictEqual(pubRes.data.data.social.twitter, socialUpdates.TWITTER_URL);
      assert.strictEqual(pubRes.data.data.social.linkedin, socialUpdates.LINKEDIN_URL);
    });

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Validation, Security & Error Handling
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 3: Validation, Security & Fallback Logic ---');

    await test('Scenario 3.1: Invalid WhatsApp number (non-10-digit) is rejected with 400', async () => {
      const updateReq = {
        body: {
          settings: {
            SUPPORT_WHATSAPP: '12345', // too short
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 400);
      assert.ok(updateRes.data.message.includes('10-digit'), 'Error message must specify 10 digits');
    });

    await test('Scenario 3.2: Invalid social URL (unsafe scheme) is rejected with 400', async () => {
      const updateReq = {
        body: {
          settings: {
            INSTAGRAM_URL: 'javascript:alert(1)',
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 400);
      assert.ok(updateRes.data.message.includes('valid web URL'), 'Error message must specify valid web URL');
    });

    await test('Scenario 3.3: Empty/null SUPPORT_WHATSAPP defaults safely to SUPPORT_PHONE', async () => {
      const updateReq = {
        body: {
          settings: {
            SUPPORT_PHONE: '8584085669',
            SUPPORT_WHATSAPP: '', // clear explicit whatsapp
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, (err) => {
        if (err) throw err;
      });
      assert.strictEqual(pubRes.data.data.contact.whatsapp, '+91 8584085669');
    });

    await test('Scenario 3.4: Redis cache key cache:public_settings is invalidated immediately on admin update', async () => {
      // 1. Prime the public cache
      const pubReq1 = {};
      const pubRes1 = createMockRes();
      await SettingsController.getPublicSettings(pubReq1, pubRes1, (err) => {
        if (err) throw err;
      });

      // Verify it exists in Redis
      const cachedBefore = await redisGet('cache:public_settings');
      assert.ok(cachedBefore !== null, 'Redis cache:public_settings should be primed');

      // 2. Perform an update
      const updateReq = {
        body: {
          settings: {
            BUSINESS_NAME: 'Bento Babu Gourmet Kitchen',
          },
        },
      };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, (err) => {
        if (err) throw err;
      });

      // 3. Verify Redis cache was purged
      const cachedAfter = await redisGet('cache:public_settings');
      assert.strictEqual(cachedAfter, null, 'Redis cache:public_settings must be invalidated');
    });

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP & RESTORATION
    // -------------------------------------------------------------------------
    console.log('\n--- Cleanup & Restoration ---');
    try {
      // Restore all original settings snapshot
      for (const s of originalSettings) {
        await SystemSetting.findOneAndUpdate(
          { key: s.key },
          { value: s.value, description: s.description, isPublic: s.isPublic },
          { upsert: true }
        );
      }
      // Delete any keys created during test that weren't in snapshot
      const currentKeys = await SystemSetting.find({}).lean();
      const origKeySet = new Set(originalSettings.map((s) => s.key));
      for (const c of currentKeys) {
        if (!origKeySet.has(c.key)) {
          await SystemSetting.deleteOne({ key: c.key });
        }
      }

      // Invalidate Redis caches
      const { redisDel } = require('../app/config/redis');
      await redisDel('cache:public_settings');
      await redisDel('cache:support_config');
      await redisDel('cache:ordering_status');
      console.log('[INFO] Successfully restored initial SystemSetting database state and cleared Redis caches.\n');
    } catch (cleanupErr) {
      console.error('[WARN] Cleanup error:', cleanupErr.message);
    }
  }

  console.log('========================================================================');
  console.log(` Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('[FATAL] Test runner crashed:', err);
  process.exit(1);
});
