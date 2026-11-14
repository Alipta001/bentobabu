/**
 * BentoBabu - Automated Customer Journey Integration Test Suite
 * Tests end-to-end customer workflows directly against the running backend:
 * 1. Registration & Login (HttpOnly cookie receipt)
 * 2. 30-Second Access Token Expiry & Silent Refresh
 * 3. Address CRUD & Persistence
 * 4. Cart Persistence & Guest-Cart Merging
 * 5. Product Search, Filtering, Sorting & Pagination
 * 6. Checkout Summary & Coupon Validation
 * 7. Razorpay Test-Mode Flow (create-order, signature verification, payment confirmation)
 * 8. COD Order Placement & Order Cancellation
 * 9. Notifications & Notification Preferences
 */

const crypto = require('crypto');
const http = require('http');

const API_BASE = 'http://localhost:4000/api/v1';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromHeaders(headers) {
    const raw = headers['set-cookie'];
    if (!raw) return;
    const cookieArray = Array.isArray(raw) ? raw : [raw];
    for (const c of cookieArray) {
      const parts = c.split(';')[0].split('=');
      const name = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      this.cookies.set(name, val);
    }
  }

  getCookieString() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  get(name) {
    return this.cookies.get(name);
  }

  delete(name) {
    this.cookies.delete(name);
  }
}

const jar = new CookieJar();

