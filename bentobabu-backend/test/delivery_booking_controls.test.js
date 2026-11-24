process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Address,
  Cart,
  Order,
  DeliveryZone,
  DeliverySlot,
  WeeklyDeliverySchedule,
  DateDeliverySchedule,
  SystemSetting,
} = require('../app/models');

const DeliverySlotService = require('../app/services/deliverySlotService');
const DeliveryController = require('../app/controllers/deliveryController');
const AdminSettingsController = require('../app/controllers/adminSettingsController');
const OrderController = require('../app/controllers/orderController');
const {
  getKolkataDateString,
  getKolkataTimeString,
  addDays,
  getDayOfWeek,
} = require('../app/utils/businessDate');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
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
  console.log('\n========================================================================');
  console.log(' BentoBabu: Configurable Delivery Booking Controls (32 Scenarios)');
  console.log('========================================================================\n');

  await connectDB();

  const todayStr = getKolkataDateString();
  const tomorrowStr = addDays(todayStr, 1);
  const dayAfterTomorrowStr = addDays(todayStr, 2);
  const day3Str = addDays(todayStr, 3);
  const day4Str = addDays(todayStr, 4);
  const day7Str = addDays(todayStr, 7);
  const day8Str = addDays(todayStr, 8);
  const yesterdayStr = addDays(todayStr, -1);

  // Setup test user, address, product, and delivery zone
  let testUser = await User.findOne({ email: 'booking_controls_tester@bentobabu.com' });
  if (!testUser) {
    testUser = await User.create({
      name: 'Booking Controls Tester',
      email: 'booking_controls_tester@bentobabu.com',
      phone: '9999988881',
      role: 'customer',
      isEmailVerified: true,
      authProvider: 'email',
    });
  }

  let testCategory = await Category.findOne({ slug: 'booking-test-cat' });
  if (!testCategory) {
    testCategory = await Category.create({
      name: 'Booking Test Cat',
      slug: 'booking-test-cat',
      isActive: true,
    });
  }

  let testProduct = await Product.findOne({ slug: 'booking-test-power-bowl' });
  if (!testProduct) {
    testProduct = await Product.create({
      name: 'Booking Test Power Bowl',
      slug: 'booking-test-power-bowl',
      description: 'Delicious test power bowl with balanced macros.',
      sku: 'BOK-TEST-001',
      category: testCategory._id,
      categories: [testCategory._id],
      price: 150,
      stockQuantity: 100,
      isAvailable: true,
      isActive: true,
    });
  }

  const TEST_PINCODE = '700122';
  let testZone = await DeliveryZone.findOne({ name: 'Booking Controls Zone' });
  if (!testZone) {
    testZone = await DeliveryZone.create({
      name: 'Booking Controls Zone',
      pincodes: [TEST_PINCODE],
      deliveryCharge: 30,
      minimumOrderAmount: 99,
      isActive: true,
      isDeleted: false,
    });
  }

  let testAddress = await Address.findOne({ user: testUser._id });
  if (!testAddress) {
    testAddress = await Address.create({
      user: testUser._id,
      fullName: 'Booking Tester',
      phone: '9876543211',
      addressLine: 'Flat 101, Station Road',
      houseNo: 'Flat 101',
      street: 'Station Road',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: TEST_PINCODE,
      addressType: 'HOME',
      isDefault: true,
    });
  }

  // Ensure cart exists
  await Cart.findOneAndUpdate(
    { user: testUser._id },
    {
      $set: {
        items: [{ product: testProduct._id, quantity: 1 }],
      },
    },
    { upsert: true }
  );

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // Ensure baseline defaults in SystemSetting
  await SystemSetting.findOneAndUpdate(
    { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
    { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES', value: 0 },
    { upsert: true }
  );
  await SystemSetting.findOneAndUpdate(
    { key: 'MAX_ADVANCE_BOOKING_DAYS' },
    { key: 'MAX_ADVANCE_BOOKING_DAYS', value: 3 },
    { upsert: true }
  );
  await SystemSetting.findOneAndUpdate(
    { key: 'ORDER_ACCEPTANCE_ENABLED' },
    { key: 'ORDER_ACCEPTANCE_ENABLED', value: true },
    { upsert: true }
  );
  await SystemSetting.findOneAndUpdate(
    { key: 'MAINTENANCE_MODE' },
    { key: 'MAINTENANCE_MODE', value: false },
    { upsert: true }
  );

  console.log('\n--- Section 1: Cut-off Configuration & Validation (Scenarios 1-5) ---');

  await test('Scenario 1: Default cutoff setting is 0 (no advance cutoff restriction)', async () => {
    const settings = await AdminSettingsController.getAllMergedSettings();
    assert.strictEqual(settings.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES, 0);
  });

  await test('Scenario 2: Admin updates cutoff setting to valid value (60 minutes)', async () => {
    const req = { body: { settings: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: 60 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.settings.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES, 60);

    const settingDoc = await SystemSetting.findOne({ key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' });
    assert.strictEqual(settingDoc.value, 60);
  });

  await test('Scenario 3: Admin update rejects negative cutoff value (< 0)', async () => {
    const req = { body: { settings: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: -15 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('Scenario 4: Admin update rejects cutoff value greater than 1440 (> 24 hours)', async () => {
    const req = { body: { settings: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: 1441 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('Scenario 5: Admin update rejects non-integer cutoff value', async () => {
    const req = { body: { settings: { DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: 'invalid_cutoff' } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  console.log('\n--- Section 2: Delivery Slot Cut-off Timing Logic (Scenarios 6-16) ---');

  await test('Scenario 6: When cutoff = 0, future date slot is available', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 0 },
      { upsert: true }
    );
    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    assert.strictEqual(schedule.state, 'AVAILABLE');
    const availableSlots = schedule.slots.filter((s) => s.isAvailable);
    assert.ok(availableSlots.length > 0);
    assert.strictEqual(schedule.slots[0].isCutoffPassed, false);
  });

  await test('Scenario 7: When cutoff = 0 and slot has not ended, slot is available', async () => {
    const slot = {
      dateStr: tomorrowStr,
      startTime: '16:00',
      endTime: '19:00',
      capacity: 20,
      bookedCount: 0,
      isActive: true,
    };
    const validation = await DeliverySlotService.validateSlotForBooking(slot);
    assert.strictEqual(validation.isValid, true);
  });

  await test('Scenario 8: When cutoff = 0 and slot has ended today, slot is marked isPastWindow', async () => {
    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(todayStr);
    const currentKolkataTime = getKolkataTimeString();
    const pastSlots = schedule.slots.filter((s) => s.endTime <= currentKolkataTime);
    pastSlots.forEach((s) => {
      assert.strictEqual(s.isPastWindow, true);
      assert.strictEqual(s.isAvailable, false);
    });
  });

  await test('Scenario 9: With cutoff = 60 mins, slot starting in 120 mins is bookable', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 60 },
      { upsert: true }
    );

    // Slot 2 hours ahead of now
    const futureDate = new Date(Date.now() + 120 * 60 * 1000);
    const futureDateStr = getKolkataDateString(futureDate);
    const futureTimeStr = getKolkataTimeString(futureDate);

    const slot = {
      dateStr: futureDateStr,
      startTime: futureTimeStr,
      endTime: '23:59',
      capacity: 20,
      bookedCount: 0,
      isActive: true,
    };

    const validation = await DeliverySlotService.validateSlotForBooking(slot);
    assert.strictEqual(validation.isValid, true);
  });

  await test('Scenario 10: With cutoff = 60 mins, slot starting in exactly 60 mins is rejected (cutoff passed)', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 60 },
      { upsert: true }
    );

    // Slot starting in 60 minutes: cutoffMs = slotStartMs - 60min = nowMs -> nowMs >= cutoffMs
    const exactCutoffDate = new Date(Date.now() + 60 * 60 * 1000);
    const exactDateStr = getKolkataDateString(exactCutoffDate);
    const exactTimeStr = getKolkataTimeString(exactCutoffDate);

    const slot = {
      dateStr: exactDateStr,
      startTime: exactTimeStr,
      endTime: '23:59',
      capacity: 20,
      bookedCount: 0,
      isActive: true,
    };

    const validation = await DeliverySlotService.validateSlotForBooking(slot);
    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(
      validation.message,
      'This delivery slot is no longer available for new orders. Please select another delivery time.'
    );
  });

  await test('Scenario 11: With cutoff = 60 mins, slot starting in 30 mins is rejected', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 60 },
      { upsert: true }
    );

    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    const futureDateStr = getKolkataDateString(futureDate);
    const futureTimeStr = getKolkataTimeString(futureDate);

    const slot = {
      dateStr: futureDateStr,
      startTime: futureTimeStr,
      endTime: '23:59',
      capacity: 20,
      bookedCount: 0,
      isActive: true,
    };

    const validation = await DeliverySlotService.validateSlotForBooking(slot);
    assert.strictEqual(validation.isValid, false);
    assert.strictEqual(
      validation.message,
      'This delivery slot is no longer available for new orders. Please select another delivery time.'
    );
  });

  await test('Scenario 12: Cut-off timing works across different slots (Morning, Noon, Evening, Night)', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 30 },
      { upsert: true }
    );

    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    assert.strictEqual(schedule.bookingCutoffMinutes, 30);
    schedule.slots.forEach((s) => {
      assert.strictEqual(s.bookingCutoffMinutes, 30);
      assert.strictEqual(typeof s.isCutoffPassed, 'boolean');
      assert.strictEqual(typeof s.cutoffTimeStr, 'string');
    });
  });

  await test('Scenario 13: Cut-off for future dates with large cutoff (1440 mins / 24 hours)', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 1440 },
      { upsert: true }
    );

    // Tomorrow morning at 08:00 is less than 24h away if now is afternoon/evening
    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    const morningSlot = schedule.slots.find((s) => s.slotKey === 'morning');
    if (morningSlot) {
      const slotStartMs = Date.parse(`${tomorrowStr}T08:00:00+05:30`);
      const cutoffMs = slotStartMs - 1440 * 60 * 1000;
      const expectedPassed = Date.now() >= cutoffMs;
      assert.strictEqual(morningSlot.isCutoffPassed, expectedPassed);
    }
  });

  await test('Scenario 14: Delivery Controller returns cutoff metadata in API response', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 45 },
      { upsert: true }
    );

    const req = { query: { pincode: TEST_PINCODE, date: tomorrowStr } };
    const res = createMockRes();
    await DeliveryController.getAvailableSlots(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.bookingCutoffMinutes, 45);
    assert.ok(Array.isArray(res.data.data));
  });

  await test('Scenario 15: getCheckoutSummary rejects slot with passed cutoff with exact message', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 60 },
      { upsert: true }
    );

    // Create slot starting in 15 mins (well inside 60 min cutoff)
    const slotTime = new Date(Date.now() + 15 * 60 * 1000);
    const slotDateStr = getKolkataDateString(slotTime);
    const slotTimeStr = getKolkataTimeString(slotTime);

    const cutoffSlot = await DeliverySlot.create({
      dateStr: slotDateStr,
      date: new Date(),
      slotKey: 'cutoff-test-slot',
      label: 'Cutoff Test Slot',
      startTime: slotTimeStr,
      endTime: '23:59',
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    });

    const req = {
      user: { id: testUser._id },
      body: {
        addressId: testAddress._id,
        deliverySlotId: cutoffSlot._id,
      },
    };
    const res = createMockRes();
    await OrderController.getCheckoutSummary(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(
      res.data.message,
      'This delivery slot is no longer available for new orders. Please select another delivery time.'
    );

    await DeliverySlot.deleteOne({ _id: cutoffSlot._id });
  });

  await test('Scenario 16: placeOrder rejects slot with passed cutoff and does not leak bookedCount', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 60 },
      { upsert: true }
    );

    const slotTime = new Date(Date.now() + 10 * 60 * 1000);
    const slotDateStr = getKolkataDateString(slotTime);
    const slotTimeStr = getKolkataTimeString(slotTime);

    const cutoffSlot = await DeliverySlot.create({
      dateStr: slotDateStr,
      date: new Date(),
      slotKey: 'cutoff-place-slot',
      label: 'Cutoff Place Slot',
      startTime: slotTimeStr,
      endTime: '23:59',
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    });

    const req = {
      user: { id: testUser._id, name: testUser.name, email: testUser.email, phone: '9876543211' },
      body: {
        addressId: testAddress._id,
        deliverySlotId: cutoffSlot._id,
        paymentMethod: 'COD',
      },
      headers: {},
    };
    const res = createMockRes();
    await OrderController.placeOrder(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(
      res.data.message,
      'This delivery slot is no longer available for new orders. Please select another delivery time.'
    );

    // Verify bookedCount is unchanged
    const reloaded = await DeliverySlot.findById(cutoffSlot._id);
    assert.strictEqual(reloaded.bookedCount, 0);

    await DeliverySlot.deleteOne({ _id: cutoffSlot._id });
  });

  console.log('\n--- Section 3: Maximum Advance Booking Days Logic (Scenarios 17-28) ---');

  await test('Scenario 17: Default maximum advance booking days is 3', async () => {
    const settings = await AdminSettingsController.getAllMergedSettings();
    assert.strictEqual(settings.MAX_ADVANCE_BOOKING_DAYS, 3);
  });

  await test('Scenario 18: Admin updates maximum advance booking days to 7', async () => {
    const req = { body: { settings: { MAX_ADVANCE_BOOKING_DAYS: 7 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.settings.MAX_ADVANCE_BOOKING_DAYS, 7);

    const settingDoc = await SystemSetting.findOne({ key: 'MAX_ADVANCE_BOOKING_DAYS' });
    assert.strictEqual(settingDoc.value, 7);
  });

  await test('Scenario 19: Admin update rejects negative advance days (< 0)', async () => {
    const req = { body: { settings: { MAX_ADVANCE_BOOKING_DAYS: -1 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('Scenario 20: Admin update rejects advance days > 30', async () => {
    const req = { body: { settings: { MAX_ADVANCE_BOOKING_DAYS: 31 } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('Scenario 21: Admin update rejects non-integer advance days', async () => {
    const req = { body: { settings: { MAX_ADVANCE_BOOKING_DAYS: 'two_weeks' } } };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('Scenario 22: When maxAdvanceBookingDays = 0, today is bookable', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 0 },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 0 },
      { upsert: true }
    );

    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(todayStr);
    assert.notStrictEqual(schedule.state, 'ADVANCE_BOOKING_EXCEEDED');
  });

  await test('Scenario 23: When maxAdvanceBookingDays = 0, tomorrow is rejected (ADVANCE_BOOKING_EXCEEDED)', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 0 },
      { upsert: true }
    );

    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    assert.strictEqual(schedule.state, 'ADVANCE_BOOKING_EXCEEDED');
    assert.strictEqual(
      schedule.message,
      'Orders can currently be placed only within the permitted advance booking period. Please select another delivery date.'
    );
    assert.strictEqual(schedule.slots.length, 0);
  });

  await test('Scenario 24: When maxAdvanceBookingDays = 1, today and tomorrow bookable, day 2 rejected', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 1 },
      { upsert: true }
    );

    const schedTomorrow = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    assert.notStrictEqual(schedTomorrow.state, 'ADVANCE_BOOKING_EXCEEDED');

    const schedDay2 = await DeliverySlotService.getEffectiveScheduleForDate(dayAfterTomorrowStr);
    assert.strictEqual(schedDay2.state, 'ADVANCE_BOOKING_EXCEEDED');
  });

  await test('Scenario 25: When maxAdvanceBookingDays = 3, day 3 is bookable, day 4 is rejected', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 3 },
      { upsert: true }
    );

    const schedDay3 = await DeliverySlotService.getEffectiveScheduleForDate(day3Str);
    assert.notStrictEqual(schedDay3.state, 'ADVANCE_BOOKING_EXCEEDED');

    const schedDay4 = await DeliverySlotService.getEffectiveScheduleForDate(day4Str);
    assert.strictEqual(schedDay4.state, 'ADVANCE_BOOKING_EXCEEDED');
  });

  await test('Scenario 26: Date in past (yesterday) rejected with PAST_DATE', async () => {
    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(yesterdayStr);
    assert.strictEqual(schedule.state, 'PAST_DATE');
    assert.strictEqual(schedule.message, 'Delivery cannot be scheduled for past dates.');
  });

  await test('Scenario 27: getCheckoutSummary rejects slot exceeding advance booking days with exact message', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 3 },
      { upsert: true }
    );

    const beyondSlot = await DeliverySlot.create({
      dateStr: day7Str,
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      slotKey: 'beyond-slot',
      label: 'Beyond Slot',
      startTime: '16:00',
      endTime: '19:00',
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    });

    const req = {
      user: { id: testUser._id },
      body: {
        addressId: testAddress._id,
        deliverySlotId: beyondSlot._id,
      },
    };
    const res = createMockRes();
    await OrderController.getCheckoutSummary(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(
      res.data.message,
      'Orders can currently be placed only within the permitted advance booking period. Please select another delivery date.'
    );

    await DeliverySlot.deleteOne({ _id: beyondSlot._id });
  });

  await test('Scenario 28: placeOrder rejects slot exceeding advance booking days and does not leak bookedCount', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 2 },
      { upsert: true }
    );

    const beyondSlot = await DeliverySlot.create({
      dateStr: day8Str,
      date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      slotKey: 'beyond-place-slot',
      label: 'Beyond Place Slot',
      startTime: '12:00',
      endTime: '15:00',
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    });

    const req = {
      user: { id: testUser._id, name: testUser.name, email: testUser.email, phone: '9876543211' },
      body: {
        addressId: testAddress._id,
        deliverySlotId: beyondSlot._id,
        paymentMethod: 'COD',
      },
      headers: {},
    };
    const res = createMockRes();
    await OrderController.placeOrder(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(
      res.data.message,
      'Orders can currently be placed only within the permitted advance booking period. Please select another delivery date.'
    );

    const reloaded = await DeliverySlot.findById(beyondSlot._id);
    assert.strictEqual(reloaded.bookedCount, 0);

    await DeliverySlot.deleteOne({ _id: beyondSlot._id });
  });

  console.log('\n--- Section 4: Safety & Non-Regression Scenarios (Scenarios 29-32) ---');

  await test('Scenario 29: Existing confirmed orders retain their deliverySlot without alteration when settings change', async () => {
    const historicalSlotKey = `historical-slot-${Date.now()}`;
    const historicalSlot = await DeliverySlot.create({
      dateStr: todayStr,
      date: new Date(),
      slotKey: historicalSlotKey,
      label: 'Historical Slot',
      startTime: '08:00',
      endTime: '11:00',
      capacity: 10,
      bookedCount: 1,
      isActive: true,
    });

    const historicalOrder = await Order.create({
      orderNumber: `HIST-${Date.now()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          productName: testProduct.name,
          unitPrice: 150,
          quantity: 1,
          subtotal: 150,
        },
      ],
      itemTotal: 150,
      deliveryFee: 30,
      grandTotal: 180,
      deliveryAddress: {
        fullName: 'Hist Tester',
        phone: '9876543211',
        addressLine: '1 Street, Barrackpore',
        city: 'Barrackpore',
        state: 'WB',
        pincode: TEST_PINCODE,
      },
      deliverySlot: historicalSlot._id,
      orderStatus: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'COD',
    });

    // Now change settings to cutoff = 120 and advance days = 0
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 120 },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 0 },
      { upsert: true }
    );

    // Verify confirmed order remains completely unaffected
    const fetchedOrder = await Order.findById(historicalOrder._id);
    assert.strictEqual(fetchedOrder.orderStatus.toUpperCase(), 'CONFIRMED');
    assert.strictEqual(fetchedOrder.deliverySlot.toString(), historicalSlot._id.toString());
    assert.strictEqual(fetchedOrder.grandTotal, 180);

    // Clean up test order & slot
    await Order.deleteOne({ _id: historicalOrder._id });
    await DeliverySlot.deleteOne({ _id: historicalSlot._id });
  });

  await test('Scenario 30: Public delivery config returns bookingCutoffMinutes, maxAdvanceBookingDays, todayKolkata, latestBookableDate', async () => {
    await SystemSetting.findOneAndUpdate(
      { key: 'DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES' },
      { value: 45 },
      { upsert: true }
    );
    await SystemSetting.findOneAndUpdate(
      { key: 'MAX_ADVANCE_BOOKING_DAYS' },
      { value: 5 },
      { upsert: true }
    );

    const req = {};
    const res = createMockRes();
    await DeliveryController.getDeliveryConfig(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.bookingCutoffMinutes, 45);
    assert.strictEqual(res.data.data.maxAdvanceBookingDays, 5);
    assert.strictEqual(res.data.data.todayKolkata, todayStr);
    assert.strictEqual(res.data.data.latestBookableDate, addDays(todayStr, 5));
  });

  await test('Scenario 31: Date-specific overrides and weekly recurring schedules continue functioning alongside booking controls', async () => {
    // Override tomorrow with custom label
    await DateDeliverySchedule.findOneAndUpdate(
      { date: tomorrowStr },
      {
        date: tomorrowStr,
        overrideMode: 'INHERIT',
        slotOverrides: [{ slotKey: 'morning', label: 'Sunrise Special Delivery' }],
        isClosed: false,
      },
      { upsert: true }
    );

    const schedule = await DeliverySlotService.getEffectiveScheduleForDate(tomorrowStr);
    const morningSlot = schedule.slots.find((s) => s.slotKey === 'morning');
    assert.ok(morningSlot);
    assert.strictEqual(morningSlot.label, 'Sunrise Special Delivery');

    // Clean up override
    await DateDeliverySchedule.deleteOne({ date: tomorrowStr });
  });

  await test('Scenario 32: Reset settings to operational defaults (0 cutoff, 3 advance days)', async () => {
    const req = {
      body: {
        settings: {
          DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES: 0,
          MAX_ADVANCE_BOOKING_DAYS: 3,
        },
      },
    };
    const res = createMockRes();
    await AdminSettingsController.updateSettings(req, res, (e) => { throw e; });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.data.settings.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES, 0);
    assert.strictEqual(res.data.data.settings.MAX_ADVANCE_BOOKING_DAYS, 3);
  });

  console.log('\n========================================================================');
  console.log(` Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  try {
    await mongoose.disconnect();
  } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
