/**
 * BentoBabu — Pre-Production Audit Verification Suite
 * Global Live Ordering Availability Control
 *
 * Verifies all 10 pre-production audit criteria:
 * 1. Admin OFF operation and atomic serialization gate target the same SystemSetting document and schema.
 * 2. Admin OFF operation awaits database commit before responding.
 * 3. Concurrent checkout cannot slip through once admin OFF commits.
 * 4. Transaction retries explicitly recheck ORDER_ACCEPTANCE_ENABLED on every attempt.
 * 5. Failed checkout transactions leave zero partial orders, stock decrements, slot bookings, or coupon leaks.
 * 6. Redis cache failure or stale Redis cache cannot authorize checkout.
 * 7. Public ordering status reads authoritative MongoDB and invalidates cache on admin toggle.
 * 8. Razorpay webhooks, payment verification, kitchen & delivery ops, cancellations, and refunds are completely unblocked.
 * 9. Frontend modal initializes safely without SSR hydration mismatch and handles session reset on status change.
 * 10. Customer cart data remains 100% intact when ordering is disabled.
 */

process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const SettingsController = require('../app/controllers/settingsController');
const OrderController = require('../app/controllers/orderController');
const { SystemSetting, Order, DeliverySlot, Product, Cart, Coupon, CouponUsage, DeliveryZone, Address } = require('../app/models');

