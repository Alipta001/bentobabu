process.env.NODE_ENV = 'test';
require('dotenv').config();

const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../app/config/db');
const { getRedisClient } = require('../app/config/redis');
const { app } = require('../server');
const {
  User,
  Order,
  Product,
  Category,
  Review,
} = require('../app/models');

function parseCookies(setCookieHeaders = []) {
  const cookies = {};
  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(';');
    const [name, ...rest] = cookiePart.split('=');
    cookies[name.trim()] = rest.join('=');
  }
  return cookies;
}

function cookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        ...options,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data,
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function loginUser(server, email, password) {
  const csrfRes = await makeRequest(server, {
    method: 'GET',
    path: '/api/v1/auth/csrf-token',
  });
  const csrfCookies = parseCookies(csrfRes.headers['set-cookie'] || []);
  const csrfToken = csrfRes.data?.data?.csrfToken || csrfCookies.bb_csrf_token;

  const loginRes = await makeRequest(
    server,
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: cookieHeader(csrfCookies),
      },
    },
    { email, password }
  );

  const authCookies = {
    ...csrfCookies,
    ...parseCookies(loginRes.headers['set-cookie'] || []),
  };

  return {
    user: loginRes.data?.data?.user,
    cookies: authCookies,
    csrfToken: authCookies.bb_csrf_token || csrfToken,
  };
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('  BentoBabu — Customer Review & Rating System Test Suite');
  console.log('===============================================================\n');

  await connectDB();
  const redis = getRedisClient();
  if (redis && redis.status !== 'ready' && typeof redis.connect === 'function') {
    try {
      await redis.connect();
    } catch {}
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const uniqueSuffix = Date.now();
  const testPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(testPassword, 10);

  // 1. Setup Users
  const customerA = await User.create({
    name: 'Rohan Sharma',
    email: `cust_rev_a_${uniqueSuffix}@bentobabu.test`,
    phone: `98711${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  const customerB = await User.create({
    name: 'Priya Patel',
    email: `cust_rev_b_${uniqueSuffix}@bentobabu.test`,
    phone: `98712${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  const adminStaff = await User.create({
    name: 'Bento Admin Moderation',
    email: `admin_rev_${uniqueSuffix}@bentobabu.test`,
    phone: `98713${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'ADMIN',
    isActive: true,
  });

  // 2. Setup Category and Products
  const category = await Category.create({
    name: `Fitness Bowls ${uniqueSuffix}`,
    slug: `fitness-bowls-${uniqueSuffix}`,
    description: 'High-protein fitness bowls',
    image: 'https://res.cloudinary.com/demo/image/upload/category.jpg',
  });

  const product1 = await Product.create({
    name: `Signature Teriyaki Salmon Bento ${uniqueSuffix}`,
    slug: `signature-teriyaki-salmon-bento-${uniqueSuffix}`,
    description: 'Wild Alaskan salmon with organic quinoa and sesame broccoli.',
    category: category._id,
    price: 649,
    isAvailable: true,
    isActive: true,
  });

  const product2 = await Product.create({
    name: `Tofu Avocado Protein Bowl ${uniqueSuffix}`,
    slug: `tofu-avocado-protein-bowl-${uniqueSuffix}`,
    description: 'Crispy organic tofu with ripe avocado and edamame.',
    category: category._id,
    price: 449,
    isAvailable: true,
    isActive: true,
  });

  // 3. Setup Orders:
  // Order 1: Customer A, DELIVERED, contains product1
  const orderDelivered = await Order.create({
    orderNumber: `ORD-DEL-${uniqueSuffix}`,
    user: customerA._id,
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    paymentMethod: 'RAZORPAY',
    itemTotal: 649,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 649,
    deliveryAddress: {
      fullName: 'Rohan Sharma',
      phone: '9871100000',
      addressLine: '100 Fitness Rd',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
    items: [
      {
        product: product1._id,
        productName: product1.name,
        quantity: 1,
        unitPrice: 649,
        subtotal: 649,
      },
    ],
  });

  // Order 2: Customer A, PREPARING (Undelivered), contains product2
  const orderUndelivered = await Order.create({
    orderNumber: `ORD-PREP-${uniqueSuffix}`,
    user: customerA._id,
    orderStatus: 'PREPARING',
    paymentStatus: 'PAID',
    paymentMethod: 'RAZORPAY',
    itemTotal: 449,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 449,
    deliveryAddress: {
      fullName: 'Rohan Sharma',
      phone: '9871100000',
      addressLine: '100 Fitness Rd',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
    items: [
      {
        product: product2._id,
        productName: product2.name,
        quantity: 1,
        unitPrice: 449,
        subtotal: 449,
      },
    ],
  });

  // Order 3: Customer A, CANCELLED
  const orderCancelled = await Order.create({
    orderNumber: `ORD-CANC-${uniqueSuffix}`,
    user: customerA._id,
    orderStatus: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    paymentMethod: 'RAZORPAY',
    itemTotal: 649,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 649,
    deliveryAddress: {
      fullName: 'Rohan Sharma',
      phone: '9871100000',
      addressLine: '100 Fitness Rd',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
    items: [
      {
        product: product1._id,
        productName: product1.name,
        quantity: 1,
        unitPrice: 649,
        subtotal: 649,
      },
    ],
  });

  // Log in users
  const authA = await loginUser(server, customerA.email, testPassword);
  const authB = await loginUser(server, customerB.email, testPassword);
  const authAdmin = await loginUser(server, adminStaff.email, testPassword);

  let reviewId = null;

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Unauthenticated review rejection (HTTP 401)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 1: Unauthenticated review rejection (HTTP 401)...');
    const unauthRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        productId: product1._id.toString(),
        orderId: orderDelivered._id.toString(),
        rating: 5,
        comment: 'Unauthenticated review attempt',
      }
    );
    assert.equal(unauthRes.statusCode, 401, `Expected 401, got ${unauthRes.statusCode}`);
    console.log('    ✓ Unauthenticated review submission blocked with HTTP 401');

    // -------------------------------------------------------------------------
    // Scenario 2: Non-purchaser review rejection (User B never bought product 1)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 2: Non-purchaser review rejection (HTTP 403 / 400)...');
    // User B tries to use User A's order
    const stolenOrderRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authB.csrfToken,
          Cookie: cookieHeader(authB.cookies),
        },
      },
      {
        productId: product1._id.toString(),
        orderId: orderDelivered._id.toString(),
        rating: 5,
        comment: 'User B trying to review with User A order',
      }
    );
    assert.equal(stolenOrderRes.statusCode, 403, `Expected 403, got ${stolenOrderRes.statusCode}`);
    console.log('    ✓ Foreign order usage blocked with HTTP 403');

    // -------------------------------------------------------------------------
    // Scenario 3: Review for undelivered order rejection (HTTP 400)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 3: Review for undelivered order rejection (HTTP 400)...');
    const undeliveredRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        productId: product2._id.toString(),
        orderId: orderUndelivered._id.toString(),
        rating: 4,
        comment: 'Meal still being prepared, trying to review early',
      }
    );
    assert.equal(undeliveredRes.statusCode, 400, `Expected 400, got ${undeliveredRes.statusCode}`);
    assert.ok(undeliveredRes.data.message.includes('delivered'));
    console.log('    ✓ Undelivered order review blocked with HTTP 400');

    // -------------------------------------------------------------------------
    // Scenario 4: Review for cancelled order rejection (HTTP 400)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 4: Review for cancelled order rejection (HTTP 400)...');
    const cancelledRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        productId: product1._id.toString(),
        orderId: orderCancelled._id.toString(),
        rating: 1,
        comment: 'Order was cancelled, trying to review',
      }
    );
    assert.equal(cancelledRes.statusCode, 400, `Expected 400, got ${cancelledRes.statusCode}`);
    console.log('    ✓ Cancelled order review blocked with HTTP 400');

    // -------------------------------------------------------------------------
    // Scenario 5: Review eligibility endpoint verification
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 5: Review eligibility check endpoint verification...');
    const eligRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/reviews/eligibility/${product1._id}`,
      headers: {
        'X-CSRF-Token': authA.csrfToken,
        Cookie: cookieHeader(authA.cookies),
      },
    });
    assert.equal(eligRes.statusCode, 200);
    assert.equal(eligRes.data.data.isEligible, true);
    assert.equal(eligRes.data.data.canReview, true);
    assert.equal(eligRes.data.data.eligibleOrders.length, 1);
    console.log('    ✓ Customer A verified eligible to review delivered product 1');

    // -------------------------------------------------------------------------
    // Scenario 6: Eligible customer review submission (201 Created)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 6: Eligible customer review submission (HTTP 201)...');
    const createRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        productId: product1._id.toString(),
        orderId: orderDelivered._id.toString(),
        rating: 5,
        title: 'Outstanding Salmon Bento!',
        comment: 'The teriyaki glaze was perfectly balanced and the quinoa was warm and fluffy. Will order again!',
        images: [
          { url: 'https://res.cloudinary.com/demo/image/upload/review_salmon.jpg' },
        ],
      }
    );
    assert.equal(createRes.statusCode, 201, `Expected 201, got ${createRes.statusCode}`);
    assert.equal(createRes.data.success, true);
    assert.equal(createRes.data.data.rating, 5);
    assert.equal(createRes.data.data.isVerifiedPurchase, true);
    assert.equal(createRes.data.data.summary.averageRating, 5);
    assert.equal(createRes.data.data.summary.totalReviews, 1);
    assert.equal(createRes.data.data.summary.distribution['5'], 1);

    reviewId = createRes.data.data.id;
    console.log(`    ✓ Verified review created: ID ${reviewId} (Rating: 5★)`);

    // Verify Product document cached values were updated
    const updatedProd1 = await Product.findById(product1._id).lean();
    assert.equal(updatedProd1.averageRating, 5);
    assert.equal(updatedProd1.totalReviews, 1);
    console.log('    ✓ Product document averageRating and totalReviews updated atomically');

    // -------------------------------------------------------------------------
    // Scenario 7: Duplicate review prevention (HTTP 409 Conflict)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 7: Duplicate review prevention (HTTP 409 Conflict)...');
    const dupRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/reviews',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        productId: product1._id.toString(),
        orderId: orderDelivered._id.toString(),
        rating: 4,
        comment: 'Trying to submit a second review for the same order item',
      }
    );
    assert.equal(dupRes.statusCode, 409, `Expected 409, got ${dupRes.statusCode}`);
    console.log('    ✓ Duplicate review rejected with HTTP 409 Conflict');

    // -------------------------------------------------------------------------
    // Scenario 8: Review update rules (HTTP 200)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 8: Review update by customer (HTTP 200)...');
    const updateRes = await makeRequest(
      server,
      {
        method: 'PUT',
        path: `/api/v1/reviews/${reviewId}`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        rating: 4,
        title: 'Very Good Salmon Bento (Updated)',
        comment: 'Updating my review: broccoli was great, teriyaki sauce was a bit sweet.',
      }
    );
    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.data.data.rating, 4);
    assert.equal(updateRes.data.data.summary.averageRating, 4);
    assert.equal(updateRes.data.data.summary.distribution['4'], 1);
    assert.equal(updateRes.data.data.summary.distribution['5'], 0);
    console.log('    ✓ Review updated and product rating summary recalculated to 4★');

    // -------------------------------------------------------------------------
    // Scenario 9: Public review listing & privacy-safe customer name
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 9: Public review listing & privacy-safe name masking...');
    const publicReviewsRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/reviews/product/${product1.slug}`,
    });
    assert.equal(publicReviewsRes.statusCode, 200);
    assert.equal(publicReviewsRes.data.data.reviews.length, 1);
    const pubRev = publicReviewsRes.data.data.reviews[0];
    assert.equal(pubRev.authorName, 'Rohan S.', 'Customer name must be privacy-safe (e.g. Rohan S.)');
    assert.equal(pubRev.rating, 4);
    assert.equal(pubRev.isVerifiedPurchase, true);
    console.log(`    ✓ Public review masked name verified: "${pubRev.authorName}"`);

    // -------------------------------------------------------------------------
    // Scenario 10: Admin review moderation (Hide review)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 10: Admin moderation (Hide review)...');
    const hideRes = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/admin/reviews/${reviewId}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        status: 'HIDDEN',
        moderationNote: 'Hidden temporarily for editorial audit.',
      }
    );
    assert.equal(hideRes.statusCode, 200);
    assert.equal(hideRes.data.data.status, 'HIDDEN');
    assert.equal(hideRes.data.data.isApproved, false);

    // Verify hidden review is no longer in public feed
    const publicAfterHideRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/reviews/product/${product1._id}`,
    });
    assert.equal(publicAfterHideRes.data.data.reviews.length, 0);
    assert.equal(publicAfterHideRes.data.data.summary.totalReviews, 0);
    console.log('    ✓ Hidden review successfully excluded from public feed & rating calculation');

    // Re-approve review
    const approveRes = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/admin/reviews/${reviewId}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        status: 'APPROVED',
      }
    );
    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.data.data.status, 'APPROVED');
    console.log('    ✓ Review re-approved and live');

    // -------------------------------------------------------------------------
    // Scenario 11: Admin authorization protection (Non-admin rejected)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 11: Admin endpoint authorization check (HTTP 403)...');
    const adminForbiddenRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/admin/reviews',
      headers: {
        'X-CSRF-Token': authA.csrfToken,
        Cookie: cookieHeader(authA.cookies),
      },
    });
    assert.equal(adminForbiddenRes.statusCode, 403, `Expected 403, got ${adminForbiddenRes.statusCode}`);
    console.log('    ✓ Non-admin access to admin review endpoints rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // Scenario 12: Review deletion & aggregate recalculation
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 12: Admin review deletion & aggregate recalculation...');
    const deleteRes = await makeRequest(server, {
      method: 'DELETE',
      path: `/api/v1/admin/reviews/${reviewId}`,
      headers: {
        'X-CSRF-Token': authAdmin.csrfToken,
        Cookie: cookieHeader(authAdmin.cookies),
      },
    });
    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.data.data.productSummary.totalReviews, 0);
    assert.equal(deleteRes.data.data.productSummary.averageRating, 0);

    // Verify Product document cached ratings are reset to 0
    const prodAfterDelete = await Product.findById(product1._id).lean();
    assert.equal(prodAfterDelete.totalReviews, 0);
    assert.equal(prodAfterDelete.averageRating, 0);
    console.log('    ✓ Review deleted and Product rating aggregates safely recalculated to 0');

    console.log('\n===============================================================');
    console.log('  ALL 12 CUSTOMER REVIEW TEST SCENARIOS PASSED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } finally {
    // Cleanup
    await Review.deleteMany({
      _id: { $in: [reviewId].filter(Boolean) },
    });
    await Order.deleteMany({
      _id: { $in: [orderDelivered._id, orderUndelivered._id, orderCancelled._id] },
    });
    await Product.deleteMany({
      _id: { $in: [product1._id, product2._id] },
    });
    await Category.deleteMany({
      _id: { $in: [category._id] },
    });
    await User.deleteMany({
      _id: { $in: [customerA._id, customerB._id, adminStaff._id] },
    });

    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
    if (redis && typeof redis.quit === 'function') {
      try {
        await redis.quit();
      } catch {}
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
