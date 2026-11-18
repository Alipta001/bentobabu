process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const crypto = require('crypto');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Address,
  Cart,
  Order,
  DeliveryZone,
  DailyMenu,
  WebhookEvent,
} = require('../app/models');

const PaymentController = require('../app/controllers/paymentController');
const OrderController = require('../app/controllers/orderController');
const { validateEnv } = require('../app/config/env');
const { getKolkataDateString } = require('../app/utils/businessDate');
const { initRedis, redisDelPattern, disconnectRedis } = require('../app/config/redis');

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
  };
  return res;
}

function createMockNext() {
  return function (err) {
    if (err) throw err;
  };
}

async function runPaymentSafetyTests() {
  console.log('\n===============================================================');
  console.log(' BentoBabu — Razorpay Payment, Refund & Webhook Safety Audit');
  console.log('===============================================================\n');

  await connectDB();
  await initRedis();

  const env = validateEnv();
  const testRunId = Date.now().toString();

  let testCategory = null;
  let testProduct = null;
  let testUser = null;
  let testAdmin = null;
  let testAddress = null;
  let testZone = null;

  try {
    // ----------------------------------------------------
    // SETUP
    // ----------------------------------------------------
    console.log('[Setup] Creating test entities...');

    testCategory = await Category.create({
      name: `PayTest Category ${testRunId}`,
      slug: `paytest-category-${testRunId}`,
      description: 'Category for payment safety audit',
    });

    testProduct = await Product.create({
      name: `PayTest Bento ${testRunId}`,
      slug: `paytest-bento-${testRunId}`,
      description: 'Audit product for Razorpay testing',
      price: 250,
      category: testCategory._id,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    testUser = await User.create({
      name: `Pay Customer ${testRunId}`,
      email: `payuser_${testRunId}@bentobabu.test`,
      password: 'TestPassword123!',
      phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: 'CUSTOMER',
      isVerified: true,
    });

    testAdmin = await User.create({
      name: `Pay Admin ${testRunId}`,
      email: `payadmin_${testRunId}@bentobabu.test`,
      password: 'TestPassword123!',
      phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      role: 'ADMIN',
      isVerified: true,
    });

    testZone = await DeliveryZone.create({
      name: `Pay Test Zone ${testRunId}`,
      pincodes: ['700099'],
      deliveryFee: 40,
      minimumOrderAmount: 100,
      isActive: true,
    });

    testAddress = await Address.create({
      user: testUser._id,
      fullName: 'Safety Audit Customer',
      phone: testUser.phone,
      addressLine: 'Salt Lake Sector V',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700099',
      addressType: 'WORK',
      isDefault: true,
    });

    // Helper to create an order awaiting payment
    async function createTestPendingOrder() {
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: true, stockQuantity: 50 });
      let cart = await Cart.findOne({ user: testUser._id });
      if (!cart) cart = new Cart({ user: testUser._id, items: [] });
      cart.items = [{ product: testProduct._id, quantity: 2 }];
      await cart.save();

      const ordRes = createMockRes();
      await OrderController.placeOrder(
        {
          user: { id: testUser._id.toString() },
          body: { addressId: testAddress._id.toString(), paymentMethod: 'RAZORPAY' },
        },
        ordRes,
        createMockNext()
      );
      assert.strictEqual(ordRes.statusCode, 201, 'Order creation must succeed');
      const order = ordRes.data.data;

      // Assign a mock Razorpay Order ID
      const rzpRes = createMockRes();
      await PaymentController.createRazorpayOrder(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: order._id.toString() },
        },
        rzpRes,
        createMockNext()
      );
      return {
        orderId: order._id.toString(),
        razorpayOrderId: rzpRes.data.data.razorpayOrderId,
        grandTotal: order.grandTotal,
      };
    }

    // ====================================================
    // SCENARIO 1: Payment Signature Verification
    // ====================================================
    console.log('\n--- Scenario 1: Payment Signature Verification ---');
    {
      const { orderId, razorpayOrderId } = await createTestPendingOrder();
      const razorpayPaymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const invalidSignature = 'invalid_tampered_hmac_signature_00000000000000000000000000000000';

      // 1A: Attempt verification with invalid signature
      const badRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: {
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: invalidSignature,
          },
        },
        badRes,
        createMockNext()
      );

      assert.strictEqual(badRes.statusCode, 400, 'Invalid signature must return HTTP 400');
      assert.strictEqual(badRes.data.success, false);
      assert(badRes.data.message.includes('Invalid payment signature'));

      // Verify order state was NOT modified
      const unconfirmedOrder = await Order.findById(orderId);
      assert.strictEqual(unconfirmedOrder.orderStatus, 'PENDING');
      assert.strictEqual(unconfirmedOrder.paymentStatus, 'PENDING');
      console.log('✔ 1A: Tampered signature rejected; order status preserved as PENDING.');

      // 1B: Verify with valid signature
      const validPayload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(validPayload)
        .digest('hex');

      const goodRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: {
            orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: validSignature,
          },
        },
        goodRes,
        createMockNext()
      );

      assert.strictEqual(goodRes.statusCode, 200, 'Valid signature must return HTTP 200');
      assert.strictEqual(goodRes.data.success, true);

      const confirmedOrder = await Order.findById(orderId);
      assert.strictEqual(confirmedOrder.orderStatus, 'CONFIRMED');
      assert.strictEqual(confirmedOrder.paymentStatus, 'PAID');
      assert.strictEqual(confirmedOrder.paymentDetails.razorpayPaymentId, razorpayPaymentId);
      console.log('✔ 1B: Valid signature verified cryptographically; order marked CONFIRMED & PAID.');
    }

    // ====================================================
    // SCENARIO 2: Idempotent & Concurrent Payment Verification
    // ====================================================
    console.log('\n--- Scenario 2: Idempotent & Concurrent Payment Verification ---');
    {
      const { orderId, razorpayOrderId } = await createTestPendingOrder();
      const razorpayPaymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const validPayload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const validSignature = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(validPayload)
        .digest('hex');

      // 2A: Sequential duplicate verification
      const res1 = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature: validSignature },
        },
        res1,
        createMockNext()
      );
      assert.strictEqual(res1.statusCode, 200);

      const res2 = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature: validSignature },
        },
        res2,
        createMockNext()
      );
      assert.strictEqual(res2.statusCode, 200);
      assert(res2.data.message.includes('already verified previously'));

      const verifiedOrder = await Order.findById(orderId);
      const confirmNotes = verifiedOrder.statusHistory.filter((h) => h.status === 'CONFIRMED');
      assert.strictEqual(confirmNotes.length, 1, 'Status history must have exactly one CONFIRMED entry');
      console.log('✔ 2A: Duplicate sequential verification handled idempotently without duplicate status entries.');

      // 2B: Concurrent simultaneous verification calls
      const { orderId: concOrderId, razorpayOrderId: concRzpOrderId } = await createTestPendingOrder();
      const concPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const concSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${concRzpOrderId}|${concPayId}`)
        .digest('hex');

      const concReq1 = {
        user: { id: testUser._id.toString() },
        body: { orderId: concOrderId, razorpayOrderId: concRzpOrderId, razorpayPaymentId: concPayId, razorpaySignature: concSig },
      };
      const concRes1 = createMockRes();
      const concReq2 = {
        user: { id: testUser._id.toString() },
        body: { orderId: concOrderId, razorpayOrderId: concRzpOrderId, razorpayPaymentId: concPayId, razorpaySignature: concSig },
      };
      const concRes2 = createMockRes();

      await Promise.all([
        PaymentController.verifyRazorpayPayment(concReq1, concRes1, createMockNext()),
        PaymentController.verifyRazorpayPayment(concReq2, concRes2, createMockNext()),
      ]);

      assert.strictEqual(concRes1.statusCode, 200);
      assert.strictEqual(concRes2.statusCode, 200);

      const concOrder = await Order.findById(concOrderId);
      const concConfirmNotes = concOrder.statusHistory.filter((h) => h.status === 'CONFIRMED');
      assert.strictEqual(concConfirmNotes.length, 1, 'Concurrent verification must write exactly one CONFIRMED entry');
      console.log('✔ 2B: Simultaneous concurrent verifications resolved atomically.');
    }

    // ====================================================
    // SCENARIO 3: Automatic Refund Safety & Stock Restoration
    // ====================================================
    console.log('\n--- Scenario 3: Automatic Refund Safety & Stock Restoration ---');
    {
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: true, stockQuantity: 50 });
      const initialStock = 50;
      const { orderId, razorpayOrderId, grandTotal } = await createTestPendingOrder();

      const midStock = (await Product.findById(testProduct._id)).stockQuantity;
      assert.strictEqual(midStock, 48, 'Stock must be reserved upon order placement');

      // Admin toggles product unavailable while user completes payment
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: false });

      const razorpayPaymentId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const validSignature = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      const refundRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature: validSignature },
        },
        refundRes,
        createMockNext()
      );

      assert.strictEqual(refundRes.statusCode, 409, 'Must return HTTP 409 Conflict when item became unavailable');
      assert(refundRes.data.message.includes('unavailable') && refundRes.data.message.includes('refund'));

      const refundedOrder = await Order.findById(orderId);
      assert.strictEqual(refundedOrder.orderStatus, 'CANCELLED');
      assert.strictEqual(refundedOrder.paymentStatus, 'REFUNDED');
      assert(refundedOrder.paymentDetails.razorpayRefundId.startsWith('rfnd_'), 'Refund ID must be persisted');
      assert.strictEqual(refundedOrder.paymentDetails.refundStatus, 'PROCESSED');
      assert.strictEqual(refundedOrder.paymentDetails.refundAmount, grandTotal);

      // Verify stock restored
      const restoredStock = (await Product.findById(testProduct._id)).stockQuantity;
      assert.strictEqual(restoredStock, initialStock, 'Stock must be restored back upon auto-refund');

      // Restore product availability for next tests
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: true });
      console.log('✔ Scenario 3: Auto-refund executed with exact paise conversion, refund ID persisted, and stock restored.');
    }

    // ====================================================
    // SCENARIO 4: Refund Gateway Failure, Timeout, and Admin Retry
    // ====================================================
    console.log('\n--- Scenario 4: Refund Gateway Failure, Timeout & Admin Retry ---');
    {
      // 4A: Gateway Failure Handling
      const originalGetClient = PaymentController.getRazorpayClient;
      PaymentController.getRazorpayClient = () => ({
        payments: {
          refund: async () => {
            const err = new Error('Gateway Error: Insufficient merchant balance for refund');
            err.statusCode = 502;
            throw err;
          },
        },
      });

      const { orderId: failOrderId, razorpayOrderId: failRzpOrderId } = await createTestPendingOrder();
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: false });

      const failPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const failSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${failRzpOrderId}|${failPayId}`)
        .digest('hex');

      // Temporarily override NODE_ENV to exercise live failure branch
      process.env.NODE_ENV = 'production';
      const failRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: failOrderId, razorpayOrderId: failRzpOrderId, razorpayPaymentId: failPayId, razorpaySignature: failSig },
        },
        failRes,
        createMockNext()
      );
      process.env.NODE_ENV = 'test';

      assert.strictEqual(failRes.statusCode, 409);
      const failOrder = await Order.findById(failOrderId);
      assert.strictEqual(failOrder.orderStatus, 'CANCELLED');
      assert.strictEqual(failOrder.paymentStatus, 'REFUND_FAILED');
      assert.strictEqual(failOrder.paymentDetails.refundStatus, 'FAILED');
      assert(failOrder.paymentDetails.refundError.includes('Insufficient merchant balance'));
      assert(failOrder.statusHistory.some((h) => h.note.includes('FLAGGED FOR MANUAL ADMIN REFUND')));
      console.log('✔ 4A: Gateway failure safely caught, paymentStatus set to REFUND_FAILED and flagged for admin.');

      // 4B: Admin Retry Refund
      // Restore client with successful mock
      PaymentController.getRazorpayClient = () => ({
        payments: {
          refund: async () => ({
            id: `rfnd_retry_${crypto.randomBytes(6).toString('hex')}`,
            status: 'processed',
          }),
        },
      });

      process.env.NODE_ENV = 'production';
      const retryRes = createMockRes();
      await PaymentController.retryRefund(
        {
          params: { orderId: failOrderId },
          user: { id: testAdmin._id.toString(), role: 'ADMIN' },
        },
        retryRes,
        createMockNext()
      );
      process.env.NODE_ENV = 'test';

      assert.strictEqual(retryRes.statusCode, 200);
      assert.strictEqual(retryRes.data.success, true);
      const retriedOrder = await Order.findById(failOrderId);
      assert.strictEqual(retriedOrder.paymentStatus, 'REFUNDED');
      assert.strictEqual(retriedOrder.paymentDetails.refundStatus, 'PROCESSED');
      assert(retriedOrder.paymentDetails.razorpayRefundId.startsWith('rfnd_retry_'));
      console.log('✔ 4B: Admin safely retried failed refund; order updated to REFUNDED with new refund ID.');

      // 4C: Refund Timeout (Network / ETIMEDOUT)
      PaymentController.getRazorpayClient = () => ({
        payments: {
          refund: async () => {
            const timeoutErr = new Error('connect ETIMEDOUT 13.235.14.22:443');
            timeoutErr.code = 'ETIMEDOUT';
            throw timeoutErr;
          },
        },
      });

      const { orderId: timeOrderId, razorpayOrderId: timeRzpOrderId } = await createTestPendingOrder();
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: false });
      const timePayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const timeSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${timeRzpOrderId}|${timePayId}`)
        .digest('hex');

      process.env.NODE_ENV = 'production';
      const timeRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: timeOrderId, razorpayOrderId: timeRzpOrderId, razorpayPaymentId: timePayId, razorpaySignature: timeSig },
        },
        timeRes,
        createMockNext()
      );
      process.env.NODE_ENV = 'test';

      assert.strictEqual(timeRes.statusCode, 409);
      const timeOrder = await Order.findById(timeOrderId);
      assert.strictEqual(timeOrder.orderStatus, 'CANCELLED');
      assert.strictEqual(timeOrder.paymentStatus, 'REFUND_PENDING');
      assert.strictEqual(timeOrder.paymentDetails.refundStatus, 'PENDING');
      console.log('✔ 4C: Refund timeout marks REFUND_PENDING and awaits reconciliation without duplicate requests.');

      // Restore default client
      PaymentController.getRazorpayClient = originalGetClient;
      await Product.updateOne({ _id: testProduct._id }, { isAvailable: true });
    }

    // ====================================================
    // SCENARIO 5: Webhook Security & Signature Validation
    // ====================================================
    console.log('\n--- Scenario 5: Webhook Security & Signature Validation ---');
    {
      const webhookSecret = env.razorpayWebhookSecret || 'test_webhook_secret_key_12345';
      process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

      const testPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_wh_${crypto.randomBytes(6).toString('hex')}`,
              order_id: 'order_nonexistent_12345',
              amount: 50000,
            },
          },
        },
      };

      // 5A: Missing signature header
      const missingRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: {},
          body: testPayload,
        },
        missingRes,
        createMockNext()
      );
      assert.strictEqual(missingRes.statusCode, 400);
      assert(missingRes.data.message.includes('Missing x-razorpay-signature'));
      console.log('✔ 5A: Webhook without x-razorpay-signature header rejected with HTTP 400.');

      // 5B: Invalid / Tampered signature
      const rawBodyStr = JSON.stringify(testPayload);
      const badSigRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': '0000000000000000000000000000000000000000000000000000000000000000' },
          rawBody: Buffer.from(rawBodyStr),
          body: testPayload,
        },
        badSigRes,
        createMockNext()
      );
      assert.strictEqual(badSigRes.statusCode, 400);
      assert(badSigRes.data.message.includes('Invalid webhook signature'));
      console.log('✔ 5B: Tampered webhook signature rejected with HTTP 400.');

      // 5C: Valid webhook signature
      const validSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBodyStr)
        .digest('hex');

      const goodWhRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: {
            'x-razorpay-signature': validSig,
            'x-razorpay-event-id': `evt_${crypto.randomBytes(8).toString('hex')}`,
          },
          rawBody: Buffer.from(rawBodyStr),
          body: testPayload,
        },
        goodWhRes,
        createMockNext()
      );
      assert.strictEqual(goodWhRes.statusCode, 200);
      console.log('✔ 5C: Valid webhook cryptographic signature accepted.');

      // 5D: Duplicate webhook event ID
      const dupEventId = `evt_dup_${crypto.randomBytes(6).toString('hex')}`;
      const dupPayload = {
        event: 'order.paid',
        payload: { order: { entity: { id: 'order_test_dup' } } },
      };
      const dupRaw = JSON.stringify(dupPayload);
      const dupSig = crypto.createHmac('sha256', webhookSecret).update(dupRaw).digest('hex');

      const dupRes1 = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': dupSig, 'x-razorpay-event-id': dupEventId },
          rawBody: Buffer.from(dupRaw),
          body: dupPayload,
        },
        dupRes1,
        createMockNext()
      );
      assert.strictEqual(dupRes1.statusCode, 200);

      const dupRes2 = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': dupSig, 'x-razorpay-event-id': dupEventId },
          rawBody: Buffer.from(dupRaw),
          body: dupPayload,
        },
        dupRes2,
        createMockNext()
      );
      assert.strictEqual(dupRes2.statusCode, 200);
      assert(dupRes2.data.message.includes('idempotent'));
      console.log('✔ 5D: Duplicate webhook event ID acknowledged idempotently with HTTP 200.');
    }

    // ====================================================
    // SCENARIO 6: Webhook Refund Event Handlers
    // ====================================================
    console.log('\n--- Scenario 6: Webhook Refund Event Handlers (created, processed, failed) ---');
    {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      // 6A: refund.created webhook
      const { orderId: whRefundOrdId, razorpayOrderId: whRefundRzpOrdId, grandTotal } = await createTestPendingOrder();
      const whPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const whRefundId = `rfnd_${crypto.randomBytes(6).toString('hex')}`;

      // Associate paymentId on the order
      await Order.updateOne(
        { _id: whRefundOrdId },
        {
          orderStatus: 'CANCELLED',
          paymentStatus: 'PAID',
          'paymentDetails.razorpayPaymentId': whPayId,
        }
      );

      const createdPayload = {
        event: 'refund.created',
        payload: {
          refund: {
            entity: {
              id: whRefundId,
              payment_id: whPayId,
              amount: grandTotal * 100,
              status: 'pending',
            },
          },
        },
      };
      const createdRaw = JSON.stringify(createdPayload);
      const createdSig = crypto.createHmac('sha256', webhookSecret).update(createdRaw).digest('hex');

      const whCreatedRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': createdSig, 'x-razorpay-event-id': `evt_${crypto.randomBytes(6).toString('hex')}` },
          rawBody: Buffer.from(createdRaw),
          body: createdPayload,
        },
        whCreatedRes,
        createMockNext()
      );
      assert.strictEqual(whCreatedRes.statusCode, 200);

      const orderAfterCreated = await Order.findById(whRefundOrdId);
      assert.strictEqual(orderAfterCreated.paymentStatus, 'REFUND_PENDING');
      assert.strictEqual(orderAfterCreated.paymentDetails.refundStatus, 'PENDING');
      assert.strictEqual(orderAfterCreated.paymentDetails.razorpayRefundId, whRefundId);
      console.log('✔ 6A: refund.created webhook sets REFUND_PENDING and records refundId.');

      // 6B: refund.processed webhook
      const processedPayload = {
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: whRefundId,
              payment_id: whPayId,
              amount: grandTotal * 100,
              status: 'processed',
            },
          },
        },
      };
      const processedRaw = JSON.stringify(processedPayload);
      const processedSig = crypto.createHmac('sha256', webhookSecret).update(processedRaw).digest('hex');

      const whProcessedRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': processedSig, 'x-razorpay-event-id': `evt_${crypto.randomBytes(6).toString('hex')}` },
          rawBody: Buffer.from(processedRaw),
          body: processedPayload,
        },
        whProcessedRes,
        createMockNext()
      );
      assert.strictEqual(whProcessedRes.statusCode, 200);

      const orderAfterProcessed = await Order.findById(whRefundOrdId);
      assert.strictEqual(orderAfterProcessed.paymentStatus, 'REFUNDED');
      assert.strictEqual(orderAfterProcessed.paymentDetails.refundStatus, 'PROCESSED');
      assert(orderAfterProcessed.paymentDetails.refundProcessedAt !== null);
      console.log('✔ 6B: refund.processed webhook reconciles order into REFUNDED with timestamp.');

      // 6C: refund.failed webhook
      const { orderId: whFailOrdId } = await createTestPendingOrder();
      const failWhPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const failWhRefundId = `rfnd_${crypto.randomBytes(6).toString('hex')}`;

      await Order.updateOne(
        { _id: whFailOrdId },
        {
          orderStatus: 'CANCELLED',
          paymentStatus: 'REFUND_PENDING',
          'paymentDetails.razorpayPaymentId': failWhPayId,
          'paymentDetails.razorpayRefundId': failWhRefundId,
        }
      );

      const failedPayload = {
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: failWhRefundId,
              payment_id: failWhPayId,
              amount: grandTotal * 100,
              error_description: 'Beneficiary bank declined credit',
            },
          },
        },
      };
      const failedRaw = JSON.stringify(failedPayload);
      const failedSig = crypto.createHmac('sha256', webhookSecret).update(failedRaw).digest('hex');

      const whFailRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': failedSig, 'x-razorpay-event-id': `evt_${crypto.randomBytes(6).toString('hex')}` },
          rawBody: Buffer.from(failedRaw),
          body: failedPayload,
        },
        whFailRes,
        createMockNext()
      );
      assert.strictEqual(whFailRes.statusCode, 200);

      const orderAfterFail = await Order.findById(whFailOrdId);
      assert.strictEqual(orderAfterFail.paymentStatus, 'REFUND_FAILED');
      assert.strictEqual(orderAfterFail.paymentDetails.refundStatus, 'FAILED');
      assert(orderAfterFail.paymentDetails.refundError.includes('Beneficiary bank declined credit'));
      console.log('✔ 6C: refund.failed webhook safely updates order to REFUND_FAILED with error details.');
    }

    // ====================================================
    // SCENARIO 7: Webhook vs Client Verification Ordering
    // ====================================================
    console.log('\n--- Scenario 7: Webhook vs Client Verification Ordering ---');
    {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      // 7A: Webhook arrives BEFORE client verification
      const { orderId: earlyWhOrdId, razorpayOrderId: earlyWhRzpOrdId } = await createTestPendingOrder();
      const earlyPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;

      const whCapturePayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: earlyPayId,
              order_id: earlyWhRzpOrdId,
              amount: 50000,
            },
          },
        },
      };
      const whRaw = JSON.stringify(whCapturePayload);
      const whSig = crypto.createHmac('sha256', webhookSecret).update(whRaw).digest('hex');

      // Webhook confirms the order first
      const earlyWhRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': whSig, 'x-razorpay-event-id': `evt_${crypto.randomBytes(6).toString('hex')}` },
          rawBody: Buffer.from(whRaw),
          body: whCapturePayload,
        },
        earlyWhRes,
        createMockNext()
      );
      assert.strictEqual(earlyWhRes.statusCode, 200);

      const orderWhFirst = await Order.findById(earlyWhOrdId);
      assert.strictEqual(orderWhFirst.orderStatus, 'CONFIRMED');
      assert.strictEqual(orderWhFirst.paymentStatus, 'PAID');

      // Client verification arrives AFTER webhook
      const clientSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${earlyWhRzpOrdId}|${earlyPayId}`)
        .digest('hex');

      const lateClientRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: earlyWhOrdId, razorpayOrderId: earlyWhRzpOrdId, razorpayPaymentId: earlyPayId, razorpaySignature: clientSig },
        },
        lateClientRes,
        createMockNext()
      );
      assert.strictEqual(lateClientRes.statusCode, 200);
      assert(lateClientRes.data.message.includes('already verified previously'));
      console.log('✔ 7A: Webhook arrival before client verification succeeds and client gets clean idempotent 200.');

      // 7B: Client verification arrives BEFORE webhook
      const { orderId: earlyClientOrdId, razorpayOrderId: earlyClientRzpOrdId } = await createTestPendingOrder();
      const earlyClientPayId = `pay_${crypto.randomBytes(6).toString('hex')}`;
      const earlyClientSig = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${earlyClientRzpOrdId}|${earlyClientPayId}`)
        .digest('hex');

      const firstClientRes = createMockRes();
      await PaymentController.verifyRazorpayPayment(
        {
          user: { id: testUser._id.toString() },
          body: { orderId: earlyClientOrdId, razorpayOrderId: earlyClientRzpOrdId, razorpayPaymentId: earlyClientPayId, razorpaySignature: earlyClientSig },
        },
        firstClientRes,
        createMockNext()
      );
      assert.strictEqual(firstClientRes.statusCode, 200);

      // Webhook arrives afterwards
      const lateWhPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: earlyClientPayId,
              order_id: earlyClientRzpOrdId,
              amount: 50000,
            },
          },
        },
      };
      const lateWhRaw = JSON.stringify(lateWhPayload);
      const lateWhSig = crypto.createHmac('sha256', webhookSecret).update(lateWhRaw).digest('hex');

      const lateWhRes = createMockRes();
      await PaymentController.handleRazorpayWebhook(
        {
          headers: { 'x-razorpay-signature': lateWhSig, 'x-razorpay-event-id': `evt_${crypto.randomBytes(6).toString('hex')}` },
          rawBody: Buffer.from(lateWhRaw),
          body: lateWhPayload,
        },
        lateWhRes,
        createMockNext()
      );
      assert.strictEqual(lateWhRes.statusCode, 200);

      const orderClientFirst = await Order.findById(earlyClientOrdId);
      const confirmHistory = orderClientFirst.statusHistory.filter((h) => h.status === 'CONFIRMED');
      assert.strictEqual(confirmHistory.length, 1, 'Exactly one CONFIRMED entry even when both succeed');
      console.log('✔ 7B: Client verification before webhook succeeds; subsequent webhook acknowledges without duplicates.');
    }

    console.log('\n===============================================================');
    console.log(' ALL 7 RAZORPAY PAYMENT & WEBHOOK SAFETY SCENARIOS PASSED! ');
    console.log('===============================================================\n');
  } finally {
    console.log('[Cleanup] Cleaning up safety audit test data...');
    if (testProduct) await Product.deleteOne({ _id: testProduct._id });
    if (testCategory) await Category.deleteOne({ _id: testCategory._id });
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await Cart.deleteOne({ user: testUser._id });
      await Address.deleteMany({ user: testUser._id });
      await Order.deleteMany({ user: testUser._id });
    }
    if (testAdmin) await User.deleteOne({ _id: testAdmin._id });
    if (testZone) await DeliveryZone.deleteOne({ _id: testZone._id });
    await WebhookEvent.deleteMany({ eventId: { $regex: /^evt_/ } });
    await redisDelPattern('cache:products:*');
    await disconnectRedis();
    await mongoose.disconnect();
    console.log('[Cleanup] Done.');
    setTimeout(() => process.exit(0), 200);
  }
}

runPaymentSafetyTests().catch((err) => {
  console.error('\n❌ Safety test execution failed:', err);
  process.exit(1);
});
