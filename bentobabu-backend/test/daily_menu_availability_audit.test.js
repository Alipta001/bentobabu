process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const { redisClient } = require('../app/config/redis');
const { User, Product, Category, DailyMenu } = require('../app/models');
const DailyMenuController = require('../app/controllers/dailyMenuController');
const ProductController = require('../app/controllers/productController');
const { getKolkataDateString, addDays } = require('../app/utils/businessDate');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
    },
  };
  return res;
}

function createNextCapture() {
  let capturedError = null;
  const next = (err) => {
    if (err) capturedError = err;
  };
  return { next, getError: () => capturedError };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — DAILY MENU AVAILABILITY AUDIT TEST SUITE       ');
  console.log('================================================================\n');

  await connectDB();

  const timestamp = Date.now();
  // Use isolated future dates so live staging today/tomorrow menus are never mutated
  const testDateA = '2099-05-10';
  const testDateB = '2099-05-11';
  const todayKolkata = getKolkataDateString();

  let adminUser;
  let testCategory;
  let normalProduct;
  let signatureProduct;

  let passedTests = 0;
  let failedTests = 0;

  function recordPass(name) {
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  }

  function recordFail(name, err) {
    failedTests++;
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err && err.stack ? err.stack : err}`);
  }

  try {
    adminUser = await User.create({
      name: `Menu Audit Admin ${timestamp}`,
      email: `menu_audit_admin_${timestamp}@test.bentobabu.in`,
      phone: `93${String(timestamp).slice(-8)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isVerified: true,
    });

    testCategory = await Category.create({
      name: `Audit Category ${timestamp}`,
      slug: `audit-cat-${timestamp}`,
      isActive: true,
    });

    normalProduct = await Product.create({
      name: `Audit Normal Bowl ${timestamp}`,
      slug: `audit-normal-bowl-${timestamp}`,
      description: 'Test normal product for daily availability audit',
      price: 199,
      category: testCategory._id,
      categories: [testCategory._id],
      dietary: 'vegetarian',
      isAvailable: true,
      isSignatureItem: false,
      stockQuantity: 20,
      dailyLimit: 20,
    });

    signatureProduct = await Product.create({
      name: `Audit Signature Bowl ${timestamp}`,
      slug: `audit-signature-bowl-${timestamp}`,
      description: 'Test signature product for daily availability audit',
      price: 299,
      category: testCategory._id,
      categories: [testCategory._id],
      dietary: 'non-vegetarian',
      isAvailable: true,
      isSignatureItem: true,
      stockQuantity: 20,
      dailyLimit: 20,
    });

    // ------------------------------------------------------------------
    // 1. Admin toggleDailyMenuItem persists to MongoDB and survives reload
    // ------------------------------------------------------------------
    try {
      const resToggle = createMockRes();
      const cap1 = createNextCapture();
      await DailyMenuController.toggleDailyMenuItem(
        {
          user: adminUser,
          body: {
            date: testDateA,
            productId: String(normalProduct._id),
            isAvailable: false,
          },
        },
        resToggle,
        cap1.next
      );
      if (cap1.getError()) throw cap1.getError();
      assert.strictEqual(resToggle.statusCode, 200);
      assert.strictEqual(resToggle.data.success, true);

      // Verify MongoDB document was created and published
      const dbDoc = await DailyMenu.findOne({ date: testDateA }).lean();
      assert.ok(dbDoc, 'DailyMenu document must be persisted in MongoDB');
      assert.strictEqual(dbDoc.isPublished, true);

      const toggledDbItem = dbDoc.items.find(
        (i) => String(i.product) === String(normalProduct._id)
      );
      assert.ok(toggledDbItem, 'Toggled product must exist in DailyMenu.items');
      assert.strictEqual(toggledDbItem.isAvailable, false);

      // Simulate admin page reload via GET /menu/daily
      const resReload = createMockRes();
      const capReload = createNextCapture();
      await DailyMenuController.getDailyMenu(
        { user: adminUser, query: { date: testDateA } },
        resReload,
        capReload.next
      );
      if (capReload.getError()) throw capReload.getError();
      assert.strictEqual(resReload.statusCode, 200);

      const reloadedNormal = resReload.data.data.items.find(
        (i) => String(i.product._id || i.product) === String(normalProduct._id)
      );
      const reloadedSignature = resReload.data.data.items.find(
        (i) => String(i.product._id || i.product) === String(signatureProduct._id)
      );
      assert.strictEqual(reloadedNormal.isAvailable, false, 'Reload must show normalProduct unavailable');
      assert.strictEqual(reloadedSignature.isAvailable, true, 'Other products must remain available');

      recordPass('1. Admin toggleDailyMenuItem persists to MongoDB and survives reload');
    } catch (err) {
      recordFail('1. Admin toggleDailyMenuItem persists to MongoDB and survives reload', err);
    }

    // ------------------------------------------------------------------
    // 2. Date isolation: toggling testDateA does NOT affect testDateB
    // ------------------------------------------------------------------
    try {
      const resDateB = createMockRes();
      const capB = createNextCapture();
      await DailyMenuController.getDailyMenu(
        { user: adminUser, query: { date: testDateB } },
        resDateB,
        capB.next
      );
      if (capB.getError()) throw capB.getError();
      const itemB = resDateB.data.data.items.find(
        (i) => String(i.product._id || i.product) === String(normalProduct._id)
      );
      assert.strictEqual(itemB.isAvailable, true, 'testDateB must remain available when only testDateA was toggled');

      recordPass('2. Date isolation: toggling testDateA does not affect testDateB');
    } catch (err) {
      recordFail('2. Date isolation: toggling testDateA does not affect testDateB', err);
    }

    // ------------------------------------------------------------------
    // 3. Customer GET /products?date=... reflects date-specific availability
    // ------------------------------------------------------------------
    try {
      const resListA = createMockRes();
      const capListA = createNextCapture();
      await ProductController.getProducts(
        { headers: {}, query: { date: testDateA, category: String(testCategory._id) } },
        resListA,
        capListA.next
      );
      if (capListA.getError()) throw capListA.getError();
      assert.strictEqual(resListA.statusCode, 200);

      const listAProducts = resListA.data.data;
      const foundNormalA = listAProducts.find((p) => String(p._id) === String(normalProduct._id));
      const foundSigA = listAProducts.find((p) => String(p._id) === String(signatureProduct._id));
      assert.ok(foundNormalA, 'Unavailable product must still be returned for display with badge');
      assert.strictEqual(foundNormalA.isAvailable, false, 'normalProduct must be unavailable on testDateA');
      assert.strictEqual(foundSigA.isAvailable, true, 'signatureProduct must be available on testDateA');
      assert.strictEqual(foundSigA.isSignatureItem, true, 'isSignatureItem must be preserved');

      const resListB = createMockRes();
      const capListB = createNextCapture();
      await ProductController.getProducts(
        { headers: {}, query: { date: testDateB, category: String(testCategory._id) } },
        resListB,
        capListB.next
      );
      if (capListB.getError()) throw capListB.getError();
      const foundNormalB = resListB.data.data.find(
        (p) => String(p._id) === String(normalProduct._id)
      );
      assert.strictEqual(foundNormalB.isAvailable, true, 'normalProduct must be available on testDateB');

      recordPass('3. Customer GET /products?date=... reflects date-specific availability & preserves Signature Items');
    } catch (err) {
      recordFail('3. Customer GET /products?date=... reflects date-specific availability & preserves Signature Items', err);
    }

    // ------------------------------------------------------------------
    // 4. Customer GET /products/:slug?date=... uses date-specific cache & availability
    // ------------------------------------------------------------------
    try {
      // First request for testDateB (available) populates cache:products:detail:<slug>:testDateB
      const resSlugB = createMockRes();
      const capSlugB = createNextCapture();
      await ProductController.getProductBySlug(
        { params: { slug: normalProduct.slug }, query: { date: testDateB } },
        resSlugB,
        capSlugB.next
      );
      if (capSlugB.getError()) throw capSlugB.getError();
      assert.strictEqual(resSlugB.data.data.isAvailable, true);

      // Request for testDateA (unavailable) must NOT get stale testDateB cache
      const resSlugA = createMockRes();
      const capSlugA = createNextCapture();
      await ProductController.getProductBySlug(
        { params: { slug: normalProduct.slug }, query: { date: testDateA } },
        resSlugA,
        capSlugA.next
      );
      if (capSlugA.getError()) throw capSlugA.getError();
      assert.strictEqual(resSlugA.data.data.isAvailable, false);

      // Now toggle testDateA back to true and verify cache invalidation updates getProductBySlug
      const resToggleBack = createMockRes();
      const capBack = createNextCapture();
      await DailyMenuController.toggleDailyMenuItem(
        {
          user: adminUser,
          body: {
            date: testDateA,
            productId: String(normalProduct._id),
            isAvailable: true,
          },
        },
        resToggleBack,
        capBack.next
      );
      if (capBack.getError()) throw capBack.getError();

      const resSlugAAfter = createMockRes();
      const capSlugAAfter = createNextCapture();
      await ProductController.getProductBySlug(
        { params: { slug: normalProduct.slug }, query: { date: testDateA } },
        resSlugAAfter,
        capSlugAAfter.next
      );
      if (capSlugAAfter.getError()) throw capSlugAAfter.getError();
      assert.strictEqual(resSlugAAfter.data.data.isAvailable, true);

      recordPass('4. Customer GET /products/:slug?date=... respects date-keyed cache and invalidation');
    } catch (err) {
      recordFail('4. Customer GET /products/:slug?date=... respects date-keyed cache and invalidation', err);
    }

    // ------------------------------------------------------------------
    // 5. Existing features: continueYesterday & getWeeklyMenu & validation
    // ------------------------------------------------------------------
    try {
      // Mark signatureProduct unavailable on testDateA, then copy-yesterday to testDateB
      const resSigOff = createMockRes();
      await DailyMenuController.toggleDailyMenuItem(
        {
          user: adminUser,
          body: {
            date: testDateA,
            productId: String(signatureProduct._id),
            isAvailable: false,
          },
        },
        resSigOff,
        () => {}
      );
      assert.strictEqual(resSigOff.statusCode, 200);

      const resCopy = createMockRes();
      const capCopy = createNextCapture();
      await DailyMenuController.continueYesterday(
        { user: adminUser, body: { targetDate: testDateB } },
        resCopy,
        capCopy.next
      );
      if (capCopy.getError()) throw capCopy.getError();
      assert.strictEqual(resCopy.statusCode, 200);

      const copiedSig = resCopy.data.data.items.find(
        (i) => String(i.product._id || i.product) === String(signatureProduct._id)
      );
      assert.strictEqual(copiedSig.isAvailable, false, 'continueYesterday must copy unavailable state from testDateA to testDateB');

      // Check weekly matrix returns 7 days starting at testDateA
      const resWeekly = createMockRes();
      const capWeekly = createNextCapture();
      await DailyMenuController.getWeeklyMenu(
        { user: adminUser, query: { startDate: testDateA } },
        resWeekly,
        capWeekly.next
      );
      if (capWeekly.getError()) throw capWeekly.getError();
      assert.strictEqual(resWeekly.statusCode, 200);
      assert.strictEqual(resWeekly.data.data.days.length, 7);

      // Validation check: invalid payload rejected with 400
      const resBad = createMockRes();
      await DailyMenuController.toggleDailyMenuItem(
        { user: adminUser, body: { date: 'invalid-date', productId: 'bad', isAvailable: 'yes' } },
        resBad,
        () => {}
      );
      assert.strictEqual(resBad.statusCode, 400);

      recordPass('5. continueYesterday, getWeeklyMenu, and 400 validation work cleanly');
    } catch (err) {
      recordFail('5. continueYesterday, getWeeklyMenu, and 400 validation work cleanly', err);
    }
  } finally {
    console.log('\n[Cleanup] Removing audit test records...');
    await DailyMenu.deleteMany({ date: { $in: [testDateA, testDateB] } }).catch(() => {});
    if (normalProduct) await Product.deleteOne({ _id: normalProduct._id }).catch(() => {});
    if (signatureProduct) await Product.deleteOne({ _id: signatureProduct._id }).catch(() => {});
    if (testCategory) await Category.deleteOne({ _id: testCategory._id }).catch(() => {});
    if (adminUser) await User.deleteOne({ _id: adminUser._id }).catch(() => {});

    // Clear test product cache keys
    try {
      if (redisClient && redisClient.isOpen) {
        const keys = await redisClient.keys('cache:products:*');
        if (keys.length > 0) await redisClient.del(keys);
        await redisClient.quit();
      }
    } catch (_) {}

    await mongoose.disconnect().catch(() => {});
  }

  console.log('\n================================================================');
  console.log(`   TEST SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
