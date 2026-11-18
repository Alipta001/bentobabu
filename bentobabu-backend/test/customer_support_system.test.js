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
  SupportTicket,
  SupportFaq,
  Notification,
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
  console.log('  BentoBabu — Customer Support System Verification Test Suite');
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

  // Setup test users
  const customerA = await User.create({
    name: 'Customer Support A',
    email: `custA_${uniqueSuffix}@bentobabu.test`,
    phone: `98761${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  const customerB = await User.create({
    name: 'Customer Support B',
    email: `custB_${uniqueSuffix}@bentobabu.test`,
    phone: `98762${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'CUSTOMER',
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });

  const adminStaff = await User.create({
    name: 'Admin Support Staff',
    email: `admin_${uniqueSuffix}@bentobabu.test`,
    phone: `98763${String(uniqueSuffix).slice(-5)}`,
    password: hashedPassword,
    role: 'ADMIN',
    isActive: true,
  });

  // Setup orders
  const sampleProductId = new mongoose.Types.ObjectId();
  const orderA = await Order.create({
    orderNumber: `ORD-TEST-${uniqueSuffix}-A`,
    user: customerA._id,
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    paymentMethod: 'RAZORPAY',
    itemTotal: 549,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 549,
    deliveryAddress: {
      fullName: 'Customer Support A',
      phone: '9876543210',
      addressLine: '123 Test St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    items: [
      {
        product: sampleProductId,
        productName: 'Avocado Bento Box',
        quantity: 1,
        unitPrice: 549,
        subtotal: 549,
      },
    ],
  });

  const orderB = await Order.create({
    orderNumber: `ORD-TEST-${uniqueSuffix}-B`,
    user: customerB._id,
    orderStatus: 'DELIVERED',
    paymentStatus: 'PAID',
    paymentMethod: 'RAZORPAY',
    itemTotal: 399,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 399,
    deliveryAddress: {
      fullName: 'Customer Support B',
      phone: '9876543211',
      addressLine: '456 Other St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400002',
    },
    items: [
      {
        product: sampleProductId,
        productName: 'Tofu Protein Bento',
        quantity: 1,
        unitPrice: 399,
        subtotal: 399,
      },
    ],
  });

  // Log in users
  const authA = await loginUser(server, customerA.email, testPassword);
  const authB = await loginUser(server, customerB.email, testPassword);
  const authAdmin = await loginUser(server, adminStaff.email, testPassword);

  let ticketAId = null;
  let ticketANumber = null;

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Customer creates a ticket
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 1: Customer creates a support ticket...');
    const createRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/support/tickets',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        subject: 'Missing avocado roll in my bento',
        category: 'MISSING_INCORRECT_ITEM',
        description: 'I received the lunch order today, but the avocado roll was missing.',
        orderId: orderA._id.toString(),
        attachments: [
          {
            url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            fileName: 'meal_photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 102400,
          },
        ],
      }
    );

    assert.equal(createRes.statusCode, 201, `Expected 201, got ${createRes.statusCode}`);
    assert.equal(createRes.data.success, true);
    assert.ok(createRes.data.data.ticketNumber.startsWith('TKT-'), 'Ticket number must start with TKT-');
    assert.equal(createRes.data.data.status, 'OPEN');
    assert.equal(createRes.data.data.category, 'MISSING_INCORRECT_ITEM');
    assert.equal(createRes.data.data.order, orderA._id.toString());
    assert.equal(createRes.data.data.attachments.length, 1);

    ticketAId = createRes.data.data.id;
    ticketANumber = createRes.data.data.ticketNumber;
    console.log(`    ✓ Ticket created: ${ticketANumber} (ID: ${ticketAId})`);

    // -------------------------------------------------------------------------
    // Scenario 2: Unauthenticated access rejection
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 2: Unauthenticated access rejection (HTTP 401)...');
    const unauthRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/support/tickets',
    });
    assert.equal(unauthRes.statusCode, 401, `Expected 401, got ${unauthRes.statusCode}`);
    console.log('    ✓ Unauthenticated request rejected with HTTP 401');

    // -------------------------------------------------------------------------
    // Scenario 3: Customer ticket ownership isolation (User B cannot access User A's ticket)
    // -------------------------------------------------------------------------
    console.log(">>> Scenario 3: Customer ownership isolation (User B cannot view User A's ticket)...");
    const forbiddenRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/support/tickets/${ticketAId}`,
      headers: {
        'X-CSRF-Token': authB.csrfToken,
        Cookie: cookieHeader(authB.cookies),
      },
    });
    assert.equal(forbiddenRes.statusCode, 403, `Expected 403, got ${forbiddenRes.statusCode}`);
    console.log('    ✓ Cross-user ticket access blocked with HTTP 403');

    // -------------------------------------------------------------------------
    // Scenario 4: Customer replies to open ticket
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 4: Customer replies to own ticket...');
    const custReplyRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/support/tickets/${ticketAId}/messages`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        message: 'Also, the chopsticks were missing from the package.',
      }
    );
    assert.equal(custReplyRes.statusCode, 200, `Expected 200, got ${custReplyRes.statusCode}`);
    assert.equal(custReplyRes.data.success, true);
    assert.equal(custReplyRes.data.data.newMessage.senderRole, 'CUSTOMER');
    console.log('    ✓ Customer reply appended successfully');

    // -------------------------------------------------------------------------
    // Scenario 5: Admin views and filters tickets
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 5: Admin views all tickets with search and filters...');
    const adminListRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/admin/support/tickets?search=${ticketANumber}&status=ALL`,
      headers: {
        'X-CSRF-Token': authAdmin.csrfToken,
        Cookie: cookieHeader(authAdmin.cookies),
      },
    });
    assert.equal(adminListRes.statusCode, 200);
    assert.equal(adminListRes.data.success, true);
    assert.ok(adminListRes.data.data.some((t) => t.ticketNumber === ticketANumber));
    console.log(`    ✓ Admin searched and located ticket ${ticketANumber}`);

    // -------------------------------------------------------------------------
    // Scenario 6: Admin replies to customer
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 6: Admin replies to customer (updates status to WAITING_FOR_CUSTOMER)...');
    const adminReplyRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/admin/support/tickets/${ticketAId}/messages`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        message: 'Dear Customer, we sincerely apologize! We are processing a refund for the missing item right away.',
        isInternalNote: false,
      }
    );
    assert.equal(adminReplyRes.statusCode, 200);
    assert.equal(adminReplyRes.data.data.status, 'WAITING_FOR_CUSTOMER');
    console.log('    ✓ Admin replied and ticket moved to WAITING_FOR_CUSTOMER');

    // -------------------------------------------------------------------------
    // Scenario 7: Admin adds internal team note (strictly private)
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 7: Admin adds private internal team note...');
    const internalNoteText = `INTERNAL AUDIT NOTE: Kitchen station #2 missed packing avocado rolls. Chef notified at ${Date.now()}.`;
    const internalNoteRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/admin/support/tickets/${ticketAId}/messages`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        message: internalNoteText,
        isInternalNote: true,
      }
    );
    assert.equal(internalNoteRes.statusCode, 200);
    assert.equal(internalNoteRes.data.data.newMessage.isInternalNote, true);

    // Verify Admin can see the internal note
    const adminDetailRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/admin/support/tickets/${ticketAId}`,
      headers: {
        'X-CSRF-Token': authAdmin.csrfToken,
        Cookie: cookieHeader(authAdmin.cookies),
      },
    });
    const adminMessages = adminDetailRes.data.data.messages;
    const adminFoundNote = adminMessages.find((m) => m.message.includes('Kitchen station #2'));
    assert.ok(adminFoundNote, 'Admin must see the internal note');
    assert.equal(adminFoundNote.isInternalNote, true);

    // CRITICAL SECURITY CHECK: Verify Customer CANNOT see the internal note
    const custDetailRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/v1/support/tickets/${ticketAId}`,
      headers: {
        'X-CSRF-Token': authA.csrfToken,
        Cookie: cookieHeader(authA.cookies),
      },
    });
    const custMessages = custDetailRes.data.data.messages;
    const custLeakedNote = custMessages.find((m) => m.message.includes('Kitchen station #2') || m.isInternalNote === true);
    assert.equal(custLeakedNote, undefined, 'CRITICAL SECURITY: Internal notes must NEVER be returned in customer API!');
    console.log('    ✓ Private team note saved: visible to admin, strictly sanitized/excluded from customer API');

    // -------------------------------------------------------------------------
    // Scenario 8: Admin updates status to RESOLVED and CLOSED
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 8: Admin updates status to RESOLVED and CLOSED...');
    const resolveRes = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/admin/support/tickets/${ticketAId}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        status: 'RESOLVED',
        resolutionNote: 'Refund issued via Razorpay, credited to customer account.',
      }
    );
    assert.equal(resolveRes.statusCode, 200);
    assert.equal(resolveRes.data.data.status, 'RESOLVED');
    assert.ok(resolveRes.data.data.resolvedAt, 'resolvedAt timestamp must be set');

    // Now close the ticket
    const closeRes = await makeRequest(
      server,
      {
        method: 'PATCH',
        path: `/api/v1/admin/support/tickets/${ticketAId}/status`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        status: 'CLOSED',
      }
    );
    assert.equal(closeRes.statusCode, 200);
    assert.equal(closeRes.data.data.status, 'CLOSED');
    assert.ok(closeRes.data.data.closedAt, 'closedAt timestamp must be set');

    // Verify Customer cannot reply to a CLOSED ticket
    const replyClosedRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: `/api/v1/support/tickets/${ticketAId}/messages`,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        message: 'Wait, I want to say something more.',
      }
    );
    assert.equal(replyClosedRes.statusCode, 400, `Expected 400, got ${replyClosedRes.statusCode}`);
    console.log('    ✓ Ticket resolved and closed; replies to closed tickets properly rejected');

    // -------------------------------------------------------------------------
    // Scenario 9: Related order authorization validation
    // -------------------------------------------------------------------------
    console.log(">>> Scenario 9: Order ownership validation (User A cannot link User B's order)...");
    const fraudOrderRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/support/tickets',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authA.csrfToken,
          Cookie: cookieHeader(authA.cookies),
        },
      },
      {
        subject: 'Fraud attempt linking foreign order',
        category: 'ORDER_ISSUE',
        description: 'Testing if I can link order B belonging to customer B.',
        orderId: orderB._id.toString(),
      }
    );
    assert.equal(fraudOrderRes.statusCode, 403, `Expected 403, got ${fraudOrderRes.statusCode}`);
    console.log('    ✓ Unowned order linking rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // Scenario 10: Customer notifications queued / generated
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 10: Customer notifications generated for support events...');
    const notifications = await Notification.find({
      user: customerA._id,
      eventType: {
        $in: [
          'SUPPORT_TICKET_CREATED',
          'SUPPORT_TICKET_REPLIED',
          'SUPPORT_TICKET_STATUS_UPDATED',
        ],
      },
    }).lean();

    assert.ok(notifications.length >= 2, `Expected at least 2 support notifications, got ${notifications.length}`);
    console.log(`    ✓ Verified ${notifications.length} support notifications recorded in DB`);

    // -------------------------------------------------------------------------
    // Scenario 11: FAQ CRUD and Public retrieval
    // -------------------------------------------------------------------------
    console.log('>>> Scenario 11: FAQ CRUD and Public retrieval...');
    // Public GET faqs
    const publicFaqRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/support/faqs',
    });
    assert.equal(publicFaqRes.statusCode, 200);
    assert.equal(publicFaqRes.data.success, true);
    assert.ok(Array.isArray(publicFaqRes.data.data));

    // Admin creates FAQ
    const newFaqRes = await makeRequest(
      server,
      {
        method: 'POST',
        path: '/api/v1/admin/support/faqs',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': authAdmin.csrfToken,
          Cookie: cookieHeader(authAdmin.cookies),
        },
      },
      {
        question: 'How do I cancel my subscription or meal plan?',
        answer: 'You can pause or cancel anytime from your Account dashboard before 8:00 AM on delivery day.',
        category: 'ORDERING',
        isPublished: true,
        orderIndex: 99,
      }
    );
    assert.equal(newFaqRes.statusCode, 201);
    const createdFaqId = newFaqRes.data.data.id;

    // Admin deletes FAQ
    const delFaqRes = await makeRequest(server, {
      method: 'DELETE',
      path: `/api/v1/admin/support/faqs/${createdFaqId}`,
      headers: {
        'X-CSRF-Token': authAdmin.csrfToken,
        Cookie: cookieHeader(authAdmin.cookies),
      },
    });
    assert.equal(delFaqRes.statusCode, 200);
    console.log('    ✓ FAQ CRUD and public listing verified');

    console.log('\n===============================================================');
    console.log('  ALL 11 CUSTOMER SUPPORT TEST SCENARIOS PASSED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } finally {
    // Cleanup test data
    await SupportTicket.deleteMany({
      _id: { $in: [ticketAId].filter(Boolean) },
    });
    await Order.deleteMany({
      _id: { $in: [orderA._id, orderB._id] },
    });
    await Notification.deleteMany({
      user: { $in: [customerA._id, customerB._id] },
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
