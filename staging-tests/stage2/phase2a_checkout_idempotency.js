/**
 * Phase 2A — Checkout Idempotency Tests
 *
 * Verifies:
 * - Duplicate checkout requests with the same idempotency key return the existing order.
 * - Double-click / concurrent checkout race conditions create exactly one order.
 * - Retries after timeout return the existing order even after cart is emptied.
 * - Stock is decremented exactly once and never decremented twice.
 * - Concurrent purchase of the last available stock (stock=1) allows exactly 1 winner,
 *   rejects the competitor with 400 Insufficient Stock, preserves loser's cart, and never causes negative stock.
 * - Failed requests do not clear cart and can be retried safely.
 */

const assert = require('assert');
const crypto = require('crypto');
const { TestApiClient } = require('../utils/testApiClient');
const { Order, Product, Cart, Address } = require('../../bentobabu-backend/app/models');

async function runPhase2A(context) {
  console.log('\n========================================================================');
  console.log('  Phase 2A: Checkout Idempotency & Concurrency Stress Tests             ');
  console.log('========================================================================');

  const results = { name: 'Phase 2A — Checkout Idempotency', passed: 0, failed: 0, tests: [] };

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

  const { customer, customers, product, address } = context;

  // 1. Same checkout request submitted twice sequentially with same Idempotency-Key
  await test('Sequential duplicate checkout returns existing order without duplicate records or stock deduction', async () => {
    const client = new TestApiClient();
    await client.login(customer.email, 'StagingTestPass123!', 'customer');

    // Add item to cart
    await client.post('/cart/items', { productId: product._id.toString(), quantity: 1 });

    const stockBefore = (await Product.findById(product._id)).stockQuantity;
    const idempotencyKey = `idemp-seq-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Request 1
    const res1 = await client.post(
      '/orders',
      { addressId: address._id.toString(), paymentMethod: 'COD' },
      { 'Idempotency-Key': idempotencyKey }
    );
    assert.strictEqual(res1.status, 201, `Expected 201 Created on first order, got ${res1.status}: ${JSON.stringify(res1.body)}`);
    const orderId1 = res1.body.data?._id || res1.body.data?.id;
    assert.ok(orderId1, 'First order must return valid order ID');

    // Request 2 (replay with same idempotency key)
    const res2 = await client.post(
      '/orders',
      { addressId: address._id.toString(), paymentMethod: 'COD' },
      { 'Idempotency-Key': idempotencyKey }
    );
    assert.ok(
      res2.status === 200 || res2.status === 201,
      `Expected 200 or 201 on idempotent replay, got ${res2.status}: ${JSON.stringify(res2.body)}`
    );
    const orderId2 = res2.body.data?._id || res2.body.data?.id;
    assert.strictEqual(orderId2, orderId1, 'Replayed request must return the identical order ID');
    assert.strictEqual(res2.body.data.orderNumber, res1.body.data.orderNumber, 'Order number must match');

    // Verify DB assertions
    const totalOrders = await Order.countDocuments({ user: customer._id, idempotencyKey });
    assert.strictEqual(totalOrders, 1, `DB must contain exactly 1 order for idempotencyKey, found ${totalOrders}`);

    const stockAfter = (await Product.findById(product._id)).stockQuantity;
    assert.strictEqual(stockBefore - stockAfter, 1, `Stock must be decremented by exactly 1, but decreased by ${stockBefore - stockAfter}`);
  });

  // 2. Double-click simulation: Two simultaneous checkout requests with the same Idempotency-Key
  await test('Double-click Place Order (concurrent requests with same Idempotency-Key) yields exactly one logical order', async () => {
    const client = new TestApiClient();
    await client.login(customer.email, 'StagingTestPass123!', 'customer');

    // Reset and repopulate cart
    await Cart.findOneAndUpdate({ user: customer._id }, { $set: { items: [{ product: product._id, quantity: 1 }] } });

    const stockBefore = (await Product.findById(product._id)).stockQuantity;
    const idempotencyKey = `idemp-dbl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Send two requests genuinely concurrently
    const [resA, resB] = await Promise.all([
      client.post(
        '/orders',
        { addressId: address._id.toString(), paymentMethod: 'COD' },
        { 'Idempotency-Key': idempotencyKey }
      ),
      client.post(
        '/orders',
        { addressId: address._id.toString(), paymentMethod: 'COD' },
        { 'Idempotency-Key': idempotencyKey }
      ),
    ]);

    const successfulCodes = [200, 201];
    assert.ok(successfulCodes.includes(resA.status), `Request A status invalid: ${resA.status}`);
    assert.ok(successfulCodes.includes(resB.status), `Request B status invalid: ${resB.status}`);

    const idA = resA.body.data?._id || resA.body.data?.id;
    const idB = resB.body.data?._id || resB.body.data?.id;
    assert.strictEqual(idA, idB, `Both concurrent requests must resolve to the identical order ID: ${idA} vs ${idB}`);

    // DB assertions
    const matchingOrders = await Order.countDocuments({ user: customer._id, idempotencyKey });
    assert.strictEqual(matchingOrders, 1, `Must have exactly 1 order in DB for idempotency key, found ${matchingOrders}`);

    const stockAfter = (await Product.findById(product._id)).stockQuantity;
    assert.strictEqual(stockBefore - stockAfter, 1, `Stock must be decremented by exactly 1 under double-click race, got ${stockBefore - stockAfter}`);
  });

  // 3. Network timeout retry: Client retries with same key after order was placed and cart emptied
  await test('Client retries with same idempotency key after network timeout cleanly returns order even when cart is empty', async () => {
    const client = new TestApiClient();
    await client.login(customer.email, 'StagingTestPass123!', 'customer');

    // Cart is empty right now
    const cart = await Cart.findOne({ user: customer._id });
    assert.strictEqual(cart.items.length, 0, 'Cart must be empty before timeout retry test');

    // Add item and place order
    await client.post('/cart/items', { productId: product._id.toString(), quantity: 1 });
    const idempotencyKey = `idemp-timeout-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const originalRes = await client.post(
      '/orders',
      { addressId: address._id.toString(), paymentMethod: 'COD' },
      { 'Idempotency-Key': idempotencyKey }
    );
    assert.strictEqual(originalRes.status, 201, 'Original order placement must succeed');
    const createdOrderId = originalRes.body.data?._id || originalRes.body.data?.id;

    // Verify cart is now empty
    const cartAfter = await Cart.findOne({ user: customer._id });
    assert.strictEqual(cartAfter.items.length, 0, 'Cart must be empty after order placement');

    // Simulate client timeout: Client sends the exact same request again
    const retryRes = await client.post(
      '/orders',
      { addressId: address._id.toString(), paymentMethod: 'COD' },
      { 'Idempotency-Key': idempotencyKey }
    );
    assert.strictEqual(retryRes.status, 200, `Expected 200 on retry after timeout, got ${retryRes.status}`);
    const retryOrderId = retryRes.body.data?._id || retryRes.body.data?.id;
    assert.strictEqual(retryOrderId, createdOrderId, 'Retry after timeout must return the original order');
  });

  // 4. Two customers attempt to purchase the last available stock (stock=1) concurrently
  await test('Two concurrent requests for the last available stock (stock=1) permits exactly one winner and never decrements below 0', async () => {
    // Create an isolated limited-stock product
    const limitedProduct = await Product.create({
      name: 'Limited Staging Bento',
      slug: `limited-bento-${Date.now()}`,
      description: 'Limited Staging Bento for stock concurrency test',
      category: product.category,
      price: 299,
      stockQuantity: 1, // Only 1 in stock!
      isAvailable: true,
      isActive: true,
      dietary: 'vegetarian',
    });

    const customerA = customers[1];
    const customerB = customers[2];

    const addressA = await Address.findOne({ user: customerA._id });
    const addressB = await Address.findOne({ user: customerB._id });

    // Populate both customer carts with the limited product
    await Cart.findOneAndUpdate({ user: customerA._id }, { $set: { items: [{ product: limitedProduct._id, quantity: 1 }] } });
    await Cart.findOneAndUpdate({ user: customerB._id }, { $set: { items: [{ product: limitedProduct._id, quantity: 1 }] } });

    const clientA = new TestApiClient();
    const clientB = new TestApiClient();
    await Promise.all([
      clientA.login(customerA.email, 'StagingTestPass123!', 'customer'),
      clientB.login(customerB.email, 'StagingTestPass123!', 'customer'),
    ]);

    // Send simultaneous checkouts
    const [resA, resB] = await Promise.all([
      clientA.post('/orders', { addressId: addressA._id.toString(), paymentMethod: 'COD' }),
      clientB.post('/orders', { addressId: addressB._id.toString(), paymentMethod: 'COD' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.strictEqual(statuses[0], 201, `Exactly one request must succeed with 201: got ${statuses[0]}`);
    assert.strictEqual(statuses[1], 400, `The competing request must fail with 400 Insufficient Stock: got ${statuses[1]}`);

    // Verify stock in DB
    const finalProduct = await Product.findById(limitedProduct._id);
    assert.strictEqual(finalProduct.stockQuantity, 0, `Product stock must be exactly 0, found ${finalProduct.stockQuantity}`);

    // Verify carts
    const winningRes = resA.status === 201 ? resA : resB;
    const losingRes = resA.status === 400 ? resA : resB;
    const winningCustomer = resA.status === 201 ? customerA : customerB;
    const losingCustomer = resA.status === 400 ? customerA : customerB;

    assert.ok(losingRes.body.message.includes('stock') || losingRes.body.message.includes('Insufficient'), 'Losing customer error message must mention stock');

    const winningCart = await Cart.findOne({ user: winningCustomer._id });
    const losingCart = await Cart.findOne({ user: losingCustomer._id });

    assert.strictEqual(winningCart.items.length, 0, 'Winning customer cart must be cleared');
    assert.strictEqual(losingCart.items.length, 1, 'Losing customer cart must be preserved so they can adjust their cart');

    // Clean up temporary product
    await Product.deleteOne({ _id: limitedProduct._id });
  });

  // 5. Failed requests do not clear cart and can be retried safely
  await test('Failed request due to invalid address does not clear cart and allows subsequent checkout', async () => {
    const client = new TestApiClient();
    await client.login(customer.email, 'StagingTestPass123!', 'customer');

    // Put item in cart
    await client.post('/cart/items', { productId: product._id.toString(), quantity: 1 });

    // Send invalid address ID
    const failedRes = await client.post('/orders', {
      addressId: '000000000000000000000000',
      paymentMethod: 'COD',
    });
    assert.strictEqual(failedRes.status, 404, `Expected 404 on non-existent address, got ${failedRes.status}`);

    // Check cart is still intact
    const cart = await Cart.findOne({ user: customer._id });
    assert.strictEqual(cart.items.length, 1, 'Cart must remain intact after a failed request');

    // Now submit valid address
    const validRes = await client.post('/orders', {
      addressId: address._id.toString(),
      paymentMethod: 'COD',
    });
    assert.strictEqual(validRes.status, 201, `Valid retry must succeed with 201, got ${validRes.status}`);

    const cartAfter = await Cart.findOne({ user: customer._id });
    assert.strictEqual(cartAfter.items.length, 0, 'Cart must be cleared only after successful order placement');
  });

  return results;
}

module.exports = {
  runPhase2A,
};
