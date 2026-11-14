/**
 * BentoBabu — End-to-End Checkout Persistence & Address Selection Test Suite
 * Tests all requirements from Part 6:
 * - Cart tests (10 scenarios)
 * - Address tests (10 scenarios)
 * - Combined tests (8 scenarios)
 */

const assert = require('assert');
const mongoose = require('../../bentobabu-backend/node_modules/mongoose');
const { User, Product, Cart, Address } = require('../../bentobabu-backend/app/models');

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const MONGO_URI = 'mongodb+srv://bentobabuofficial_db_user:Kaz2rulo3erFzs7T@cluster0.rs108p2.mongodb.net/bentobabu?retryWrites=true&w=majority';

class LocalStorageMock {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get(key) {
    return this.getItem(key);
  }
  set(key, value) {
    this.setItem(key, value);
  }
  delete(key) {
    this.removeItem(key);
  }
}

class BrowserClient {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = null;
    this.refreshCallCount = 0;
    this.refreshPromise = null;
    this.localStorage = new LocalStorageMock();
  }

  updateCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const header of list) {
      const parts = header.split(';').map((s) => s.trim());
      const [nameVal] = parts;
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx === -1) continue;
      const name = nameVal.slice(0, eqIdx).trim();
      const value = nameVal.slice(eqIdx + 1).trim();

      const maxAgePart = parts.find((p) => p.toLowerCase().startsWith('max-age='));
      if (maxAgePart) {
        const maxAgeSec = parseInt(maxAgePart.split('=')[1], 10);
        if (maxAgeSec <= 0) {
          this.cookies.delete(name);
          continue;
        }
      }

      if (!value) {
        this.cookies.delete(name);
        continue;
      }
      this.cookies.set(name, value);
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join('; ');
  }

  async fetchCsrf() {
    const res = await fetch(`${API_BASE}/auth/csrf-token`, {
      headers: { Cookie: this.getCookieHeader() },
    });
    this.updateCookies(res.headers.getSetCookie());
    const body = await res.json();
    this.csrfToken = body.data.csrfToken;
    return this.csrfToken;
  }

  async singleFlightRefresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        this.refreshCallCount++;
        await this.fetchCsrf();
        const headers = {
          'Content-Type': 'application/json',
          Cookie: this.getCookieHeader(),
        };
        if (this.csrfToken) {
          headers['X-CSRF-Token'] = this.csrfToken;
        }
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        this.updateCookies(res.headers.getSetCookie());
        if (!res.ok) {
          const err = new Error(`Refresh failed with HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async request(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (isMutating && !options.skipCsrf) {
      if (!this.csrfToken) {
        await this.fetchCsrf();
      }
    }

    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    if (isMutating && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (isMutating && !headers['X-CSRF-Token'] && this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    headers.Cookie = this.getCookieHeader();

    let res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    this.updateCookies(res.headers.getSetCookie());

    // Single-flight transparent refresh simulation on 401
    if (res.status === 401 && !options._retry) {
      if (
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/register') ||
        endpoint.includes('/auth/refresh')
      ) {
        return res;
      }

      options._retry = true;
      try {
        await this.singleFlightRefresh();
        if (isMutating) {
          await this.fetchCsrf();
          if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
          }
        }
        headers.Cookie = this.getCookieHeader();
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
        });
        this.updateCookies(res.headers.getSetCookie());
      } catch (err) {
        return res;
      }
    }

    return res;
  }

  async clearCart() {
    this.localStorage.removeItem('bb_cart_state_v1');
    return this.request('/cart', { method: 'DELETE' });
  }

  async addToCart(product, quantity) {
    const res = await this.request('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId: (product._id || product.id).toString(), quantity }),
    });

    // Update local storage simulation
    let currentItems = [];
    const stored = this.localStorage.getItem('bb_cart_state_v1');
    if (stored) {
      try { currentItems = JSON.parse(stored).items || []; } catch {}
    }
    const existing = currentItems.find(
      (it) => (it.product.id || it.product._id).toString() === (product._id || product.id).toString()
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      currentItems.push({
        product: {
          id: (product._id || product.id).toString(),
          name: product.name,
          price: product.price,
        },
        quantity,
      });
    }
    this.localStorage.setItem('bb_cart_state_v1', JSON.stringify({ items: currentItems }));
    return res;
  }

  // Frontend checkout initialization sequence
  async runCheckoutInitialization() {
    // 1. Initialize Auth
    const meRes = await this.request('/auth/me');
    if (!meRes.ok) {
      throw new Error(`Auth initialization failed: HTTP ${meRes.status}`);
    }
    const meData = await meRes.json();
    const user = meData.data.user;

    // 2. Fetch server cart and merge with local cart items if any exist
    let localCart = [];
    try {
      const stored = this.localStorage.getItem('bb_cart_state_v1');
      if (stored) localCart = JSON.parse(stored).items || [];
    } catch {}

    let cartResponse;
    if (localCart.length > 0) {
      const mergeRes = await this.request('/cart/merge', {
        method: 'POST',
        body: JSON.stringify({
          items: localCart.map((i) => ({
            productId: i.product.id || i.product._id,
            quantity: i.quantity,
          })),
        }),
      });
      cartResponse = await mergeRes.json();
    } else {
      const getCartRes = await this.request('/cart');
      cartResponse = await getCartRes.json();
    }

    const hydratedCart = cartResponse.data?.items || [];
    this.localStorage.setItem(
      'bb_cart_state_v1',
      JSON.stringify({ items: hydratedCart })
    );

    // 3. Fetch saved addresses
    const addrRes = await this.request('/addresses');
    const addrData = await addrRes.json();
    const savedAddresses = addrData.data || [];

    // 4. Restore selected address preference
    const storedAddressId = this.localStorage.getItem('bb_selected_address_id') || '';
    let selectedAddressId = '';

    if (savedAddresses.length > 0) {
      const matched = savedAddresses.find(
        (a) => a.id === storedAddressId || a._id === storedAddressId
      );
      if (matched) {
        selectedAddressId = matched.id || matched._id;
      } else {
        const fallback = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
        selectedAddressId = fallback.id || fallback._id;
      }
      this.localStorage.setItem('bb_selected_address_id', selectedAddressId);
    } else {
      this.localStorage.removeItem('bb_selected_address_id');
    }

    // 5. If cart has items and address is selected, request authoritative checkout summary
    let summary = null;
    if (hydratedCart.length > 0 && selectedAddressId) {
      const summaryRes = await this.request('/orders/checkout-summary', {
        method: 'POST',
        body: JSON.stringify({ addressId: selectedAddressId }),
      });
      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        summary = sumData.data?.summary || sumData.data;
      } else {
        const errJson = await summaryRes.json();
        throw new Error(`Checkout summary failed: ${errJson.message}`);
      }
    }

    return {
      user,
      cart: hydratedCart,
      addresses: savedAddresses,
      selectedAddressId,
      summary,
    };
  }
}

async function runAllTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  console.log('====================================================');
  console.log('       BENTOBABU CHECKOUT PERSISTENCE SUITE         ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.stack || err.message}\n`);
      process.exitCode = 1;
    }
  }

  // Fetch available products from DB
  const products = await Product.find({ isActive: true, isAvailable: true }).limit(3);
  assert(products.length >= 2, 'Need at least 2 active products in DB');
  const p1 = products[0];
  const p2 = products[1];

  const client = new BrowserClient();
  let customerUser = null;

  // ----------------------------------------------------
  // SECTION 1: CART TESTS (10 Tests)
  // ----------------------------------------------------
  console.log('--- SECTION 1: CART PERSISTENCE TESTS ---');

  await test('1. Log in as a customer', async () => {
    const res = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@bentobabu.in',
        password: 'CustomerPassword@123',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    customerUser = body.data.user;
    assert.ok(customerUser && customerUser.id);
  });

  await test('2. Add two different products to the cart', async () => {
    await client.clearCart();
    const res1 = await client.addToCart(p1, 2);
    assert.strictEqual(res1.status, 200);

    const res2 = await client.addToCart(p2, 1);
    assert.strictEqual(res2.status, 200);
  });

  await test('3. Verify both products appear in MongoDB', async () => {
    const cartInDb = await Cart.findOne({ user: customerUser.id });
    assert.ok(cartInDb, 'Cart record must exist in MongoDB');
    assert.strictEqual(cartInDb.items.length, 2, 'Must contain 2 products in DB');

    const item1 = cartInDb.items.find((i) => i.product.toString() === p1._id.toString());
    const item2 = cartInDb.items.find((i) => i.product.toString() === p2._id.toString());
    assert.ok(item1, 'Product 1 must be in MongoDB Cart');
    assert.strictEqual(item1.quantity, 2);
    assert.ok(item2, 'Product 2 must be in MongoDB Cart');
    assert.strictEqual(item2.quantity, 1);
  });

  let savedAddr = null;
  await test('4. Open checkout', async () => {
    // Ensure customer has at least one address for checkout summary
    const addrs = await Address.find({ user: customerUser.id });
    if (addrs.length === 0) {
      savedAddr = await Address.create({
        user: customerUser.id,
        fullName: 'Customer Test',
        phone: '9876543210',
        addressLine: '12 River Road',
        houseNo: '12',
        street: 'River Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
        isDefault: true,
      });
    } else {
      savedAddr = addrs[0];
    }
    client.localStorage.setItem('bb_selected_address_id', savedAddr._id.toString());

    const result = await client.runCheckoutInitialization();
    assert.ok(result.cart.length === 2, 'Checkout cart must have 2 items');
    assert.ok(result.selectedAddressId, 'Address must be selected');
    assert.ok(result.summary, 'Summary must be returned');
  });

  await test('5. Verify checkout summary shows correct products and totals', async () => {
    const summaryRes = await client.request('/orders/checkout-summary', {
      method: 'POST',
      body: JSON.stringify({ addressId: savedAddr._id.toString() }),
    });
    assert.strictEqual(summaryRes.status, 200);
    const body = await summaryRes.json();
    const summary = body.data.summary || body.data;

    const expectedItemTotal = p1.price * 2 + p2.price * 1;
    assert.strictEqual(summary.itemTotal, expectedItemTotal, `Item total must equal ${expectedItemTotal}`);
    assert.ok(summary.grandTotal >= summary.itemTotal);
  });

  await test('6. Reload checkout', async () => {
    // Reload checkout: runs initialization sequence anew
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.cart.length, 2, 'Both items must be restored');
    assert.ok(result.summary, 'Summary must load after reload');
  });

  await test('7. Verify both products remain', async () => {
    const cartRes = await client.request('/cart');
    const body = await cartRes.json();
    const items = body.data.items;
    assert.strictEqual(items.length, 2);
    assert.ok(items.some((i) => i.product.id === p1._id.toString() && i.quantity === 2));
    assert.ok(items.some((i) => i.product.id === p2._id.toString() && i.quantity === 1));
  });

  await test('8. Verify checkout summary is recalculated correctly', async () => {
    const summaryRes = await client.request('/orders/checkout-summary', {
      method: 'POST',
      body: JSON.stringify({ addressId: savedAddr._id.toString() }),
    });
    assert.strictEqual(summaryRes.status, 200);
    const body = await summaryRes.json();
    const summary = body.data.summary || body.data;
    const expected = p1.price * 2 + p2.price * 1;
    assert.strictEqual(summary.itemTotal, expected);
  });

  await test('9. Navigate away and return to checkout', async () => {
    // Simulate navigating to /menu (fetching products)
    const menuRes = await client.request('/products');
    assert.strictEqual(menuRes.status, 200);

    // Return to checkout
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.cart.length, 2);
    assert.ok(result.summary);
  });

  await test('10. Verify cart contents remain unchanged', async () => {
    const cartInDb = await Cart.findOne({ user: customerUser.id });
    assert.strictEqual(cartInDb.items.length, 2);
  });

  // ----------------------------------------------------
  // SECTION 2: ADDRESS TESTS (10 Tests)
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: SAVED ADDRESS PERSISTENCE TESTS ---');

  let addr1 = null;
  let addr2 = null;

  await test('1. Open checkout', async () => {
    // Clean addresses for test
    await Address.deleteMany({ user: customerUser.id });
    client.localStorage.removeItem('bb_selected_address_id');

    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.addresses.length, 0);
    assert.strictEqual(result.selectedAddressId, '');
  });

  await test('2. Save two different addresses', async () => {
    const res1 = await client.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Customer Home',
        phone: '9876543210',
        addressLine: 'Flat 101, Green View, SN Banerjee Road',
        houseNo: 'Flat 101',
        street: 'SN Banerjee Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
        isDefault: true,
      }),
    });
    assert.strictEqual(res1.status, 201);
    const b1 = await res1.json();
    addr1 = b1.data.address || b1.data;

    const res2 = await client.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Customer Office',
        phone: '9876543211',
        addressLine: 'Suite 4B, Tech Park, Station Road',
        houseNo: 'Suite 4B',
        street: 'Station Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'WORK',
        isDefault: false,
      }),
    });
    assert.strictEqual(res2.status, 201);
    const b2 = await res2.json();
    addr2 = b2.data.address || b2.data;

    assert.ok(addr1._id || addr1.id);
    assert.ok(addr2._id || addr2.id);
  });

  await test('3. Select the second address', async () => {
    const id2 = (addr2._id || addr2.id).toString();
    client.localStorage.setItem('bb_selected_address_id', id2);
    assert.strictEqual(client.localStorage.getItem('bb_selected_address_id'), id2);
  });

  await test('4. Reload checkout', async () => {
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.addresses.length, 2);
  });

  await test('5. Verify both saved addresses are displayed', async () => {
    const res = await client.request('/addresses');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const list = body.data || [];
    assert.strictEqual(list.length, 2);
  });

  await test('6. Verify the previously selected address is restored', async () => {
    const result = await client.runCheckoutInitialization();
    const id2 = (addr2._id || addr2.id).toString();
    assert.strictEqual(result.selectedAddressId, id2, 'Selected address must be restored to second address');
  });

  await test('7. Change the selected address', async () => {
    const id1 = (addr1._id || addr1.id).toString();
    client.localStorage.setItem('bb_selected_address_id', id1);
  });

  await test('8. Reload again and verify the new selection is restored', async () => {
    const result = await client.runCheckoutInitialization();
    const id1 = (addr1._id || addr1.id).toString();
    assert.strictEqual(result.selectedAddressId, id1, 'Selected address must be restored to first address');
  });

  await test('9. Set a default address and verify fallback behavior', async () => {
    // Clear stored preference to trigger fallback
    client.localStorage.removeItem('bb_selected_address_id');
    const result = await client.runCheckoutInitialization();
    const id1 = (addr1._id || addr1.id).toString();
    assert.strictEqual(result.selectedAddressId, id1, 'Fallback must select default address (addr1)');
  });

  await test('10. Delete the selected address and verify a valid fallback is selected', async () => {
    const id1 = (addr1._id || addr1.id).toString();
    const id2 = (addr2._id || addr2.id).toString();

    // Set preference to addr1
    client.localStorage.setItem('bb_selected_address_id', id1);

    // Delete addr1 via API
    const delRes = await client.request(`/addresses/${id1}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);

    // Reload checkout: addr1 no longer exists, should fall back to addr2
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.addresses.length, 1);
    assert.strictEqual(result.selectedAddressId, id2, 'Must fall back to addr2');
  });

  // ----------------------------------------------------
  // SECTION 3: COMBINED TESTS (8 Tests)
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: COMBINED PERSISTENCE & REFRESH TESTS ---');

  await test('1. Add products to cart', async () => {
    await client.clearCart();
    await client.addToCart(p1, 1);
    await client.addToCart(p2, 2);

    const cartRes = await client.request('/cart');
    const body = await cartRes.json();
    assert.strictEqual(body.data.items.length, 2);
  });

  await test('2. Save an address', async () => {
    const res = await client.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Bento Customer',
        phone: '9876543215',
        addressLine: '44 Riverside Promenade',
        houseNo: '44',
        street: 'Riverside Promenade',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
        addressType: 'HOME',
        isDefault: true,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    savedAddr = body.data.address || body.data;
  });

  await test('3. Select the address', async () => {
    const id = (savedAddr._id || savedAddr.id).toString();
    client.localStorage.setItem('bb_selected_address_id', id);
    assert.strictEqual(client.localStorage.getItem('bb_selected_address_id'), id);
  });

  await test('4. Reload the checkout page', async () => {
    const result = await client.runCheckoutInitialization();
    assert.ok(result);
  });

  await test('5. Verify cart, address list, selected address, and checkout summary are all restored', async () => {
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.cart.length, 2, 'Cart must have 2 items');
    assert.ok(result.addresses.length >= 1, 'Address list must have items');
    const id = (savedAddr._id || savedAddr.id).toString();
    assert.strictEqual(result.selectedAddressId, id, 'Selected address must match savedAddr');
    assert.ok(result.summary, 'Checkout summary must be computed');
    const expected = p1.price * 1 + p2.price * 2;
    assert.strictEqual(result.summary.itemTotal, expected, `Summary item total must equal ${expected}`);
  });

  await test('6. Wait for the 30-second access token to expire (32 seconds)...', async () => {
    console.log('      Sleeping 32s for 30-second access token expiry...');
    await new Promise((r) => setTimeout(r, 32000));
    console.log('      Access token expired.');
  });

  await test('7. Reload checkout', async () => {
    const refreshCountBefore = client.refreshCallCount;
    const result = await client.runCheckoutInitialization();
    assert.ok(result.summary, 'Checkout must initialize successfully');
    assert.ok(client.refreshCallCount > refreshCountBefore, 'Silent refresh must have been triggered');
  });

  await test('8. Verify silent refresh works and all checkout data loads successfully', async () => {
    const result = await client.runCheckoutInitialization();
    assert.strictEqual(result.cart.length, 2);
    assert.ok(result.selectedAddressId);
    assert.ok(result.summary);
    assert.strictEqual(result.summary.itemTotal, p1.price * 1 + p2.price * 2);
  });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(passed === total ? 0 : 1);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
