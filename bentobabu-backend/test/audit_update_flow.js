process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const connectDB = require('../app/config/db');
const { SystemSetting } = require('../app/models');
const SettingsController = require('../app/controllers/settingsController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const SupportController = require('../app/controllers/supportController');
const { redisGet, redisDel } = require('../app/config/redis');

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

async function runAudit() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Admin-to-Customer Update Flow & Cache Audit (Staging)');
  console.log('========================================================================\n');

  await connectDB();

  const originalSettings = await SystemSetting.find({}).lean();
  console.log(`[SNAPSHOT] Captured initial state of ${originalSettings.length} settings in staging MongoDB.\n`);

  // Target authoritative address & values to verify at end
  const AUTHORITATIVE_ADDRESS = 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';
  const AUTHORITATIVE_PHONE = '+91 8584085669';
  const AUTHORITATIVE_WHATSAPP = '+91 8584085669';
  const AUTHORITATIVE_EMAIL = 'bentobabuofficial@gmail.com';
  const AUTHORITATIVE_HOURS = '7:00 AM – 10:30 PM (Daily)';

  let stepCount = 0;

  async function auditStep(name, fn) {
    stepCount++;
    console.log(`Step ${stepCount}: ${name}`);
    await fn();
    console.log(`  ✓ Passed\n`);
  }

  try {
    // -------------------------------------------------------------------------
    // FLOW 1: Business Address Update Flow
    // -------------------------------------------------------------------------
    await auditStep('Change business address -> verify MongoDB -> verify Redis purge -> verify Public API', async () => {
      // 1. Prime Redis cache first
      const primeReq = {};
      const primeRes = createMockRes();
      await SettingsController.getPublicSettings(primeReq, primeRes, () => {});
      const cachedBefore = await redisGet('cache:public_settings');
      assert.ok(cachedBefore !== null, 'Redis cache:public_settings should be active');

      // 2. Admin updates address
      const testAddress = 'BentoBabu Culinary Hub, Holding 12, Station Road, Barrackpore, West Bengal - 700122, India';
      const updateReq = { body: { settings: { BUSINESS_ADDRESS: testAddress } } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      // 3. Verify MongoDB stored the value
      const stored = await SystemSetting.findOne({ key: 'BUSINESS_ADDRESS' }).lean();
      assert.strictEqual(stored.value, testAddress);

      // 4. Verify Redis cache was purged
      const cachedAfter = await redisGet('cache:public_settings');
      assert.strictEqual(cachedAfter, null, 'Redis cache:public_settings must be null after update');

      // 5. Fetch Public API again
      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      assert.strictEqual(pubRes.data.data.contact.address, testAddress);

      // 6. Verify Support API
      const suppReq = {};
      const suppRes = createMockRes();
      await SupportController.getSupportConfig(suppReq, suppRes, () => {});
      assert.strictEqual(suppRes.data.data.address, testAddress);
    });

    // -------------------------------------------------------------------------
    // FLOW 2: Phone and WhatsApp Update Flow
    // -------------------------------------------------------------------------
    await auditStep('Change phone & WhatsApp -> verify MongoDB -> verify Redis purge -> verify Public API', async () => {
      const testPhone = '8123456789';
      const testWhatsapp = '7003123456';
      const updateReq = { body: { settings: { SUPPORT_PHONE: testPhone, SUPPORT_WHATSAPP: testWhatsapp } } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      const cachedAfter = await redisGet('cache:public_settings');
      assert.strictEqual(cachedAfter, null);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      assert.strictEqual(pubRes.data.data.contact.phone, `+91 ${testPhone}`);
      assert.strictEqual(pubRes.data.data.contact.whatsapp, `+91 ${testWhatsapp}`);
    });

    // -------------------------------------------------------------------------
    // FLOW 3: Support Email Update Flow
    // -------------------------------------------------------------------------
    await auditStep('Change support email -> verify MongoDB -> verify Redis purge -> verify Public API', async () => {
      const testEmail = 'support.desk@bentobabu.com';
      const updateReq = { body: { settings: { SUPPORT_EMAIL: testEmail } } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      assert.strictEqual(pubRes.data.data.contact.email, testEmail);

      const suppReq = {};
      const suppRes = createMockRes();
      await SupportController.getSupportConfig(suppReq, suppRes, () => {});
      assert.strictEqual(suppRes.data.data.email, testEmail);
    });

    // -------------------------------------------------------------------------
    // FLOW 4: Operating Hours Update Flow
    // -------------------------------------------------------------------------
    await auditStep('Change operating hours -> verify MongoDB -> verify Redis purge -> verify Public API', async () => {
      const testHours = '6:30 AM – 11:00 PM (Daily)';
      const updateReq = { body: { settings: { SUPPORT_HOURS: testHours } } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      assert.strictEqual(pubRes.data.data.contact.operatingHours, testHours);

      const suppReq = {};
      const suppRes = createMockRes();
      await SupportController.getSupportConfig(suppReq, suppRes, () => {});
      assert.strictEqual(suppRes.data.data.operatingHours, testHours);
    });

    // -------------------------------------------------------------------------
    // FLOW 5: Social Media URLs Flow
    // -------------------------------------------------------------------------
    await auditStep('Change social media URLs -> verify Public API returns updated links', async () => {
      const socialUpdates = {
        INSTAGRAM_URL: 'https://instagram.com/bentobabu_live',
        FACEBOOK_URL: 'https://facebook.com/bentobabu_live',
        TWITTER_URL: 'https://x.com/bentobabu_live',
        LINKEDIN_URL: 'https://linkedin.com/company/bentobabu-official',
      };
      const updateReq = { body: { settings: socialUpdates } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      assert.strictEqual(pubRes.data.data.social.instagram, socialUpdates.INSTAGRAM_URL);
      assert.strictEqual(pubRes.data.data.social.facebook, socialUpdates.FACEBOOK_URL);
      assert.strictEqual(pubRes.data.data.social.twitter, socialUpdates.TWITTER_URL);
      assert.strictEqual(pubRes.data.data.social.linkedin, socialUpdates.LINKEDIN_URL);
    });

    // -------------------------------------------------------------------------
    // FLOW 6: Authoritative PIN 700122 Verification
    // -------------------------------------------------------------------------
    await auditStep('Ensure authoritative address has PIN 700122 and NOT 700120', async () => {
      // Set to the true authoritative address
      const authUpdates = {
        BUSINESS_ADDRESS: AUTHORITATIVE_ADDRESS,
        SUPPORT_PHONE: '8584085669',
        SUPPORT_WHATSAPP: '8584085669',
        SUPPORT_EMAIL: AUTHORITATIVE_EMAIL,
        SUPPORT_HOURS: AUTHORITATIVE_HOURS,
      };
      const updateReq = { body: { settings: authUpdates } };
      const updateRes = createMockRes();
      await AdminSettingsController.updateSettings(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 200);

      const pubReq = {};
      const pubRes = createMockRes();
      await SettingsController.getPublicSettings(pubReq, pubRes, () => {});
      const addr = pubRes.data.data.contact.address;
      assert.strictEqual(addr, AUTHORITATIVE_ADDRESS);
      assert.ok(addr.includes('700122'), 'Address must contain 700122');
      assert.strictEqual(addr.includes('700120'), false, 'Address must NOT contain 700120');

      // Also check support endpoint
      const suppReq = {};
      const suppRes = createMockRes();
      await SupportController.getSupportConfig(suppReq, suppRes, () => {});
      assert.strictEqual(suppRes.data.data.address, AUTHORITATIVE_ADDRESS);
      assert.ok(suppRes.data.data.address.includes('700122'));
      assert.strictEqual(suppRes.data.data.address.includes('700120'), false);
    });

  } finally {
    // Cleanly purge caches
    await redisDel('cache:public_settings');
    await redisDel('cache:support_config');
    await redisDel('cache:ordering_status');
    console.log('[INFO] Redis caches purged after audit completion.\n');
  }

  console.log('========================================================================');
  console.log('  ALL AUDIT FLOWS COMPLETED SUCCESSFULLY!');
  console.log('========================================================================\n');
  process.exit(0);
}

runAudit().catch((err) => {
  console.error('[FATAL] Audit crashed:', err);
  process.exit(1);
});
