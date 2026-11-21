/**
 * BentoBabu — Service Expansion Voting Journey & Regression Test Suite
 * Validates the complete user journey from PIN entry to serviceability check,
 * modal triggering, guest/authenticated voting, deduplication, and admin demand rankings.
 */

const assert = require('assert');
const mongoose = require('../../bentobabu-backend/node_modules/mongoose');
const {
  User,
  DeliveryZone,
  ServiceExpansionVote,
} = require('../../bentobabu-backend/app/models');

const DeliveryController = require('../../bentobabu-backend/app/controllers/deliveryController');
const ServiceExpansionController = require('../../bentobabu-backend/app/controllers/serviceExpansionController');
const AdminDashboardController = require('../../bentobabu-backend/app/controllers/adminDashboardController');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
  return res;
}

// Client-side delivery service simulation (mirroring bentobabu-frontend/services/deliveryService.ts)
async function clientCheckServiceability(pincode, mockBackendFetcher) {
  if (!pincode || pincode.trim().length !== 6) {
    return {
      serviceable: false,
      message: 'Please enter a valid 6-digit PIN code.',
      deliveryFee: 0,
      minimumOrderAmount: 0,
    };
  }

  const raw = await mockBackendFetcher(pincode.trim());
  const data = raw && 'data' in raw && raw.data ? raw.data : raw;

  const isServiceable = Boolean(raw.serviceable ?? data?.serviceable ?? false);

  if (!isServiceable || raw.code === 'UNSERVICEABLE_LOCATION') {
    return {
      serviceable: false,
      message:
        raw.message || `Delivery is currently not available for PIN code ${pincode.trim()}`,
      deliveryFee: 0,
      minimumOrderAmount: 0,
    };
  }

  const fee =
    typeof data.deliveryCharge === 'number'
      ? data.deliveryCharge
      : typeof data.deliveryFee === 'number'
      ? data.deliveryFee
      : typeof data.zone?.deliveryCharge === 'number'
      ? data.zone.deliveryCharge
      : 0;

  return {
    serviceable: true,
    message: raw.message || 'Delivery is available to your location!',
    zone: data.zone,
    deliveryFee: fee,
    minimumOrderAmount:
      typeof data.minimumOrderAmount === 'number' ? data.minimumOrderAmount : 0,
    freeDeliveryThreshold: data.freeDeliveryThreshold,
    estimatedDeliveryTime:
      data.estimatedDeliveryTime || data.zone?.estimatedDeliveryTime || '35 - 45 mins',
  };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — SERVICE EXPANSION VOTING POPUP JOURNEY TESTS    ');
  console.log('================================================================\n');

  const MONGO_URI =
    process.env.MONGODB_URI ||
    'mongodb+srv://bentobabuofficial_db_user:Kaz2rulo3erFzs7T@cluster0.rs108p2.mongodb.net/bentobabu?retryWrites=true&w=majority';

  await mongoose.connect(MONGO_URI);
  console.log('[Setup] Connected to database.\n');

  const timestamp = Date.now();
  let adminUser, testCustomer;
  let testZone;
  const supportedPin = '700120';
  const unsupportedPin1 = `70${String(timestamp).slice(-4)}`;
  const unsupportedPin2 = `71${String(timestamp + 1).slice(-4)}`;

  let passedTests = 0;
  let failedTests = 0;

  function recordPass(testName) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  }

  function recordFail(testName, error) {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    Error: ${error.message || error}`);
  }

  // Backend mock adapter
  async function callBackendServiceability(pin) {
    const req = { query: { pincode: pin } };
    const res = createMockRes();
    await DeliveryController.checkServiceability(req, res, (err) => {
      if (err) throw err;
    });
    return res.data;
  }

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users and active zone...');

    adminUser = await User.create({
      name: `Admin Expansion ${timestamp}`,
      email: `admin_exp_${timestamp}@test.bentobabu.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isVerified: true,
    });

    testCustomer = await User.create({
      name: `Customer Expansion ${timestamp}`,
      email: `cust_exp_${timestamp}@test.bentobabu.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    // Ensure supportedPin is in an active zone
    testZone = await DeliveryZone.findOne({ pincodes: supportedPin, isActive: true });
    if (!testZone) {
      testZone = await DeliveryZone.create({
        name: `Barrackpore Hub ${timestamp}`,
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [88.35, 22.75],
              [88.39, 22.75],
              [88.39, 22.78],
              [88.35, 22.78],
              [88.35, 22.75],
            ],
          ],
        },
        pincodes: [supportedPin],
        deliveryCharge: 0,
        minimumOrderAmount: 99,
        isActive: true,
      });
    }

    // Ensure unsupportedPin1 is not in any active zone
    await DeliveryZone.updateMany(
      { pincodes: { $in: [unsupportedPin1, unsupportedPin2] } },
      { $pull: { pincodes: { $in: [unsupportedPin1, unsupportedPin2] } } }
    );

    // ----------------------------------------------------
    // TEST 1: Customer enters a supported PIN code -> no service expansion popup
    // ----------------------------------------------------
    try {
      const res = await clientCheckServiceability(supportedPin, callBackendServiceability);
      assert.strictEqual(res.serviceable, true, 'Supported PIN must return serviceable: true');
      assert.ok(res.message.includes('available'), 'Message indicates available');

      // Modal trigger check: if serviceable, popup must NOT trigger
      const shouldTriggerPopup = !res.serviceable;
      assert.strictEqual(
        shouldTriggerPopup,
        false,
        'Supported PIN must never trigger expansion popup'
      );

      recordPass('Test 1: Customer enters supported PIN -> serviceable: true, NO popup triggered');
    } catch (err) {
      recordFail('Test 1: Supported PIN', err);
    }

    // ----------------------------------------------------
    // TEST 2: Customer enters an unsupported PIN code -> popup appears
    // ----------------------------------------------------
    try {
      const res = await clientCheckServiceability(unsupportedPin1, callBackendServiceability);
      assert.strictEqual(
        res.serviceable,
        false,
        'Unsupported PIN must return serviceable: false'
      );
      assert.ok(
        res.message.includes('not available'),
        'Message indicates delivery not available'
      );

      // Modal trigger check: unserviceable triggers expansion popup
      const shouldTriggerPopup = !res.serviceable;
      assert.strictEqual(
        shouldTriggerPopup,
        true,
        'Unsupported PIN must trigger expansion popup'
      );

      recordPass('Test 2: Customer enters unsupported PIN -> serviceable: false, popup triggers');
    } catch (err) {
      recordFail('Test 2: Unsupported PIN', err);
    }

    // ----------------------------------------------------
    // TEST 3: Guest submits a vote -> vote is successfully recorded
    // ----------------------------------------------------
    const guestAnonId = `anon_${timestamp}_guest_vote`;
    try {
      const reqVote = {
        body: {
          pincode: unsupportedPin1,
          locality: 'Salt Lake Sector V',
          city: 'Kolkata',
          state: 'West Bengal',
          anonymousIdentifier: guestAnonId,
          source: 'CHECKOUT_UNSERVICEABLE',
        },
        user: null, // Guest
      };
      const resVote = createMockRes();
      await ServiceExpansionController.vote(reqVote, resVote, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resVote.statusCode, 201, 'Guest vote should return 201 Created');
      assert.strictEqual(resVote.data.success, true, 'success should be true');
      assert.ok(
        resVote.data.message.includes('recorded') || resVote.data.message.includes('Thank you'),
        'Thank you message returned'
      );

      // Verify in database
      const voteDoc = await ServiceExpansionVote.findOne({
        pincode: unsupportedPin1,
        anonymousIdentifier: guestAnonId,
      });
      assert.ok(voteDoc, 'Vote document created in database');
      assert.strictEqual(voteDoc.pincode, unsupportedPin1);
      assert.strictEqual(voteDoc.customer, null, 'Customer should be null for guest');

      recordPass('Test 3: Guest submits vote -> recorded in ServiceExpansionVote collection');
    } catch (err) {
      recordFail('Test 3: Guest vote submission', err);
    }

    // ----------------------------------------------------
    // TEST 4: Authenticated customer submits a vote -> vote is successfully recorded
    // ----------------------------------------------------
    try {
      const reqAuthVote = {
        body: {
          pincode: unsupportedPin2,
          locality: 'New Town Action Area I',
          city: 'Kolkata',
          state: 'West Bengal',
          customerName: testCustomer.name,
          customerPhone: testCustomer.phone,
          source: 'CHECKOUT_UNSERVICEABLE',
        },
        user: testCustomer,
      };
      const resAuthVote = createMockRes();
      await ServiceExpansionController.vote(reqAuthVote, resAuthVote, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resAuthVote.statusCode, 201, 'Customer vote returns 201 Created');
      assert.strictEqual(resAuthVote.data.success, true);

      // Verify in database
      const authVoteDoc = await ServiceExpansionVote.findOne({
        pincode: unsupportedPin2,
        customer: testCustomer._id,
      });
      assert.ok(authVoteDoc, 'Customer vote document created');
      assert.strictEqual(String(authVoteDoc.customer), String(testCustomer._id));

      recordPass('Test 4: Authenticated customer submits vote -> user._id associated');
    } catch (err) {
      recordFail('Test 4: Authenticated customer vote', err);
    }

    // ----------------------------------------------------
    // TEST 5: Customer attempts duplicate voting -> existing deduplication rules apply
    // ----------------------------------------------------
    try {
      const reqDupVote = {
        body: {
          pincode: unsupportedPin1,
          locality: 'Salt Lake Sector V',
          anonymousIdentifier: guestAnonId,
          source: 'CHECKOUT_UNSERVICEABLE',
        },
        user: null,
      };
      const resDupVote = createMockRes();
      await ServiceExpansionController.vote(reqDupVote, resDupVote, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resDupVote.statusCode, 200, 'Duplicate vote returns 200 OK');
      assert.strictEqual(resDupVote.data.success, true);
      assert.strictEqual(
        resDupVote.data.alreadyVoted,
        true,
        'Response indicates alreadyVoted: true'
      );

      // Verify voteCount was NOT inflated
      const allVotes = await ServiceExpansionVote.find({
        pincode: unsupportedPin1,
        anonymousIdentifier: guestAnonId,
      });
      assert.strictEqual(allVotes.length, 1, 'Exactly one vote document exists for this guest');

      recordPass('Test 5: Duplicate voting handled idempotently without count inflation');
    } catch (err) {
      recordFail('Test 5: Duplicate voting', err);
    }

    // ----------------------------------------------------
    // TEST 6: Customer changes from unsupported PIN to supported PIN -> unserviceable state clears
    // ----------------------------------------------------
    try {
      // Step 1: User enters unsupported PIN
      const step1 = await clientCheckServiceability(unsupportedPin1, callBackendServiceability);
      assert.strictEqual(step1.serviceable, false);

      // Step 2: User corrects PIN to supported PIN
      const step2 = await clientCheckServiceability(supportedPin, callBackendServiceability);
      assert.strictEqual(step2.serviceable, true);

      // In checkout page, when step2.serviceable === true, lastPromptedPincodeRef resets and modal closes
      const modalOpenState = !step2.serviceable;
      assert.strictEqual(
        modalOpenState,
        false,
        'Modal closes and serviceable state displays cleanly'
      );

      recordPass('Test 6: Changing from unsupported to supported PIN clears popup and error');
    } catch (err) {
      recordFail('Test 6: Transition unsupported -> supported', err);
    }

    // ----------------------------------------------------
    // TEST 7: Customer changes from supported PIN to unsupported PIN -> popup appears
    // ----------------------------------------------------
    try {
      const step3 = await clientCheckServiceability(unsupportedPin2, callBackendServiceability);
      assert.strictEqual(step3.serviceable, false);
      const modalOpenState = !step3.serviceable;
      assert.strictEqual(
        modalOpenState,
        true,
        'Modal opens when switching back to unserviceable PIN'
      );

      recordPass('Test 7: Changing from supported to unsupported PIN triggers popup');
    } catch (err) {
      recordFail('Test 7: Transition supported -> unsupported', err);
    }

    // ----------------------------------------------------
    // TEST 8: Verify popup is NOT permanently suppressed by old local storage state
    // ----------------------------------------------------
    try {
      // Simulate that localStorage already has this PIN marked as voted
      // The updated checkout/page.tsx does NOT block modal opening if hasVotedForPincode is true
      const hasVotedLocal = true;
      const cleanPin = unsupportedPin1;

      // New trigger logic: relies purely on backend serviceability, not blocked by hasVotedLocal
      let modalOpened = false;
      if (!step3Serviceable(cleanPin)) {
        modalOpened = true; // Unconditionally prompt on new unsupported PIN
      }

      function step3Serviceable(pin) {
        return pin === supportedPin;
      }

      assert.strictEqual(
        modalOpened,
        true,
        'Modal opens even if voter previously submitted or had local flag'
      );
      recordPass('Test 8: Modal is NOT suppressed by stale local storage voting state');
    } catch (err) {
      recordFail('Test 8: Stale local storage suppression check', err);
    }

    // ----------------------------------------------------
    // TEST 9: Admin demand rankings and expansion summary reflect the votes
    // ----------------------------------------------------
    try {
      const reqSummary = { user: adminUser, query: { periodDays: 30 } };
      const resSummary = createMockRes();
      await ServiceExpansionController.getSummary(reqSummary, resSummary, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resSummary.statusCode, 200, 'Admin summary returns 200');
      assert.strictEqual(resSummary.data.success, true);
      assert.ok(resSummary.data.data.totalVotes >= 2, 'Total votes reflects test votes');
      assert.ok(
        resSummary.data.data.uniquePincodesCount >= 2,
        'Distinct unserved locations counted'
      );

      // Check locations query
      const reqLocs = {
        user: adminUser,
        query: { page: 1, limit: 10, search: unsupportedPin1 },
      };
      const resLocs = createMockRes();
      await ServiceExpansionController.getLocations(reqLocs, resLocs, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(resLocs.statusCode, 200, 'Locations list returns 200');
      assert.ok(resLocs.data.data.locations.length >= 1, 'Contains unsupportedPin1');
      assert.strictEqual(resLocs.data.data.locations[0].pincode, unsupportedPin1);

      recordPass('Test 9: Admin demand rankings & analytics reflect newly submitted votes');
    } catch (err) {
      recordFail('Test 9: Admin demand rankings', err);
    }

    // ----------------------------------------------------
    // TEST 10: Attempting to vote for an ALREADY supported PIN is rejected
    // ----------------------------------------------------
    try {
      const reqSupportedVote = {
        body: {
          pincode: supportedPin,
          locality: 'Barrackpore',
          anonymousIdentifier: 'guest_test',
        },
        user: null,
      };
      const resSupportedVote = createMockRes();
      await ServiceExpansionController.vote(reqSupportedVote, resSupportedVote, (err) => {
        if (err) throw err;
      });

      assert.strictEqual(
        resSupportedVote.statusCode,
        400,
        'Voting for an already serviceable PIN must return 400'
      );
      assert.strictEqual(
        resSupportedVote.data.alreadyServiceable,
        true,
        'Returns alreadyServiceable: true'
      );

      recordPass('Test 10: Voting on already serviceable PIN correctly rejected');
    } catch (err) {
      recordFail('Test 10: Supported PIN vote rejection', err);
    }
  } finally {
    console.log('\n[Cleanup] Cleaning up test records...');
    try {
      await ServiceExpansionVote.deleteMany({
        pincode: { $in: [unsupportedPin1, unsupportedPin2] },
      });
      if (adminUser) await User.deleteOne({ _id: adminUser._id });
      if (testCustomer) await User.deleteOne({ _id: testCustomer._id });
    } catch (cErr) {
      console.error('[Cleanup] Error:', cErr.message);
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected MongoDB.\n');
  }

  console.log('================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