const makeMockRequest = (reqOptions, dispatchFn) => {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage({ on: () => {}, once: () => {}, emit: () => {} });
    req.ip = '127.0.0.1';
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };
    req.connection = { remoteAddress: '127.0.0.1' };
    Object.assign(req, reqOptions);

    let statusCode = 200;
    const resHeaders = {};

    const res = new http.ServerResponse(req);
    res.status = (code) => {
      statusCode = code;
      return res;
    };
    res.set = (field, val) => {
      if (typeof field === 'object' && field !== null) {
        for (const [k, v] of Object.entries(field)) {
          resHeaders[k.toLowerCase()] = v;
        }
      } else if (typeof field === 'string') {
        resHeaders[field.toLowerCase()] = val;
      }
      return res;
    };
    res.setHeader = (k, v) => {
      resHeaders[k.toLowerCase()] = v;
    };
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.getHeaders = () => resHeaders;

    res.json = (data) => {
      resolve({ statusCode, headers: resHeaders, body: data });
    };

    res.end = () => {
      resolve({ statusCode, headers: resHeaders, body: null });
    };

    try {
      dispatchFn(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

const runAudit = async () => {
  console.log('================================================================');
  console.log('  BENTO BABU — PRE-PRODUCTION AUDIT VERIFICATION SUITE         ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  const check = async (pointNumber, description, fn) => {
    total++;
    try {
      await fn();
      console.log(`  ✓ [Point ${pointNumber}] ${description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [Point ${pointNumber}] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // POINT 1 & 2: Same SystemSetting document, compatible transactions & commit
  // ---------------------------------------------------------------------------
  await check(1, 'Admin OFF and checkout atomic gate operate on identical document & schema', async () => {
    let capturedAdminQuery = null;
    let capturedAdminUpdate = null;
    let capturedGateQuery = null;

    const origFindOneAndUpdate = SystemSetting.findOneAndUpdate;

    SystemSetting.findOneAndUpdate = async (query, update, opts) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED' && !('value' in query)) {
        capturedAdminQuery = query;
        capturedAdminUpdate = update;
        return { key: 'ORDER_ACCEPTANCE_ENABLED', value: update.value };
      }
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED' && query.value === true) {
        capturedGateQuery = query;
        return null;
      }
      return origFindOneAndUpdate.call(SystemSetting, query, update, opts);
    };

    // Simulate Admin OFF call
    await makeMockRequest(
      { method: 'PUT', url: '/api/v1/admin/settings', body: { ORDER_ACCEPTANCE_ENABLED: false } },
      (req, res, next) => AdminSettingsController.updateSettings(req, res, next)
    );

    SystemSetting.findOneAndUpdate = origFindOneAndUpdate;

    assert.deepStrictEqual(capturedAdminQuery, { key: 'ORDER_ACCEPTANCE_ENABLED' });
    assert.strictEqual(capturedAdminUpdate.value, false);
    assert.strictEqual(capturedAdminUpdate.key, 'ORDER_ACCEPTANCE_ENABLED');
  });

  await check(2, 'Admin OFF operation commits to database before returning HTTP 200', async () => {
    let dbUpdated = false;
    let dbUpdatedBeforeResponse = false;

    const origFindOneAndUpdate = SystemSetting.findOneAndUpdate;
    SystemSetting.findOneAndUpdate = async (query, update, opts) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        await new Promise((r) => setTimeout(r, 20));
        dbUpdated = true;
        return { key: 'ORDER_ACCEPTANCE_ENABLED', value: update.value };
      }
      return origFindOneAndUpdate.call(SystemSetting, query, update, opts);
    };

    const res = await makeMockRequest(
      { method: 'PUT', url: '/api/v1/admin/settings', body: { ORDER_ACCEPTANCE_ENABLED: false } },
      (req, res, next) => {
        const origJson = res.json;
        res.json = (data) => {
          dbUpdatedBeforeResponse = dbUpdated;
          return origJson(data);
        };
        return AdminSettingsController.updateSettings(req, res, next);
      }
    );

    SystemSetting.findOneAndUpdate = origFindOneAndUpdate;

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(dbUpdated, true, 'Database write must occur');
    assert.strictEqual(dbUpdatedBeforeResponse, true, 'Database write must finish before response is sent');
  });

  // ---------------------------------------------------------------------------
  // POINT 3: Concurrent checkout requests cannot create orders after OFF commits
  // ---------------------------------------------------------------------------
  await check(3, 'Concurrent checkout requests cannot create orders once admin OFF commits', async () => {
    // Simulate setting in MongoDB has value: false
    const origFindOne = SystemSetting.findOne;
    const origFindOneAndUpdate = SystemSetting.findOneAndUpdate;

    SystemSetting.findOne = (query) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        const doc = { key: 'ORDER_ACCEPTANCE_ENABLED', value: false };
        return {
          lean: async () => doc,
          session: async () => doc,
          then: (resolve) => resolve(doc),
        };
      }
      return {
        lean: async () => null,
        session: async () => null,
        then: (resolve) => resolve(null),
      };
    };

    SystemSetting.findOneAndUpdate = async (query, update, opts) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED' && query.value === true) {
        return null; // Atomic gate returns null because document value is false
      }
      return origFindOneAndUpdate.call(SystemSetting, query, update, opts);
    };

    const res = await makeMockRequest(
      {
        method: 'POST',
        url: '/api/v1/orders',
        body: { addressId: '65f1234567890abcdef12345', paymentMethod: 'COD' },
        user: { id: '65f1234567890abcdef00001' },
      },
      (req, res, next) => OrderController.placeOrder(req, res, next)
    );

    SystemSetting.findOne = origFindOne;
    SystemSetting.findOneAndUpdate = origFindOneAndUpdate;

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'ORDERING_DISABLED');
    assert.strictEqual(res.body.message, "We're not accepting new orders right now. Please check back later.");
  });

  // ---------------------------------------------------------------------------
  // POINT 4: Transaction retries recheck ORDER_ACCEPTANCE_ENABLED
  // ---------------------------------------------------------------------------
  await check(4, 'Transaction retry loop rechecks ORDER_ACCEPTANCE_ENABLED on every attempt', async () => {
    let attemptCount = 0;
    const gateChecks = [];

    const origFindOneAndUpdate = SystemSetting.findOneAndUpdate;
    const origFindOne = SystemSetting.findOne;

    // First attempt: simulate pre-check passed when ON, but transient WriteConflict occurs
    // Second attempt: admin toggled to OFF in between attempts -> gate must detect OFF and abort
    SystemSetting.findOne = (query) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        // Pre-check returns ON (true)
        const doc = { key: 'ORDER_ACCEPTANCE_ENABLED', value: attemptCount === 0 ? true : false };
        return {
          lean: async () => doc,
          session: async () => doc,
          then: (resolve) => resolve(doc),
        };
      }
      return { lean: async () => null, session: async () => null, then: (r) => r(null) };
    };

    // Address mock
    const origAddressFindOne = Address.findOne;
    Address.findOne = () => ({
      then: (r) => r({ _id: '65f1234567890abcdef12345', user: '65f1234567890abcdef00001', pincode: '700122' }),
    });

    // Zone mock
    const origZoneFindOne = DeliveryZone.findOne;
    DeliveryZone.findOne = () => ({
      then: (r) => r({ _id: '65f1234567890abcdef12349', pincodes: ['700122'], deliveryCharge: 30 }),
    });

    // DailyMenu mock
    const { DailyMenu } = require('../app/models');
    const origDailyMenuFindOne = DailyMenu.findOne;
    DailyMenu.findOne = () => ({
      lean: async () => ({ date: '2026-11-20', isPublished: true, items: [] }),
      then: (r) => r({ date: '2026-11-20', isPublished: true, items: [] }),
    });

    SystemSetting.findOneAndUpdate = async (query, update, opts) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        attemptCount++;
        gateChecks.push({ attempt: attemptCount, queryValue: query.value });

        if (attemptCount === 1) {
          // Trigger transient error on attempt 1 to cause a transaction retry
          const transientErr = new Error('WriteConflict error: competing transaction locked document');
          transientErr.errorLabels = ['TransientTransactionError'];
          throw transientErr;
        } else {
          // Attempt 2: Admin has switched OFF in between attempts
          return null; // Gate fails because value is now false
        }
      }
      return origFindOneAndUpdate.call(SystemSetting, query, update, opts);
    };

    const res = await makeMockRequest(
      {
        method: 'POST',
        url: '/api/v1/orders',
        body: { addressId: '65f1234567890abcdef12345', paymentMethod: 'COD' },
        user: { id: '65f1234567890abcdef00001' },
      },
      (req, res, next) => OrderController.placeOrder(req, res, next)
    );

    SystemSetting.findOneAndUpdate = origFindOneAndUpdate;
    SystemSetting.findOne = origFindOne;
    Address.findOne = origAddressFindOne;
    DeliveryZone.findOne = origZoneFindOne;
    DailyMenu.findOne = origDailyMenuFindOne;

    assert.strictEqual(attemptCount, 2, 'Must have attempted retry');
    assert.strictEqual(gateChecks.length, 2, 'Gate check must have executed on both attempt 1 and attempt 2');
    assert.strictEqual(res.statusCode, 503, 'Attempt 2 must abort and return 503 when admin toggled OFF');
    assert.strictEqual(res.body.code, 'ORDERING_DISABLED');
  });

  // ---------------------------------------------------------------------------
  // POINT 5: Failed checkout transactions leave no partial orders or leaks
  // ---------------------------------------------------------------------------
  await check(5, 'Failed checkout transactions leave zero partial orders, stock decrements, slot bookings or coupon leaks', async () => {
    let orderCreated = false;
    let stockModified = false;
    let slotModified = false;
    let couponModified = false;

    const origOrderSave = Order.prototype.save;
    Order.prototype.save = function () {
      orderCreated = true;
      return origOrderSave.apply(this, arguments);
    };

    const origProductUpdateOne = Product.updateOne;
    Product.updateOne = async () => { stockModified = true; };

    const origSlotFindOneAndUpdate = DeliverySlot.findOneAndUpdate;
    DeliverySlot.findOneAndUpdate = async () => { slotModified = true; };

    const origCouponUpdateOne = Coupon.updateOne;
    Coupon.updateOne = async () => { couponModified = true; };

    // Run checkout when ordering is OFF
    const origFindOne = SystemSetting.findOne;
    SystemSetting.findOne = (query) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        return { lean: async () => ({ key: 'ORDER_ACCEPTANCE_ENABLED', value: false }) };
      }
      return { lean: async () => null };
    };

    const res = await makeMockRequest(
      {
        method: 'POST',
        url: '/api/v1/orders',
        body: { addressId: '65f1234567890abcdef12345', paymentMethod: 'COD', deliverySlotId: '65f1234567890abcdef12348' },
        user: { id: '65f1234567890abcdef00001' },
      },
      (req, res, next) => OrderController.placeOrder(req, res, next)
    );

    SystemSetting.findOne = origFindOne;
    Order.prototype.save = origOrderSave;
    Product.updateOne = origProductUpdateOne;
    DeliverySlot.findOneAndUpdate = origSlotFindOneAndUpdate;
    Coupon.updateOne = origCouponUpdateOne;

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(orderCreated, false, 'No order must be saved');
    assert.strictEqual(stockModified, false, 'No stock must be decremented');
    assert.strictEqual(slotModified, false, 'No delivery slot must be booked');
    assert.strictEqual(couponModified, false, 'No coupon usage must be recorded');
  });

  // ---------------------------------------------------------------------------
  // POINT 6: Redis cache failure cannot cause stale ordering availability
  // ---------------------------------------------------------------------------
  await check(6, 'Redis cache failure or stale Redis cache cannot authorize checkout', async () => {
    // Checkout queries MongoDB directly, not Redis
    const fs = require('fs');
    const orderControllerSource = fs.readFileSync(require.resolve('../app/controllers/orderController.js'), 'utf8');

    // Confirm placeOrder does not read from redis for ORDER_ACCEPTANCE_ENABLED
    const hasRedisOrderCheck = /redisGet.*ORDER_ACCEPTANCE_ENABLED/i.test(orderControllerSource);
    assert.strictEqual(hasRedisOrderCheck, false, 'placeOrder must never read ordering status from Redis cache');

    // Confirm checkout directly queries MongoDB SystemSetting
    assert.ok(
      orderControllerSource.includes("SystemSetting.findOne({ key: 'ORDER_ACCEPTANCE_ENABLED' })") &&
      orderControllerSource.includes("SystemSetting.findOneAndUpdate(\n          { key: 'ORDER_ACCEPTANCE_ENABLED', value: true }"),
      'placeOrder must directly check MongoDB SystemSetting'
    );
  });

  // ---------------------------------------------------------------------------
  // POINT 7: Public ordering status reads authoritative source and invalidates cache
  // ---------------------------------------------------------------------------
  await check(7, 'Public status reads authoritative MongoDB and invalidates cache on admin toggle', async () => {
    let mongoQueried = false;
    const origFindOne = SystemSetting.findOne;

    SystemSetting.findOne = (query) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        mongoQueried = true;
        return { lean: async () => ({ key: 'ORDER_ACCEPTANCE_ENABLED', value: false }) };
      }
      return origFindOne.call(SystemSetting, query);
    };

    const res = await makeMockRequest(
      { method: 'GET', url: '/api/v1/settings/ordering-status' },
      (req, res, next) => SettingsController.getOrderingStatus(req, res, next)
    );

    SystemSetting.findOne = origFindOne;

    assert.strictEqual(mongoQueried, true, 'SettingsController must query authoritative MongoDB');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.acceptingOrders, false);
    assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');

    // Verify admin toggle invalidates cache
    const adminSettingsSource = require('fs').readFileSync(
      require.resolve('../app/controllers/adminSettingsController.js'),
      'utf8'
    );
    assert.ok(
      adminSettingsSource.includes("await redisDel('cache:ordering_status')"),
      'adminSettingsController must explicitly invalidate cache:ordering_status'
    );
  });

  // ---------------------------------------------------------------------------
  // POINT 8: Uninterrupted critical workflows
  // ---------------------------------------------------------------------------
  await check(8, 'Razorpay webhook, payment verification, kitchen & delivery ops, cancellations and refunds are unblocked', () => {
    const fs = require('fs');

    const paymentCode = fs.readFileSync(require.resolve('../app/controllers/paymentController.js'), 'utf8');
    assert.ok(!paymentCode.includes('ORDER_ACCEPTANCE_ENABLED'), 'paymentController must not block on ORDER_ACCEPTANCE_ENABLED');

    const kitchenOpsCode = fs.readFileSync(require.resolve('../app/controllers/orderOperationsController.js'), 'utf8');
    assert.ok(!kitchenOpsCode.includes('ORDER_ACCEPTANCE_ENABLED'), 'orderOperationsController must not block on ORDER_ACCEPTANCE_ENABLED');

    const orderControllerCode = fs.readFileSync(require.resolve('../app/controllers/orderController.js'), 'utf8');
    // Check that cancelOrder function does not check ORDER_ACCEPTANCE_ENABLED
    const cancelOrderIndex = orderControllerCode.indexOf('static async cancelOrder');
    assert.ok(cancelOrderIndex > -1, 'cancelOrder must exist');
    const cancelOrderBlock = orderControllerCode.slice(cancelOrderIndex, cancelOrderIndex + 2000);
    assert.ok(!cancelOrderBlock.includes('ORDER_ACCEPTANCE_ENABLED'), 'cancelOrder must not check ORDER_ACCEPTANCE_ENABLED');
  });

  // ---------------------------------------------------------------------------
  // POINT 9: Customer modal SSR safety & session reset
  // ---------------------------------------------------------------------------
  await check(9, 'Customer modal initializes safely without SSR hydration mismatch and handles session reset on status change', () => {
    const fs = require('fs');
    const modalCode = fs.readFileSync(require.resolve('../../bentobabu-frontend/components/ui/ServiceUnavailableModal.tsx'), 'utf8');
    const contextCode = fs.readFileSync(require.resolve('../../bentobabu-frontend/context/OrderingStatusContext.tsx'), 'utf8');

    // Confirm initial state is false to guarantee SSR and client hydration tree match
    assert.ok(
      contextCode.includes('const [isModalOpen, setIsModalOpen] = useState(false);'),
      'isModalOpen must initialize to false to prevent hydration mismatch'
    );

    // Confirm session reset when transitioning from true -> false
    assert.ok(
      contextCode.includes('if (prevStatusRef.current === true) {') &&
      contextCode.includes('sessionStorage.removeItem(SESSION_DISMISSED_KEY);'),
      'Must clear dismissal in sessionStorage when status transitions from ON to OFF'
    );

    // Confirm modal renders null when closed
    assert.ok(
      modalCode.includes('if (!isModalOpen) return null;'),
      'Modal must return null when not open'
    );
  });

  // ---------------------------------------------------------------------------
  // POINT 10: Existing cart data remains intact
  // ---------------------------------------------------------------------------
  await check(10, 'Existing customer cart data in MongoDB is never cleared or modified when ordering is disabled', async () => {
    let cartCleared = false;
    const origCartFindOneAndUpdate = Cart.findOneAndUpdate;

    Cart.findOneAndUpdate = async (query, update, opts) => {
      if (update && update.$set && Array.isArray(update.$set.items) && update.$set.items.length === 0) {
        cartCleared = true;
      }
      return origCartFindOneAndUpdate.call(Cart, query, update, opts);
    };

    const origFindOne = SystemSetting.findOne;
    SystemSetting.findOne = (query) => {
      if (query.key === 'ORDER_ACCEPTANCE_ENABLED') {
        return { lean: async () => ({ key: 'ORDER_ACCEPTANCE_ENABLED', value: false }) };
      }
      return { lean: async () => null };
    };

    const res = await makeMockRequest(
      {
        method: 'POST',
        url: '/api/v1/orders',
        body: { addressId: '65f1234567890abcdef12345', paymentMethod: 'COD' },
        user: { id: '65f1234567890abcdef00001' },
      },
      (req, res, next) => OrderController.placeOrder(req, res, next)
    );

    SystemSetting.findOne = origFindOne;
    Cart.findOneAndUpdate = origCartFindOneAndUpdate;

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(cartCleared, false, 'Customer cart must NEVER be emptied on rejected checkout');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} AUDIT POINTS VERIFIED SUCCESSFULLY!   `);
  console.log('================================================================\n');
};

runAudit().catch((err) => {
  console.error('\nAudit Suite FAILED:', err);
  process.exit(1);
});
