process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Order,
  DeliverySlot,
  CancellationRequest,
  WebhookEvent,
} = require('../app/models');

const CancellationService = require('../app/services/cancellationService');
const PaymentController = require('../app/controllers/paymentController');
const { authorize } = require('../app/middleware/authMiddleware');
const { getKolkataDateString } = require('../app/utils/businessDate');

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

async function runSafetyAudit() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Cancellation & Razorpay Refund Deep Safety Audit');
  console.log('========================================================================\n');

  await connectDB();

  const testSuffix = Date.now().toString().slice(-6);

  // Setup Test Category & Product
  const testCategory = await Category.create({
    name: `Safety Audit Cat ${testSuffix}`,
    slug: `safety-audit-cat-${testSuffix}`,
    description: 'Category for safety audit suite',
    isActive: true,
  });

  const testProduct = await Product.create({
    name: `Audit Keto Meal ${testSuffix}`,
    slug: `audit-keto-meal-${testSuffix}`,
    sku: `SKU-AUDIT-${testSuffix}`,
    description: 'Fresh test meal for safety audit verification',
    price: 499,
    categories: [testCategory._id],
    category: testCategory._id,
    stockQuantity: 50,
    preparationTime: 25,
    isAvailable: true,
    isActive: true,
  });

  const customerUser = await User.create({
    name: `Audit Customer ${testSuffix}`,
    email: `audit.customer.${testSuffix}@bentobabu.test`,
    phone: `98111${testSuffix.slice(0, 5)}`,
    role: 'CUSTOMER',
    isActive: true,
  });

  const unauthorizedCustomer = await User.create({
    name: `Sneaky Customer ${testSuffix}`,
    email: `sneaky.customer.${testSuffix}@bentobabu.test`,
    phone: `98222${testSuffix.slice(0, 5)}`,
    role: 'CUSTOMER',
    isActive: true,
  });

  const deliveryRider = await User.create({
    name: `Audit Rider ${testSuffix}`,
    email: `audit.rider.${testSuffix}@bentobabu.test`,
    phone: `98333${testSuffix.slice(0, 5)}`,
    role: 'DELIVERY',
    isActive: true,
  });

  const kitchenStaff = await User.create({
    name: `Audit Chef ${testSuffix}`,
    email: `audit.chef.${testSuffix}@bentobabu.test`,
    phone: `98444${testSuffix.slice(0, 5)}`,
    role: 'KITCHEN',
    isActive: true,
  });

  const admin1 = await User.create({
    name: `Audit Admin 1 ${testSuffix}`,
    email: `audit.admin1.${testSuffix}@bentobabu.test`,
    phone: `98555${testSuffix.slice(0, 5)}`,
    role: 'ADMIN',
    isActive: true,
  });

  const admin2 = await User.create({
    name: `Audit Admin 2 ${testSuffix}`,
    email: `audit.admin2.${testSuffix}@bentobabu.test`,
    phone: `98666${testSuffix.slice(0, 5)}`,
    role: 'ADMIN',
    isActive: true,
  });

  const todayStr = getKolkataDateString(new Date());
  const testSlot = await DeliverySlot.create({
    date: todayStr,
    label: 'Evening Delivery',
    startTime: '18:00',
    endTime: '19:00',
    capacity: 25,
    bookedCount: 5,
    isActive: true,
  });

  // Helper function to build valid test orders
  async function createAuditOrder(overrides = {}) {
    const qty = overrides.quantity || 1;
    const price = testProduct.price;
    const subtotal = qty * price;
    const deliveryCharge = 40;
    const taxAmount = 25;
    const grandTotal = subtotal + deliveryCharge + taxAmount;

    return await Order.create({
      orderNumber: `BB-AUD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      user: overrides.user || customerUser._id,
      items: [
        {
          product: testProduct._id,
          productName: testProduct.name,
          quantity: qty,
          unitPrice: price,
          subtotal: subtotal,
        },
      ],
      itemTotal: subtotal,
      subtotal: subtotal,
      deliveryCharge: deliveryCharge,
      taxAmount: taxAmount,
      grandTotal: grandTotal,
      deliveryAddress: {
        fullName: 'Audit Recipient',
        phone: '9811100000',
        addressLine: '123 Barrackpore Station Rd',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
      },
      orderStatus: overrides.orderStatus || 'CONFIRMED',
      paymentStatus: overrides.paymentStatus || 'PAID',
      paymentMethod: overrides.paymentMethod || 'RAZORPAY',
      paymentDetails: overrides.paymentDetails || {
        razorpayPaymentId: `pay_audit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        amount: grandTotal,
        refundStatus: 'NONE',
      },
      deliverySlot: overrides.deliverySlot || testSlot._id,
      cancellationRecovery: overrides.cancellationRecovery || {
        stockRestored: false,
        slotRestored: false,
        couponRestored: false,
      },
    });
  }

  let passed = 0;
  let failed = 0;

  async function auditScenario(title, fn) {
    try {
      await fn();
      console.log(`  ✓ [AUDIT PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [AUDIT FAIL] ${title}`);
      console.error('    Error:', err.message);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // AUDIT 1: Concurrent Admin Approval Race Condition
  // -------------------------------------------------------------------------
  await auditScenario('Audit 1: Concurrent Admin Approval Race (Atomic CAS Lock)', async () => {
    const order = await createAuditOrder({ orderStatus: 'CONFIRMED', paymentStatus: 'PAID' });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Dual admin click race test',
      status: 'PENDING',
      refundStatus: 'PENDING',
      refundAmount: order.grandTotal,
    });

    order.cancellationRequest = cancReq._id;
    await order.save();

    // Two administrators execute approval concurrently at the exact same millisecond
    const results = await Promise.allSettled([
      CancellationService.approveCancellationRequest({ requestId: cancReq._id, adminUser: admin1 }),
      CancellationService.approveCancellationRequest({ requestId: cancReq._id, adminUser: admin2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one approval must succeed');
    assert.strictEqual(rejected.length, 1, 'The concurrent approval attempt must be rejected');
    assert.strictEqual(rejected[0].reason.statusCode, 409, 'Concurrent caller must receive HTTP 409 Conflict');

    // Confirm DB state is consistently APPROVED and order is CANCELLED exactly once
    const updatedReq = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(updatedReq.status, 'APPROVED');

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.orderStatus, 'CANCELLED');
    assert.strictEqual(updatedOrder.cancellationRecovery.stockRestored, true);
    assert.strictEqual(updatedOrder.cancellationRecovery.slotRestored, true);
  });

  // -------------------------------------------------------------------------
  // AUDIT 2: Concurrent Admin Rejection Race Condition
  // -------------------------------------------------------------------------
  await auditScenario('Audit 2: Concurrent Admin Rejection Race (Atomic CAS Lock)', async () => {
    const order = await createAuditOrder({ orderStatus: 'CONFIRMED', paymentStatus: 'PAID' });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Dual admin rejection test',
      status: 'PENDING',
      refundStatus: 'PENDING',
      refundAmount: order.grandTotal,
    });

    // Two administrators execute rejection concurrently
    const results = await Promise.allSettled([
      CancellationService.rejectCancellationRequest({
        requestId: cancReq._id,
        adminUser: admin1,
        rejectionReason: 'Kitchen already prepared food',
      }),
      CancellationService.rejectCancellationRequest({
        requestId: cancReq._id,
        adminUser: admin2,
        rejectionReason: 'Too late to cancel',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one rejection must succeed');
    assert.strictEqual(rejected.length, 1, 'Concurrent rejection must fail');
    assert.strictEqual(rejected[0].reason.statusCode, 409, 'Concurrent rejection receives HTTP 409 Conflict');

    const updatedReq = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(updatedReq.status, 'REJECTED');
    assert.strictEqual(updatedReq.refundStatus, 'NOT_REQUIRED');
  });

  // -------------------------------------------------------------------------
  // AUDIT 3: Concurrent Refund Retry Race Condition
  // -------------------------------------------------------------------------
  await auditScenario('Audit 3: Concurrent Refund Retry Race Protection', async () => {
    const order = await createAuditOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'REFUND_FAILED',
      paymentDetails: {
        razorpayPaymentId: `pay_audit_rtry_${Date.now()}`,
        refundStatus: 'FAILED',
        amount: 564,
      },
      cancellationRecovery: { stockRestored: true, slotRestored: true, couponRestored: true },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Retry race test',
      status: 'APPROVED',
      refundStatus: 'FAILED',
      failureReason: 'Gateway timeout previously',
      refundAmount: order.grandTotal,
    });

    // Two administrators click retry refund at the exact same millisecond
    const results = await Promise.allSettled([
      CancellationService.retryRefund({ requestId: cancReq._id, adminUser: admin1 }),
      CancellationService.retryRefund({ requestId: cancReq._id, adminUser: admin2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one refund retry call must execute');
    assert.strictEqual(rejected.length, 1, 'The duplicate retry call must be rejected');
    assert.strictEqual(rejected[0].reason.statusCode, 409, 'Concurrent retry returns HTTP 409');
  });

  // -------------------------------------------------------------------------
  // AUDIT 4: Gateway Reconciliation on Network Timeout
  // -------------------------------------------------------------------------
  await auditScenario('Audit 4: Gateway Reconciliation Prevents Duplicate Refund on Network Disconnect', async () => {
    const paymentId = `pay_audit_recon_${Date.now()}`;
    const order = await createAuditOrder({
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      paymentDetails: {
        razorpayPaymentId: paymentId,
        amount: 564,
        refundStatus: 'NONE',
      },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Reconciliation timeout test',
      status: 'PENDING',
      refundStatus: 'PENDING',
      refundAmount: order.grandTotal,
    });

    // Execute cancellation & refund
    await CancellationService.executeOrderCancellationAndRefund({
      order,
      cancellationRequest: cancReq,
      adminUser: admin1,
      reason: cancReq.reason,
    });

    assert.ok(order.paymentDetails.razorpayRefundId, 'Refund ID must be generated');
    assert.strictEqual(order.paymentStatus, 'REFUNDED');
    assert.strictEqual(order.orderStatus, 'CANCELLED');

    // Simulate an admin re-invoking executeOrderCancellationAndRefund:
    // Should detect existing active refund ID and NEVER call payment gateway again
    const priorRefundId = order.paymentDetails.razorpayRefundId;
    await CancellationService.executeOrderCancellationAndRefund({
      order,
      cancellationRequest: cancReq,
      adminUser: admin1,
      reason: 'Repeated cancellation execution',
    });

    assert.strictEqual(order.paymentDetails.razorpayRefundId, priorRefundId, 'Refund ID must remain identical (idempotent)');
  });

  // -------------------------------------------------------------------------
  // AUDIT 5: Webhook Idempotency (Duplicate Delivery of refund.processed)
  // -------------------------------------------------------------------------
  await auditScenario('Audit 5: Duplicate Webhook Delivery Idempotency', async () => {
    const paymentId = `pay_audit_wb_${Date.now()}`;
    const refundId = `rfnd_audit_wb_${Date.now()}`;
    const order = await createAuditOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      paymentDetails: {
        razorpayPaymentId: paymentId,
        razorpayRefundId: refundId,
        refundStatus: 'PENDING',
        amount: 564,
      },
      cancellationRecovery: { stockRestored: true, slotRestored: true, couponRestored: true },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Duplicate webhook test',
      status: 'APPROVED',
      refundStatus: 'INITIATED',
      razorpayRefundId: refundId,
      refundAmount: order.grandTotal,
    });

    const crypto = require('crypto');
    const { validateEnv } = require('../app/config/env');
    const env = validateEnv();
    const webhookSecret = env.razorpayWebhookSecret || 'test_webhook_secret_key_12345';
    env.razorpayWebhookSecret = webhookSecret;

    const webhookEventId = `evt_audit_dup_${Date.now()}`;
    const webhookBody = {
      event: 'refund.processed',
      event_id: webhookEventId,
      payload: {
        refund: {
          entity: {
            id: refundId,
            payment_id: paymentId,
            amount: order.grandTotal * 100,
            status: 'processed',
          },
        },
      },
    };
    const rawBodyStr = JSON.stringify(webhookBody);
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');

    const webhookReq = {
      headers: {
        'x-razorpay-event-id': webhookEventId,
        'x-razorpay-signature': signature,
      },
      rawBody: Buffer.from(rawBodyStr, 'utf8'),
      body: webhookBody,
    };

    // First webhook delivery
    const res1 = createMockRes();
    await PaymentController.handleRazorpayWebhook(webhookReq, res1);
    assert.strictEqual(res1.statusCode, 200, 'First webhook must return 200 OK');

    const updatedReq1 = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(updatedReq1.refundStatus, 'SUCCESS');

    const updatedOrder1 = await Order.findById(order._id);
    assert.strictEqual(updatedOrder1.paymentStatus, 'REFUNDED');
    const historyCount1 = updatedOrder1.statusHistory.length;

    // Second (duplicate) webhook delivery
    const res2 = createMockRes();
    await PaymentController.handleRazorpayWebhook(webhookReq, res2);
    assert.strictEqual(res2.statusCode, 200, 'Duplicate webhook must return 200 OK (idempotent)');
    assert.ok(res2.data?.message?.includes('idempotent') || res2.data?.success === true);

    const updatedOrder2 = await Order.findById(order._id);
    assert.strictEqual(updatedOrder2.statusHistory.length, historyCount1, 'Duplicate webhook must not append duplicate status entries');
  });

  // -------------------------------------------------------------------------
  // AUDIT 6: Webhook refund.failed preserves CANCELLED Order and Does Not Revert Stock
  // -------------------------------------------------------------------------
  await auditScenario('Audit 6: Webhook refund.failed marks REFUND_FAILED without corrupting order status or stock', async () => {
    const paymentId = `pay_audit_fail_${Date.now()}`;
    const refundId = `rfnd_audit_fail_${Date.now()}`;
    const order = await createAuditOrder({
      orderStatus: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      paymentDetails: {
        razorpayPaymentId: paymentId,
        razorpayRefundId: refundId,
        refundStatus: 'PENDING',
        amount: 564,
      },
      cancellationRecovery: { stockRestored: true, slotRestored: true, couponRestored: true },
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Failed refund webhook test',
      status: 'APPROVED',
      refundStatus: 'PROCESSING',
      razorpayRefundId: refundId,
      refundAmount: order.grandTotal,
    });

    const crypto = require('crypto');
    const { validateEnv } = require('../app/config/env');
    const env = validateEnv();
    const webhookSecret = env.razorpayWebhookSecret || 'test_webhook_secret_key_12345';
    env.razorpayWebhookSecret = webhookSecret;

    const webhookEventId = `evt_audit_fail_${Date.now()}`;
    const webhookBody = {
      event: 'refund.failed',
      event_id: webhookEventId,
      payload: {
        refund: {
          entity: {
            id: refundId,
            payment_id: paymentId,
            amount: order.grandTotal * 100,
            error_description: 'Beneficiary bank declined account refund',
          },
        },
      },
    };
    const rawBodyStr = JSON.stringify(webhookBody);
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBodyStr).digest('hex');

    const webhookReq = {
      headers: {
        'x-razorpay-event-id': webhookEventId,
        'x-razorpay-signature': signature,
      },
      rawBody: Buffer.from(rawBodyStr, 'utf8'),
      body: webhookBody,
    };

    const res = createMockRes();
    await PaymentController.handleRazorpayWebhook(webhookReq, res);
    assert.strictEqual(res.statusCode, 200);

    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.orderStatus, 'CANCELLED', 'Order must remain CANCELLED');
    assert.strictEqual(updatedOrder.paymentStatus, 'REFUND_FAILED', 'Payment status must reflect failure');
    assert.strictEqual(updatedOrder.paymentDetails.refundStatus, 'FAILED');
    assert.strictEqual(updatedOrder.cancellationRecovery.stockRestored, true, 'Recovery flags must remain true');

    const updatedReq = await CancellationRequest.findById(cancReq._id);
    assert.strictEqual(updatedReq.refundStatus, 'FAILED');
  });

  // -------------------------------------------------------------------------
  // AUDIT 7: Order Schema Payment Status Validation
  // -------------------------------------------------------------------------
  await auditScenario('Audit 7: Order Schema Strictly Supports All Refund Payment Statuses', async () => {
    const validStatuses = [
      'PENDING',
      'PAID',
      'FAILED',
      'REFUNDED',
      'REFUND_PENDING',
      'REFUND_FAILED',
      'COD_PENDING',
      'COLLECTED_BY_RIDER',
    ];

    for (const status of validStatuses) {
      const testOrd = new Order({
        user: customerUser._id,
        orderNumber: `BB-VAL-${status}-${Date.now().toString().slice(-4)}`,
        items: [
          {
            product: testProduct._id,
            productName: testProduct.name,
            price: 100,
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
          },
        ],
        itemTotal: 100,
        subtotal: 100,
        deliveryCharge: 40,
        taxAmount: 5,
        grandTotal: 145,
        deliveryAddress: {
          fullName: 'Test Customer',
          phone: '9811100000',
          addressLine: 'Barrackpore',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700120',
          addressType: 'HOME',
        },
        orderStatus: 'PENDING',
        paymentMethod: 'RAZORPAY',
        paymentStatus: status,
      });

      const validationError = testOrd.validateSync();
      assert.ifError(validationError, `Order schema must accept paymentStatus "${status}" without validation error`);
    }

    // Negative check: Invalid status must be rejected
    const invalidOrd = new Order({
      user: customerUser._id,
      orderNumber: `BB-VAL-INVALID-${Date.now().toString().slice(-4)}`,
      items: [
        {
          product: testProduct._id,
          productName: testProduct.name,
          price: 100,
          quantity: 1,
          unitPrice: 100,
          subtotal: 100,
        },
      ],
      itemTotal: 100,
      subtotal: 100,
      deliveryCharge: 40,
      taxAmount: 5,
      grandTotal: 145,
      deliveryAddress: {
        fullName: 'Test',
        phone: '9811100000',
        addressLine: 'Road',
        city: 'City',
        state: 'WB',
        pincode: '700120',
        addressType: 'HOME',
      },
      orderStatus: 'PENDING',
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'SOME_ARBITRARY_STATUS',
    });

    const expectedErr = invalidOrd.validateSync();
    assert.ok(expectedErr, 'Order schema must reject invalid payment status');
  });

  // -------------------------------------------------------------------------
  // AUDIT 8: RBAC Verification - Non-Admin Roles Blocked with 403
  // -------------------------------------------------------------------------
  await auditScenario('Audit 8: RBAC Security: Non-Admin Roles Blocked with 403 Forbidden', async () => {
    const adminAuthorizer = authorize('ADMIN');

    // 1. Customer Attempt
    let customerBlocked = false;
    const reqCustomer = { user: customerUser };
    const resCustomer = createMockRes();
    adminAuthorizer(reqCustomer, resCustomer, () => {
      customerBlocked = false;
    });
    if (resCustomer.statusCode === 403) customerBlocked = true;
    assert.strictEqual(customerBlocked, true, 'CUSTOMER role must receive 403 on admin cancellation endpoint');

    // 2. Delivery Rider Attempt
    let riderBlocked = false;
    const reqRider = { user: deliveryRider };
    const resRider = createMockRes();
    adminAuthorizer(reqRider, resRider, () => {
      riderBlocked = false;
    });
    if (resRider.statusCode === 403) riderBlocked = true;
    assert.strictEqual(riderBlocked, true, 'DELIVERY role must receive 403 on admin cancellation endpoint');

    // 3. Kitchen Staff Attempt
    let kitchenBlocked = false;
    const reqKitchen = { user: kitchenStaff };
    const resKitchen = createMockRes();
    adminAuthorizer(reqKitchen, resKitchen, () => {
      kitchenBlocked = false;
    });
    if (resKitchen.statusCode === 403) kitchenBlocked = true;
    assert.strictEqual(kitchenBlocked, true, 'KITCHEN role must receive 403 on admin cancellation endpoint');

    // 4. Admin Attempt
    let adminAllowed = false;
    const reqAdmin = { user: admin1 };
    const resAdmin = createMockRes();
    adminAuthorizer(reqAdmin, resAdmin, () => {
      adminAllowed = true;
    });
    assert.strictEqual(adminAllowed, true, 'ADMIN role must be authorized successfully');
  });

  // -------------------------------------------------------------------------
  // AUDIT 9: Cross-Customer Access Control
  // -------------------------------------------------------------------------
  await auditScenario('Audit 9: Cross-Customer Access Control on Cancellation Request', async () => {
    // Order belongs to customerUser
    const order = await createAuditOrder({ orderStatus: 'PENDING', paymentStatus: 'PENDING' });

    // unauthorizedCustomer tries to cancel customerUser's order
    let crossCustomerBlocked = false;
    try {
      await CancellationService.createCancellationRequest({
        orderId: order._id,
        customerId: unauthorizedCustomer._id,
        reason: 'Attempting to cancel someone else order',
      });
    } catch (err) {
      crossCustomerBlocked = true;
      assert.strictEqual(err.statusCode, 404, 'Must return 404 not found to prevent info disclosure');
      assert.ok(err.message.includes('not belong to your account'));
    }

    assert.strictEqual(crossCustomerBlocked, true, 'Cross-customer cancellation request must be blocked');
  });

  // -------------------------------------------------------------------------
  // AUDIT 10: Refund Amount Cap Verification
  // -------------------------------------------------------------------------
  await auditScenario('Audit 10: Refund Amount Never Exceeds Captured Total', async () => {
    const order = await createAuditOrder({
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
    });

    const cancReq = await CancellationRequest.create({
      order: order._id,
      customer: customerUser._id,
      reason: 'Testing amount calculation',
      status: 'PENDING',
      refundStatus: 'PENDING',
      refundAmount: order.grandTotal,
    });

    await CancellationService.executeOrderCancellationAndRefund({
      order,
      cancellationRequest: cancReq,
      adminUser: admin1,
      reason: 'Cap audit',
    });

    assert.strictEqual(order.paymentDetails.refundAmount, order.grandTotal, 'Refund amount must exactly match order total');
    assert.strictEqual(cancReq.refundAmount, order.grandTotal, 'Cancellation request refund amount must match order total');
  });

  // Cleanup test fixtures
  console.log('\nCleaning up safety audit test fixtures...');
  await CancellationRequest.deleteMany({ customer: { $in: [customerUser._id, unauthorizedCustomer._id] } });
  await Order.deleteMany({ user: { $in: [customerUser._id, unauthorizedCustomer._id] } });
  await User.deleteMany({ _id: { $in: [customerUser._id, unauthorizedCustomer._id, deliveryRider._id, kitchenStaff._id, admin1._id, admin2._id] } });
  await Product.deleteOne({ _id: testProduct._id });
  await Category.deleteOne({ _id: testCategory._id });
  await DeliverySlot.deleteOne({ _id: testSlot._id });
  await WebhookEvent.deleteMany({ eventId: { $regex: /^evt_audit_/ } });

  console.log('\n========================================================================');
  console.log(` Safety Audit Run Completed: ${passed} PASSED, ${failed} FAILED (Total 10 Deep Audits)`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runSafetyAudit().catch((err) => {
  console.error('Fatal safety audit runner error:', err);
  process.exit(1);
});
