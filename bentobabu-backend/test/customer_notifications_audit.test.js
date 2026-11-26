process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const { redisClient } = require('../app/config/redis');
const { User, Notification } = require('../app/models');
const NotificationController = require('../app/controllers/notificationController');
const NotificationDispatcher = require('../app/utils/notificationDispatcher');

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — CUSTOMER NOTIFICATIONS AUDIT TEST SUITE         ');
  console.log('================================================================\n');

  await connectDB();

  const ts = Date.now();
  let customerA;
  let customerB;
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err && err.stack ? err.stack : err}`);
    }
  }

  try {
    customerA = await User.create({
      name: `Notif Customer A ${ts}`,
      email: `notif_a_${ts}@test.bentobabu.in`,
      phone: `94${String(ts).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
      notificationPreferences: { email: false, whatsapp: false, inApp: true },
    });

    customerB = await User.create({
      name: `Notif Customer B ${ts}`,
      email: `notif_b_${ts}@test.bentobabu.in`,
      phone: `95${String(ts).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
      notificationPreferences: { email: false, whatsapp: false, inApp: true },
    });

    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: `BB-TEST-${ts}`,
      totalAmount: 299,
      paymentMethod: 'COD',
    };

    let createdNotifId;

    await test('NotificationDispatcher.dispatch creates dynamic IN_APP notification for customer event', async () => {
      await NotificationDispatcher.dispatch({
        userId: customerA._id,
        orderId: mockOrder._id,
        order: mockOrder,
        eventType: 'ORDER_PLACED',
      });

      const res = createMockRes();
      await NotificationController.getNotifications(
        { user: customerA, query: {} },
        res,
        (e) => { throw e; }
      );
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.data.data.notifications.length >= 1);
      const notif = res.data.data.notifications[0];
      assert.ok(notif.subject && notif.message && notif.createdAt);
      assert.strictEqual(notif.isRead, false);
      assert.strictEqual(notif.eventType, 'ORDER_PLACED');
      createdNotifId = String(notif._id || notif.id);
    });

    await test('Customer isolation: Customer B cannot fetch or mark Customer A notification as read', async () => {
      const resListB = createMockRes();
      await NotificationController.getNotifications(
        { user: customerB, query: {} },
        resListB,
        (e) => { throw e; }
      );
      assert.strictEqual(resListB.statusCode, 200);
      assert.strictEqual(resListB.data.data.notifications.length, 0);

      const resReadB = createMockRes();
      await NotificationController.markAsRead(
        { user: customerB, params: { id: createdNotifId } },
        resReadB,
        (e) => { throw e; }
      );
      assert.strictEqual(resReadB.statusCode, 404);
    });

    await test('Customer A markAsRead updates isRead=true and decrements unreadCount; markAllAsRead clears remaining', async () => {
      const resCountBefore = createMockRes();
      await NotificationController.getUnreadCount(
        { user: customerA },
        resCountBefore,
        (e) => { throw e; }
      );
      const beforeCount = resCountBefore.data.data.unreadCount;
      assert.ok(beforeCount >= 1);

      const resReadA = createMockRes();
      await NotificationController.markAsRead(
        { user: customerA, params: { id: createdNotifId } },
        resReadA,
        (e) => { throw e; }
      );
      assert.strictEqual(resReadA.statusCode, 200);
      assert.strictEqual(resReadA.data.data.notification.isRead, true);

      const resCountAfter = createMockRes();
      await NotificationController.getUnreadCount(
        { user: customerA },
        resCountAfter,
        (e) => { throw e; }
      );
      assert.strictEqual(resCountAfter.data.data.unreadCount, beforeCount - 1);

      const resReadAll = createMockRes();
      await NotificationController.markAllAsRead(
        { user: customerA },
        resReadAll,
        (e) => { throw e; }
      );
      assert.strictEqual(resReadAll.statusCode, 200);

      const resCountFinal = createMockRes();
      await NotificationController.getUnreadCount(
        { user: customerA },
        resCountFinal,
        (e) => { throw e; }
      );
      assert.strictEqual(resCountFinal.data.data.unreadCount, 0);
    });
  } finally {
    if (customerA) await Notification.deleteMany({ user: customerA._id }).catch(() => {});
    if (customerB) await Notification.deleteMany({ user: customerB._id }).catch(() => {});
    if (customerA) await User.deleteOne({ _id: customerA._id }).catch(() => {});
    if (customerB) await User.deleteOne({ _id: customerB._id }).catch(() => {});
    try {
      if (redisClient && redisClient.isOpen) await redisClient.quit();
    } catch (_) {}
    await mongoose.disconnect().catch(() => {});
  }

  console.log('\n================================================================');
  console.log(`   TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
