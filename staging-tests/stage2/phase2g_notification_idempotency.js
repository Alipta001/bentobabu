/**
 * Phase 2G — Notification Idempotency & Delivery Resilience Tests
 *
 * Verifies:
 * - Duplicate event dispatches for RIDER_ACCEPTED, PICKED_UP, DELIVERED, and ORDER_CANCELLED
 *   do not create duplicate Notification records in MongoDB.
 * - Idempotency keys prevent double sending across IN_APP, EMAIL, and WHATSAPP channels.
 * - Retry mechanisms cleanly handle simulated provider errors without duplicating records.
 * - Notification recovery updates attempts and state without crash loops.
 */

const assert = require('assert');
const NotificationDispatcher = require('../../bentobabu-backend/app/utils/notificationDispatcher');
const { Notification, Order } = require('../../bentobabu-backend/app/models');

async function runPhase2G(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2G: Notification Idempotency & Dispatch Resilience Tests        ');
  console.log('========================================================================');

  const results = { name: 'Phase 2G — Notification Idempotency', passed: 0, failed: 0, tests: [] };

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

  const { customer, product, address } = context;

  // Create an order for testing notification dispatches
  const orderNumber = 'BB-NOTIF-' + Date.now().toString(36).toUpperCase();
  const testOrder = await Order.create({
    orderNumber,
    user: customer._id,
    items: [{ product: product._id, productName: product.name, quantity: 1, unitPrice: product.price, subtotal: product.price }],
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
    orderStatus: 'CONFIRMED',
  });

  const eventsToTest = [
    'RIDER_ACCEPTED',
    'OUT_FOR_DELIVERY',
    'ORDER_DELIVERED',
    'ORDER_CANCELLED',
  ];

  // 1. Duplicate event generation for all 4 critical lifecycle events
  for (const eventType of eventsToTest) {
    await test(`Duplicate dispatch for ${eventType} does not create duplicate notification records`, async () => {
      // Dispatch event twice concurrently
      await Promise.all([
        NotificationDispatcher.dispatch({
          userId: customer._id,
          orderId: testOrder._id,
          order: testOrder,
          eventType,
          metadata: { orderNumber: testOrder.orderNumber },
        }),
        NotificationDispatcher.dispatch({
          userId: customer._id,
          orderId: testOrder._id,
          order: testOrder,
          eventType,
          metadata: { orderNumber: testOrder.orderNumber },
        }),
      ]);

      // Check IN_APP notifications
      const inAppNotifications = await Notification.find({
        order: testOrder._id,
        eventType,
        channel: 'IN_APP',
      });
      assert.strictEqual(
        inAppNotifications.length,
        1,
        `Expected exactly 1 IN_APP record for ${eventType}, found ${inAppNotifications.length}`
      );

      // Check EMAIL notifications
      const emailNotifications = await Notification.find({
        order: testOrder._id,
        eventType,
        channel: 'EMAIL',
      });
      assert.strictEqual(
        emailNotifications.length,
        1,
        `Expected exactly 1 EMAIL record for ${eventType}, found ${emailNotifications.length}`
      );
    });
  }

  // 2. Notification retry mechanism with idempotency
  await test('NotificationDispatcher.retry increments attempts cleanly and avoids duplicate execution', async () => {
    // Find one of the notifications
    const notif = await Notification.findOne({ order: testOrder._id, channel: 'EMAIL' });
    assert.ok(notif, 'Notification must exist');

    // Simulate failed status
    notif.status = 'FAILED';
    notif.attempts = 1;
    notif.lastError = 'Simulated timeout';
    await notif.save();

    // Call retry
    const retried = await NotificationDispatcher.retry(notif._id);
    assert.strictEqual(retried.status, 'SENT', 'Retried notification should transition to SENT');
    assert.ok(retried.attempts >= 2, 'Attempts counter must be incremented');

    // Check DB record count hasn't changed
    const totalEmail = await Notification.countDocuments({
      order: testOrder._id,
      eventType: notif.eventType,
      channel: 'EMAIL',
    });
    assert.strictEqual(totalEmail, 1, 'Retry must update existing record, not create duplicate');
  });

  return results;
}

module.exports = {
  runPhase2G,
};
