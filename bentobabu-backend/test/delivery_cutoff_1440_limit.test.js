process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const { redisClient } = require('../app/config/redis');
const { SystemSetting, WeeklyDeliverySchedule, DeliverySlot } = require('../app/models');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const AdminDeliveryController = require('../app/controllers/adminDeliveryController');
const DeliverySlotService = require('../app/services/deliverySlotService');
const { getKolkataDateString, addDays } = require('../app/utils/businessDate');

function createMockRes() {
  const res = {
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
  return res;
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — 1440-MINUTE DELIVERY CUTOFF TEST SUITE          ');
  console.log('================================================================\n');

  await connectDB();

  let originalCutoffSetting = null;
  let originalWeeklySchedule = null;
  let testSlot = null;
  const testDayOfWeek = 6; // Saturday
  const realDateNow = Date.now;

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
    originalCutoffSetting = await SystemSetting.findOne({
      key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES',
    }).lean();
    originalWeeklySchedule = await WeeklyDeliverySchedule.findOne({
      dayOfWeek: testDayOfWeek,
    }).lean();

    // ------------------------------------------------------------------
    // 1. Global DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES validation (360, 600, 1440, >1440, <0)
    // ------------------------------------------------------------------
    await test('Global cutoff accepts 360, 600, and 1440 minutes and persists', async () => {
      for (const val of [360, 600, 1440]) {
        const res = createMockRes();
        await AdminSettingsController.updateSettings(
          { body: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: val }, user: { id: 'test-admin' } },
          res,
          (e) => { throw e; }
        );
        assert.strictEqual(res.statusCode, 200);
        const doc = await SystemSetting.findOne({
          key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES',
        }).lean();
        assert.strictEqual(doc.value, val);
      }
    });

    await test('Global cutoff rejects negative (-1) and > 1440 (1441) values', async () => {
      for (const invalidVal of [-1, 1441]) {
        const res = createMockRes();
        await AdminSettingsController.updateSettings(
          { body: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: invalidVal }, user: { id: 'test-admin' } },
          res,
          (e) => { throw e; }
        );
        assert.strictEqual(res.statusCode, 400);
      }
    });

    // ------------------------------------------------------------------
    // 2. Per-slot orderCutoffMinutes validation (360, 600, 1440, >1440, <0)
    // ------------------------------------------------------------------
    await test('Per-slot weekly orderCutoffMinutes accepts 360, 600, and 1440', async () => {
      for (const val of [360, 600, 1440]) {
        const res = createMockRes();
        await AdminDeliveryController.updateWeeklySchedule(
          {
            params: { dayOfWeek: String(testDayOfWeek) },
            body: {
              isDeliveryEnabled: true,
              slots: [
                {
                  slotKey: 'morning',
                  label: 'Morning',
                  startTime: '08:00',
                  endTime: '11:00',
                  capacity: 20,
                  isActive: true,
                  orderCutoffMinutes: val,
                },
              ],
            },
          },
          res,
          (e) => { throw e; }
        );
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.data.schedule.slots[0].orderCutoffMinutes, val);
      }
    });

    await test('Per-slot weekly orderCutoffMinutes rejects negative (-1) and > 1440 (1441)', async () => {
      for (const invalidVal of [-1, 1441]) {
        const res = createMockRes();
        await AdminDeliveryController.updateWeeklySchedule(
          {
            params: { dayOfWeek: String(testDayOfWeek) },
            body: {
              isDeliveryEnabled: true,
              slots: [
                {
                  slotKey: 'morning',
                  label: 'Morning',
                  startTime: '08:00',
                  endTime: '11:00',
                  capacity: 20,
                  isActive: true,
                  orderCutoffMinutes: invalidVal,
                },
              ],
            },
          },
          res,
          (e) => { throw e; }
        );
        assert.strictEqual(res.statusCode, 400);
      }
    });

    // ------------------------------------------------------------------
    // 3. Morning 08:00 slot with 600-min cutoff closes at 22:00 previous night
    // ------------------------------------------------------------------
    await test('Morning 08:00 slot with 600-min cutoff closes at 22:00 previous night (Asia/Kolkata)', async () => {
      await SystemSetting.findOneAndUpdate(
        { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
        { value: 600 },
        { upsert: true }
      );

      const todayStr = getKolkataDateString();
      const tomorrowStr = addDays(todayStr, 1);

      // Simulate 21:59 IST today (1 minute before 22:00 previous-night cutoff for tomorrow 08:00)
      const beforeCutoffMs = Date.parse(`${todayStr}T21:59:00+05:30`);
      Date.now = () => beforeCutoffMs;

      const scheduleBefore = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr, true);
      const morningBefore = scheduleBefore.slots.find((s) => s.startTime === '08:00');
      assert.ok(morningBefore, 'Morning 08:00 slot should exist');
      assert.strictEqual(morningBefore.cutoffTimeStr, '22:00');
      assert.strictEqual(morningBefore.isCutoffPassed, false);

      testSlot = await DeliverySlot.create({
        dateStr: tomorrowStr,
        date: new Date(`${tomorrowStr}T00:00:00+05:30`),
        slotKey: 'morning-600-test',
        label: 'Morning 600 Test',
        startTime: '08:00',
        endTime: '11:00',
        capacity: 10,
        bookedCount: 0,
        isActive: true,
      });

      const validBefore = await DeliverySlotService.validateSlotForBooking(testSlot);
      assert.strictEqual(validBefore.isValid, true, 'Booking at 21:59 previous night must be allowed');

      // Simulate 22:00 IST today (exact cutoff) and 22:05 IST today (after cutoff)
      for (const timeStr of ['22:00:00', '22:05:00']) {
        Date.now = () => Date.parse(`${todayStr}T${timeStr}+05:30`);
        const validAfter = await DeliverySlotService.validateSlotForBooking(testSlot);
        assert.strictEqual(
          validAfter.isValid,
          false,
          `Booking at ${timeStr} previous night must be rejected after 600-min cutoff`
        );
      }
    });
  } finally {
    Date.now = realDateNow;

    if (testSlot) {
      await DeliverySlot.deleteOne({ _id: testSlot._id }).catch(() => {});
    }

    if (originalCutoffSetting) {
      await SystemSetting.findOneAndUpdate(
        { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
        { value: originalCutoffSetting.value },
        { upsert: true }
      ).catch(() => {});
    } else {
      await SystemSetting.deleteOne({ key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' }).catch(() => {});
    }

    if (originalWeeklySchedule) {
      await WeeklyDeliverySchedule.findOneAndUpdate(
        { dayOfWeek: testDayOfWeek },
        {
          $set: {
            dayName: originalWeeklySchedule.dayName,
            isDeliveryEnabled: originalWeeklySchedule.isDeliveryEnabled,
            slots: originalWeeklySchedule.slots,
          },
        },
        { upsert: true }
      ).catch(() => {});
    }

    try {
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
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
