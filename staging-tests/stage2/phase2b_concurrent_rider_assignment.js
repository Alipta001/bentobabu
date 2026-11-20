/**
 * Phase 2B — Concurrent Rider Assignment Tests
 *
 * Verifies:
 * - When 5 delivery riders attempt to accept the exact same READY_FOR_PICKUP order simultaneously:
 *   - Exactly one rider succeeds (200 OK) and is assigned.
 *   - The other 4 competing riders receive 409 Conflict.
 *   - The 4 losing riders remain ONLINE with currentOrderId === null.
 *   - Exactly 1 rider (the winner) is marked BUSY with currentOrderId set to the order.
 *   - Order assignment persists in MongoDB.
 *   - Repeated requests from the winning rider do not corrupt the assignment.
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function createReadyOrder(context) {
  const { customer, product, address } = context;

  // Create an order via DB directly or API, set to READY_FOR_PICKUP
  const orderNumber = 'BB-TEST-RDY-' + Date.now().toString(36).toUpperCase();
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
    orderStatus: 'READY_FOR_PICKUP',
    assignedDeliveryPartner: null,
    statusHistory: [
      {
        status: 'READY_FOR_PICKUP',
        changedBy: customer._id,
        changedAt: new Date(),
        note: 'Order ready for dispatch in central kitchen',
      },
    ],
  });

  return order;
}

async function runPhase2B(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2B: Concurrent Rider Assignment Stress Tests                    ');
  console.log('========================================================================');

  const results = { name: 'Phase 2B — Concurrent Rider Assignment', passed: 0, failed: 0, tests: [] };

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
  assert.ok(riders && riders.length >= 5, 'Must have at least 5 seeded riders for Phase 2B');

  // Authenticate all 5 riders
  const riderClients = [];
  for (let i = 0; i < 5; i++) {
    const client = new TestApiClient();
    const riderUser = riders[i].rider;
    const res = await client.login(riderUser.email, 'StagingRiderPass123!', 'delivery');
    assert.strictEqual(res.status, 200, `Rider ${i + 1} login failed: ${JSON.stringify(res.body)}`);
    riderClients.push({ client, user: riderUser });
  }

  // 1. Five riders concurrently attempt to accept the same READY_FOR_PICKUP order
  await test('5 riders simultaneously accepting same order produces exactly 1 winner (200) and 4 conflicts (409)', async () => {
    // Ensure all 5 riders are ONLINE with currentOrderId === null
    const riderIds = riderClients.map((r) => r.user._id);
    await Order.deleteMany({ assignedDeliveryPartner: { $in: riderIds } });
    await DeliveryPartnerPresence.updateMany(
      { user: { $in: riderIds } },
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

    const order = await createReadyOrder(context);

    // Concurrently trigger acceptance from all 5 riders using Promise.all
    const acceptPromises = riderClients.map(({ client }) =>
      client.patch(`/operations/delivery/orders/${order._id.toString()}/status`, {
        status: 'RIDER_ACCEPTED',
      })
    );

    const responses = await Promise.all(acceptPromises);
    const winners = responses.filter((r) => r.status === 200);
    const losers = responses.filter((r) => r.status === 409);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winner with status 200, got ${winners.length}`);
    assert.strictEqual(losers.length, 4, `Expected exactly 4 losers with status 409 Conflict, got ${losers.length}`);

    // Verify error message for losers
    for (const loser of losers) {
      assert.ok(
        loser.body.message.includes('already been assigned') ||
        loser.body.message.includes('not available'),
        `Conflict message must describe order assignment conflict, got: ${loser.body.message}`
      );
    }

    // Verify DB state of the order
    const updatedOrder = await Order.findById(order._id);
    assert.strictEqual(updatedOrder.orderStatus, 'RIDER_ACCEPTED', 'Order status must be RIDER_ACCEPTED');
    assert.ok(updatedOrder.assignedDeliveryPartner, 'Order must have an assignedDeliveryPartner');

    const winnerUserId = updatedOrder.assignedDeliveryPartner.toString();
    const winningRider = riderClients.find((r) => r.user._id.toString() === winnerUserId);
    assert.ok(winningRider, 'Assigned partner must match one of the 5 test riders');

    // Verify DB state of rider presences:
    // Winner must be BUSY with currentOrderId = order._id
    const winnerPresence = await DeliveryPartnerPresence.findOne({ user: winningRider.user._id });
    assert.strictEqual(winnerPresence.availabilityStatus, 'BUSY', 'Winning rider presence must be BUSY');
    assert.strictEqual(
      winnerPresence.currentOrderId.toString(),
      order._id.toString(),
      'Winning rider currentOrderId must reference the assigned order'
    );

    // All 4 losers must remain ONLINE and NOT have any orphaned BUSY state or currentOrderId
    const losingRiders = riderClients.filter((r) => r.user._id.toString() !== winnerUserId);
    for (const loser of losingRiders) {
      const loserPresence = await DeliveryPartnerPresence.findOne({ user: loser.user._id });
      assert.strictEqual(loserPresence.availabilityStatus, 'ONLINE', `Losing rider ${loser.user.email} must remain ONLINE`);
      assert.strictEqual(loserPresence.currentOrderId, null, `Losing rider ${loser.user.email} currentOrderId must be null`);
    }
  });

  // 2. Repeated acceptance requests from the winning rider
  await test('Repeated acceptance requests from the assigned winning rider do not corrupt assignment or duplicate status', async () => {
    // Reset presences and delete prior active orders for test riders
    const riderIds = riderClients.map((r) => r.user._id);
    await Order.deleteMany({ assignedDeliveryPartner: { $in: riderIds } });
    await DeliveryPartnerPresence.updateMany(
      { user: { $in: riderIds } },
      { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
    );

    const order = await createReadyOrder(context);
    const winnerClient = riderClients[0].client;

    // First request
    const firstRes = await winnerClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, {
      status: 'RIDER_ACCEPTED',
    });
    assert.strictEqual(firstRes.status, 200, 'First acceptance must succeed with 200');

    // Second request from same winning rider
    const secondRes = await winnerClient.patch(`/operations/delivery/orders/${order._id.toString()}/status`, {
      status: 'RIDER_ACCEPTED',
    });
    // Can return 400 ("Order must be in READY_FOR_PICKUP") or 200 idempotent response, but must NOT error or reassign
    assert.ok(
      [200, 400].includes(secondRes.status),
      `Repeated acceptance from assigned rider should return 200 or 400, got ${secondRes.status}`
    );

    // Verify in DB that assigned delivery partner is unchanged
    const dbOrder = await Order.findById(order._id);
    assert.strictEqual(
      dbOrder.assignedDeliveryPartner.toString(),
      riderClients[0].user._id.toString(),
      'Delivery partner must remain rider 1'
    );
  });

  // 3. A rider who already has an active BUSY order cannot accept a second order
  await test('A rider who currently has an active order is blocked from accepting another order', async () => {
    const rider = riderClients[0];
    const order2 = await createReadyOrder(context);

    // Rider 0 already has an active order from previous test
    const res = await rider.client.patch(`/operations/delivery/orders/${order2._id.toString()}/status`, {
      status: 'RIDER_ACCEPTED',
    });

    assert.ok(
      [400, 403, 409].includes(res.status),
      `Expected error (400/403/409) when busy rider attempts to accept second order, got: ${res.status}`
    );
    assert.ok(
      res.body.message.includes('active order') ||
      res.body.message.includes('not available') ||
      res.body.message.includes('ONLINE'),
      `Message must explain active order conflict, got: ${res.body.message}`
    );
  });

  return results;
}

module.exports = {
  runPhase2B,
};
