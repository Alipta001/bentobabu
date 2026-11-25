process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const { User, Product, Category } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { app } = require('../server');

let serverInstance = null;
let port = 0;

const makeRequest = (options, body = null) => {
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
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
};

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Signature Items Backend & API Verification Suite');
  console.log('========================================================================\n');

  await connectDB();

  await new Promise((resolve) => {
    serverInstance = app.listen(0, '127.0.0.1', () => {
      port = serverInstance.address().port;
      resolve();
    });
  });

  const ts = Date.now();
  let testCategory = null;
  let adminUser = null;
  let customerUser = null;
  let adminToken = '';
  let customerToken = '';
  const createdProductIds = [];

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
    // Setup test users & category
    testCategory = await Category.create({
      name: `Signature Test Cat ${ts}`,
      slug: `sig-test-cat-${ts}`,
      isActive: true,
    });

    adminUser = await User.create({
      name: 'Sig Admin',
      email: `sig_admin_${ts}@bentobabu.test`,
      phone: `91${String(ts).slice(-8)}`,
      passwordHash: 'hashed_pw_test',
      role: 'ADMIN',
      isActive: true,
    });

    customerUser = await User.create({
      name: 'Sig Customer',
      email: `sig_cust_${ts}@bentobabu.test`,
      phone: `92${String(ts).slice(-8)}`,
      passwordHash: 'hashed_pw_test',
      role: 'CUSTOMER',
      isActive: true,
    });

    adminToken = generateAccessToken(adminUser);
    customerToken = generateAccessToken(customerUser);

    let defaultProdId = null;
    let sigProdId = null;

    await test('1. New products default to isSignatureItem: false', async () => {
      const res = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: `Regular Bowl ${ts}`,
          description: 'Regular balanced meal',
          price: 199,
          category: testCategory._id.toString(),
          stockQuantity: 10,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.isSignatureItem, false);
      defaultProdId = res.body.data.id || res.body.data._id;
      createdProductIds.push(defaultProdId);
    });

    await test('2. Admin can create a signature product (isSignatureItem: true)', async () => {
      const res = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/products',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: `Signature Bento ${ts}`,
          description: 'Chef special signature bento',
          price: 299,
          category: testCategory._id.toString(),
          stockQuantity: 15,
          isSignatureItem: true,
        }
      );

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.data.isSignatureItem, true);
      sigProdId = res.body.data.id || res.body.data._id;
      createdProductIds.push(sigProdId);
    });

    await test('3. Admin can update signature status (false -> true -> false)', async () => {
      const patch1 = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/products/${defaultProdId}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isSignatureItem: true }
      );
      assert.strictEqual(patch1.statusCode, 200);
      assert.strictEqual(patch1.body.data.isSignatureItem, true);

      const patch2 = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/products/${defaultProdId}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isSignatureItem: false }
      );
      assert.strictEqual(patch2.statusCode, 200);
      assert.strictEqual(patch2.body.data.isSignatureItem, false);
    });

    await test('4. Unauthorized / non-admin users cannot modify signature status (401 & 403)', async () => {
      const unauthRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/products/${defaultProdId}`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        },
        { isSignatureItem: true }
      );
      assert.strictEqual(unauthRes.statusCode, 401);

      const custRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/products/${defaultProdId}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`,
          },
        },
        { isSignatureItem: true }
      );
      assert.strictEqual(custRes.statusCode, 403);
    });

    await test('5. Customer API returns isSignatureItem flag and preserves category visibility', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/products?category=${testCategory._id.toString()}&skipCache=true`,
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 200);
      const list = res.body.data;
      const sigItem = list.find((p) => (p.id || p._id) === sigProdId);
      const regItem = list.find((p) => (p.id || p._id) === defaultProdId);

      assert.ok(sigItem, 'Signature product must still appear in its normal category');
      assert.strictEqual(sigItem.isSignatureItem, true);
      assert.ok(regItem, 'Regular product must appear in its normal category');
      assert.strictEqual(regItem.isSignatureItem, false);

      // Verify detail endpoint also includes isSignatureItem
      const detailRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/products/${sigItem.slug}`,
        method: 'GET',
      });
      assert.strictEqual(detailRes.statusCode, 200);
      assert.strictEqual(detailRes.body.data.isSignatureItem, true);
    });

    await test('6. Inactive signature products are excluded from public customer API', async () => {
      const inactiveSig = await Product.create({
        name: `Inactive Sig ${ts}`,
        slug: `inactive-sig-${ts}`,
        description: 'Hidden signature item',
        price: 249,
        category: testCategory._id,
        categories: [testCategory._id],
        stockQuantity: 10,
        isAvailable: true,
        isActive: false,
        isSignatureItem: true,
      });
      createdProductIds.push(inactiveSig._id);

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/products?isSignatureItem=true&skipCache=true`,
        method: 'GET',
      });
      assert.strictEqual(res.statusCode, 200);
      const foundInactive = res.body.data.find((p) => (p.id || p._id) === inactiveSig._id.toString());
      assert.strictEqual(foundInactive, undefined, 'Inactive signature item must NOT be returned publicly');
    });

    await test('7. Invalid non-boolean isSignatureItem payload is rejected with 400', async () => {
      const badRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/products/${defaultProdId}`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { isSignatureItem: 'invalid-string' }
      );
      assert.strictEqual(badRes.statusCode, 400);
    });
  } finally {
    console.log('\n--- Cleanup ---');
    if (createdProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: createdProductIds } });
    }
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (customerUser) await User.deleteOne({ _id: customerUser._id });
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(` Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[FATAL] Test suite crashed:', err);
  process.exit(1);
});
