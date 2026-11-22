process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
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
  DeliverySlot,
  CancellationRequest,
  DailyInventory,
  Coupon,
  CouponUsage,
} = require('../app/models');

const CancellationService = require('../app/services/cancellationService');
const CancellationController = require('../app/controllers/cancellationController');
const AdminOrderController = require('../app/controllers/adminOrderController');
const OrderController = require('../app/controllers/orderController');
const PaymentController = require('../app/controllers/paymentController');
const { getKolkataDateString } = require('../app/utils/businessDate');

// Helper to create mock Express response
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

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Customer Cancellation, Admin Approval & Refund (25 Scenarios)');
  console.log('========================================================================\n');

  await connectDB();

  const testSuffix = Date.now().toString().slice(-6);

  // Setup Test Fixtures: Category & Product
  let testCategory = await Category.findOne({ slug: 'test-healthy-cancellation' });
  if (!testCategory) {
    testCategory = await Category.create({
      name: `Test Healthy Cancellation ${testSuffix}`,
      slug: `test-healthy-cancellation-${testSuffix}`,
      description: 'Test category for cancellation workflow',
      isActive: true,
      displayOrder: 99,
    });
  }

  let testProduct = await Product.create({
    name: `High Protein Salad ${testSuffix}`,
    slug: `high-protein-salad-${testSuffix}`,
    sku: `SKU-CANC-${testSuffix}`,
    description: 'Fresh nutritious salad rich in organic protein and wholesome fibers',
    price: 350,
    categories: [testCategory._id],
    category: testCategory._id,
    stockQuantity: 100,
    preparationTime: 20,
    isAvailable: true,
    isActive: true,
  });

  // Setup Test Customers & Admin
  const customerA = await User.create({
    name: `Customer Alpha ${testSuffix}`,
    email: `customer.alpha.${testSuffix}@bentobabu.test`,
    phone: `98765${testSuffix.slice(0, 5)}`,
    role: 'CUSTOMER',
    isActive: true,
  });

  const customerB = await User.create({
    name: `Customer Beta ${testSuffix}`,
    email: `customer.beta.${testSuffix}@bentobabu.test`,
    phone: `98766${testSuffix.slice(0, 5)}`,
    role: 'CUSTOMER',
    isActive: true,
  });

  const adminUser = await User.create({
    name: `Admin Supervisor ${testSuffix}`,
    email: `admin.canc.${testSuffix}@bentobabu.test`,
    phone: `98767${testSuffix.slice(0, 5)}`,
    role: 'ADMIN',
    isActive: true,
  });

  // Setup Test Delivery Slot
  const todayStr = getKolkataDateString(new Date());
  const testSlot = await DeliverySlot.create({
    date: todayStr,
    label: 'Noon Delivery',
    startTime: '12:00',
    endTime: '13:00',
    capacity: 50,
    bookedCount: 5,
    isActive: true,
  });

  // Helper to create test order
  async function createTestOrder(opts = {}) {
    return await Order.create({
      orderNumber: `BB-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user: opts.user || customerA._id,
      items: [
        {
          product: testProduct._id,
          productName: testProduct.name,
          quantity: opts.quantity || 2,
          price: testProduct.price,
          unitPrice: testProduct.price,
          subtotal: (opts.quantity || 2) * testProduct.price,
        },
      ],
      itemTotal: (opts.quantity || 2) * testProduct.price,
      subtotal: (opts.quantity || 2) * testProduct.price,
      deliveryCharge: 40,
      taxAmount: 35,
      grandTotal: (opts.quantity || 2) * testProduct.price + 75,
      orderStatus: opts.orderStatus || 'PENDING',
      paymentStatus: opts.paymentStatus || 'PENDING',
      paymentMethod: opts.paymentMethod || 'RAZORPAY',
      deliverySlot: testSlot._id,
      paymentDetails: opts.paymentDetails || {
        razorpayPaymentId: opts.paymentStatus === 'PAID' ? `pay_mock_${Date.now()}` : undefined,
      },
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9876543210',
        addressLine: '12 River Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      deliveryAddress: {
        fullName: 'Test Customer',
        phone: '9876543210',
        addressLine: '12 River Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
    });
  }

  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${title}`);
      console.error(`    Error: ${err.message}\n`);
      failed++;
    }
  }

  // ==========================================
  // SCENARIOS 1 - 3: ELIGIBLE STAGES
  // ==========================================
  await test('Scenario 1: Customer submits cancellation request for unpaid PENDING order', async () => {
    const order = await createTestOrder({ orderStatus: 'PENDING', paymentStatus: 'PENDING' });
    const req = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Placed this by mistake while checking delivery slot',
    });

    assert.strictEqual(req.status, 'PENDING');
    assert.strictEqual(req.refundStatus, 'NOT_REQUIRED');
    assert.strictEqual(req.order.toString(), order._id.toString());
    assert.strictEqual(req.customer.toString(), customerA._id.toString());

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.cancellationRequest.toString(), req._id.toString());
    assert.strictEqual(updatedOrder.orderStatus, 'PENDING', 'Order must stay PENDING until admin approves');
  });

  await test('Scenario 2: Customer submits cancellation request for paid CONFIRMED order', async () => {
    const order = await createTestOrder({ orderStatus: 'CONFIRMED', paymentStatus: 'PAID' });
    const req = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Need to change delivery location to office address',
    });

    assert.strictEqual(req.status, 'PENDING');
    assert.strictEqual(req.refundStatus, 'PENDING', 'Paid orders must track refundStatus as PENDING');
    assert.strictEqual(req.refundAmount, order.grandTotal);
  });

  await test('Scenario 3: Customer submits cancellation request for PREPARING order', async () => {
    const order = await createTestOrder({ orderStatus: 'PREPARING', paymentStatus: 'PAID' });
    const req = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Urgent meeting scheduled during lunch delivery window',
    });

    assert.strictEqual(req.status, 'PENDING');
    assert.strictEqual(req.order.toString(), order._id.toString());
  });

  // ==========================================
  // SCENARIOS 4 - 10: INELIGIBLE STAGES
  // ==========================================
  await test('Scenario 4: Rejection of request if order reached READY_FOR_PICKUP (Packed & Sealed)', async () => {
    const order = await createTestOrder({ orderStatus: 'READY_FOR_PICKUP' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Want to cancel now please',
      });
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('packed') || e.message.includes('READY_FOR_PICKUP'));
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw, 'Should throw error when order is READY_FOR_PICKUP');
  });

  await test('Scenario 5: Rejection of request if order reached READY_FOR_DISPATCH', async () => {
    const order = await createTestOrder({ orderStatus: 'READY_FOR_DISPATCH' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Order no longer needed',
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw);
  });

  await test('Scenario 6: Rejection of request if order is RIDER_ACCEPTED', async () => {
    const order = await createTestOrder({ orderStatus: 'RIDER_ACCEPTED' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Rider is taking too long',
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw);
  });

  await test('Scenario 7: Rejection of request if order is OUT_FOR_DELIVERY / PICKED_UP', async () => {
    const order = await createTestOrder({ orderStatus: 'OUT_FOR_DELIVERY' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Cannot receive package now',
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw);
  });

  await test('Scenario 8: Rejection of request if order is DELIVERED', async () => {
    const order = await createTestOrder({ orderStatus: 'DELIVERED' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Cancel after delivery',
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw);
  });

  await test('Scenario 9: Rejection of request if order is already CANCELLED', async () => {
    const order = await createTestOrder({ orderStatus: 'CANCELLED' });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Cancel again',
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threw);
  });

  await test('Scenario 10: Rejection of request if order is in non-eligible terminal status', async () => {
    assert.strictEqual(CancellationService.isOrderEligibleForCancellation('EXPIRED'), false);
    assert.strictEqual(CancellationService.isOrderEligibleForCancellation('DELIVERED'), false);
    assert.strictEqual(CancellationService.isOrderEligibleForCancellation('CANCELLED'), false);
    assert.strictEqual(CancellationService.isOrderEligibleForCancellation('OUT_FOR_DELIVERY'), false);
  });

  // ==========================================
  // SCENARIOS 11 - 15: VALIDATION, RBAC, DUPLICATE ENFORCEMENT
  // ==========================================
  await test('Scenario 11: Validation rejects missing reason or reason under 5 characters', async () => {
    const order = await createTestOrder({ orderStatus: 'PENDING' });
    let threwShort = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'bad',
      });
    } catch (e) {
      threwShort = true;
      assert.strictEqual(e.statusCode, 400);
      assert.ok(e.message.includes('minimum 5'));
    }
    assert.ok(threwShort);

    let threwEmpty = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: '   ',
      });
    } catch (e) {
      threwEmpty = true;
      assert.strictEqual(e.statusCode, 400);
    }
    assert.ok(threwEmpty);
  });

  await test('Scenario 12: Validation rejects reason exceeding 500 characters', async () => {
    const order = await createTestOrder({ orderStatus: 'PENDING' });
    const longReason = 'A'.repeat(501);
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: longReason,
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
      assert.ok(e.message.includes('500'));
    }
    assert.ok(threw);
  });

  await test('Scenario 13: Customer cannot request cancellation for an order belonging to another customer', async () => {
    const order = await createTestOrder({ user: customerA._id });
    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerB._id, // Wrong customer!
        reason: 'I want to cancel someone elses order',
      });
    } catch (e) {
      threw = true;
      assert.ok([403, 404].includes(e.statusCode));
      assert.ok(e.message.includes('permission') || e.message.includes('authorized') || e.message.includes('not found') || e.message.includes('not owned'));
    }
    assert.ok(threw);
  });

  await test('Scenario 14: Anti-duplicate protection: Rejection of second request when one is already PENDING', async () => {
    const order = await createTestOrder({ orderStatus: 'PENDING' });
    await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'First cancellation request submission',
    });

    let threw = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: customerA._id,
        reason: 'Second rapid cancellation request submission',
      });
    } catch (e) {
      threw = true;
      assert.ok([400, 409].includes(e.statusCode));
      assert.ok(e.message.includes('already submitted and pending admin review') || e.message.includes('pending'));
    }
    assert.ok(threw);
  });

  await test('Scenario 15: Submitting cancellation request preserves active orderStatus', async () => {
    const order = await createTestOrder({ orderStatus: 'CONFIRMED' });
    await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Checking that order is not instantly cancelled',
    });

    const refreshedOrder = await Order.findById(order._id);
    assert.strictEqual(refreshedOrder.orderStatus, 'CONFIRMED');
    assert.notStrictEqual(refreshedOrder.orderStatus, 'CANCELLED');
  });

  // ==========================================
  // SCENARIOS 16 - 17: ADMIN RETRIEVAL & CONTROLLER
  // ==========================================
  await test('Scenario 16: Admin can list cancellation requests with status filter & pagination', async () => {
    const req = {
      query: { status: 'pending', page: 1, limit: 10 },
      user: adminUser,
    };
    const res = createMockRes();
    await CancellationController.getAdminCancellationRequests(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.ok(Array.isArray(res.data.data.cancellationRequests));
    assert.ok(typeof res.data.data.pendingCount === 'number');
    assert.ok(res.data.data.pagination);
  });

  await test('Scenario 17: Admin can fetch single cancellation request details by ID with populated order and customer', async () => {
    const order = await createTestOrder({ orderStatus: 'PENDING' });
    const createdReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Detailed inspection test',
    });

    const req = {
      params: { id: createdReq._id.toString() },
      user: adminUser,
    };
    const res = createMockRes();
    await CancellationController.getAdminCancellationRequestById(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.success);
    const detail = res.data.data.cancellationRequest;
    assert.strictEqual(detail._id.toString(), createdReq._id.toString());
    assert.ok(detail.order && typeof detail.order === 'object');
    assert.ok(detail.customer && typeof detail.customer === 'object');
  });

  // ==========================================
  // SCENARIOS 18 - 20: ADMIN APPROVAL WORKFLOW
  // ==========================================
  await test('Scenario 18: Admin approves unpaid order cancellation: transitions order, restores inventory & slot, sets refundStatus=NOT_REQUIRED', async () => {
    const initialSlotBooked = testSlot.bookedCount;
    const initialStock = testProduct.stockQuantity;

    const order = await createTestOrder({ orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', quantity: 2 });
    const cancReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Cannot pick up at specified time',
    });

    const result = await CancellationService.approveCancellationRequest({
      requestId: cancReq._id,
      adminUser,
    });

    assert.strictEqual(result.cancellationRequest.status, 'APPROVED');
    assert.strictEqual(result.cancellationRequest.refundStatus, 'NOT_REQUIRED');
    assert.strictEqual(result.order.orderStatus, 'CANCELLED');

    // Verify slot capacity released
    const slotAfter = await DeliverySlot.findById(testSlot._id);
    assert.strictEqual(slotAfter.bookedCount, initialSlotBooked - 1);

    // Verify product stock restored
    const prodAfter = await Product.findById(testProduct._id);
    assert.strictEqual(prodAfter.stockQuantity, initialStock + 2);
  });

  await test('Scenario 19: Admin approves paid order cancellation: executes Razorpay refund with idempotency notes', async () => {
    const order = await createTestOrder({
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      quantity: 1,
      paymentDetails: { razorpayPaymentId: 'pay_test_captured_123' },
    });

    const cancReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Doctor advised strict fasting today',
    });

    const result = await CancellationService.approveCancellationRequest({
      requestId: cancReq._id,
      adminUser,
    });

    assert.strictEqual(result.cancellationRequest.status, 'APPROVED');
    assert.strictEqual(result.cancellationRequest.refundStatus, 'SUCCESS');
    assert.ok(result.cancellationRequest.razorpayRefundId);
    assert.strictEqual(result.cancellationRequest.refundAmount, order.grandTotal);

    // Verify Order is updated to CANCELLED and REFUNDED
    const orderAfter = await Order.findById(order._id);
    assert.strictEqual(orderAfter.orderStatus, 'CANCELLED');
    assert.strictEqual(orderAfter.paymentStatus, 'REFUNDED');
    assert.strictEqual(orderAfter.paymentDetails.refundStatus, 'PROCESSED');
  });

  await test('Scenario 20: Approval revalidation: Blocks approval if order progressed to PACKED stage before admin reviews', async () => {
    const order = await createTestOrder({ orderStatus: 'CONFIRMED' });
    const cancReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Late cancellation request',
    });

    // Kitchen progresses order to READY_FOR_PICKUP before admin clicks approve
    order.orderStatus = 'READY_FOR_PICKUP';
    await order.save();

    let threw = false;
    try {
      await CancellationService.approveCancellationRequest({
        requestId: cancReq._id,
        adminUser,
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
      assert.ok(e.message.includes('READY FOR PICKUP') || e.message.includes('progressed'));
    }
    assert.ok(threw);

    // Request remains PENDING
    const reqAfter = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(reqAfter.status, 'PENDING');
  });

  // ==========================================
  // SCENARIOS 21 - 22: ADMIN REJECTION WORKFLOW
  // ==========================================
  await test('Scenario 21: Admin rejects cancellation request with mandatory rejection reason', async () => {
    const order = await createTestOrder({ orderStatus: 'PREPARING' });
    const cancReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Want to cancel my food',
    });

    const rejected = await CancellationService.rejectCancellationRequest({
      requestId: cancReq._id,
      adminUser,
      rejectionReason: 'Fresh ingredients already cooked and bento is being boxed.',
    });

    assert.strictEqual(rejected.status, 'REJECTED');
    assert.strictEqual(rejected.rejectionReason, 'Fresh ingredients already cooked and bento is being boxed.');
    assert.strictEqual(rejected.refundStatus, 'NOT_REQUIRED');

    // Order must remain PREPARING
    const orderAfter = await Order.findById(order._id);
    assert.strictEqual(orderAfter.orderStatus, 'PREPARING');
  });

  await test('Scenario 22: Admin rejection fails if rejection reason is missing or under 3 characters', async () => {
    const order = await createTestOrder({ orderStatus: 'CONFIRMED' });
    const cancReq = await CancellationService.createCancellationRequest({
      orderId: order._id,
      customerId: customerA._id,
      reason: 'Want to cancel now',
    });

    let threw = false;
    try {
      await CancellationService.rejectCancellationRequest({
        requestId: cancReq._id,
        adminUser,
        rejectionReason: 'no', // Only 2 chars
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 400);
      assert.ok(e.message.includes('minimum 3'));
    }
    assert.ok(threw);
  });

  // ==========================================
  // SCENARIOS 23 - 25: RESILIENCE, RBAC & WEBHOOKS
  // ==========================================
  await test('Scenario 23: Refund failure handling & safe admin retryRefund without duplicate cancellation', async () => {
    const order = await createTestOrder({
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentDetails: { razorpayPaymentId: 'pay_error_test_gateway' },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerA._id,
      reason: 'Order cancelled with gateway failure simulated',
      status: 'APPROVED',
      refundStatus: 'FAILED',
      refundAmount: order.grandTotal,
      failureReason: 'Gateway connectivity timeout',
    });

    order.orderStatus = 'CANCELLED';
    order.paymentStatus = 'REFUND_FAILED';
    order.paymentDetails.refundStatus = 'FAILED';
    order.cancellationRequest = cancReq._id;
    await order.save();

    // Admin retries refund via service
    const retried = await CancellationService.retryRefund({
      requestId: cancReq._id,
      adminUser,
    });

    assert.strictEqual(retried.cancellationRequest.refundStatus, 'SUCCESS');
    assert.ok(retried.cancellationRequest.razorpayRefundId);

    const orderAfter = await Order.findById(order._id);
    assert.strictEqual(orderAfter.paymentStatus, 'REFUNDED');
    assert.strictEqual(orderAfter.paymentDetails.refundStatus, 'PROCESSED');
  });

  await test('Scenario 24: Direct Admin cancellation endpoint succeeds without "403 Access denied"', async () => {
    const order = await createTestOrder({ orderStatus: 'CONFIRMED', paymentStatus: 'PENDING' });

    const req = {
      params: { id: order._id.toString() },
      body: { reason: 'Operational cancellation from admin kitchen dashboard' },
      user: adminUser,
    };
    const res = createMockRes();

    await AdminOrderController.cancelOrder(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.success);
    assert.strictEqual(res.data.data.order.orderStatus, 'CANCELLED');
    assert.strictEqual(res.data.data.order.cancellationReason, 'Operational cancellation from admin kitchen dashboard');
  });

  await test('Scenario 25: Razorpay webhook events synchronize with CancellationRequest and Order', async () => {
    const order = await createTestOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'PAID',
      paymentDetails: {
        razorpayPaymentId: `pay_webhook_test_${Date.now()}`,
        razorpayRefundId: `rfnd_webhook_${Date.now()}`,
      },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerA._id,
      reason: 'Customer cancelled, awaiting refund webhook',
      status: 'APPROVED',
      refundStatus: 'PROCESSING',
      refundAmount: order.grandTotal,
      razorpayRefundId: order.paymentDetails.razorpayRefundId,
    });

    const crypto = require('crypto');
    const { validateEnv } = require('../app/config/env');
    const env = validateEnv();
    const webhookSecret = env.razorpayWebhookSecret || 'test_webhook_secret_key_12345';
    env.razorpayWebhookSecret = webhookSecret;

    const webhookBody = {
      event: 'refund.processed',
      event_id: `evt_rfnd_${Date.now()}`,
      payload: {
        refund: {
          entity: {
            id: order.paymentDetails.razorpayRefundId,
            payment_id: order.paymentDetails.razorpayPaymentId,
            amount: Math.round(order.grandTotal * 100),
            status: 'processed',
          },
        },
      },
    };
    const rawBodyStr = JSON.stringify(webhookBody);
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');

    const webhookReq = {
      body: webhookBody,
      rawBody: Buffer.from(rawBodyStr, 'utf8'),
      headers: {
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': `evt_rfnd_${Date.now()}`,
      },
    };
    const webhookRes = createMockRes();

    // Call payment controller webhook processor
    await PaymentController.handleRazorpayWebhook(webhookReq, webhookRes);

    assert.strictEqual(webhookRes.statusCode, 200);

    const updatedReq = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(updatedReq.refundStatus, 'SUCCESS');

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.paymentStatus, 'REFUNDED');
    assert.strictEqual(updatedOrder.paymentDetails.refundStatus, 'PROCESSED');
  });

  // Cleanup test data
  console.log('\nCleaning up test artifacts...');
  await CancellationRequest.deleteMany({ order: { $in: [testProduct._id] } });
  await Order.deleteMany({ 'items.product': testProduct._id });
  await Product.deleteOne({ _id: testProduct._id });
  await Category.deleteOne({ _id: testCategory._id });
  await User.deleteMany({ _id: { $in: [customerA._id, customerB._id, adminUser._id] } });
  await DeliverySlot.deleteOne({ _id: testSlot._id });

  console.log('\n========================================================================');
  console.log(` Test Run Completed: ${passed} PASSED, ${failed} FAILED (Total 25 Scenarios)`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
