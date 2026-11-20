/**
 * Phase 2C — Rider Presence Lifecycle Tests
 *
 * Verifies:
 * - Complete presence state transitions: ONLINE -> BUSY -> BUSY -> ONLINE.
 * - Rider presence marks BUSY and binds currentOrderId upon order acceptance.
 * - Heartbeat disconnections and browser refresh/reconnect restore the active order and BUSY state.
 * - Attempting to switch to OFFLINE during an active order records intended availability as OFFLINE
 *   but maintains BUSY availability until delivery is completed.
 * - Delivery completion restores availability according to intended availability.
 * - Active orders survive process simulation and reconnect cleanly.
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function createReadyOrder(context) {
  const { customer, product, address } = context;
  const orderNumber = 'BB-PRES-' + Date.now().toString(36).toUpperCase();
  return await Order.create({
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
    orderStatus: 'READY_FOR_PICKUP',
    assignedDeliveryPartner: null,
  });
}

async function runPhase2C(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2C: Rider Presence Lifecycle Tests                              ');
  console.log('========================================================================');

  const results = { name: 'Phase 2C — Rider Presence Lifecycle', passed: 0, failed: 0, tests: [] };

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
  const targetRider = riders[0].rider;
  const riderClient = new TestApiClient();
  await riderClient.login(targetRider.email, 'StagingRiderPass123!', 'delivery');

  // Clear any existing active orders and reset presence to initial ONLINE state
  await Order.deleteMany({ assignedDeliveryPartner: targetRider._id });
  await DeliveryPartnerPresence.findOneAndUpdate(
    { user: targetRider._id },
    {
      $set: {
        accountStatus: 'ACTIVE',
        availabilityStatus: 'ONLINE',
        intendedAvailability: 'ONLINE',
        currentOrderId: null,
        lastHeartbeat: new Date(),
      },
    }
  );

  let testOrder = null;

  // 1. Initial State: ONLINE
  await test('Rider begins in ONLINE and AVAILABLE state', async () => {
    const res = await riderClient.get('/delivery/presence/me');
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.data.presence.availabilityStatus, 'ONLINE');
    assert.strictEqual(res.body.data.activeOrder, null);
  });

  // 2. Rider accepts order -> Transitions to BUSY
  await test('Rider accepts order: presence transitions ONLINE -> BUSY and binds currentOrderId', async () => {
    testOrder = await createReadyOrder(context);

    const acceptRes = await riderClient.patch(
      `/operations/delivery/orders/${testOrder._id.toString()}/status`,
      { status: 'RIDER_ACCEPTED' }
    );
    assert.strictEqual(acceptRes.status, 200, 'Acceptance must succeed with 200');

    // Fetch presence
    const presRes = await riderClient.get('/delivery/presence/me');
    assert.strictEqual(presRes.status, 200);
    assert.strictEqual(presRes.body.data.presence.availabilityStatus, 'BUSY');
    assert.strictEqual(
      presRes.body.data.presence.currentOrderId.toString(),
      testOrder._id.toString()
    );
    assert.ok(presRes.body.data.activeOrder, 'activeOrder must be populated');
    assert.strictEqual(presRes.body.data.activeOrder.orderStatus, 'RIDER_ACCEPTED');
  });

  // 3. Rider closes browser / reconnects: active order state persists and recovers BUSY
  await test('Rider reconnect simulation recovers active order and preserves BUSY presence', async () => {
    // Simulate new client instance (browser refresh / new tab)
    const newClient = new TestApiClient();
    await newClient.login(targetRider.email, 'StagingRiderPass123!', 'delivery');

    const res = await newClient.get('/delivery/presence/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.presence.availabilityStatus, 'BUSY');
    assert.ok(res.body.data.activeOrder, 'Active order must be recovered after reconnect');
    assert.strictEqual(
      (res.body.data.activeOrder.id || res.body.data.activeOrder._id).toString(),
      testOrder._id.toString()
    );
  });

  // 4. Rider attempts manual availability change to OFFLINE during active order
  await test('Manual OFFLINE toggle during active delivery records intended OFFLINE but preserves BUSY status', async () => {
    const res = await riderClient.patch('/delivery/presence/availability', {
      availability: 'OFFLINE',
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

    // Verify in DB directly
    const presenceInDb = await DeliveryPartnerPresence.findOne({ user: targetRider._id });
    assert.strictEqual(presenceInDb.intendedAvailability, 'OFFLINE', 'Intended availability must be recorded as OFFLINE');
    assert.strictEqual(presenceInDb.availabilityStatus, 'BUSY', 'Availability status must remain BUSY until order is delivered');
    assert.strictEqual(presenceInDb.currentOrderId.toString(), testOrder._id.toString());
  });

  // 5. Rider confirms pickup -> Presence remains BUSY
  await test('Pickup confirmation maintains BUSY presence', async () => {
    const pickupRes = await riderClient.patch(
      `/operations/delivery/orders/${testOrder._id.toString()}/status`,
      { status: 'PICKED_UP' }
    );
    assert.strictEqual(pickupRes.status, 200, 'Pickup must succeed with 200');

    const presRes = await riderClient.get('/delivery/presence/me');
    assert.strictEqual(presRes.body.data.presence.availabilityStatus, 'BUSY');
  });

  // 6. Complete delivery -> Transitions to intended OFFLINE
  await test('Delivery completion transitions presence to intended OFFLINE state', async () => {
    const dbOrder = await Order.findById(testOrder._id).select('+deliveryOtpCode');
    const deliverRes = await riderClient.patch(
      `/operations/delivery/orders/${testOrder._id.toString()}/status`,
      { status: 'DELIVERED', otp: dbOrder.deliveryOtpCode }
    );
    assert.strictEqual(deliverRes.status, 200, `Delivery completion must succeed with 200, got: ${JSON.stringify(deliverRes.body)}`);

    // Verify presence returned to intended OFFLINE
    const presRes = await riderClient.get('/delivery/presence/me');
    assert.strictEqual(presRes.status, 200);
    assert.strictEqual(presRes.body.data.presence.availabilityStatus, 'OFFLINE');
    assert.strictEqual(presRes.body.data.presence.currentOrderId, null);
    assert.strictEqual(presRes.body.data.activeOrder, null);
  });

  // 7. Rider switches back ONLINE cleanly
  await test('Rider switches back ONLINE cleanly after order completion', async () => {
    const res = await riderClient.patch('/delivery/presence/availability', {
      availability: 'ONLINE',
    });
    assert.strictEqual(res.status, 200);

    const presRes = await riderClient.get('/delivery/presence/me');
    assert.strictEqual(presRes.body.data.presence.availabilityStatus, 'ONLINE');
    assert.strictEqual(presRes.body.data.presence.intendedAvailability, 'ONLINE');
  });

  return results;
}

module.exports = {
  runPhase2C,
};