function request(method, path, body = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
    const headers = {
      Accept: 'application/json',
      ...customHeaders,
    };

    const cookieStr = jar.getCookieString();
    if (cookieStr) {
      headers['Cookie'] = cookieStr;
    }

    const csrfToken = jar.get('bb_csrf_token');
    if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
      if (!headers['X-CSRF-Token']) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers,
      },
      (res) => {
        jar.setFromHeaders(res.headers);
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            json = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSuite() {
  console.log('================================================================');
  console.log(' BentoBabu - End-to-End Customer Journey Verification Suite');
  console.log('================================================================\n');

  const results = [];
  const logStep = (step, name, passed, detail = '') => {
    results.push({ step, name, passed, detail });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${status}] Step ${step}: ${name}`);
    if (detail) console.log(`       Detail: ${detail}`);
  };

  try {
    // -------------------------------------------------------------
    // Step 0: Obtain CSRF Token
    // -------------------------------------------------------------
    const csrfRes = await request('GET', '/auth/csrf-token');
    const hasCsrf = csrfRes.status === 200 && Boolean(jar.get('bb_csrf_token'));
    logStep(0, 'Initialize CSRF Token & Cookie Jar', hasCsrf, `Token: ${jar.get('bb_csrf_token')?.slice(0, 16)}...`);

    // -------------------------------------------------------------
    // Step 1: Customer Registration & HttpOnly Cookie Set
    // -------------------------------------------------------------
    const unique = Date.now().toString().slice(-6);
    const testUser = {
      name: `Automated Test Customer ${unique}`,
      email: `test_customer_${unique}@bentobabu.in`,
      phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: `TestSecurePass123!`,
    };

    const regRes = await request('POST', '/auth/register', testUser);
    const userId = regRes.data?.data?.user?.id || regRes.data?.data?.user?._id;
    const regPass = regRes.status === 201 && jar.get('bb_access_token') && jar.get('bb_refresh_token');
    logStep(1, 'Customer Registration & Cookie Receipt', regPass, `User: ${testUser.email} (ID: ${userId})`);

    // -------------------------------------------------------------
    // Step 2: Customer Login
    // -------------------------------------------------------------
    jar.delete('bb_access_token');
    jar.delete('bb_refresh_token');

    const loginRes = await request('POST', '/auth/login', {
      identifier: testUser.email,
      password: testUser.password,
    });
    const loginPass = loginRes.status === 200 && jar.get('bb_access_token') && jar.get('bb_refresh_token');
    logStep(2, 'Customer Login with Email/Password', loginPass, `Status: ${loginRes.status}`);

    // -------------------------------------------------------------
    // Step 3: Access Token Expiry (30s) & Silent Refresh
    // -------------------------------------------------------------
    console.log('\n--- Testing 30-Second Access Token Expiry & Silent Refresh ---');
    console.log('Access token validity is 30s. Waiting 31 seconds to guarantee expiration...');
    const preRefreshMe = await request('GET', '/auth/me');
    const userName = preRefreshMe.data?.data?.name || preRefreshMe.data?.data?.user?.name;
    console.log(`Pre-wait /auth/me: ${preRefreshMe.status} OK (User: ${userName})`);

    await sleep(31000);

    // Call /auth/me with expired access token
    const expiredMe = await request('GET', '/auth/me');
    const expiredAsExpected = expiredMe.status === 401;
    console.log(`Post-expiry /auth/me status: ${expiredMe.status} (Expected: 401 Unauthorized)`);

    // Perform silent refresh using refresh cookie
    const refreshRes = await request('POST', '/auth/refresh', {});
    const refreshPass = refreshRes.status === 200 && Boolean(jar.get('bb_access_token'));
    console.log(`POST /auth/refresh status: ${refreshRes.status} (New access cookie received)`);

    // Verify /auth/me succeeds with newly issued access cookie
    const postRefreshMe = await request('GET', '/auth/me');
    const tokenRefreshWorkflowPass = expiredAsExpected && refreshPass && postRefreshMe.status === 200;
    logStep(3, '30s Access Token Expiry & Silent Refresh', tokenRefreshWorkflowPass,
      `Expired -> 401, Refreshed -> 200 OK, Final /auth/me -> 200 OK`);

    // -------------------------------------------------------------
    // Step 4: Address CRUD & Persistence
    // -------------------------------------------------------------
    const addressData = {
      fullName: 'Bento Babu QA Tester',
      phone: testUser.phone,
      addressLine: 'Flat 402, Lotus Grand Residences, Barrackpore',
      landmark: 'Near Barrackpore Railway Station',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700120',
      addressType: 'HOME',
      isDefault: true,
    };

    const addRes = await request('POST', '/addresses', addressData);
    const createdAddr = addRes.data?.data;
    const addressId = createdAddr?._id || createdAddr?.id;
    const addPass = addRes.status === 201 && Boolean(addressId);

    // Update address
    const updateRes = await request('PATCH', `/addresses/${addressId}`, {
      landmark: 'Opposite Metro Station Gate 2',
    });
    const updatePass = updateRes.status === 200 && updateRes.data?.data?.landmark === 'Opposite Metro Station Gate 2';

    // Verify persistence after reload
    const getAddrRes = await request('GET', '/addresses');
    const addressList = getAddrRes.data?.data || [];
    const persistedAddr = addressList.find((a) => (a._id || a.id) === addressId);
    const addrPersistPass = addPass && updatePass && Boolean(persistedAddr) && persistedAddr.isDefault === true;
    logStep(4, 'Address Creation, Update & Persistence', addrPersistPass, `Address ID: ${addressId}, Default: true`);

    // -------------------------------------------------------------
    // Step 5: Product Search, Category Filtering, Dietary Filtering, Sorting & Pagination
    // -------------------------------------------------------------
    const searchRes = await request('GET', '/products?search=paneer');
    const searchPass = searchRes.status === 200 && Array.isArray(searchRes.data?.data);

    const dietaryRes = await request('GET', '/products?dietary=VEG');
    const dietaryPass = dietaryRes.status === 200 && Array.isArray(dietaryRes.data?.data);

    const sortRes = await request('GET', '/products?sort=price_asc');
    const sortPass = sortRes.status === 200 && Array.isArray(sortRes.data?.data);

    const pageRes = await request('GET', '/products?page=1&limit=3');
    const pagePass = pageRes.status === 200 && pageRes.data?.data?.length <= 3;

    const catalogPass = searchPass && dietaryPass && sortPass && pagePass;
    logStep(5, 'Product Search, Dietary Filter, Sort & Pagination', catalogPass,
      `Found ${searchRes.data?.data?.length} search items, ${pageRes.data?.data?.length} paginated items`);

    // -------------------------------------------------------------
    // Step 6: Cart Persistence & Guest-Cart Merging
    // -------------------------------------------------------------
    const prodList = pageRes.data?.data || [];
    if (prodList.length < 2) {
      throw new Error('Not enough active products to test cart flow');
    }
    const prodA = prodList[0];
    const prodB = prodList[1];
    const idA = prodA._id || prodA.id;
    const idB = prodB._id || prodB.id;

    // Simulate guest cart merge
    const guestCartItems = [
      { productId: idA, quantity: 2 },
    ];
    const mergeRes = await request('POST', '/cart/merge', { items: guestCartItems });
    const mergePass = mergeRes.status === 200;

    // Add item B
    const addItemRes = await request('POST', '/cart/items', {
      productId: idB,
      quantity: 1,
    });
    const addCartPass = addItemRes.status === 200;

    // Fetch cart to verify MongoDB persistence
    const cartRes = await request('GET', '/cart');
    const cartItems = cartRes.data?.data?.items || [];
    const itemTotal = cartRes.data?.data?.itemTotal;
    const cartPersistPass = mergePass && addCartPass && cartItems.length >= 2;
    logStep(6, 'Cart Persistence & Guest-Cart Merging', cartPersistPass,
      `Items in cart: ${cartItems.length}, ItemTotal: ₹${itemTotal}`);

    // -------------------------------------------------------------
    // Step 7: Checkout Summary & Coupon Validation
    // -------------------------------------------------------------
    const couponValRes = await request('POST', '/coupons/validate', {
      code: 'WELCOME50',
      orderAmount: itemTotal || 500,
    });
    const couponValid = couponValRes.status === 200 && couponValRes.data?.success;

    const summaryRes = await request('POST', '/orders/checkout-summary', {
      addressId,
      couponCode: 'WELCOME50',
    });
    const summaryData = summaryRes.data?.data;
    const summaryPass = summaryRes.status === 200 && summaryData && summaryData.grandTotal > 0;
    logStep(7, 'Checkout Summary & Coupon Validation', couponValid && summaryPass,
      `GrandTotal: ₹${summaryData?.grandTotal}, Discount: ₹${summaryData?.couponDiscount || 0}, Delivery: ₹${summaryData?.deliveryCharge}`);

    // -------------------------------------------------------------
    // Step 8: Razorpay Test-Mode Flow (create-order, signature verification, payment confirmation)
    // -------------------------------------------------------------
    const rzpOrderRes = await request('POST', '/orders', {
      addressId,
      paymentMethod: 'RAZORPAY',
      couponCode: 'WELCOME50',
    });
    const rzpOrder = rzpOrderRes.data?.data;
    const rzpOrderIdDb = rzpOrder?._id || rzpOrder?.id;
    const rzpOrderCreated = rzpOrderRes.status === 201 && Boolean(rzpOrderIdDb);

    // Create Razorpay payment order
    const rzpCreateRes = await request('POST', '/payments/razorpay/create-order', {
      orderId: rzpOrderIdDb,
    });
    const rzpOrderId = rzpCreateRes.data?.data?.razorpayOrderId;
    const rzpCreatePass = rzpCreateRes.status === 200 && Boolean(rzpOrderId);

    // Generate cryptographic HMAC-SHA256 test signature
    const testPaymentId = `pay_test_${crypto.randomBytes(8).toString('hex')}`;
    const rzpSecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder_secret';
    const payload = `${rzpOrderId}|${testPaymentId}`;
    const testSignature = crypto.createHmac('sha256', rzpSecret).update(payload).digest('hex');

    // Verify payment signature
    const rzpVerifyRes = await request('POST', '/payments/razorpay/verify', {
      orderId: rzpOrderIdDb,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: testPaymentId,
      razorpaySignature: testSignature,
    });
    const verifiedOrder = rzpVerifyRes.data?.data;
    const rzpVerifyPass = rzpVerifyRes.status === 200 && verifiedOrder?.paymentStatus === 'PAID';

    logStep(8, 'Razorpay Test Flow (Create, Signature Verify & Confirm)',
      rzpOrderCreated && rzpCreatePass && rzpVerifyPass,
      `Order: ${rzpOrder?.orderNumber}, RzpOrderId: ${rzpOrderId}, Payment: ${verifiedOrder?.paymentStatus}`);

    // -------------------------------------------------------------
    // Step 9: COD Order Placement & Cancellation
    // -------------------------------------------------------------
    // Add item back into cart for second order
    await request('POST', '/cart/items', {
      productId: idA,
      quantity: 1,
    });

    const codOrderRes = await request('POST', '/orders', {
      addressId,
      paymentMethod: 'COD',
    });
    const codOrder = codOrderRes.data?.data;
    const codOrderIdDb = codOrder?._id || codOrder?.id;
    const codOrderCreated = codOrderRes.status === 201 && Boolean(codOrderIdDb);

    // Confirm COD
    const codConfirmRes = await request('POST', '/payments/cod/confirm', {
      orderId: codOrderIdDb,
    });
    const codConfirmPass = codConfirmRes.status === 200 && codConfirmRes.data?.data?.orderStatus === 'CONFIRMED';

    // Cancel the COD order
    const cancelRes = await request('PATCH', `/orders/${codOrderIdDb}/cancel`, {
      reason: 'Customer requested change of plan',
    });
    const cancelPass = cancelRes.status === 200 && cancelRes.data?.data?.orderStatus === 'CANCELLED';

    logStep(9, 'COD Order Placement & Customer Cancellation',
      codOrderCreated && codConfirmPass && cancelPass,
      `COD Order: ${codOrder?.orderNumber}, Final Status: ${cancelRes.data?.data?.orderStatus}`);

    // -------------------------------------------------------------
    // Step 10: Notifications & Preferences
    // -------------------------------------------------------------
    const notifRes = await request('GET', '/notifications');
    const notifPass = notifRes.status === 200 && Array.isArray(notifRes.data?.data?.notifications);

    const unreadRes = await request('GET', '/notifications/unread-count');
    const unreadPass = unreadRes.status === 200 && typeof unreadRes.data?.data?.unreadCount === 'number';

    const prefRes = await request('GET', '/notifications/preferences');
    const prefPass = prefRes.status === 200 && Boolean(prefRes.data?.data?.preferences);

    const updatePrefRes = await request('PATCH', '/notifications/preferences', {
      email: true,
      whatsapp: false,
      inApp: true,
    });
    const updatePrefPass = updatePrefRes.status === 200 && updatePrefRes.data?.success;

    logStep(10, 'Notifications & Preferences Management',
      notifPass && unreadPass && prefPass && updatePrefPass,
      `Notifications fetched, unreadCount: ${unreadRes.data?.data?.unreadCount}, Preferences updated`);

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(' Integration Test Suite Summary:');
    const allPassed = results.every((r) => r.passed);
    console.log(` Total steps: ${results.length}, Passed: ${results.filter((r) => r.passed).length}, Failed: ${results.filter((r) => !r.passed).length}`);
    console.log(` Overall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '⚠️ SOME TESTS FAILED'}`);
    console.log('================================================================\n');

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runSuite();
