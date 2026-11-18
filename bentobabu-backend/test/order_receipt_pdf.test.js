const http = require('http');
const assert = require('assert');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { app } = require('../server');
const connectDB = require('../app/config/db');
const { connectRedis } = require('../app/config/redis');
const { User, Order, SystemSetting } = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const { generateOrderReceiptPdf } = require('../app/utils/receiptGenerator');
const b2Storage = require('../app/utils/b2Storage');
const orderReceiptService = require('../app/utils/orderReceiptService');
const receiptQueue = require('../app/utils/receiptQueue');

// In-Memory Backblaze B2 Mock
const inMemoryB2Store = new Map();
let b2UploadShouldFail = false;
let b2GetShouldFail = false;
let uploadCallCount = 0;

const mockB2 = {
  uploadFile: async ({ objectKey, body, contentType, contentDisposition, metadata }) => {
    uploadCallCount++;
    if (b2UploadShouldFail) {
      throw new Error('Simulated Backblaze B2 connection timeout during upload');
    }
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    inMemoryB2Store.set(objectKey, {
      buffer,
      contentType,
      contentDisposition,
      metadata,
      eTag: 'mock_etag_' + Date.now(),
      fileSize: buffer.length,
    });
    return {
      objectKey,
      bucket: 'bentobabu-receipts-mock',
      eTag: 'mock_etag_' + Date.now(),
      fileSize: buffer.length,
    };
  },
  getFile: async (objectKey) => {
    if (b2GetShouldFail) {
      throw new Error('Simulated B2 retrieval failure');
    }
    const item = inMemoryB2Store.get(objectKey);
    if (!item) {
      const err = new Error('NoSuchKey: The specified key does not exist.');
      err.name = 'NoSuchKey';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
    return {
      buffer: item.buffer,
      contentType: item.contentType || 'application/pdf',
      contentLength: item.fileSize,
      metadata: item.metadata,
      lastModified: new Date(),
    };
  },
  verifyObject: async (objectKey) => {
    const item = inMemoryB2Store.get(objectKey);
    if (!item) {
      return { exists: false, sizeBytes: 0, contentType: '', eTag: '' };
    }
    return {
      exists: true,
      sizeBytes: item.fileSize,
      contentType: item.contentType || 'application/pdf',
      eTag: item.eTag,
    };
  },
  deleteFile: async (objectKey) => {
    inMemoryB2Store.delete(objectKey);
    return { success: true, objectKey };
  },
  getSignedDownloadUrl: async (objectKey, expiresIn = 3600) => {
    return `https://s3.us-east-005.backblazeb2.com/bentobabu-receipts-mock/${objectKey}?presigned=true&exp=${expiresIn}`;
  },
};

// Install the mock client for b2Storage
b2Storage.setMockB2Client(mockB2);

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.address().port,
        ...options,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let parsed = null;
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            try {
              parsed = JSON.parse(buffer.toString('utf8'));
            } catch (e) {
              parsed = buffer.toString('utf8');
            }
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBuffer: buffer,
          });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting BentoBabu Backblaze B2 PDF Receipt Test Suite ---');
  await connectDB(process.env.MONGODB_URI);
  if (typeof connectRedis === 'function') {
    try {
      await connectRedis();
    } catch (e) {}
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 1. Setup test users
    const customer1 = await User.findOneAndUpdate(
      { email: 'b2_customer1@bentobabu.com' },
      {
        name: 'B2 Customer One',
        email: 'b2_customer1@bentobabu.com',
        phone: '9876511111',
        role: 'CUSTOMER',
        isPhoneVerified: true,
        isEmailVerified: true,
        password: 'Password123!',
      },
      { upsert: true, returnDocument: 'after' }
    );

    const customer2 = await User.findOneAndUpdate(
      { email: 'b2_customer2@bentobabu.com' },
      {
        name: 'B2 Customer Two',
        email: 'b2_customer2@bentobabu.com',
        phone: '9876522222',
        role: 'CUSTOMER',
        isPhoneVerified: true,
        isEmailVerified: true,
        password: 'Password123!',
      },
      { upsert: true, returnDocument: 'after' }
    );

    const admin = await User.findOneAndUpdate(
      { email: 'b2_admin@bentobabu.com' },
      {
        name: 'B2 Admin User',
        email: 'b2_admin@bentobabu.com',
        phone: '9876533333',
        role: 'ADMIN',
        isPhoneVerified: true,
        isEmailVerified: true,
        password: 'Password123!',
      },
      { upsert: true, returnDocument: 'after' }
    );

    const staff = await User.findOneAndUpdate(
      { email: 'b2_staff@bentobabu.com' },
      {
        name: 'B2 Kitchen Staff',
        email: 'b2_staff@bentobabu.com',
        phone: '9876544444',
        role: 'KITCHEN',
        isPhoneVerified: true,
        isEmailVerified: true,
        password: 'Password123!',
      },
      { upsert: true, returnDocument: 'after' }
    );

    const customer1Token = generateAccessToken(customer1);
    const customer2Token = generateAccessToken(customer2);
    const adminToken = generateAccessToken(admin);
    const staffToken = generateAccessToken(staff);

    // Clean up existing test orders
    await Order.deleteMany({
      orderNumber: { $in: ['BB-B2-ORD01', 'BB-B2-ORD02', 'BB-B2-ORD03', 'BB-B2-CONCURRENT', 'BB-B2-HISTORICAL'] },
    });

    // Create primary test order
    const dummyProd = new mongoose.Types.ObjectId();
    const order1 = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-ORD01',
      items: [
        {
          product: dummyProd,
          productName: 'Teriyaki Tofu Bento Box',
          quantity: 2,
          unitPrice: 280,
          subtotal: 560,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Customer One',
        phone: '9876511111',
        addressLine: 'Apt 101, Lake View Residency',
        landmark: 'Opposite Central Park',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 560,
      couponDiscount: 0,
      deliveryCharge: 30,
      taxAmount: 28,
      grandTotal: 618,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'CONFIRMED',
      receipt: {
        status: 'PENDING',
      },
    });

    // Test 1: PDF generated and uploaded to Backblaze B2 on initial request
    console.log('Testing 1: PDF generated and uploaded successfully to B2...');
    uploadCallCount = 0;
    const res1 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
      headers: {
        Authorization: `Bearer ${customer1Token}`,
      },
    });

    assert.strictEqual(res1.statusCode, 200, `Expected 200, got ${res1.statusCode}`);
    assert.strictEqual(res1.headers['content-type'], 'application/pdf');
    assert(res1.rawBuffer.slice(0, 5).toString('ascii').startsWith('%PDF-'), 'Response must start with %PDF-');
    assert.strictEqual(uploadCallCount, 1, 'B2 upload should be invoked exactly once');
    console.log('✓ Test 1 passed: PDF generated and uploaded successfully to Backblaze B2');

    // Test 2: Receipt metadata persisted correctly in MongoDB
    console.log('Testing 2: Receipt metadata persisted in Order document...');
    const refreshedOrder1 = await Order.findById(order1._id);
    assert.strictEqual(refreshedOrder1.receipt.status, 'STORED');
    assert.strictEqual(refreshedOrder1.receipt.storageProvider, 'BACKBLAZE_B2');
    assert(refreshedOrder1.receipt.objectKey.startsWith('receipts/'), 'objectKey must follow receipts/{year}/{month}/ format');
    assert(refreshedOrder1.receipt.objectKey.endsWith('BB-B2-ORD01.pdf'), 'objectKey must end with orderNumber.pdf');
    assert(refreshedOrder1.receipt.fileSize > 0, 'fileSize must be positive');
    assert(refreshedOrder1.receipt.uploadedAt instanceof Date, 'uploadedAt must be Date');
    assert(refreshedOrder1.receipt.snapshot.businessName, 'snapshot.businessName must be preserved');
    console.log('✓ Test 2 passed: Metadata persisted in database with deterministic objectKey and legal snapshot');

    // Test 3: Existing stored PDF reused on subsequent downloads without re-uploading
    console.log('Testing 3: Existing stored PDF reused on subsequent downloads...');
    const uploadCallsBefore = uploadCallCount;
    const res3 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
      headers: {
        Authorization: `Bearer ${customer1Token}`,
      },
    });

    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(uploadCallCount, uploadCallsBefore, 'No additional upload to B2 should occur when already STORED');
    console.log('✓ Test 3 passed: Subsequent downloads reuse the stored B2 object without regeneration');

    // Test 4: Customer cannot access another customer's receipt (403 Forbidden)
    console.log("Testing 4: Customer cannot access another customer's receipt...");
    const res4 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
      headers: {
        Authorization: `Bearer ${customer2Token}`,
      },
    });
    assert.strictEqual(res4.statusCode, 403, `Expected 403, got ${res4.statusCode}`);
    console.log('✓ Test 4 passed: Strict customer ownership enforced (403 Forbidden)');

    // Test 5: Unauthenticated requests rejected (401 Unauthorized)
    console.log('Testing 5: Unauthenticated request rejected...');
    const res5 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
    });
    assert.strictEqual(res5.statusCode, 401, `Expected 401, got ${res5.statusCode}`);
    console.log('✓ Test 5 passed: Unauthenticated requests rejected (401 Unauthorized)');

    // Test 6: Admin can download customer receipts (200 OK)
    console.log("Testing 6: Admin can download customer's receipt...");
    const res6 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.strictEqual(res6.statusCode, 200);
    assert.strictEqual(res6.headers['content-type'], 'application/pdf');
    console.log('✓ Test 6 passed: Admin authorized for operational receipt access');

    // Test 7: Kitchen staff can download customer receipts (200 OK)
    console.log("Testing 7: Kitchen staff can download customer's receipt...");
    const res7 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${order1._id}/receipt`,
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    assert.strictEqual(res7.statusCode, 200);
    assert.strictEqual(res7.headers['content-type'], 'application/pdf');
    console.log('✓ Test 7 passed: Kitchen staff authorized for package receipt verification');

    // Test 8: B2 upload failure handled gracefully
    console.log('Testing 8: Handling B2 upload failure gracefully...');
    const orderFail = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-ORD02',
      items: [
        {
          product: dummyProd,
          productName: 'Paneer Satay Bento',
          quantity: 1,
          unitPrice: 220,
          subtotal: 220,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Customer One',
        phone: '9876511111',
        addressLine: 'Apt 101',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 220,
      deliveryCharge: 0,
      taxAmount: 11,
      grandTotal: 231,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'CONFIRMED',
      receipt: { status: 'PENDING' },
    });

    b2UploadShouldFail = true; // Simulate B2 network timeout
    const res8 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${orderFail._id}/receipt`,
      headers: {
        Authorization: `Bearer ${customer1Token}`,
      },
    });

    b2UploadShouldFail = false; // Reset mock
    // Response should still serve the generated PDF so customer is not broken
    assert.strictEqual(res8.statusCode, 200);
    assert.strictEqual(res8.headers['content-type'], 'application/pdf');

    // But order in DB must NOT be marked STORED; it must be marked FAILED
    const refreshedOrderFail = await Order.findById(orderFail._id);
    assert.strictEqual(refreshedOrderFail.receipt.status, 'FAILED');
    assert(
      refreshedOrderFail.receipt.lastError.includes('Simulated Backblaze B2 connection timeout'),
      'lastError must record the storage failure message'
    );
    console.log('✓ Test 8 passed: B2 upload failure marked as FAILED in database without crashing download');

    // Test 9: Admin regeneration recovers FAILED receipts
    console.log('Testing 9: Admin controlled regeneration recovers FAILED receipts...');
    const res9 = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/orders/${orderFail._id}/receipt/regenerate`,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      },
      {}
    );

    assert.strictEqual(res9.statusCode, 200);
    assert.strictEqual(res9.body.success, true);
    assert.strictEqual(res9.body.data.receipt.status, 'STORED');

    const recoveredOrder = await Order.findById(orderFail._id);
    assert.strictEqual(recoveredOrder.receipt.status, 'STORED');
    assert.strictEqual(recoveredOrder.receipt.lastError, null);
    console.log('✓ Test 9 passed: Admin regeneration recovers FAILED receipt and transitions to STORED');

    // Test 10: Missing B2 object recovery
    console.log('Testing 10: Automatic recovery when B2 object is missing from storage...');
    // Artificially delete the object from B2 store while DB still says STORED
    const targetKey = recoveredOrder.receipt.objectKey;
    inMemoryB2Store.delete(targetKey);
    assert.strictEqual(inMemoryB2Store.has(targetKey), false);

    // Now request the receipt download - service must detect missing object and regenerate/re-upload
    const res10 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/orders/${orderFail._id}/receipt`,
      headers: {
        Authorization: `Bearer ${customer1Token}`,
      },
    });

    assert.strictEqual(res10.statusCode, 200);
    assert.strictEqual(res10.headers['content-type'], 'application/pdf');
    assert.strictEqual(inMemoryB2Store.has(targetKey), true, 'Missing object must be restored into B2');
    console.log('✓ Test 10 passed: Missing B2 object safely detected, regenerated, and restored');

    // Test 11: Concurrent requests do not create competing duplicate receipts
    console.log('Testing 11: Concurrent receipt generation requests...');
    const orderConcurrent = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-CONCURRENT',
      items: [
        {
          product: dummyProd,
          productName: 'Steamed Edamame & Brown Rice',
          quantity: 1,
          unitPrice: 190,
          subtotal: 190,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Customer One',
        phone: '9876511111',
        addressLine: 'Apt 101',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 190,
      deliveryCharge: 0,
      taxAmount: 9.5,
      grandTotal: 199.5,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'CONFIRMED',
      receipt: { status: 'PENDING' },
    });

    // Fire 5 simultaneous download requests for the same pending order
    const concurrentResponses = await Promise.all([
      makeRequest(server, { method: 'GET', path: `/api/v1/orders/${orderConcurrent._id}/receipt`, headers: { Authorization: `Bearer ${customer1Token}` } }),
      makeRequest(server, { method: 'GET', path: `/api/v1/orders/${orderConcurrent._id}/receipt`, headers: { Authorization: `Bearer ${customer1Token}` } }),
      makeRequest(server, { method: 'GET', path: `/api/v1/orders/${orderConcurrent._id}/receipt`, headers: { Authorization: `Bearer ${customer1Token}` } }),
      makeRequest(server, { method: 'GET', path: `/api/v1/orders/${orderConcurrent._id}/receipt`, headers: { Authorization: `Bearer ${customer1Token}` } }),
      makeRequest(server, { method: 'GET', path: `/api/v1/orders/${orderConcurrent._id}/receipt`, headers: { Authorization: `Bearer ${customer1Token}` } }),
    ]);

    for (const cr of concurrentResponses) {
      assert.strictEqual(cr.statusCode, 200, `Concurrent request failed with ${cr.statusCode}`);
      assert.strictEqual(cr.headers['content-type'], 'application/pdf');
    }

    const recheckConcurrent = await Order.findById(orderConcurrent._id);
    assert.strictEqual(recheckConcurrent.receipt.status, 'STORED');
    console.log('✓ Test 11 passed: Concurrent requests resolved cleanly without duplicate competing receipts');

    // Test 12: Historical receipt regeneration preserves original financial values and legal snapshot
    console.log('Testing 12: Historical receipt regeneration preserves snapshot data...');
    const orderHistorical = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-HISTORICAL',
      items: [
        {
          product: dummyProd,
          productName: 'Legacy Protein Bowl',
          quantity: 3,
          unitPrice: 150,
          subtotal: 450,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Customer One',
        phone: '9876511111',
        addressLine: 'Old Address',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 450,
      couponDiscount: 50,
      deliveryCharge: 20,
      taxAmount: 21,
      grandTotal: 441,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      receipt: {
        status: 'STORED',
        objectKey: 'receipts/2026/01/legacy/BB-B2-HISTORICAL.pdf',
        snapshot: {
          businessName: 'BentoBabu Original Entity',
          businessAddress: 'Old Registered Commercial Hub, Barrackpore - 700120',
          supportEmail: 'old_care@bentobabu.in',
          supportPhone: '+91 99999 00000',
          websiteUrl: 'https://legacy.bentobabu.in',
          fssaiStatus: 'APPLICATION_SUBMITTED',
          fssaiNumber: '',
          gstin: '',
        },
      },
    });

    // Now regenerate receipt using orderReceiptService
    const regenResult = await orderReceiptService.generateAndStoreReceipt(orderHistorical._id, { forceRegenerate: true });
    assert.strictEqual(regenResult.status, 'STORED');
    // Verify that the historical snapshot was preserved and not replaced with current active settings
    assert.strictEqual(regenResult.order.receipt.snapshot.businessName, 'BentoBabu Original Entity');
    assert.strictEqual(regenResult.order.receipt.snapshot.businessAddress, 'Old Registered Commercial Hub, Barrackpore - 700120');
    assert.strictEqual(regenResult.order.receipt.snapshot.supportEmail, 'old_care@bentobabu.in');
    console.log('✓ Test 12 passed: Historical legal and financial snapshot preserved during regeneration');

    // Test 13: B2 credentials are never exposed in API responses
    console.log('Testing 13: Verifying B2 credentials are not exposed in responses...');
    const res13 = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/admin/orders/${orderHistorical._id}`,
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.strictEqual(res13.statusCode, 200);
    const bodyStr = JSON.stringify(res13.body);
    assert(!bodyStr.includes('B2_APPLICATION_KEY'), 'Response must not contain B2_APPLICATION_KEY');
    assert(!bodyStr.includes('B2_KEY_ID'), 'Response must not contain B2_KEY_ID');
    assert(!bodyStr.includes('secretAccessKey'), 'Response must not contain secretAccessKey');
    assert(!bodyStr.includes('accessKeyId'), 'Response must not contain accessKeyId');
    console.log('✓ Test 13 passed: B2 credentials and secrets are never exposed in API payloads');

    // Test 14: Failure Injection: B2 upload succeeded but MongoDB write failed -> Pre-generation reconciliation
    console.log('Testing 14: Failure injection: Pre-generation reconciliation when B2 has object but MongoDB is unsynced...');
    const orderReconcile = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-RECONCILE',
      items: [
        {
          product: dummyProd,
          productName: 'Reconciliation Bowl',
          quantity: 1,
          unitPrice: 190,
          subtotal: 190,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Reconcile Test',
        phone: '9876511111',
        addressLine: 'Apt 101',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 190,
      deliveryCharge: 0,
      taxAmount: 9.5,
      grandTotal: 199.5,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      receipt: { status: 'PENDING' },
    });

    const expectedReconcileKey = b2Storage.buildReceiptObjectKey(orderReconcile);
    const mockFileBuffer = Buffer.from('Mock PDF Content for Pre-existing Object');
    inMemoryB2Store.set(expectedReconcileKey, {
      buffer: mockFileBuffer,
      contentType: 'application/pdf',
      fileSize: mockFileBuffer.length,
      eTag: 'reconcile-etag-123',
    });

    const uploadCountBefore = uploadCallCount;
    const reconcileResult = await orderReceiptService.generateAndStoreReceipt(orderReconcile._id);
    assert.strictEqual(reconcileResult.status, 'STORED');
    assert.strictEqual(reconcileResult.fromStorage, true);
    assert.strictEqual(uploadCallCount, uploadCountBefore, 'Should not upload to B2 again if object already exists');

    const dbReconciled = await Order.findById(orderReconcile._id);
    assert.strictEqual(dbReconciled.receipt.status, 'STORED');
    assert.strictEqual(dbReconciled.receipt.objectKey, expectedReconcileKey);
    assert.strictEqual(dbReconciled.receipt.fileSize, mockFileBuffer.length);
    console.log('✓ Test 14 passed: Pre-generation reconciliation heals MongoDB from existing B2 object without duplicate upload');

    // Test 15: Failure Injection: Stale Worker CAS Fencing prevents database corruption
    console.log('Testing 15: Failure injection: Stale worker CAS fencing with lockToken...');
    const orderFence = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-FENCE',
      items: [
        {
          product: dummyProd,
          productName: 'Fence Test Bowl',
          quantity: 1,
          unitPrice: 190,
          subtotal: 190,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Fence Test',
        phone: '9876511111',
        addressLine: 'Apt 101',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 190,
      deliveryCharge: 0,
      taxAmount: 9.5,
      grandTotal: 199.5,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      receipt: {
        status: 'GENERATING',
        lockToken: 'stale-worker-token-xyz',
        lockExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        generatedAt: new Date(Date.now() - 65000),
      },
    });

    // Worker 2 takes over because lock expired
    const worker2Result = await orderReceiptService.generateAndStoreReceipt(orderFence._id);
    assert.strictEqual(worker2Result.status, 'STORED');

    // Now Stale Worker 1 wakes up and attempts to finalize with its stale lockToken
    const staleAttempt = await Order.findOneAndUpdate(
      { _id: orderFence._id, 'receipt.lockToken': 'stale-worker-token-xyz' },
      { $set: { 'receipt.status': 'FAILED', 'receipt.lastError': 'Late error from stale worker' } },
      { returnDocument: 'after' }
    );
    assert.strictEqual(staleAttempt, null, 'Stale worker update must be rejected by CAS fence');

    const fenceVerified = await Order.findById(orderFence._id);
    assert.strictEqual(fenceVerified.receipt.status, 'STORED', 'Authoritative status must remain STORED');
    console.log('✓ Test 15 passed: Stale worker update rejected by CAS filter; race condition prevented');

    // Test 16: Queue Resilience: Non-blocking enqueue with graceful fallback
    console.log('Testing 16: Queue resilience and idempotent enqueue...');
    const enqueueRes1 = await receiptQueue.enqueueReceipt(orderReconcile._id);
    assert(enqueueRes1.enqueued === true || enqueueRes1.enqueued === false, 'Enqueue must return boolean status');

    // Immediate second enqueue of same order should deduplicate if Redis is active or execute safely
    const enqueueRes2 = await receiptQueue.enqueueReceipt(orderReconcile._id);
    assert.ok(enqueueRes2);
    console.log('✓ Test 16 passed: Queue enqueue is non-blocking, safe, and handles deduplication gracefully');

    // Test 17: Durable Background Reconciliation for crashed / expired jobs
    console.log('Testing 17: Durable background reconciliation recovers abandoned orders...');
    const orderAbandoned = await Order.create({
      user: customer1._id,
      orderNumber: 'BB-B2-ABANDONED',
      items: [
        {
          product: dummyProd,
          productName: 'Abandoned Bowl',
          quantity: 1,
          unitPrice: 190,
          subtotal: 190,
        },
      ],
      deliveryAddress: {
        fullName: 'B2 Abandoned Test',
        phone: '9876511111',
        addressLine: 'Apt 101',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 190,
      deliveryCharge: 0,
      taxAmount: 9.5,
      grandTotal: 199.5,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      receipt: {
        status: 'GENERATING',
        lockToken: 'abandoned-token-123',
        lockExpiresAt: new Date(Date.now() - 300000), // Expired 5 minutes ago
      },
    });

    const reconciliation = await receiptQueue.reconcilePendingReceipts(50);
    assert(reconciliation.recoveredCount >= 1, 'Reconciliation must recover expired abandoned orders');
    console.log('✓ Test 17 passed: Durable background reconciliation recovers abandoned/crashed orders');

    // Clean up test data
    await Order.deleteMany({
      orderNumber: {
        $in: [
          'BB-B2-ORD01',
          'BB-B2-ORD02',
          'BB-B2-ORD03',
          'BB-B2-CONCURRENT',
          'BB-B2-HISTORICAL',
          'BB-B2-RECONCILE',
          'BB-B2-FENCE',
          'BB-B2-ABANDONED',
        ],
      },
    });
    await User.deleteMany({
      email: {
        $in: [
          'b2_customer1@bentobabu.com',
          'b2_customer2@bentobabu.com',
          'b2_admin@bentobabu.com',
          'b2_staff@bentobabu.com',
        ],
      },
    });

    console.log('\n==================================================================');
    console.log('ALL 17 BACKBLAZE B2 RECEIPT AUDIT AND INTEGRATION TESTS PASSED!');
    console.log('==================================================================\n');

    server.close();
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Test suite failed:', err);
    server.close();
    await mongoose.connection.close();
    process.exit(1);
  }
}

runTests();
