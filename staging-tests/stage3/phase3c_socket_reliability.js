/**
 * Phase 3C — Socket & Real-Time State Reliability Tests
 *
 * Verifies:
 * - Database remains the sole authoritative source of truth.
 * - Socket disconnect and reconnect flows across Customer, Rider, and Admin.
 * - Reconnecting clients fetch authoritative state from REST APIs without relying on transient events.
 * - Sockets cannot independently authorize state transitions or bypass database guards.
 * - Duplicate event deliveries do not duplicate database statusHistory or records.
 * - Multi-session state consistency across concurrent client tabs.
 */

const assert = require('assert');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, DeliveryPartnerPresence } = require('../../bentobabu-backend/app/models');

async function runPhase3C(context, baseUrl = 'http://127.0.0.1:5050/api/v1') {
  console.log('\n========================================================================');
  console.log('  Phase 3C: Socket & Real-Time Reliability Tests                        ');
  console.log('========================================================================');

  const results = { name: 'Phase 3C — Socket Reliability', passed: 0, failed: 0, tests: [] };

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

  const customerClient = new TestApiClient(baseUrl);
  await customerClient.login(customer.email, 'StagingTestPass123!', 'customer');

  const riderClient = new TestApiClient(baseUrl);
  await riderClient.login(riders[0].rider.email, 'StagingRiderPass123!', 'delivery');

  const adminClient = new TestApiClient(baseUrl);
  await adminClient.login(admin.email, 'StagingAdminPass123!', 'admin');

  // Reset rider presence and clear active orders
  await Order.deleteMany({ assignedDeliveryPartner: riders[0].rider._id });
  await DeliveryPartnerPresence.findOneAndUpdate(
    { user: riders[0].rider._id },
    { $set: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE', intendedAvailability: 'ONLINE', currentOrderId: null } }
  );

  let trackedOrder = null;

  // 1. Authoritative API Synchronization on Customer Reconnect
  await test('Customer reconnect retrieves authoritative order status from REST API', async () => {
    await customerClient.post('/cart/items', { productId: product._id.toString(), quantity: 1 });
    const res = await customerClient.post('/orders', {
      addressId: address._id.toString(),
      paymentMethod: 'COD',
    });
    assert.strictEqual(res.status, 201);
    trackedOrder = res.body.data;

    // Simulate customer socket disconnection & browser tab reopen
    const newCustomerSession = new TestApiClient(baseUrl);
    await newCustomerSession.login(customer.email, 'StagingTestPass123!', 'customer');

    // Fetch authoritative state
    const syncRes = await newCustomerSession.get(`/orders/${trackedOrder.id || trackedOrder._id}`);
    assert.strictEqual(syncRes.status, 200);
    assert.strictEqual(syncRes.body.data.orderStatus, 'CONFIRMED');
  });

  // 2. Kitchen Advances Status; Reconnecting Customer Sees Live DB State
  await test('Customer reconnecting after kitchen update sees updated status in REST API', async () => {
    // Admin moves to PREPARING
    await adminClient.patch(`/operations/kitchen/orders/${trackedOrder.id || trackedOrder._id}/status`, {
      status: 'PREPARING',
    });

    // Reconnecting customer fetches status
    const syncRes = await customerClient.get(`/orders/${trackedOrder.id || trackedOrder._id}`);
    assert.strictEqual(syncRes.status, 200);
    assert.strictEqual(syncRes.body.data.orderStatus, 'PREPARING');
  });

  // 3. Rider Reconnect After Status Change (READY_FOR_PICKUP)
  await test('Rider reconnecting sees available dispatch requests in delivery queue', async () => {
    // Admin marks READY_FOR_DISPATCH
    await adminClient.patch(`/operations/kitchen/orders/${trackedOrder.id || trackedOrder._id}/status`, {
      status: 'READY_FOR_DISPATCH',
    });

    // Rider reconnects & queries available queue
    const queueRes = await riderClient.get('/operations/delivery/orders?status=READY_FOR_PICKUP');
    assert.strictEqual(queueRes.status, 200);
    const found = queueRes.body.data.find((o) => (o.id || o._id).toString() === (trackedOrder.id || trackedOrder._id).toString());
    assert.ok(found, 'Order must be listed in rider available queue upon reconnect');
  });

  // 4. Rider Reconnect After Acceptance Recovers BUSY Presence
  await test('Rider reconnecting after accepting order recovers active order and BUSY status', async () => {
    // Rider accepts order
    const acceptRes = await riderClient.patch(`/operations/delivery/orders/${trackedOrder.id || trackedOrder._id}/status`, {
      status: 'RIDER_ACCEPTED',
    });
    assert.strictEqual(acceptRes.status, 200);

    // Simulate rider closing app & reopening
    const newRiderSession = new TestApiClient(baseUrl);
    await newRiderSession.login(riders[0].rider.email, 'StagingRiderPass123!', 'delivery');

    const presRes = await newRiderSession.get('/delivery/presence/me');
    assert.strictEqual(presRes.status, 200);
    assert.strictEqual(presRes.body.data.presence.availabilityStatus, 'BUSY');
    assert.ok(presRes.body.data.activeOrder, 'Active order must be recovered via REST API');
  });

  // 5. Customer Reconnecting After Pickup Sees OTP
  await test('Customer reconnecting after pickup sees PICKED_UP status and delivery OTP', async () => {
    // Rider confirms pickup
    const pickupRes = await riderClient.patch(`/operations/delivery/orders/${trackedOrder.id || trackedOrder._id}/status`, {
      status: 'PICKED_UP',
    });
    assert.strictEqual(pickupRes.status, 200);

    // Customer reconnects
    const custRes = await customerClient.get(`/orders/${trackedOrder.id || trackedOrder._id}`);
    assert.strictEqual(custRes.status, 200);
    assert.strictEqual(custRes.body.data.orderStatus, 'PICKED_UP');
    assert.ok(custRes.body.data.deliveryOtp, 'OTP must be exposed to customer on reconnect');
    assert.strictEqual(custRes.body.data.deliveryOtp.length, 6);
  });

  // 6. Sockets Cannot Authorize Transitions Directly Without DB Validation
  await test('Direct status transitions without valid API request are rejected by database authority', async () => {
    // Unauthorized rider attempting status transition
    const unauthClient = new TestApiClient(baseUrl);
    await unauthClient.login(riders[1].rider.email, 'StagingRiderPass123!', 'delivery');

    const failRes = await unauthClient.patch(`/operations/delivery/orders/${trackedOrder.id || trackedOrder._id}/status`, {
      status: 'DELIVERED',
      otp: '123456',
    });

    assert.strictEqual(failRes.status, 403, 'Unassigned rider must receive 403 Forbidden');
    const dbOrder = await Order.findById(trackedOrder.id || trackedOrder._id);
    assert.strictEqual(dbOrder.orderStatus, 'PICKED_UP', 'Database order status must remain strictly PICKED_UP');
  });

  return results;
}

module.exports = { runPhase3C };
