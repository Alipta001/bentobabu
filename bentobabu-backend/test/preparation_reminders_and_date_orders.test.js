process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Order,
  Product,
  Category,
  DeliverySlot,
  SystemSetting,
  Notification,
} = require('../app/models');
const { generateAccessToken } = require('../app/utils/token');
const {
  getKolkataDateString,
  addDays,
} = require('../app/utils/businessDate');
const {
  PreparationReminderService,
  calculateReminderAt,
} = require('../app/services/preparationReminderService');
const { app } = require('../server');

let serverInstance = null;
let port = 0;

const makeRequest = (options, body = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
};

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Preparation Reminders & Date-Wise Order Management Suite');
  console.log('========================================================================\n');

  await connectDB();

  await new Promise((resolve) => {
    serverInstance = app.listen(0, '127.0.0.1', () => {
      port = serverInstance.address().port;
      resolve();
    });
  });

  const ts = Date.now();
  const todayStr = getKolkataDateString();
  const tomorrowStr = addDays(todayStr, 1);
  const dayAfterStr = addDays(todayStr, 2);

  const originalReminderSetting = await SystemSetting.findOne({ key: 'PREPARATION_REMINDER_MINUTES' }).lean();

  let adminUser = null;
  let customerUser = null;
  let testCat = null;
  let testProd = null;
  let adminToken = '';
  const createdSlotIds = [];
  const createdOrderIds = [];

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  try {
    adminUser = await User.create({
      name: 'Reminder Admin',
      email: `rem_admin_${ts}@bentobabu.test`,
      phone: `93${String(ts).slice(-8)}`,
      passwordHash: 'hashed_pw',
      role: 'ADMIN',
      isActive: true,
    });

    customerUser = await User.create({
      name: 'Reminder Customer',
      email: `rem_cust_${ts}@bentobabu.test`,
      phone: `94${String(ts).slice(-8)}`,
      passwordHash: 'hashed_pw',
      role: 'CUSTOMER',
      isActive: true,
    });

    adminToken = generateAccessToken(adminUser);

    testCat = await Category.create({
      name: `Rem Cat ${ts}`,
      slug: `rem-cat-${ts}`,
      isActive: true,
    });

    testProd = await Product.create({
      name: `Rem Bowl ${ts}`,
      slug: `rem-bowl-${ts}`,
      description: 'Test bowl',
      price: 250,
      category: testCat._id,
      categories: [testCat._id],
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    // Helper to create slot
    async function createSlot(dateStr, slotKey, label, startTime, endTime) {
      const slot = await DeliverySlot.create({
        date: new Date(`${dateStr}T00:00:00+05:30`),
        dateStr,
        slotKey: `${slotKey}_${ts}`,
        label,
        startTime,
        endTime,
        capacity: 30,
        bookedCount: 0,
        isActive: true,
      });
      createdSlotIds.push(slot._id);
      return slot;
    }

    // Helper to create order
    async function createTestOrder({ slot, orderStatus = 'CONFIRMED', paymentMethod = 'COD', paymentStatus = 'COD_PENDING', qty = 2 }) {
      const ord = await Order.create({
        orderNumber: `BB-REM-${Math.floor(100000 + Math.random() * 900000)}`,
        user: customerUser._id,
        items: [
          {
            product: testProd._id,
            productName: testProd.name,
            quantity: qty,
            unitPrice: testProd.price,
            subtotal: testProd.price * qty,
          },
        ],
        deliveryAddress: {
          fullName: 'Test Customer',
          phone: '9876543210',
          addressLine: '12 Main Road',
          city: 'Barrackpore',
          state: 'West Bengal',
          pincode: '700122',
          addressType: 'HOME',
        },
        deliverySlot: slot._id,
        itemTotal: testProd.price * qty,
        deliveryCharge: 0,
        taxAmount: 0,
        grandTotal: testProd.price * qty,
        paymentMethod,
        paymentStatus,
        orderStatus,
      });
      createdOrderIds.push(ord._id);
      return ord;
    }

    // 1. Reminder calculation for morning, noon/afternoon, evening, night slots in Asia/Kolkata
    await test('1. Reminder calculation for morning, noon, evening & night slots (Asia/Kolkata)', async () => {
      const m = calculateReminderAt({ deliveryDateStr: '2026-11-26', startTime: '08:00', leadMinutes: 120 });
      const n = calculateReminderAt({ deliveryDateStr: '2026-11-26', startTime: '12:00', leadMinutes: 120 });
      const e = calculateReminderAt({ deliveryDateStr: '2026-11-26', startTime: '16:00', leadMinutes: 60 });
      const ni = calculateReminderAt({ deliveryDateStr: '2026-11-26', startTime: '19:30', leadMinutes: 60 });

      assert.strictEqual(m.toISOString(), new Date('2026-11-26T06:00:00+05:30').toISOString());
      assert.strictEqual(n.toISOString(), new Date('2026-11-26T10:00:00+05:30').toISOString());
      assert.strictEqual(e.toISOString(), new Date('2026-11-26T15:00:00+05:30').toISOString());
      assert.strictEqual(ni.toISOString(), new Date('2026-11-26T18:30:00+05:30').toISOString());

      // 0 minutes = reminder at slot start
      const zeroMin = calculateReminderAt({ deliveryDateStr: '2026-11-26', startTime: '19:30', leadMinutes: 0 });
      assert.strictEqual(zeroMin.toISOString(), new Date('2026-11-26T19:30:00+05:30').toISOString());
    });

    // 2. Admin reminder settings persist and validate correctly
    await test('2. Admin reminder settings validate (0-1440) and persist in SystemSetting', async () => {
      const badRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/admin/delivery/reminder-settings',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { reminderMinutes: { morning: -10 } }
      );
      assert.strictEqual(badRes.statusCode, 400);

      const goodRes = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/v1/admin/delivery/reminder-settings',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          reminderMinutes: {
            [`morning_${ts}`]: 120,
            [`noon_${ts}`]: 90,
            [`evening_${ts}`]: 60,
            [`night_${ts}`]: 45,
          },
        }
      );
      assert.strictEqual(goodRes.statusCode, 200);
      assert.strictEqual(goodRes.body.data.reminderMinutes[`morning_${ts}`], 120);
      assert.strictEqual(goodRes.body.data.reminderMinutes[`night_${ts}`], 45);
    });

    const tomorrowMorningSlot = await createSlot(tomorrowStr, 'morning', 'Morning', '08:00', '11:00');
    const tomorrowNightSlot = await createSlot(tomorrowStr, 'night', 'Night', '19:30', '22:30');
    const dayAfterEveningSlot = await createSlot(dayAfterStr, 'evening', 'Evening', '16:00', '19:00');

    // 3. Orders placed today for tomorrow & several days in advance
    let tomorrowOrder = null;
    let advanceOrder = null;
    await test('3. Orders placed today for tomorrow and several days in advance schedule UPCOMING reminders', async () => {
      tomorrowOrder = await createTestOrder({ slot: tomorrowMorningSlot, qty: 3 });
      advanceOrder = await createTestOrder({ slot: dayAfterEveningSlot, qty: 2 });

      await PreparationReminderService.scheduleOrRecalculateReminder(tomorrowOrder, {
        slotDoc: tomorrowMorningSlot,
      });
      await PreparationReminderService.scheduleOrRecalculateReminder(advanceOrder, {
        slotDoc: dayAfterEveningSlot,
      });

      const reloaded1 = await Order.findById(tomorrowOrder._id);
      const reloaded2 = await Order.findById(advanceOrder._id);

      assert.strictEqual(reloaded1.deliveryDateStr, tomorrowStr);
      assert.strictEqual(reloaded1.preparationReminder.status, 'UPCOMING');
      assert.strictEqual(reloaded1.preparationReminder.leadMinutes, 120);

      assert.strictEqual(reloaded2.deliveryDateStr, dayAfterStr);
      assert.strictEqual(reloaded2.preparationReminder.status, 'UPCOMING');
      assert.strictEqual(reloaded2.preparationReminder.leadMinutes, 60);
    });

    // 4. Orders placed shortly before reminder time -> transitions to DUE via worker
    await test('4. Orders placed shortly before reminder time become DUE when reminderAt arrives & recover after restart', async () => {
      const slotStart = new Date(`${tomorrowStr}T19:30:00+05:30`);
      const reminderTarget = new Date(slotStart.getTime() - 45 * 60 * 1000); // 45 mins lead time
      const justBefore = new Date(reminderTarget.getTime() - 10 * 1000); // 10s before reminder

      const shortOrder = await createTestOrder({ slot: tomorrowNightSlot, qty: 1 });
      await PreparationReminderService.scheduleOrRecalculateReminder(shortOrder, {
        slotDoc: tomorrowNightSlot,
        now: justBefore,
      });

      let check = await Order.findById(shortOrder._id);
      assert.strictEqual(check.preparationReminder.status, 'UPCOMING');

      // Simulate time advancing past reminderAt (e.g. after server restart recovery)
      const afterReminder = new Date(reminderTarget.getTime() + 5 * 1000);
      const proc = await PreparationReminderService.processDueReminders(afterReminder);
      assert.ok(proc.processedCount >= 1, 'Due reminder must be processed');

      check = await Order.findById(shortOrder._id);
      assert.strictEqual(check.preparationReminder.status, 'DUE');
      assert.ok(check.preparationReminder.sentAt, 'sentAt must be recorded');

      // Verify in-app Notification was created with required details
      const notif = await Notification.findOne({ order: shortOrder._id, eventType: 'PREPARATION_REMINDER' }).lean();
      assert.ok(notif, 'Admin IN_APP preparation reminder notification must exist');
      assert.ok(notif.message.includes(shortOrder.orderNumber));
      assert.ok(notif.message.includes('Test Customer'));
    });

    // 5. Duplicate reminder prevention
    await test('5. Duplicate reminder prevention: concurrent processDueReminders does not re-send DUE reminders', async () => {
      const slotStart = new Date(`${tomorrowStr}T19:30:00+05:30`);
      const afterReminder = new Date(slotStart.getTime() - 40 * 60 * 1000);

      // Run worker twice concurrently
      const [res1, res2] = await Promise.all([
        PreparationReminderService.processDueReminders(afterReminder),
        PreparationReminderService.processDueReminders(afterReminder),
      ]);

      // Neither should re-process already-DUE reminders
      assert.strictEqual(res1.processedCount, 0);
      assert.strictEqual(res2.processedCount, 0);
    });

    // 6. Orders placed after reminder time -> LATE_PREP immediately
    await test('6. Orders placed after reminder time immediately mark as LATE_PREP', async () => {
      const slotStart = new Date(`${tomorrowStr}T19:30:00+05:30`);
      const afterReminderTime = new Date(slotStart.getTime() - 10 * 60 * 1000); // 10 mins before slot (< 45m lead)

      const lateOrder = await createTestOrder({ slot: tomorrowNightSlot, qty: 1 });
      await PreparationReminderService.scheduleOrRecalculateReminder(lateOrder, {
        slotDoc: tomorrowNightSlot,
        now: afterReminderTime,
      });

      const reloaded = await Order.findById(lateOrder._id);
      assert.strictEqual(reloaded.preparationReminder.status, 'LATE_PREP');
      assert.strictEqual(reloaded.preparationReminder.isLatePrep, true);
      assert.ok(reloaded.preparationReminder.sentAt);
    });

    // 7. Cancelled orders do not receive reminders
    await test('7. Cancelled orders do not receive reminders', async () => {
      const cancelOrder = await createTestOrder({ slot: tomorrowMorningSlot, orderStatus: 'CONFIRMED' });
      await PreparationReminderService.scheduleOrRecalculateReminder(cancelOrder, {
        slotDoc: tomorrowMorningSlot,
      });

      await Order.updateOne({ _id: cancelOrder._id }, { $set: { orderStatus: 'CANCELLED' } });
      await PreparationReminderService.cancelReminderForOrder(cancelOrder._id);

      const reloaded = await Order.findById(cancelOrder._id);
      assert.strictEqual(reloaded.preparationReminder.status, 'CANCELLED');

      const notifs = await Notification.find({ order: cancelOrder._id, eventType: 'PREPARATION_REMINDER' });
      assert.strictEqual(notifs.length, 0);
    });

    // 8. Changing delivery date or slot recalculates reminder
    await test('8. Changing delivery slot/date via PATCH /schedule recalculates reminder', async () => {
      const res = await makeRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/v1/admin/orders/${tomorrowOrder._id.toString()}/schedule`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { deliverySlotId: dayAfterEveningSlot._id.toString() }
      );

      assert.strictEqual(res.statusCode, 200);
      const updated = await Order.findById(tomorrowOrder._id);
      assert.strictEqual(updated.deliveryDateStr, dayAfterStr);
      assert.strictEqual(updated.deliverySlotKey, `evening_${ts}`);
      assert.strictEqual(updated.preparationReminder.leadMinutes, 60);
    });

    // 9. Reminder acknowledgement
    await test('9. Acknowledge Preparation records timestamp & admin user and prevents re-sending', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/admin/orders/${tomorrowOrder._id.toString()}/acknowledge-preparation`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.order.preparationReminder.status, 'ACKNOWLEDGED');
      assert.ok(res.body.data.order.preparationReminder.acknowledgedAt);
      assert.strictEqual(
        (
          res.body.data.order.preparationReminder.acknowledgedBy.id ||
          res.body.data.order.preparationReminder.acknowledgedBy._id
        ).toString(),
        adminUser._id.toString()
      );
    });

    // 10. Date-wise order filtering & Asia/Kolkata date boundaries & slot grouping
    await test('10. Date-wise order filtering (tomorrow, upcoming, custom) returns accurate slotSummary & totals', async () => {
      const tomorrowRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/admin/orders?deliveryDateFilter=tomorrow`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(tomorrowRes.statusCode, 200);
      assert.ok(tomorrowRes.body.data.dateSummary.totalOrders >= 2);
      assert.ok(tomorrowRes.body.data.dateSummary.slots.length >= 1);

      const customRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: `/api/v1/admin/orders?deliveryDate=${dayAfterStr}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(customRes.statusCode, 200);
      const foundAdvance = customRes.body.data.orders.find((o) => o._id === advanceOrder._id.toString());
      const foundMoved = customRes.body.data.orders.find((o) => o._id === tomorrowOrder._id.toString());
      assert.ok(foundAdvance, 'Advance order must appear on dayAfterStr');
      assert.ok(foundMoved, 'Rescheduled order must appear on dayAfterStr');
      assert.ok(customRes.body.data.dateSummary.totalItems >= 5);
    });
  } finally {
    console.log('\n--- Cleanup ---');
    if (createdOrderIds.length > 0) {
      await Notification.deleteMany({ order: { $in: createdOrderIds } });
      await Order.deleteMany({ _id: { $in: createdOrderIds } });
    }
    if (createdSlotIds.length > 0) {
      await DeliverySlot.deleteMany({ _id: { $in: createdSlotIds } });
    }
    if (testProd) await Product.deleteOne({ _id: testProd._id });
    if (testCat) await Category.deleteOne({ _id: testCat._id });
    if (adminUser) await User.deleteOne({ _id: adminUser._id });
    if (customerUser) await User.deleteOne({ _id: customerUser._id });

    if (originalReminderSetting) {
      await SystemSetting.findOneAndUpdate(
        { key: 'PREPARATION_REMINDER_MINUTES' },
        { value: originalReminderSetting.value },
        { upsert: true }
      );
    } else {
      await SystemSetting.deleteOne({ key: 'PREPARATION_REMINDER_MINUTES' });
    }

    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(` Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[FATAL] Test suite crashed:', err);
  process.exit(1);
});
