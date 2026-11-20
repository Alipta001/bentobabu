/**
 * Phase 2F — Concurrent Delivery Completion Tests
 *
 * Verifies:
 * - Simultaneous DELIVERED requests for the same order produce exactly one successful completion.
 * - No duplicate statusHistory entries for DELIVERED.
 * - Rider presence is cleanly restored upon delivery completion.
 * - Concurrent cash collection (POST /operations/delivery/orders/:id/collect-cash)
 *   does not record duplicate cash records or status history entries.
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function createPickedUpOrder(context, riderUser) {
  const { customer, product, address } = context;
  const orderNumber = 'BB-CONC-DEL-' + Date.now().toString(36).toUpperCase();
  const plainOtp = '123987';
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

async function runPhase2F(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2F: Concurrent Delivery Completion Tests                        ');
  console.log('========================================================================');

  const results = { name: 'Phase 2F — Concurrent Delivery Completion', passed: 0, failed: 0, tests: [] };

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
  const targetRider = riders[3].rider;

  const riderClient = new TestApiClient();
  await riderClient.login(targetRider.email, 'StagingRiderPass123!', 'delivery');

  // 1. Multiple simultaneous DELIVERED requests
  await test('Simultaneous DELIVERED requests produce exactly 1 success (200) and conflicts (409) without duplicate history', async () => {
    const { order, plainOtp } = await createPickedUpOrder(context, targetRider);

    // Set rider presence to BUSY with this order
    await DeliveryPartnerPresence.findOneAndUpdate(
      { user: targetRider._id },
      {
        $set: {
          accountStatus: 'ACTIVE',
          availabilityStatus: 'BUSY',
          intendedAvailability: 'ONLINE',
          currentOrderId: order._id,
        },
      }
    );

    // Concurrently send 3 completion requests
    const [res1, res2, res3] = await Promise.all([
      riderClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: plainOtp }),
      riderClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: plainOtp }),
      riderClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: plainOtp }),
    ]);

    const successes = [res1, res2, res3].filter((r) => r.status === 200);
    const conflicts = [res1, res2, res3].filter((r) => r.status === 409);

    assert.strictEqual(successes.length, 1, `Expected exactly 1 success, got ${successes.length}`);
    assert.strictEqual(conflicts.length, 2, `Expected exactly 2 conflicts, got ${conflicts.length}`);

    // DB assertions
    const dbOrder = await Order.findById(order._id);
    assert.strictEqual(dbOrder.orderStatus, 'DELIVERED');

    const deliveredHistory = dbOrder.statusHistory.filter((h) => h.status === 'DELIVERED');
    assert.strictEqual(
      deliveredHistory.length,
      1,
      `Order statusHistory must contain exactly 1 DELIVERED entry, found ${deliveredHistory.length}`
    );

    // Rider presence must be restored to ONLINE
    const presence = await DeliveryPartnerPresence.findOne({ user: targetRider._id });
    assert.strictEqual(presence.availabilityStatus, 'ONLINE', 'Rider presence must return to ONLINE');
    assert.strictEqual(presence.currentOrderId, null, 'currentOrderId must be cleared');
  });

  // 2. Concurrent Cash Collection (POST /collect-cash)
  await test('Concurrent cash collection calls do not create duplicate cash records', async () => {
    const { order, plainOtp } = await createPickedUpOrder(context, targetRider);

    // Mark delivered first
    await riderClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, { status: 'DELIVERED', otp: plainOtp });

    // Send 3 simultaneous collect-cash requests
    const [res1, res2, res3] = await Promise.all([
      riderClient.post(`/operations/delivery/orders/${order._id.toString()}/collect-cash`, { note: 'Cash collected 1' }),
      riderClient.post(`/operations/delivery/orders/${order._id.toString()}/collect-cash`, { note: 'Cash collected 2' }),
      riderClient.post(`/operations/delivery/orders/${order._id.toString()}/collect-cash`, { note: 'Cash collected 3' }),
    ]);

    for (const r of [res1, res2, res3]) {
      assert.strictEqual(r.status, 200, `Expected 200 OK on collect-cash, got ${r.status}`);
    }

    const dbOrder = await Order.findById(order._id);
    assert.strictEqual(dbOrder.paymentStatus, 'COLLECTED_BY_RIDER');
    assert.ok(dbOrder.paymentDetails.cashCollection, 'cashCollection record must exist');

    const cashHistory = dbOrder.statusHistory.filter((h) => h.status === 'CASH_COLLECTED');
    assert.strictEqual(
      cashHistory.length,
      1,
      `statusHistory must contain exactly 1 CASH_COLLECTED entry, found ${cashHistory.length}`
    );
  });

  return results;
}

module.exports = {
  runPhase2F,
};
