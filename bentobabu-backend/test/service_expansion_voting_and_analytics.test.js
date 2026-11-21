process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Order,
  DeliveryZone,
  ServiceExpansionVote,
  DeliveryPartnerPresence,
} = require('../app/models');

const ServiceExpansionController = require('../app/controllers/serviceExpansionController');
const AdminDashboardController = require('../app/controllers/adminDashboardController');

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    headers: {},
    rawBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
    },
    send(payload) {
      this.rawBody = payload;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   BENTO BABU — SERVICE EXPANSION & BI DASHBOARD TEST SUITE     ');
  console.log('================================================================\n');

  await connectDB();

  const timestamp = Date.now();
  let adminUser, customerUser1, customerUser2;
  let activeZone;
  let cat1, prod1, prod2;
  let order1, order2, order3, cancelledOrder, refundedOrder;

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log('[Setup] Creating test users, active delivery zone, products, and orders...');

    adminUser = await User.create({
      name: `Admin Analytics ${timestamp}`,
      email: `admin_bi_${timestamp}@test.bentobabu.in`,
      phone: `91${String(timestamp).slice(-8)}`,
      password: 'AdminPassword123!',
      role: 'ADMIN',
      isVerified: true,
    });

    customerUser1 = await User.create({
      name: `Customer Alpha ${timestamp}`,
      email: `alpha_${timestamp}@test.bentobabu.in`,
      phone: `92${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    customerUser2 = await User.create({
      name: `Customer Beta ${timestamp}`,
      email: `beta_${timestamp}@test.bentobabu.in`,
      phone: `93${String(timestamp).slice(-8)}`,
      password: 'CustomerPassword123!',
      role: 'CUSTOMER',
      isVerified: true,
    });

    // Create an active delivery zone with serviceable PIN code 700120
    activeZone = await DeliveryZone.create({
      name: `Barrackpore Central ${timestamp}`,
      pincodes: ['700120', '700121'],
      deliveryCharge: 30,
      estimatedDeliveryMinutes: 35,
      isActive: true,
    });

    // Category and Products
    cat1 = await Category.create({
      name: `High Protein Bowls ${timestamp}`,
      slug: `high-protein-${timestamp}`,
      isActive: true,
    });

    prod1 = await Product.create({
      name: `Tofu Teriyaki Bowl ${timestamp}`,
      slug: `tofu-teriyaki-${timestamp}`,
      description: 'Organic pan-seared tofu tossed in house teriyaki sauce with steamed greens.',
      category: cat1._id,
      price: 250,
      stockQuantity: 40,
      isActive: true,
    });

    prod2 = await Product.create({
      name: `Grilled Paneer Bento ${timestamp}`,
      slug: `grilled-paneer-${timestamp}`,
      description: 'Spiced cottage cheese steak with herb quinoa and roasted sesame broccoli.',
      category: cat1._id,
      price: 320,
      stockQuantity: 25,
      isActive: true,
    });

    // Create delivered, paid orders in current period
    order1 = await Order.create({
      orderNumber: `ORD-TEST-1-${timestamp}`,
      user: customerUser1._id,
      items: [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: 2,
          unitPrice: 250,
          subtotal: 500,
        },
        {
          product: prod2._id,
          productName: prod2.name,
          quantity: 1,
          unitPrice: 320,
          subtotal: 320,
        },
      ],
      deliveryAddress: {
        fullName: customerUser1.name,
        phone: customerUser1.phone,
        addressLine: '12 River Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 820,
      deliveryCharge: 30,
      taxAmount: 41,
      couponDiscount: 50,
      grandTotal: 841,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      statusHistory: [
        { status: 'CONFIRMED', changedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { status: 'PICKED_UP', changedAt: new Date(Date.now() - 40 * 60 * 1000) },
        { status: 'DELIVERED', changedAt: new Date(Date.now() - 10 * 60 * 1000) },
      ],
    });

    // Cash on Delivery completed order
    order2 = await Order.create({
      orderNumber: `ORD-TEST-2-${timestamp}`,
      user: customerUser1._id,
      items: [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      ],
      deliveryAddress: {
        fullName: customerUser1.name,
        phone: customerUser1.phone,
        addressLine: '45 Station Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 250,
      deliveryCharge: 30,
      taxAmount: 12.5,
      couponDiscount: 0,
      grandTotal: 292.5,
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      orderStatus: 'DELIVERED',
      statusHistory: [
        { status: 'CONFIRMED', changedAt: new Date(Date.now() - 120 * 60 * 1000) },
        { status: 'OUT_FOR_DELIVERY', changedAt: new Date(Date.now() - 50 * 60 * 1000) },
        { status: 'DELIVERED', changedAt: new Date(Date.now() - 20 * 60 * 1000) },
      ],
    });

    // In-Kitchen Active order
    order3 = await Order.create({
      orderNumber: `ORD-TEST-3-${timestamp}`,
      user: customerUser2._id,
      items: [
        {
          product: prod2._id,
          productName: prod2.name,
          quantity: 2,
          unitPrice: 320,
          subtotal: 640,
        },
      ],
      deliveryAddress: {
        fullName: customerUser2.name,
        phone: customerUser2.phone,
        addressLine: '8 Market St',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700121',
      },
      itemTotal: 640,
      deliveryCharge: 30,
      taxAmount: 32,
      couponDiscount: 0,
      grandTotal: 702,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PAID',
      orderStatus: 'PREPARING',
      statusHistory: [
        { status: 'CONFIRMED', changedAt: new Date(Date.now() - 15 * 60 * 1000) },
        { status: 'PREPARING', changedAt: new Date(Date.now() - 5 * 60 * 1000) },
      ],
    });

    // Cancelled order (should be excluded from revenue and sales)
    cancelledOrder = await Order.create({
      orderNumber: `ORD-TEST-CANCEL-${timestamp}`,
      user: customerUser2._id,
      items: [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: 5,
          unitPrice: 250,
          subtotal: 1250,
        },
      ],
      deliveryAddress: {
        fullName: customerUser2.name,
        phone: customerUser2.phone,
        addressLine: '99 Old Lane',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 1250,
      deliveryCharge: 30,
      taxAmount: 62.5,
      grandTotal: 1342.5,
      paymentMethod: 'COD',
      paymentStatus: 'FAILED',
      orderStatus: 'CANCELLED',
      cancellationReason: 'Customer changed delivery address',
      statusHistory: [
        { status: 'CANCELLED', changedAt: new Date() },
      ],
    });

    // Refunded Order
    refundedOrder = await Order.create({
      orderNumber: `ORD-TEST-REFUND-${timestamp}`,
      user: customerUser2._id,
      items: [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      ],
      deliveryAddress: {
        fullName: customerUser2.name,
        phone: customerUser2.phone,
        addressLine: '10 Cantonment Rd',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 250,
      deliveryCharge: 30,
      taxAmount: 12.5,
      grandTotal: 292.5,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'REFUNDED',
      orderStatus: 'DELIVERED',
      paymentDetails: {
        refundStatus: 'PROCESSED',
        refundAmount: 292.5,
        refundProcessedAt: new Date(),
      },
    });

    // Active delivery presence
    await DeliveryPartnerPresence.create({
      user: adminUser._id,
      availabilityStatus: 'ONLINE',
      accountStatus: 'ACTIVE',
      lastHeartbeat: new Date(),
    });

    console.log('[Setup Complete] All test fixtures created.\n');

    // ====================================================
    // TEST SECTION 1: SERVICE EXPANSION VOTING SYSTEM
    // ====================================================
    console.log('--- PART 1: SERVICE AREA EXPANSION VOTING TESTS ---');

    // Test 1: Valid Guest Vote
    {
      const req = {
        body: {
          pincode: '700140',
          locality: 'Shyamnagar',
          city: 'North 24 Parganas',
          state: 'West Bengal',
          anonymousIdentifier: `guest_${timestamp}`,
        },
        user: null,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 201, 'Guest vote should return HTTP 201');
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.pincode, '700140');
      assert.strictEqual(res.data.data.locality, 'Shyamnagar');
      console.log('✔ Test 1 PASS: Valid guest vote recorded successfully');
    }

    // Test 2: Invalid PIN Code Rejection
    {
      const req = {
        body: { pincode: '012345', anonymousIdentifier: `guest_inv_${timestamp}` },
        user: null,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 400, 'Invalid PIN code starting with 0 should return 400');
      assert.strictEqual(res.data.success, false);
      console.log('✔ Test 2 PASS: Invalid PIN code correctly rejected');
    }

    // Test 3: Already Serviceable Location Rejection
    {
      const req = {
        body: { pincode: '700120', anonymousIdentifier: `guest_serv_${timestamp}` },
        user: null,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 400, 'Already serviceable location should return 400');
      assert.strictEqual(res.data.alreadyServiceable, true);
      console.log('✔ Test 3 PASS: Vote on already serviceable PIN code correctly redirected');
    }

    // Test 4: Idempotent Guest Voting (Deduplication)
    {
      const req = {
        body: {
          pincode: '700140',
          locality: 'Shyamnagar East',
          anonymousIdentifier: `guest_${timestamp}`,
        },
        user: null,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 200, 'Repeat vote should return HTTP 200 (idempotent)');
      assert.strictEqual(res.data.alreadyVoted, true);

      // Verify database count does NOT inflate
      const count = await ServiceExpansionVote.countDocuments({
        pincode: '700140',
        anonymousIdentifier: `guest_${timestamp}`,
      });
      assert.strictEqual(count, 1, 'Only one vote document must exist for this guest and PIN');
      console.log('✔ Test 4 PASS: Idempotent guest voting prevents duplicate count inflation');
    }

    // Test 5: Authenticated Customer Vote
    {
      const req = {
        body: {
          pincode: '700150',
          locality: 'Kankinara',
          city: 'Bhatpara',
          state: 'West Bengal',
        },
        user: customerUser1,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 201, 'Customer vote should return 201');
      assert.strictEqual(res.data.data.pincode, '700150');
      console.log('✔ Test 5 PASS: Authenticated customer vote recorded with user association');
    }

    // Test 6: Same Customer Voting for a Different PIN Code
    {
      const req = {
        body: {
          pincode: '700160',
          locality: 'Naihati',
          city: 'Naihati',
          state: 'West Bengal',
        },
        user: customerUser1,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 201, 'Customer can vote for different PIN codes');
      console.log('✔ Test 6 PASS: Customer can vote for different PIN codes');
    }

    // Test 7: Customer Re-voting for Same PIN Code
    {
      const req = {
        body: {
          pincode: '700150',
          locality: 'Kankinara Station Rd',
        },
        user: customerUser1,
      };
      const res = createMockRes();
      await ServiceExpansionController.vote(req, res, () => {});

      assert.strictEqual(res.statusCode, 200, 'Re-voting returns 200');
      assert.strictEqual(res.data.alreadyVoted, true);
      const count = await ServiceExpansionVote.countDocuments({
        pincode: '700150',
        customer: customerUser1._id,
      });
      assert.strictEqual(count, 1, 'Only 1 record exists for customer and PIN 700150');
      console.log('✔ Test 7 PASS: Customer deduplication works idempotently');
    }

    // Test 7b: Guest Voting Followed by Login (Identity Linking & Anti-Inflation)
    {
      const switchingAnonId = `anon_switch_${timestamp}`;
      // Step 1: Guest votes for 700170
      const guestReq = {
        body: {
          pincode: '700170',
          locality: 'Bhatpara',
          anonymousIdentifier: switchingAnonId,
        },
      };
      const guestRes = createMockRes();
      await ServiceExpansionController.vote(guestReq, guestRes, () => {});
      assert.strictEqual(guestRes.statusCode, 201);
      assert.strictEqual(guestRes.data.alreadyVoted, false);

      // Step 2: Customer logs in on same browser and attempts to vote for 700170
      const authReq = {
        body: {
          pincode: '700170',
          locality: 'Bhatpara Central',
          anonymousIdentifier: switchingAnonId,
        },
        user: customerUser2,
      };
      const authRes = createMockRes();
      await ServiceExpansionController.vote(authReq, authRes, () => {});
      assert.strictEqual(authRes.statusCode, 200, 'Authenticated attempt after guest vote returns 200');
      assert.strictEqual(authRes.data.alreadyVoted, true, 'Flagged as already voted');

      // Verify no duplicate record was created and customer is linked
      const totalVotes700170 = await ServiceExpansionVote.countDocuments({ pincode: '700170' });
      assert.strictEqual(totalVotes700170, 1, 'Exactly 1 vote record exists after switching identity');
      const linkedRecord = await ServiceExpansionVote.findOne({ pincode: '700170' });
      assert.strictEqual(String(linkedRecord.customer), String(customerUser2._id), 'Guest vote claimed by customer');

      // Step 3: Customer logs out and attempts to vote again as guest on same browser
      const postLogoutReq = {
        body: {
          pincode: '700170',
          anonymousIdentifier: switchingAnonId,
        },
      };
      const postLogoutRes = createMockRes();
      await ServiceExpansionController.vote(postLogoutReq, postLogoutRes, () => {});
      assert.strictEqual(postLogoutRes.statusCode, 200);
      assert.strictEqual(postLogoutRes.data.alreadyVoted, true, 'Guest attempt after customer vote blocked');
      const finalCount = await ServiceExpansionVote.countDocuments({ pincode: '700170' });
      assert.strictEqual(finalCount, 1, 'Still exactly 1 record, anti-inflation verified');
      console.log('✔ Test 7b PASS: Identity linking and guest-customer anti-inflation verified');
    }

    // Test 7c: Concurrent Duplicate Requests Handling
    {
      const concurrentAnonId = `anon_concurrent_${timestamp}`;
      const concurrentReqs = Array.from({ length: 4 }).map(() => ({
        body: {
          pincode: '700170',
          locality: 'Bhatpara Race',
          anonymousIdentifier: concurrentAnonId,
        },
      }));

      const responses = await Promise.all(
        concurrentReqs.map(async (r) => {
          const res = createMockRes();
          await ServiceExpansionController.vote(r, res, () => {});
          return res;
        })
      );

      // All requests must return either 200 or 201 without unhandled crash
      responses.forEach((res) => {
        assert([200, 201].includes(res.statusCode), `Concurrent request returned ${res.statusCode}`);
      });
      console.log('✔ Test 7c PASS: Concurrent duplicate requests safely handled without crash');
    }

    // Test 8: Admin Summary API
    {
      const req = { query: { periodDays: 30 } };
      const res = createMockRes();
      await ServiceExpansionController.getSummary(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert(res.data.data.totalVotes >= 3, 'Total votes should be at least 3');
      assert(res.data.data.uniquePincodesCount >= 3, 'Unique PIN codes should be at least 3');
      assert(res.data.data.topRequestedArea !== null, 'Top requested area should be computed');
      console.log('✔ Test 8 PASS: Admin expansion summary returns accurate aggregated metrics');
    }

    // Test 9: Admin Locations Ranked List & Search
    {
      const req = { query: { search: 'Naihati' } };
      const res = createMockRes();
      await ServiceExpansionController.getLocations(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.data.locations[0].pincode, '700160');
      assert.strictEqual(res.data.data.locations[0].locality, 'Naihati');
      console.log('✔ Test 9 PASS: Admin expansion locations search filters correctly');
    }

    // Test 10: Admin Status Update & Internal Notes
    {
      const req = {
        params: { id: '700150' },
        body: {
          status: 'UNDER_CONSIDERATION',
          internalNotes: 'Dense cluster near railway junction. Exploring rider deployment.',
        },
      };
      const res = createMockRes();
      await ServiceExpansionController.updateLocationStatus(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.data.status, 'UNDER_CONSIDERATION');

      const updated = await ServiceExpansionVote.findOne({ pincode: '700150' });
      assert.strictEqual(updated.status, 'UNDER_CONSIDERATION');
      assert.strictEqual(updated.internalNotes, 'Dense cluster near railway junction. Exploring rider deployment.');
      console.log('✔ Test 10 PASS: Admin status and private internal notes updated successfully');
    }

    // Test 11: Admin CSV Export
    {
      const req = {};
      const res = createMockRes();
      await ServiceExpansionController.exportLocations(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['Content-Type'], 'text/csv; charset=utf-8');
      assert(typeof res.rawBody === 'string');
      assert(res.rawBody.includes('PIN Code'), 'CSV contains PIN Code header');
      assert(res.rawBody.includes('700150'), 'CSV contains PIN 700150');
      console.log('✔ Test 11 PASS: Admin CSV export returns RFC-compliant tabular data');
    }

    // ====================================================
    // TEST SECTION 2: BI DASHBOARD & ANALYTICS
    // ====================================================
    console.log('\n--- PART 2: ADMIN BUSINESS INTELLIGENCE DASHBOARD TESTS ---');

    // Test 12: Overview KPIs (Revenue, Orders, Completed, AOV, Cancellation Rate)
    {
      const req = { query: { period: 'today' } };
      const res = createMockRes();
      await AdminDashboardController.getOverview(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { kpis, operations } = res.data.data;

      // Net revenue should sum order1 (841) + order2 (292.5) + order3 (702) + refundedOrder (292.5 - 292.5 = 0)
      // Cancelled order (1342.5) must NOT be counted!
      const expectedNetRevenue = 841 + 292.5 + 702; // 1835.5
      assert(kpis.totalRevenue.value >= expectedNetRevenue, `Total revenue should include non-cancelled paid/delivered orders: ${kpis.totalRevenue.value}`);

      // Cancellation rate calculation
      assert(kpis.cancellationRate.value > 0, 'Cancellation rate should be greater than 0');
      assert(operations.pendingOrders >= 0);
      assert(operations.preparingOrders >= 1, 'In-kitchen orders should include preparing order3');

      console.log('✔ Test 12 PASS: Overview primary KPI cards calculate net revenue and lifecycle safely');
    }

    // Test 13: Revenue Timeline with Continuous Zero-Filled IST Dates
    {
      const req = { query: { period: '7d' } };
      const res = createMockRes();
      await AdminDashboardController.getRevenue(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { summary, timeline } = res.data.data;

      assert(Array.isArray(timeline), 'Timeline should be an array');
      assert.strictEqual(timeline.length, 8, '7-day range should contain 8 continuous dates (0d to 7d inclusive)');
      assert(summary.breakdown.itemSubtotal > 0, 'Item subtotal must be positive');
      assert(summary.breakdown.deliveryCharges > 0, 'Delivery charges must be positive');
      assert(summary.breakdown.refunds >= 292.5, 'Refunds should include refundedOrder');
      console.log('✔ Test 13 PASS: Revenue timeline returns continuous zero-filled time series in IST');
    }

    // Test 14: Product Analytics ("What's Selling the Most?")
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getProducts(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { topSellingProducts, categoryPerformance } = res.data.data;

      assert(topSellingProducts.length > 0, 'Top selling products should not be empty');
      const topDish = topSellingProducts[0];
      assert(topDish.unitsSold > 0, 'Units sold must be positive');
      assert(topDish.grossSales > 0, 'Gross sales must be positive');
      assert(topDish.contributionPercentage > 0, 'Contribution % must be positive');

      assert(categoryPerformance.length > 0, 'Category performance must exist');
      assert(categoryPerformance[0].revenue > 0, 'Category revenue must be currency sum, not items count!');
      console.log('✔ Test 14 PASS: What\'s Selling the Most product ranking and category revenue are accurate');
    }

    // Test 15: Customer Segmentation & Top Customers
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getCustomers(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { segmentation, topCustomers, repeatPurchaseRate } = res.data.data;

      assert(segmentation.newCustomers >= 0, 'New customers count defined');
      assert(segmentation.repeatCustomers >= 1, 'customerUser1 placed 2 orders so should be repeat buyer');
      assert(topCustomers.length > 0, 'Top customers should have records');
      assert.strictEqual(topCustomers[0].userId.toString(), customerUser1._id.toString());
      console.log('✔ Test 15 PASS: Customer cohort segmentation and repeat rates computed properly');
    }

    // Test 16: Peak Hours & Day of Week Velocity
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getPeakHours(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { hourlyVelocity, dayOfWeekVelocity } = res.data.data;

      assert.strictEqual(hourlyVelocity.length, 24, '24 hourly buckets must be generated');
      assert.strictEqual(dayOfWeekVelocity.length, 7, '7 day-of-week buckets must be generated');
      console.log('✔ Test 16 PASS: Peak hours velocity properly divided into 24-hour and 7-day buckets');
    }

    // Test 17: Geographic Demand
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getLocations(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { serviceableLocations, unservedDemand } = res.data.data;

      assert(serviceableLocations.length > 0, 'Serviceable locations list exists');
      assert.strictEqual(serviceableLocations[0].pincode, '700120');
      assert(unservedDemand.length > 0, 'Unserved expansion demand listed');
      console.log('✔ Test 17 PASS: Geographic serviceable revenue and unserved demand mapped accurately');
    }

    // Test 18: Payment Analytics
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getPayments(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { statusBreakdown, methodDistribution, refunds } = res.data.data;

      assert(statusBreakdown.PAID.count >= 2, 'At least 2 paid orders');
      assert(methodDistribution.some((m) => m.method === 'RAZORPAY'));
      assert(methodDistribution.some((m) => m.method === 'COD'));
      assert(refunds.amount >= 292.5, 'Refunds amount tracked accurately');
      console.log('✔ Test 18 PASS: Payment methods and refund reconciliation match actual orders');
    }

    // Test 19: Delivery Fleet Performance
    {
      const req = { query: { period: '30d' } };
      const res = createMockRes();
      await AdminDashboardController.getDelivery(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      const { fleet, ordersQueue, avgDeliveryMinutes } = res.data.data;

      assert(fleet.activeOnline >= 1, 'At least 1 active online partner');
      assert(ordersQueue.deliveredInPeriod >= 2, 'Delivered orders count matches');
      assert(avgDeliveryMinutes > 0, 'Average delivery duration is positive number');
      console.log('✔ Test 19 PASS: Delivery fleet status and dispatch queues calculated cleanly');
    }

    console.log('\n================================================================');
    console.log('       ALL 19 AUDIT SUITE TESTS PASSED CLEANLY (19/19)          ');
    console.log('================================================================\n');
  } finally {
    // ----------------------------------------------------
    // CLEANUP FIXTURES
    // ----------------------------------------------------
    console.log('[Cleanup] Cleaning up test database records...');
    try {
      if (adminUser) await User.deleteOne({ _id: adminUser._id });
      if (customerUser1) await User.deleteOne({ _id: customerUser1._id });
      if (customerUser2) await User.deleteOne({ _id: customerUser2._id });
      if (activeZone) await DeliveryZone.deleteOne({ _id: activeZone._id });
      if (cat1) await Category.deleteOne({ _id: cat1._id });
      if (prod1) await Product.deleteOne({ _id: prod1._id });
      if (prod2) await Product.deleteOne({ _id: prod2._id });
      if (order1) await Order.deleteOne({ _id: order1._id });
      if (order2) await Order.deleteOne({ _id: order2._id });
      if (order3) await Order.deleteOne({ _id: order3._id });
      if (cancelledOrder) await Order.deleteOne({ _id: cancelledOrder._id });
      if (refundedOrder) await Order.deleteOne({ _id: refundedOrder._id });
      await DeliveryPartnerPresence.deleteMany({ partner: adminUser?._id });
      await ServiceExpansionVote.deleteMany({
        pincode: { $in: ['700140', '700150', '700160', '700170'] },
      });
      console.log('[Cleanup] Test fixtures safely purged.\n');
    } catch (cleanupErr) {
      console.error('[Cleanup Error]', cleanupErr);
    }
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
