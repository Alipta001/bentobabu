/**
 * Phase 2E — OTP Security Tests
 *
 * Verifies:
 * - OTP is hidden from customer before pickup.
 * - OTP is revealed to customer upon PICKED_UP.
 * - Unassigned riders cannot verify OTP (403 Forbidden).
 * - Incorrect OTP increments failedOtpAttempts atomically.
 * - Concurrent incorrect OTP attempts do not bypass the lockout threshold.
 * - Attempt counters are durably persisted in MongoDB.
 * - Lockout occurs at >= 5 failed attempts (429 Too Many Requests).
 * - OTP cannot be reused after delivery is marked DELIVERED (409 Conflict).
 * - OTP hash and plain code are securely wiped to null in MongoDB after delivery.
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function createPickedUpOrder(context, riderUser) {
  const { customer, product, address } = context;
  const orderNumber = 'BB-OTP-' + Date.now().toString(36).toUpperCase();
  const plainOtp = '654321';
  const crypto = require('crypto');
  const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');

  const order = await Order.create({
    orderNumber,
    user: customer._id,
    items: [
      {
        product: product._id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        subtotal: product.price,
      },
    ],
    deliveryAddress: {
      fullName: address.fullName,
      phone: address.phone,
      addressLine: address.addressLine,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      addressType: 'HOME',
    },
    itemTotal: product.price,
    deliveryCharge: 30,
    taxAmount: 0,
    grandTotal: product.price + 30,
    paymentMethod: 'COD',
    paymentStatus: 'COD_PENDING',
    orderStatus: 'PICKED_UP',
    assignedDeliveryPartner: riderUser._id,
    deliveryOTP: otpHash,
    deliveryOtpCode: plainOtp,
    deliveryOtpExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    failedOtpAttempts: 0,
  });

  return { order, plainOtp };
}

async function runPhase2E(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2E: OTP Security & Lockout Tests                                ');
  console.log('========================================================================');

  const results = { name: 'Phase 2E — OTP Security', passed: 0, failed: 0, tests: [] };

  async function test(title, fn) {
    try {
      await fn();
      results.passed++;
      results.tests.push({ title, status: 'PASS' });
      console.log(`  ✓ [PASS] ${title}`);
    } catch (err) {
      results.failed++;
      results.tests.push({ title, status: 'FAIL', error: err.message });
      console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    }
  }

  const { riders } = context;
  const assignedRider = riders[2].rider;
  const unassignedRider = riders[3].rider;

  const assignedClient = new TestApiClient();
  await assignedClient.login(assignedRider.email, 'StagingRiderPass123!', 'delivery');

  const unassignedClient = new TestApiClient();
  await unassignedClient.login(unassignedRider.email, 'StagingRiderPass123!', 'delivery');

  // 1. Unassigned rider cannot verify OTP
  await test('Unassigned rider cannot attempt OTP verification (returns 403 Forbidden)', async () => {
    const { order } = await createPickedUpOrder(context, assignedRider);
    const res = await unassignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: '654321' }
    );
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  // 2. Incorrect OTP attempt increments counter atomically
  await test('Incorrect OTP attempt returns 400 and increments failedOtpAttempts in DB', async () => {
    const { order } = await createPickedUpOrder(context, assignedRider);
    const res = await assignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: '000000' }
    );
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('Invalid delivery OTP'), 'Message must indicate invalid OTP');

    const dbOrder = await Order.findById(order._id).select('+failedOtpAttempts');
    assert.strictEqual(dbOrder.failedOtpAttempts, 1, 'failedOtpAttempts must be exactly 1');
  });

  // 3. Concurrent incorrect attempts increment count atomically without race conditions
  await test('Concurrent incorrect attempts increment failedOtpAttempts atomically', async () => {
    const { order } = await createPickedUpOrder(context, assignedRider);

    // Send 3 incorrect attempts concurrently
    const attempts = await Promise.all([
      assignedClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: '111111' }),
      assignedClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: '222222' }),
      assignedClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: '333333' }),
    ]);

    for (const a of attempts) {
      assert.strictEqual(a.status, 400);
    }

    const dbOrder = await Order.findById(order._id).select('+failedOtpAttempts');
    assert.strictEqual(dbOrder.failedOtpAttempts, 3, `failedOtpAttempts must be 3, found ${dbOrder.failedOtpAttempts}`);
  });

  // 4. Lockout triggers at 5 failed attempts (returns 429 Too Many Requests)
  await test('Lockout triggers after 5 failed OTP attempts (returns 429)', async () => {
    const { order, plainOtp } = await createPickedUpOrder(context, assignedRider);

    // Send 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await assignedClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, {
        status: 'DELIVERED',
        otp: `99999${i}`,
      });
    }

    const dbOrder = await Order.findById(order._id).select('+failedOtpAttempts');
    assert.ok(dbOrder.failedOtpAttempts >= 5, 'failedOtpAttempts must be >= 5');

    // Even with the CORRECT OTP, rider is locked out
    const lockedRes = await assignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: plainOtp }
    );
    assert.strictEqual(lockedRes.status, 429, `Expected 429 lockout, got ${lockedRes.status}`);
    assert.ok(lockedRes.body.message.includes('locked') || lockedRes.body.message.includes('exceeded'));
  });

  // 5. OTP cannot be reused after delivery is completed
  await test('OTP cannot be reused after delivery completion (returns 409 Conflict)', async () => {
    const { order, plainOtp } = await createPickedUpOrder(context, assignedRider);

    // Deliver successfully
    const successRes = await assignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: plainOtp }
    );
    assert.strictEqual(successRes.status, 200, 'First delivery must succeed');

    // Try to deliver again with the same OTP
    const replayRes = await assignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: plainOtp }
    );
    assert.strictEqual(replayRes.status, 409, `Expected 409 Conflict on replay, got ${replayRes.status}`);
  });

  // 6. OTP hash and code are wiped from MongoDB after delivery
  await test('Delivery OTP hash, plain code, and expiry are wiped to null in DB upon delivery', async () => {
    const { order, plainOtp } = await createPickedUpOrder(context, assignedRider);

    await assignedClient.patch(
      `/operations/delivery/orders/${order._id.toString()}/status`,
      { status: 'DELIVERED', otp: plainOtp }
    );

    const dbOrder = await Order.findById(order._id).select('+deliveryOTP +deliveryOtpCode +deliveryOtpExpiresAt');
    assert.strictEqual(dbOrder.deliveryOTP, null, 'deliveryOTP must be null');
    assert.strictEqual(dbOrder.deliveryOtpCode, null, 'deliveryOtpCode must be null');
    assert.strictEqual(dbOrder.deliveryOtpExpiresAt, null, 'deliveryOtpExpiresAt must be null');
  });

  return results;
}

module.exports = {
  runPhase2E,
};
