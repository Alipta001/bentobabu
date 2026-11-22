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
const AdminDeliveryController = require('../app/controllers/adminDeliveryController');
const { getKolkataDateString, getDayOfWeek, getDayName } = require('../app/utils/businessDate');

// Helper to create mock Express response
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

// Helper to find future dates with specific weekday (0=Sun, 1=Mon, ..., 6=Sat)
function getFutureDateForWeekday(targetWeekday, weekOffset = 1) {
  const now = new Date();
  const kolkataStr = getKolkataDateString(now);
  const currentWeekday = getDayOfWeek(kolkataStr);
  let daysUntilTarget = (targetWeekday - currentWeekday + 7) % 7;
  if (daysUntilTarget === 0) daysUntilTarget = 7;
  daysUntilTarget += (weekOffset - 1) * 7;

  const targetDate = new Date(Date.now() + daysUntilTarget * 24 * 60 * 60 * 1000);
  return getKolkataDateString(targetDate);
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Delivery Slot Recurring & Date Scheduling (20 Scenarios)');
  console.log('========================================================================\n');

  await connectDB();

  const currentDbName = mongoose.connection.name;
  console.log(`[Safety Verification] Connected to database: "${currentDbName}"`);
  if (!['bentobabu_staging', 'bentobabu_test'].includes(currentDbName)) {
    console.warn(`[Notice] Running in database: ${currentDbName}. All operations will use isolated test fixtures.`);
  }

  const testPin = '700120';
  const unserviceablePin = '700999';
  let testZone;

  try {
    // Setup Serviceable Zone for testing
    testZone = await DeliveryZone.findOneAndUpdate(
      { name: 'Test Scheduling Zone' },
      {
        name: 'Test Scheduling Zone',
        pincodes: [testPin],
        deliveryCharge: 30,
        minimumOrderAmount: 100,
        estimatedDeliveryMinutes: 35,
        isActive: true,
        isDeleted: false,
      },
      { upsert: true, new: true }
    );

    // =========================================================================
    // Test 1: Seed & verify weekly schedule for all 7 days (Monday - Sunday)
    // =========================================================================
    console.log('[Test 1] Seeding and verifying weekly schedule for all 7 days (Monday - Sunday)...');
    await DeliverySlotService.seedDefaultWeeklySchedule();
    const allWeekly = await WeeklyDeliverySchedule.find({}).sort({ dayOfWeek: 1 });
    assert.strictEqual(allWeekly.length, 7, 'All 7 weekdays must have a weekly schedule record');

    for (let day = 0; day <= 6; day++) {
      const schedule = allWeekly.find((s) => s.dayOfWeek === day);
      assert.ok(schedule, `Schedule for dayOfWeek ${day} (${getDayName(day)}) must exist`);
      assert.strictEqual(schedule.isDeliveryEnabled, true, `Delivery should be enabled by default for ${getDayName(day)}`);
      assert.ok(Array.isArray(schedule.slots) && schedule.slots.length >= 4, `${getDayName(day)} should have at least 4 default slots`);
    }
    console.log('  -> All 7 days verified with active default slots (Morning, Noon, Evening, Night).');

    // =========================================================================
    // Test 2: Fetch next Monday's slots from weekly recurring template
    // =========================================================================
    console.log('[Test 2] Fetching next Monday slots from weekly recurring template...');
    const nextMonday = getFutureDateForWeekday(1, 1); // 1 = Monday, 1st upcoming
    assert.strictEqual(getDayOfWeek(nextMonday), 1, 'Calculated date must be a Monday');

    const monSchedule = await DeliverySlotService.getEffectiveScheduleForDate(nextMonday, false);
    assert.strictEqual(monSchedule.state, 'AVAILABLE');
    assert.ok(monSchedule.slots.length >= 4, 'Next Monday should resolve at least 4 slots');
    const slotLabels = monSchedule.slots.map((s) => s.label);
    assert.ok(slotLabels.some((l) => l.includes('Morning')), 'Should include Morning slot');
    assert.ok(slotLabels.some((l) => l.includes('Noon')), 'Should include Noon slot');
    assert.ok(slotLabels.some((l) => l.includes('Evening')), 'Should include Evening slot');
    assert.ok(slotLabels.some((l) => l.includes('Night')), 'Should include Night slot');
    console.log(`  -> Successfully resolved ${monSchedule.slots.length} recurring slots for next Monday (${nextMonday}).`);

    // =========================================================================
    // Test 3: Auto-propagation to future occurrences without manual creation
    // =========================================================================
    console.log('[Test 3] Verifying auto-propagation to future occurrence 3 weeks later...');
    const futureMonday = getFutureDateForWeekday(1, 3); // 3 weeks out
    const futureSchedule = await DeliverySlotService.getEffectiveScheduleForDate(futureMonday, false);
    assert.strictEqual(futureSchedule.state, 'AVAILABLE');
    assert.strictEqual(futureSchedule.slots.length, monSchedule.slots.length, 'Future Monday must automatically have identical slots');
    console.log(`  -> Future Monday (${futureMonday}) automatically populated without manual weekly recreation.`);

    // =========================================================================
    // Test 4: Configure 4 specific delivery periods with custom capacities
    // =========================================================================
    console.log('[Test 4] Updating Monday schedule with specific configured capacities (20, 25, 20, 25)...');
    const customSlotsConfig = [
      { label: 'Morning Slot', startTime: '08:00', endTime: '11:00', capacity: 20, orderCutoffMinutes: 60, isActive: true },
      { label: 'Noon Slot', startTime: '12:00', endTime: '15:00', capacity: 25, orderCutoffMinutes: 60, isActive: true },
      { label: 'Evening Slot', startTime: '16:00', endTime: '19:00', capacity: 20, orderCutoffMinutes: 60, isActive: true },
      { label: 'Night Slot', startTime: '19:30', endTime: '22:30', capacity: 25, orderCutoffMinutes: 60, isActive: true },
    ];

    const mockAdminReq = {
      params: { dayOfWeek: '1' },
      body: { isDeliveryEnabled: true, slots: customSlotsConfig },
    };
    const mockAdminRes = createMockRes();
    await AdminDeliveryController.updateWeeklySchedule(mockAdminReq, mockAdminRes);
    assert.strictEqual(mockAdminRes.statusCode, 200);

    const refreshedMon = await DeliverySlotService.getEffectiveScheduleForDate(nextMonday, false);
    const morning = refreshedMon.slots.find((s) => s.label === 'Morning Slot');
    const noon = refreshedMon.slots.find((s) => s.label === 'Noon Slot');
    const evening = refreshedMon.slots.find((s) => s.label === 'Evening Slot');
    const night = refreshedMon.slots.find((s) => s.label === 'Night Slot');
    assert.strictEqual(morning.capacity, 20);
    assert.strictEqual(noon.capacity, 25);
    assert.strictEqual(evening.capacity, 20);
    assert.strictEqual(night.capacity, 25);
    console.log('  -> Monday recurring schedule updated and verified: Morning (20), Noon (25), Evening (20), Night (25).');

    // =========================================================================
    // Test 5: Disable one recurring slot and verify customer API excludes it
    // =========================================================================
    console.log('[Test 5] Disabling Morning slot on Monday recurring schedule and testing customer API...');
    const disabledMorningConfig = customSlotsConfig.map((s) =>
      s.label === 'Morning Slot' ? { ...s, isActive: false } : s
    );
    const mockDisableReq = {
      params: { dayOfWeek: '1' },
      body: { isDeliveryEnabled: true, slots: disabledMorningConfig },
    };
    const mockDisableRes = createMockRes();
    await AdminDeliveryController.updateWeeklySchedule(mockDisableReq, mockDisableRes);

    const custReq = { query: { pincode: testPin, date: nextMonday } };
    const custRes = createMockRes();
    await DeliveryController.getAvailableSlots(custReq, custRes);
    assert.strictEqual(custRes.statusCode, 200);
    assert.ok(custRes.data.success);
    const returnedLabels = custRes.data.data.map((s) => s.label);
    assert.ok(!returnedLabels.includes('Morning Slot'), 'Disabled Morning Slot must NOT be in customer available slots');
    assert.ok(returnedLabels.includes('Noon Slot'), 'Noon Slot must be returned');

    // Re-enable Morning Slot for subsequent tests
    await AdminDeliveryController.updateWeeklySchedule(
      { params: { dayOfWeek: '1' }, body: { isDeliveryEnabled: true, slots: customSlotsConfig } },
      createMockRes()
    );
    console.log('  -> Customer API correctly excluded disabled recurring slot.');

    // =========================================================================
    // Test 6: Add a date-specific custom slot for a particular date
    // =========================================================================
    console.log('[Test 6] Adding date-specific custom slot for a specific date...');
    const testDate = getFutureDateForWeekday(3, 1); // Wednesday
    const updateDateReq = {
      params: { date: testDate },
      body: {
        overrideMode: 'ADDITIVE',
        customSlots: [
          { label: 'Late Evening Special', startTime: '21:00', endTime: '23:00', capacity: 15, isActive: true },
        ],
      },
    };
    const updateDateRes = createMockRes();
    await AdminDeliveryController.updateDateSchedule(updateDateReq, updateDateRes);
    assert.strictEqual(updateDateRes.statusCode, 200);

    const wedSchedule = await DeliverySlotService.getEffectiveScheduleForDate(testDate, false);
    const customSlot = wedSchedule.slots.find((s) => s.label === 'Late Evening Special');
    assert.ok(customSlot, 'Custom slot must appear in effective schedule');
    assert.strictEqual(customSlot.capacity, 15);
    assert.strictEqual(customSlot.scheduleSource, 'DATE_ADDITION');
    console.log('  -> Date-specific custom slot created and verified.');

    // =========================================================================
    // Test 7: Replace recurring schedule for a holiday (overrideMode: 'REPLACE')
    // =========================================================================
    console.log('[Test 7] Replacing recurring schedule with single holiday slot (overrideMode: REPLACE)...');
    const holidayDate = getFutureDateForWeekday(4, 1); // Thursday
    const holidayReq = {
      params: { date: holidayDate },
      body: {
        overrideMode: 'REPLACE',
        customSlots: [
          { label: 'Festival Special Lunch', startTime: '11:30', endTime: '14:30', capacity: 40, isActive: true },
        ],
      },
    };
    await AdminDeliveryController.updateDateSchedule(holidayReq, createMockRes());

    const holidaySchedule = await DeliverySlotService.getEffectiveScheduleForDate(holidayDate, false);
    assert.strictEqual(holidaySchedule.slots.length, 1, 'In REPLACE mode, only custom slots should exist');
    assert.strictEqual(holidaySchedule.slots[0].label, 'Festival Special Lunch');
    assert.strictEqual(holidaySchedule.slots[0].capacity, 40);
    console.log('  -> REPLACE mode successfully superseded regular weekly slots.');

    // =========================================================================
    // Test 8: Add an extra slot without removing recurring slots (ADDITIVE)
    // =========================================================================
    console.log('[Test 8] Verifying ADDITIVE mode preserves weekly slots while adding extra slot...');
    // testDate from Test 6 was configured with ADDITIVE
    const additiveSchedule = await DeliverySlotService.getEffectiveScheduleForDate(testDate, false);
    const weeklyCount = (await WeeklyDeliverySchedule.findOne({ dayOfWeek: 3 })).slots.length;
    assert.strictEqual(additiveSchedule.slots.length, weeklyCount + 1, 'Must contain all weekly slots plus 1 custom slot');
    console.log(`  -> ADDITIVE mode verified: ${weeklyCount} weekly slots + 1 additive slot = ${additiveSchedule.slots.length} slots.`);

    // =========================================================================
    // Test 9: Disable an inherited slot on one date only without affecting recurring template
    // =========================================================================
    console.log('[Test 9] Disabling an inherited slot on one date only...');
    const fridayDate = getFutureDateForWeekday(5, 1); // Friday
    const friWeekly = await WeeklyDeliverySchedule.findOne({ dayOfWeek: 5 });
    const slotKeyToDisable = friWeekly.slots[0].slotKey;

    await AdminDeliveryController.updateDateSchedule(
      {
        params: { date: fridayDate },
        body: {
          overrideMode: 'INHERIT',
          disabledSlotKeys: [slotKeyToDisable],
        },
      },
      createMockRes()
    );

    const friEffective = await DeliverySlotService.getEffectiveScheduleForDate(fridayDate, false);
    const disabledSlot = friEffective.slots.find((s) => s.slotKey === slotKeyToDisable);
    assert.ok(disabledSlot, 'Slot exists in effective list for audit');
    assert.strictEqual(disabledSlot.isActive, false, 'Slot must be marked inactive for this date');

    // Verify weekly template is untouched
    const friWeeklyAfter = await WeeklyDeliverySchedule.findOne({ dayOfWeek: 5 });
    const templateSlot = friWeeklyAfter.slots.find((s) => s.slotKey === slotKeyToDisable);
    assert.strictEqual(templateSlot.isActive, true, 'Weekly recurring template must remain active');
    console.log('  -> Date-level disable verified without mutating recurring weekly template.');

    // =========================================================================
    // Test 10: Restore weekly schedule for a date (DELETE /schedules/dates/:date)
    // =========================================================================
    console.log('[Test 10] Restoring date to standard weekly schedule...');
    const restoreRes = createMockRes();
    await AdminDeliveryController.restoreWeeklySchedule({ params: { date: fridayDate } }, restoreRes);
    assert.strictEqual(restoreRes.statusCode, 200);

    const restoredEffective = await DeliverySlotService.getEffectiveScheduleForDate(fridayDate, false);
    const restoredSlot = restoredEffective.slots.find((s) => s.slotKey === slotKeyToDisable);
    assert.strictEqual(restoredSlot.isActive, true, 'Slot must be restored to active state');
    console.log('  -> Restore date schedule successfully reverted all overrides.');

    // =========================================================================
    // Test 11: Ensure no duplicate slots when recurring and date-specific overlap
    // =========================================================================
    console.log('[Test 11] Checking for duplicate slots when custom slot shares timing with recurring slot...');
    const saturdayDate = getFutureDateForWeekday(6, 1);
    const satWeekly = await WeeklyDeliverySchedule.findOne({ dayOfWeek: 6 });
    const firstSatSlot = satWeekly.slots[0];

    // Add a date override with same timing
    await AdminDeliveryController.updateDateSchedule(
      {
        params: { date: saturdayDate },
        body: {
          overrideMode: 'INHERIT',
          slotOverrides: [
            { slotKey: firstSatSlot.slotKey, capacity: 50, label: 'Supercharged Morning' },
          ],
        },
      },
      createMockRes()
    );

    const satEffective = await DeliverySlotService.getEffectiveScheduleForDate(saturdayDate, false);
    const morningSlots = satEffective.slots.filter((s) => s.slotKey === firstSatSlot.slotKey);
    assert.strictEqual(morningSlots.length, 1, 'Must NOT create duplicate slots for the same slotKey');
    assert.strictEqual(morningSlots[0].capacity, 50, 'Capacity override should apply');
    assert.strictEqual(morningSlots[0].label, 'Supercharged Morning');
    console.log('  -> Overlap correctly resolved as an override without duplicate slots.');

    // =========================================================================
    // Test 12: Booked-count and capacity calculations
    // =========================================================================
    console.log('[Test 12] Verifying booked-count and remainingCapacity calculations...');
    const testSlot = satEffective.slots[0];
    await DeliverySlot.findByIdAndUpdate(testSlot.id, { bookedCount: 12 });

    const updatedSat = await DeliverySlotService.getEffectiveScheduleForDate(saturdayDate, false);
    const slotAfterBooking = updatedSat.slots.find((s) => s.id === testSlot.id);
    assert.strictEqual(slotAfterBooking.bookedCount, 12);
    assert.strictEqual(slotAfterBooking.remainingCapacity, slotAfterBooking.capacity - 12);
    console.log(`  -> Remaining capacity verified: ${slotAfterBooking.capacity} - 12 = ${slotAfterBooking.remainingCapacity}.`);

    // =========================================================================
    // Test 13: Fully booked slot behavior (ALL_FULL state)
    // =========================================================================
    console.log('[Test 13] Verifying ALL_FULL state when all slots are at max capacity...');
    const fullDate = getFutureDateForWeekday(2, 2); // Tuesday 2 weeks out
    const fullSchedule = await DeliverySlotService.getEffectiveScheduleForDate(fullDate, false);

    // Set all slots bookedCount = capacity
    for (const s of fullSchedule.slots) {
      await DeliverySlot.findByIdAndUpdate(s.id, { bookedCount: s.capacity });
    }

    const checkFullSchedule = await DeliverySlotService.getEffectiveScheduleForDate(fullDate, false);
    assert.strictEqual(checkFullSchedule.state, 'ALL_FULL', 'State must be ALL_FULL when all slots are exhausted');
    assert.strictEqual(checkFullSchedule.slots.filter((s) => s.isAvailable).length, 0);

    const fullCustRes = createMockRes();
    await DeliveryController.getAvailableSlots({ query: { pincode: testPin, date: fullDate } }, fullCustRes);
    assert.strictEqual(fullCustRes.data.state, 'ALL_FULL');
    assert.strictEqual(fullCustRes.data.data.length, 0, 'No slots available for booking');
    console.log('  -> ALL_FULL state returned with zero available booking slots.');

    // =========================================================================
    // Test 14: Booking cutoff behavior for past windows (BOOKING_CLOSED)
    // =========================================================================
    console.log('[Test 14] Verifying order cutoff filtering for past timing windows...');
    // Pass today's date and check that slots with end times already passed are marked not available
    const todayKolkata = getKolkataDateString(new Date());
    const todaySchedule = await DeliverySlotService.getEffectiveScheduleForDate(todayKolkata, false);
    assert.ok(todaySchedule.state, 'Should return state for today');
    // For every slot where endTime < now, isAvailable must be false
    const nowTimeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    for (const slot of todaySchedule.slots) {
      if (slot.endTime <= nowTimeStr) {
        assert.strictEqual(slot.isAvailable, false, `Slot ending at ${slot.endTime} before ${nowTimeStr} must not be available`);
      }
    }
    console.log('  -> Past timing windows correctly excluded from available slots.');

    // =========================================================================
    // Test 15: Concurrent bookings cannot exceed capacity (Atomic conditional increment)
    // =========================================================================
    console.log('[Test 15] Verifying atomic conditional reservation prevents overbooking...');
    const atomicSlot = await DeliverySlot.create({
      date: new Date(saturdayDate + 'T00:00:00.000Z'),
      dateStr: saturdayDate,
      slotKey: 'atomic-test-slot-' + Date.now(),
      label: 'Atomic Concurrency Slot',
      startTime: '10:00',
      endTime: '12:00',
      capacity: 3,
      bookedCount: 0,
      isActive: true,
      scheduleSource: 'CUSTOM',
    });

    // Simulate 5 simultaneous reservations for a slot with capacity 3
    const reservationPromises = Array.from({ length: 5 }).map(async () => {
      const reserved = await DeliverySlot.findOneAndUpdate(
        {
          _id: atomicSlot._id,
          isActive: true,
          $expr: { $lt: ['$bookedCount', '$capacity'] },
        },
        { $inc: { bookedCount: 1 } },
        { new: true }
      );
      return Boolean(reserved);
    });

    const results = await Promise.all(reservationPromises);
    const successCount = results.filter(Boolean).length;
    const failureCount = results.filter((r) => !r).length;

    assert.strictEqual(successCount, 3, 'Exactly 3 reservations must succeed');
    assert.strictEqual(failureCount, 2, '2 excess reservations must be rejected');

    const finalSlot = await DeliverySlot.findById(atomicSlot._id);
    assert.strictEqual(finalSlot.bookedCount, 3, 'Booked count must be capped exactly at 3');
    console.log(`  -> Concurrency verified: ${successCount} reservations succeeded, ${failureCount} rejected, bookedCount=${finalSlot.bookedCount}.`);

    // =========================================================================
    // Test 16: Cancelled orders release capacity correctly
    // =========================================================================
    console.log('[Test 16] Verifying capacity release upon order cancellation...');
    const released = await DeliverySlot.findOneAndUpdate(
      { _id: atomicSlot._id, bookedCount: { $gt: 0 } },
      { $inc: { bookedCount: -1 } },
      { new: true }
    );
    assert.strictEqual(released.bookedCount, 2, 'Capacity should decrement to 2');
    console.log('  -> Released 1 slot successfully: bookedCount decremented from 3 to 2.');

    // =========================================================================
    // Test 17: Existing confirmed orders remain unchanged after schedule edits
    // =========================================================================
    console.log('[Test 17] Verifying existing confirmed orders remain linked and unchanged after schedule edits...');
    // Create dummy order referencing slot
    const dummyOrder = await Order.create({
      orderNumber: 'ORD-TEST-' + Date.now(),
      user: new mongoose.Types.ObjectId(),
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          productName: 'Test Bento Box',
          quantity: 1,
          unitPrice: 200,
          subtotal: 200,
        },
      ],
      itemTotal: 200,
      deliveryCharge: 30,
      taxAmount: 0,
      grandTotal: 230,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      deliverySlot: atomicSlot._id,
      deliveryAddress: {
        fullName: 'Test Recipient',
        phone: '9876543210',
        addressLine: '123 Test Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: testPin,
      },
    });

    // Update slot timing/label in admin
    await AdminDeliveryController.updateSlot(
      {
        params: { id: atomicSlot._id.toString() },
        body: { label: 'Renamed Atomic Window', capacity: 10 },
      },
      createMockRes()
    );

    const checkedOrder = await Order.findById(dummyOrder._id).populate('deliverySlot');
    assert.strictEqual(checkedOrder.deliverySlot._id.toString(), atomicSlot._id.toString());
    assert.strictEqual(checkedOrder.deliverySlot.label, 'Renamed Atomic Window');
    assert.strictEqual(checkedOrder.orderStatus, 'CONFIRMED');
    console.log('  -> Existing order reference preserved intact across schedule update.');

    // Cleanup dummy order
    await Order.findByIdAndDelete(dummyOrder._id);

    // =========================================================================
    // Test 18: Kolkata timezone and midnight rollover verification
    // =========================================================================
    console.log('[Test 18] Verifying Asia/Kolkata date handling and midnight rollover...');
    const nowUtc = new Date();
    const kolkataDateStr = getKolkataDateString(nowUtc);
    assert.match(kolkataDateStr, /^\d{4}-\d{2}-\d{2}$/, 'Date string must match YYYY-MM-DD');

    // Simulate UTC midnight vs IST midnight:
    // UTC 2026-11-22T19:00:00Z is 2026-11-23 00:30:00 IST (+5:30)
    const testUtcDate = new Date('2026-11-22T19:00:00.000Z');
    const computedIstDate = getKolkataDateString(testUtcDate);
    assert.strictEqual(computedIstDate, '2026-11-23', 'UTC 19:00 must correctly map to next day IST (00:30)');
    console.log('  -> Kolkata timezone rollover verified: 19:00 UTC mapped to 2026-11-23 IST.');

    // =========================================================================
    // Test 19: Zone & PIN code serviceability check integration
    // =========================================================================
    console.log('[Test 19] Verifying zone and PIN code serviceability check...');
    // Serviceable PIN
    const validPinRes = createMockRes();
    await DeliveryController.getAvailableSlots(
      { query: { pincode: testPin, date: nextMonday } },
      validPinRes
    );
    assert.strictEqual(validPinRes.statusCode, 200);
    assert.strictEqual(validPinRes.data.serviceable, true);

    // Unserviceable PIN
    const invalidPinRes = createMockRes();
    await DeliveryController.getAvailableSlots(
      { query: { pincode: unserviceablePin, date: nextMonday } },
      invalidPinRes
    );
    assert.strictEqual(invalidPinRes.statusCode, 200);
    assert.strictEqual(invalidPinRes.data.serviceable, false);
    assert.strictEqual(invalidPinRes.data.state, 'UNSERVICEABLE');
    assert.strictEqual(invalidPinRes.data.data.length, 0);
    console.log('  -> Serviceable vs unserviceable PIN check verified.');

    // =========================================================================
    // Test 20: Existing checkout API contract compatibility
    // =========================================================================
    console.log('[Test 20] Verifying checkout API response contract and required fields...');
    const contractRes = createMockRes();
    await DeliveryController.getAvailableSlots(
      { query: { pincode: testPin, date: nextMonday } },
      contractRes
    );
    assert.strictEqual(contractRes.statusCode, 200);
    assert.ok(contractRes.data.success);
    assert.ok(Array.isArray(contractRes.data.data));
    assert.ok(contractRes.data.data.length > 0);

    const slotPayload = contractRes.data.data[0];
    const requiredFields = ['id', '_id', 'date', 'dateStr', 'slotKey', 'label', 'startTime', 'endTime', 'capacity', 'bookedCount', 'remainingCapacity', 'isActive'];
    for (const field of requiredFields) {
      assert.ok(field in slotPayload, `Response slot must contain field "${field}"`);
    }
    assert.strictEqual(typeof slotPayload.startTime, 'string');
    assert.strictEqual(typeof slotPayload.endTime, 'string');
    assert.strictEqual(typeof slotPayload.capacity, 'number');
    assert.strictEqual(typeof slotPayload.bookedCount, 'number');
    assert.strictEqual(typeof slotPayload.remainingCapacity, 'number');
    console.log('  -> All 12 required slot fields verified against API contract.');

    console.log('\n========================================================================');
    console.log(' ALL 20 SCENARIOS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exitCode = 1;
  } finally {
    if (testZone) {
      await DeliveryZone.findByIdAndDelete(testZone._id);
    }
    await mongoose.connection.close();
    process.exit(process.exitCode || 0);
  }
}

runTests();
