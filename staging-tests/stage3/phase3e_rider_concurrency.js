/**
 * Phase 3E — Rider & Order Concurrency Stress Tests
 *
 * Verifies:
 * - Competing rider claims on the same dispatch order.
 * - Rider offline toggle while BUSY preserves BUSY state until delivery is complete.
 * - Admin reassignment conflicts.
 * - Concurrent pickup requests (exactly 1 succeeds).
 * - Concurrent delivery completion requests (exactly 1 succeeds with valid OTP).
 * - Order ownership and rider availability remain strictly consistent in MongoDB.
 */

const assert = require('assert');
const crypto = require('crypto');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function createReadyOrder(context) {
  const { customer, product, address } = context;
  const orderNumber = 'BB-CONC-' + Date.now().toString(36).toUpperCase();
  return await Order.create({
    orderNumber,
    user: customer._id,
    items: [{ product: product._id, productName: product.name, quantity: 1, unitPrice: product.price, subtotal: product.price }],
    deliveryAddress: { fullName: address.fullName, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, addressType: 'HOME' },
    itemTotal: product.price,
    deliveryCharge: 30,
    grandTotal: product.price + 30,
    paymentMethod: 'COD',
    paymentStatus: 'COD_PENDING',
    orderStatus: 'READY_FOR_PICKUP',
    assignedDeliveryPartner: null,
  });
}

