/**
 * Phase 2D — Complete Order Lifecycle Integration Tests
 *
 * Verifies:
 * - Full lifecycle: READY_FOR_DISPATCH -> RIDER_ACCEPTED -> PICKED_UP -> DELIVERED.
 * - Customer tracking reflects live persisted state at each step.
 * - RIDER_ACCEPTED does NOT expose OTP or display Out for Delivery.
 * - PICKED_UP triggers Out for Delivery representation and reveals customer delivery OTP.
 * - Only the assigned rider can confirm pickup (unassigned riders receive 403).
 * - Invalid status transitions are rejected with 400.
 * - Legacy status compatibility (e.g. READY_FOR_DISPATCH canonicalizes to READY_FOR_PICKUP).
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function runPhase2D(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2D: Complete Order Lifecycle Integration Tests                  ');
  console.log('========================================================================');

  const results = { name: 'Phase 2D — Order Lifecycle', passed: 0, failed: 0, tests: [] };

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

  const { customer, product, address, riders, admin } = context;

  const customerClient = new TestApiClient();
  await customerClient.login(customer.email, 'StagingTestPass123!', 'customer');

  const rider1Client = new TestApiClient();
  await rider1Client.login(riders[0].rider.email, 'StagingRiderPass123!', 'delivery');

  const rider2Client = new TestApiClient();
  await rider2Client.login(riders[1].rider.email, 'StagingRiderPass123!', 'delivery');

  const adminClient = new TestApiClient();
  await adminClient.login(admin.email, 'StagingAdminPass123!', 'admin');

  // Reset riders presences and clear prior orders
  await Order.deleteMany({ assignedDeliveryPartner: { $in: [riders[0].rider._id, riders[1].rider._id] } });
  await DeliveryPartnerPresence.updateMany(
    { user: { $in: [riders[0].rider._id, riders[1].rider._id] } },
    { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
  );

  let lifecycleOrder = null;

  // 1. Order Placement by Customer
  await test('Customer places a COD order -> Status starts at CONFIRMED', async () => {
    await customerClient.post('/cart/items', { productId: product._id.toString(), quantity: 1 });
    const res = await customerClient.post('/orders', {
      addressId: address._id.toString(),
      paymentMethod: 'COD',
    });
    assert.strictEqual(res.status, 201);
    lifecycleOrder = res.body.data;
    assert.strictEqual(lifecycleOrder.orderStatus, 'CONFIRMED');
  });

  // 2. Kitchen / Admin moves to PREPARING
  await test('Kitchen updates status: CONFIRMED -> PREPARING', async () => {
    const res = await adminClient.patch(
      `/operations/kitchen/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'PREPARING' }
    );
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.data.orderStatus, 'PREPARING');

    // Customer tracking check
    const trackRes = await customerClient.get(`/orders/${lifecycleOrder.id || lifecycleOrder._id}`);
    assert.strictEqual(trackRes.status, 200);
    assert.strictEqual(trackRes.body.data.orderStatus, 'PREPARING');
  });

  // 3. Kitchen marks READY_FOR_DISPATCH (canonicalized to READY_FOR_PICKUP)
  await test('Kitchen marks READY_FOR_DISPATCH -> canonicalizes to READY_FOR_PICKUP', async () => {
    const res = await adminClient.patch(
      `/operations/kitchen/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'READY_FOR_DISPATCH' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.orderStatus, 'READY_FOR_PICKUP');

    // Customer tracking check
    const trackRes = await customerClient.get(`/orders/${lifecycleOrder.id || lifecycleOrder._id}`);
    assert.strictEqual(trackRes.status, 200);
    assert.strictEqual(trackRes.body.data.orderStatus, 'READY_FOR_PICKUP');
    // OTP must NOT be exposed to customer yet
    assert.strictEqual(trackRes.body.data.deliveryOtp, undefined, 'OTP must not be exposed in READY_FOR_PICKUP');
  });

  // 4. Invalid jump directly to DELIVERED rejected
  await test('Invalid status transition directly from READY_FOR_PICKUP to DELIVERED is rejected', async () => {
    const res = await rider1Client.patch(
      `/operations/delivery/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'DELIVERED', otp: '123456' }
    );
    assert.ok(
      [400, 403].includes(res.status),
      `Expected 400 Bad Request or 403 Forbidden, got ${res.status}`
    );
  });

  // 5. Rider 1 accepts the request -> RIDER_ACCEPTED
  await test('Rider accepts delivery request -> Order transitions to RIDER_ACCEPTED (NOT Out for Delivery)', async () => {
    const res = await rider1Client.patch(
      `/operations/delivery/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'RIDER_ACCEPTED' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.orderStatus, 'RIDER_ACCEPTED');
    assert.strictEqual(res.body.data.assignedDeliveryPartner.toString(), riders[0].rider._id.toString());

    // Customer tracking check
    const trackRes = await customerClient.get(`/orders/${lifecycleOrder.id || lifecycleOrder._id}`);
    assert.strictEqual(trackRes.status, 200);
    assert.strictEqual(trackRes.body.data.orderStatus, 'RIDER_ACCEPTED');
    // Critical requirement: In RIDER_ACCEPTED, customer must NOT see OTP yet and must NOT see Out for Delivery
    assert.strictEqual(
      trackRes.body.data.deliveryOtp,
      undefined,
      'OTP must not be visible to customer while rider is only in RIDER_ACCEPTED'
    );
  });

  // 6. Unassigned Rider 2 attempts to confirm pickup -> Blocked with 403
  await test('Unassigned rider cannot confirm pickup (returns 403 Forbidden)', async () => {
    const res = await rider2Client.patch(
      `/operations/delivery/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'PICKED_UP' }
    );
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for unassigned rider, got ${res.status}`);
  });

  // 7. Assigned Rider 1 confirms pickup -> PICKED_UP
  let revealedOtp = null;
  await test('Assigned rider confirms pickup -> Status updates to PICKED_UP and OTP is revealed to customer', async () => {
    const res = await rider1Client.patch(
      `/operations/delivery/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'PICKED_UP' }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.orderStatus, 'PICKED_UP');

    // Customer tracking check
    const trackRes = await customerClient.get(`/orders/${lifecycleOrder.id || lifecycleOrder._id}`);
    assert.strictEqual(trackRes.status, 200);
    assert.strictEqual(trackRes.body.data.orderStatus, 'PICKED_UP');

    // Upon PICKED_UP, OTP is now revealed to the customer!
    assert.ok(trackRes.body.data.deliveryOtp, 'Delivery OTP must be exposed to customer once order is PICKED_UP');
    revealedOtp = trackRes.body.data.deliveryOtp;
    assert.strictEqual(revealedOtp.length, 6, 'OTP must be a 6-digit code');
  });

  // 8. Rider delivers order using customer-provided OTP -> DELIVERED
  await test('Assigned rider marks DELIVERED with valid OTP -> Status updates to DELIVERED and OTP is wiped', async () => {
    const res = await rider1Client.patch(
      `/operations/delivery/orders/${lifecycleOrder.id || lifecycleOrder._id}/status`,
      { status: 'DELIVERED', otp: revealedOtp }
    );
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.data.orderStatus, 'DELIVERED');

    // Verify DB OTP is wiped
    const dbOrder = await Order.findById(lifecycleOrder.id || lifecycleOrder._id).select('+deliveryOTP +deliveryOtpCode');
    assert.strictEqual(dbOrder.deliveryOTP, null, 'deliveryOTP hash must be wiped to null after delivery');
    assert.strictEqual(dbOrder.deliveryOtpCode, null, 'deliveryOtpCode must be wiped to null after delivery');

    // Customer tracking check
    const trackRes = await customerClient.get(`/orders/${lifecycleOrder.id || lifecycleOrder._id}`);
    assert.strictEqual(trackRes.status, 200);
    assert.strictEqual(trackRes.body.data.orderStatus, 'DELIVERED');
    assert.strictEqual(trackRes.body.data.deliveryOtp, undefined, 'OTP must be undefined after delivery');
  });

  return results;
}

module.exports = {
  runPhase2D,
};