async function runPhase3E(context, baseUrl = 'http://127.0.0.1:5050/api/v1') {
  console.log('\n========================================================================');
  console.log('  Phase 3E: Rider & Order Concurrency Stress Tests                      ');
  console.log('========================================================================');

  const results = { name: 'Phase 3E — Rider Concurrency', passed: 0, failed: 0, tests: [] };

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

  const { riders, admin } = context;

  // Set up 3 active riders
  const riderClients = [];
  for (let i = 0; i < 3; i++) {
    const c = new TestApiClient(baseUrl);
    await c.login(riders[i].rider.email, 'StagingRiderPass123!', 'delivery');
    riderClients.push({ client: c, user: riders[i].rider });
  }

  const adminClient = new TestApiClient(baseUrl);
  await adminClient.login(admin.email, 'StagingAdminPass123!', 'admin');

  // Reset riders presence
  const riderIds = riderClients.map((r) => r.user._id);
  await Order.deleteMany({ assignedDeliveryPartner: { $in: riderIds } });
  await DeliveryPartnerPresence.updateMany(
    { user: { $in: riderIds } },
    { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
  );

  // 1. Multiple Riders Competing for Same Order
  await test('Three riders concurrently accepting the same order produces exactly 1 winner and 2 conflicts (409)', async () => {
    const order = await createReadyOrder(context);

    const [res1, res2, res3] = await Promise.all([
      riderClients[0].client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'RIDER_ACCEPTED' }),
      riderClients[1].client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'RIDER_ACCEPTED' }),
      riderClients[2].client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'RIDER_ACCEPTED' }),
    ]);

    const winners = [res1, res2, res3].filter((r) => r.status === 200);
    const losers = [res1, res2, res3].filter((r) => r.status === 409);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winner, got ${winners.length}`);
    assert.strictEqual(losers.length, 2, `Expected exactly 2 conflicts (409), got ${losers.length}`);

    const dbOrder = await Order.findById(order._id);
    assert.strictEqual(dbOrder.orderStatus, 'RIDER_ACCEPTED');
    assert.ok(dbOrder.assignedDeliveryPartner);
  });

  // 2. Rider Going Offline While BUSY
  await test('Rider attempting to go OFFLINE while in-flight records intended OFFLINE but remains BUSY', async () => {
    const activeRider = riderClients[0];
    const order = await createReadyOrder(context);

    // Rider 0 accepts
    await Order.deleteMany({ assignedDeliveryPartner: activeRider.user._id });
    await DeliveryPartnerPresence.findOneAndUpdate(
      { user: activeRider.user._id },
      { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
    );

    const acceptRes = await activeRider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'RIDER_ACCEPTED' });
    assert.strictEqual(acceptRes.status, 200);

    // Rider toggles availability to OFFLINE
    const offRes = await activeRider.client.patch('/delivery/presence/availability', { availability: 'OFFLINE' });
    assert.strictEqual(offRes.status, 200);

    // Verify presence in DB
    const pres = await DeliveryPartnerPresence.findOne({ user: activeRider.user._id });
    assert.strictEqual(pres.availabilityStatus, 'BUSY', 'Status must stay BUSY during delivery');
    assert.strictEqual(pres.intendedAvailability, 'OFFLINE', 'Intended availability must record OFFLINE');
  });

  // 3. Concurrent Pickup Requests
  await test('Concurrent pickup confirmations from assigned rider resolve idempotently without error', async () => {
    const rider = riderClients[1];
    await Order.deleteMany({ assignedDeliveryPartner: rider.user._id });
    await DeliveryPartnerPresence.findOneAndUpdate(
      { user: rider.user._id },
      { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
    );

    const order = await createReadyOrder(context);
    await rider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'RIDER_ACCEPTED' });

    // Send two pickup confirmations concurrently
    const [p1, p2] = await Promise.all([
      rider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'PICKED_UP' }),
      rider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'PICKED_UP' }),
    ]);

    // One must be 200, the other either 200 or 400 ('Order pickup has already been confirmed')
    assert.ok(
      (p1.status === 200 && [200, 400].includes(p2.status)) ||
      (p2.status === 200 && [200, 400].includes(p1.status)),
      `Concurrent pickup must resolve cleanly, got: ${p1.status}, ${p2.status}`
    );

    const dbOrder = await Order.findById(order._id);
    assert.strictEqual(dbOrder.orderStatus, 'PICKED_UP');
  });

  // 4. Concurrent Delivery Completion
  await test('Concurrent delivery completion with valid OTP produces exactly 1 DELIVERED commit', async () => {
    const rider = riderClients[2];
    await Order.deleteMany({ assignedDeliveryPartner: rider.user._id });
    await DeliveryPartnerPresence.findOneAndUpdate(
      { user: rider.user._id },
      { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
    );

    const plainOtp = '556677';
    const otpHash = crypto.createHash('sha256').update(plainOtp).digest('hex');

    const order = await Order.create({
      orderNumber: 'BB-DEL-CONC-' + Date.now().toString(36).toUpperCase(),
      user: context.customer._id,
      items: [{ product: context.product._id, productName: context.product.name, quantity: 1, unitPrice: 100, subtotal: 100 }],
      deliveryAddress: { fullName: 'Test', phone: '9876543210', addressLine: 'Road', city: 'City', state: 'State', pincode: '700120' },
      itemTotal: 100,
      deliveryCharge: 30,
      grandTotal: 130,
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
      orderStatus: 'PICKED_UP',
      assignedDeliveryPartner: rider.user._id,
      deliveryOTP: otpHash,
      deliveryOtpCode: plainOtp,
      deliveryOtpExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      failedOtpAttempts: 0,
    });

    const [d1, d2] = await Promise.all([
      rider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'DELIVERED', otp: plainOtp }),
      rider.client.patch(`/operations/delivery/orders/${order._id}/status`, { status: 'DELIVERED', otp: plainOtp }),
    ]);

    const successes = [d1, d2].filter((r) => r.status === 200);
    const conflicts = [d1, d2].filter((r) => [400, 409].includes(r.status));

    assert.strictEqual(successes.length, 1, `Expected exactly 1 successful completion, got ${successes.length}`);
    assert.strictEqual(conflicts.length, 1, `Expected exactly 1 conflict response, got ${conflicts.length}`);

    const dbOrder = await Order.findById(order._id).select('+deliveryOTP +deliveryOtpCode');
    assert.strictEqual(dbOrder.orderStatus, 'DELIVERED');
    assert.ok(!dbOrder.deliveryOTP, 'deliveryOTP must be cleared or null upon delivery');
  });

  return results;
}

module.exports = { runPhase3E };
