/**
 * Unit tests for BentoBabu analytics helpers (consent, URL/search sanitization,
 * purchase revenue reconciliation, eligibility, and deduplication).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// Transpile lib/analytics.ts in-memory to test pure logic without modifying project config
const analyticsTsPath = path.resolve(__dirname, "../lib/analytics.ts");
const source = fs.readFileSync(analyticsTsPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});

const mod = { exports: {} };
const fn = new Function("exports", "require", "module", "__filename", "__dirname", compiled.outputText);
fn(mod.exports, require, mod, analyticsTsPath, path.dirname(analyticsTsPath));
const analytics = mod.exports;

function createMockWindow() {
  const storage = new Map();
  const listeners = new Map();
  const dataLayer = [];
  const win = {
    location: { origin: "https://www.bentobabu.com" },
    dataLayer,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    dispatchEvent: (ev) => {
      const list = listeners.get(ev.type) || [];
      for (const cb of list) cb(ev);
    },
    addEventListener: (type, cb) => {
      const list = listeners.get(type) || [];
      list.push(cb);
      listeners.set(type, list);
    },
    removeEventListener: (type, cb) => {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((item) => item !== cb));
    },
  };
  return { win, storage, dataLayer };
}

function run() {
  console.log("\n=== BentoBabu Analytics Unit Tests ===");

  // 1. Environment gating & GTM ID validation
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "false";
  assert.strictEqual(analytics.isAnalyticsEnabled(), false);
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";
  process.env.NEXT_PUBLIC_REQUIRE_ANALYTICS_CONSENT = "true";
  assert.strictEqual(analytics.isAnalyticsEnabled(), true);

  assert.strictEqual(analytics.validateGtmId("GTM-ABC123"), "GTM-ABC123");
  assert.strictEqual(analytics.validateGtmId("  GTM-XYZ987  "), "GTM-XYZ987");
  assert.strictEqual(analytics.validateGtmId("G-123456"), "");
  assert.strictEqual(analytics.validateGtmId("gtm-abc123"), "");
  assert.strictEqual(analytics.validateGtmId("GTM-123!"), "");
  assert.strictEqual(analytics.validateGtmId(""), "");
  assert.strictEqual(analytics.validateGtmId(undefined), "");

  delete process.env.NEXT_PUBLIC_GTM_ID;
  assert.strictEqual(analytics.getGtmId(), "");
  process.env.NEXT_PUBLIC_GTM_ID = "  GTM-STAGE01 ";
  assert.strictEqual(analytics.getGtmId(), "GTM-STAGE01");

  // 2. Consent defaults to unset -> hasAnalyticsConsent() is false
  const { win, dataLayer } = createMockWindow();
  global.window = win;
  global.document = { title: "BentoBabu" };
  global.CustomEvent = class CustomEvent {
    constructor(type, opts) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };

  // 2. Automatic analytics enabled when master gate is true (no consent banner required)
  assert.strictEqual(analytics.requiresAnalyticsConsent(), false);
  assert.strictEqual(analytics.getAnalyticsConsent(), "granted");
  assert.strictEqual(analytics.hasAnalyticsConsent(), true);

  // 3. Automatic view_item & page_view deduplication across rerenders
  let viewedProductRef = null;
  const sampleProd = { id: "p_mid", name: "Mid-Page Bowl", price: 250 };
  const runViewItemEffect = () => {
    if (!analytics.hasAnalyticsConsent()) return;
    if (viewedProductRef === sampleProd.id) return;
    viewedProductRef = sampleProd.id;
    analytics.trackViewItem(sampleProd);
  };

  runViewItemEffect();
  runViewItemEffect();
  assert.strictEqual(viewedProductRef, "p_mid");
  assert.strictEqual(
    dataLayer.filter((d) => d && d.event === "view_item").length,
    1,
    "view_item must fire once across rerenders"
  );

  // Page view deduplication across rerenders
  let lastPageRef = null;
  const runPageEffect = (p) => {
    if (!analytics.hasAnalyticsConsent() || lastPageRef === p) return;
    lastPageRef = p;
    analytics.trackPageView(p);
  };
  runPageEffect("/menu");
  runPageEffect("/menu");
  assert.strictEqual(dataLayer.filter((d) => d && d.event === "page_view").length, 1);

  analytics.trackSearch("millet bowl");
  assert.ok(dataLayer.some((d) => d && d.event === "search" && d.search_term === "millet bowl"));

  // 4. Master gate disabled blocks all events immediately
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "false";
  assert.strictEqual(analytics.hasAnalyticsConsent(), false);
  const lenWhenDisabled = dataLayer.length;
  analytics.trackSearch("while disabled");
  analytics.trackAddToCart(sampleProd, 1);
  analytics.trackPageView("/cart");
  assert.strictEqual(dataLayer.length, lenWhenDisabled);
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";

  // 5. URL & Search PII sanitization
  assert.strictEqual(
    analytics.sanitizeUrlPath("/menu", new URLSearchParams("category=bowls&token=secret123&search=abc@test.com&page=2")),
    "/menu?category=bowls&page=2"
  );
  assert.strictEqual(analytics.sanitizeSearchTerm("user@example.com"), "[redacted]");
  assert.strictEqual(analytics.sanitizeSearchTerm("9876543210"), "[redacted]");
  assert.strictEqual(analytics.sanitizeSearchTerm("700120"), "[redacted]");
  assert.strictEqual(analytics.sanitizeSearchTerm("Paneer Bowl"), "Paneer Bowl");

  // 6. Order eligibility & purchase value reconciliation + deduplication
  analytics.setAnalyticsConsent("granted");
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "ord_pending",
      orderStatus: "PENDING",
      paymentStatus: "PENDING",
      paymentMethod: "RAZORPAY",
    }),
    false
  );
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "ord_cancelled",
      orderStatus: "CANCELLED",
      paymentStatus: "REFUNDED",
      paymentMethod: "RAZORPAY",
    }),
    false
  );

  const codOrder = {
    id: "ord_cod_1",
    orderNumber: "BB-COD-1001",
    orderStatus: "CONFIRMED",
    paymentStatus: "COD_PENDING",
    paymentMethod: "COD",
    itemTotal: 499.98,
    couponDiscount: 50,
    deliveryCharge: 30,
    taxAmount: 0,
    grandTotal: 479.98,
    items: [
      { productId: "p1", productName: "Bowl A", unitPrice: 249.99, quantity: 2, variantName: "Regular" },
    ],
  };

  const trackedFirst = analytics.trackPurchaseFromOrder(codOrder, "SAVE50");
  assert.strictEqual(trackedFirst, true);
  const purchasePush = dataLayer.find((d) => d && d.event === "purchase");
  assert.ok(purchasePush);
  assert.strictEqual(purchasePush.ecommerce.transaction_id, "BB-COD-1001");
  assert.strictEqual(purchasePush.ecommerce.value, 449.98);
  assert.strictEqual(purchasePush.ecommerce.shipping, 30);
  assert.strictEqual(purchasePush.ecommerce.tax, 0);
  assert.strictEqual(purchasePush.ecommerce.coupon, "SAVE50");
  assert.strictEqual(purchasePush.ecommerce.items[0].price, 224.99);
  assert.strictEqual(purchasePush.ecommerce.items[0].discount, 25);

  // 6b. No coupon & shipping/tax excluded from item revenue
  const noCouponPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_no_coupon",
    orderNumber: "BB-NC-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    itemTotal: 300,
    couponDiscount: 0,
    deliveryCharge: 40,
    taxAmount: 15,
    grandTotal: 355,
    items: [{ productId: "p1", productName: "Bowl A", unitPrice: 150, quantity: 2 }],
  });
  assert.strictEqual(noCouponPayload.value, 300);
  assert.strictEqual(noCouponPayload.shipping, 40);
  assert.strictEqual(noCouponPayload.tax, 15);
  assert.strictEqual(noCouponPayload.items[0].price, 150);
  assert.strictEqual(noCouponPayload.items[0].discount, undefined);

  // 6c. Multiple products with different prices & proportional coupon allocation
  const multiPayload = analytics.buildPurchaseEcommercePayload(
    {
      id: "ord_multi",
      orderNumber: "BB-MULTI-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
      itemTotal: 450,
      couponDiscount: 45,
      deliveryCharge: 25,
      taxAmount: 10,
      grandTotal: 440,
      items: [
        { productId: "p1", productName: "Meal 300", unitPrice: 300, quantity: 1 },
        { productId: "p2", productName: "Meal 150", unitPrice: 150, quantity: 1 },
      ],
    },
    "TENOFF"
  );
  assert.strictEqual(multiPayload.value, 405);
  assert.strictEqual(multiPayload.shipping, 25);
  assert.strictEqual(multiPayload.tax, 10);
  assert.strictEqual(multiPayload.items[0].price, 270);
  assert.strictEqual(multiPayload.items[0].discount, 30);
  assert.strictEqual(multiPayload.items[1].price, 135);
  assert.strictEqual(multiPayload.items[1].discount, 15);

  // 6d. Coupon discount allocation and paise rounding (10 INR across 3 units of 100 INR)
  const roundingPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_round",
    orderNumber: "BB-RND-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "COD_PENDING",
    paymentMethod: "COD",
    itemTotal: 300,
    couponDiscount: 10,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 290,
    items: [{ productId: "p1", productName: "Bowl 100", unitPrice: 100, quantity: 3 }],
  });
  const sumFromItemsPaise = roundingPayload.items.reduce(
    (sum, it) => sum + Math.round(it.price * 100) * it.quantity,
    0
  );
  assert.strictEqual(roundingPayload.value, 290);
  assert.strictEqual(sumFromItemsPaise, 29000);

  // Refresh / revisit deduplication
  const trackedSecond = analytics.trackPurchaseFromOrder(codOrder, "SAVE50");
  assert.strictEqual(trackedSecond, false);

  // 7. Unavailable localStorage never throws
  win.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  win.localStorage.getItem = () => {
    throw new Error("SecurityError");
  };
  assert.strictEqual(analytics.hasTrackedPurchase("ord_cod_1"), true); // memory fallback works

  // 8. Consent Mode initialization order & fail-closed scenarios
  const toCmdList = (dl) =>
    dl.map((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && "0" in entry) {
        return Array.from(entry);
      }
      return entry;
    });

  // 8a. Fresh visit with analytics enabled -> automatically queues default denied FIRST, analytics granted SECOND, then events
  const firstVisit = createMockWindow();
  global.window = firstVisit.win;
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";
  const canTrackFirst = analytics.ensureConsentModeInitialized();
  assert.strictEqual(canTrackFirst, true);
  assert.strictEqual(analytics.isConsentModeInitialized(), true);
  assert.strictEqual(analytics.hasAnalyticsConsent(), true);
  // Calling again must not duplicate consent default/update
  assert.strictEqual(analytics.ensureConsentModeInitialized(), true);
  analytics.trackPageView("/menu");
  const firstCmds = toCmdList(firstVisit.dataLayer);
  assert.strictEqual(firstCmds.length, 3);
  assert.strictEqual(firstCmds[0][0], "consent");
  assert.strictEqual(firstCmds[0][1], "default");
  assert.deepStrictEqual(firstCmds[0][2], {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
  assert.strictEqual(firstCmds[1][0], "consent");
  assert.strictEqual(firstCmds[1][1], "update");
  assert.deepStrictEqual(firstCmds[1][2], {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.strictEqual(firstCmds[2].event, "page_view");

  // 8g. Initialization failure leaves window uninitialized & blocks consent grant update and events
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";
  process.env.NEXT_PUBLIC_REQUIRE_ANALYTICS_CONSENT = "true";

  // Case 1: window.gtag throws during default consent initialization
  const failingGtagWin = createMockWindow();
  failingGtagWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  failingGtagWin.win.gtag = () => {
    throw new Error("gtag failed");
  };
  global.window = failingGtagWin.win;
  assert.strictEqual(analytics.initDefaultConsentMode(), false);
  assert.strictEqual(analytics.isConsentModeInitialized(), false);
  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  assert.strictEqual(analytics.isConsentModeInitialized(), false);
  analytics.trackPageView("/menu");
  analytics.trackAddToCart(sampleProd, 1);
  assert.strictEqual(failingGtagWin.dataLayer.length, 0);

  // Case 2: window.dataLayer is non-writable / missing push
  const failingDataLayerWin = createMockWindow();
  failingDataLayerWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  failingDataLayerWin.win.dataLayer = { push: "not-a-function" };
  global.window = failingDataLayerWin.win;
  assert.strictEqual(analytics.initDefaultConsentMode(), false);
  assert.strictEqual(analytics.isConsentModeInitialized(), false);
  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  analytics.trackSearch("blocked on init failure");

  // Case 3: Recovery after transient gtag failure
  const recoveryWin = createMockWindow();
  recoveryWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  recoveryWin.win.gtag = () => {
    throw new Error("transient gtag failure");
  };
  global.window = recoveryWin.win;
  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  assert.strictEqual(analytics.isConsentModeInitialized(), false);
  analytics.trackPageView("/menu");
  assert.strictEqual(recoveryWin.dataLayer.length, 0);

  delete recoveryWin.win.gtag;
  assert.strictEqual(analytics.ensureConsentModeInitialized(), true);
  assert.strictEqual(analytics.isConsentModeInitialized(), true);
  analytics.trackPageView("/menu");
  const recoveryCmds = toCmdList(recoveryWin.dataLayer);
  assert.strictEqual(recoveryCmds.length, 3);
  assert.strictEqual(recoveryCmds[0][0], "consent");
  assert.strictEqual(recoveryCmds[0][1], "default");
  assert.strictEqual(recoveryCmds[0][2].analytics_storage, "denied");
  assert.strictEqual(recoveryCmds[1][0], "consent");
  assert.strictEqual(recoveryCmds[1][1], "update");
  assert.strictEqual(recoveryCmds[1][2].analytics_storage, "granted");
  assert.strictEqual(recoveryCmds[2].event, "page_view");

  // Case 4: gtag accepts default denied but throws on granted update -> retry queues only missing update without duplicate default
  const updateFailWin = createMockWindow();
  updateFailWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  let shouldFailGrantUpdate = true;
  updateFailWin.win.gtag = function (cmd, action, payload) {
    if (cmd === "consent" && action === "update" && shouldFailGrantUpdate) {
      throw new Error("transient consent update failure");
    }
    updateFailWin.dataLayer.push([cmd, action, payload]);
  };
  global.window = updateFailWin.win;

  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  // GTM eligibility (isConsentModeInitialized() && hasAnalyticsConsent()) must remain false
  assert.strictEqual(analytics.isConsentModeInitialized(), false);
  assert.strictEqual(analytics.isConsentModeInitialized() && analytics.hasAnalyticsConsent(), false);
  analytics.trackPageView("/menu");
  assert.strictEqual(updateFailWin.dataLayer.length, 1);

  // Now allow update to succeed and retry
  shouldFailGrantUpdate = false;
  assert.strictEqual(analytics.ensureConsentModeInitialized(), true);
  assert.strictEqual(analytics.isConsentModeInitialized(), true);
  assert.strictEqual(analytics.isConsentModeInitialized() && analytics.hasAnalyticsConsent(), true);
  analytics.trackPageView("/menu");

  const updateRetryCmds = toCmdList(updateFailWin.dataLayer);
  assert.strictEqual(updateRetryCmds.length, 3);
  assert.strictEqual(updateRetryCmds[0][0], "consent");
  assert.strictEqual(updateRetryCmds[0][1], "default");
  assert.strictEqual(updateRetryCmds[0][2].analytics_storage, "denied");
  assert.strictEqual(updateRetryCmds[1][0], "consent");
  assert.strictEqual(updateRetryCmds[1][1], "update");
  assert.strictEqual(updateRetryCmds[1][2].analytics_storage, "granted");
  assert.strictEqual(updateRetryCmds[2].event, "page_view");

  // Case 5: Lifecycle retry recovers automatic initialization without duplicating default denied
  const lifecycleWin = createMockWindow();
  let failLifecycleUpdate = true;
  lifecycleWin.win.gtag = function (cmd, action, payload) {
    if (cmd === "consent" && action === "update" && failLifecycleUpdate) {
      throw new Error("transient lifecycle update failure");
    }
    lifecycleWin.dataLayer.push([cmd, action, payload]);
  };
  global.window = lifecycleWin.win;

  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  assert.strictEqual(analytics.isConsentModeInitialized(), false);

  const onFocusOrOnline = () => {
    analytics.ensureConsentModeInitialized();
  };
  lifecycleWin.win.addEventListener("focus", onFocusOrOnline);
  lifecycleWin.win.addEventListener("online", onFocusOrOnline);

  // Update still failing -> retry keeps GTM eligibility false
  lifecycleWin.win.dispatchEvent({ type: "focus" });
  assert.strictEqual(analytics.isConsentModeInitialized() && analytics.hasAnalyticsConsent(), false);

  // Update recovers -> online retry succeeds without duplicating default denied
  failLifecycleUpdate = false;
  lifecycleWin.win.dispatchEvent({ type: "online" });
  assert.strictEqual(analytics.isConsentModeInitialized() && analytics.hasAnalyticsConsent(), true);
  analytics.trackPageView("/checkout");

  lifecycleWin.win.removeEventListener("focus", onFocusOrOnline);
  lifecycleWin.win.removeEventListener("online", onFocusOrOnline);

  const lifecycleCmds = toCmdList(lifecycleWin.dataLayer);
  assert.strictEqual(lifecycleCmds.length, 3);
  assert.strictEqual(lifecycleCmds[0][0], "consent");
  assert.strictEqual(lifecycleCmds[0][1], "default");
  assert.strictEqual(lifecycleCmds[1][0], "consent");
  assert.strictEqual(lifecycleCmds[1][1], "update");
  assert.strictEqual(lifecycleCmds[1][2].analytics_storage, "granted");
  assert.strictEqual(lifecycleCmds[2].event, "page_view");

  // 8i. Invalid/NaN/negative/overflow ecommerce inputs fail safely without NaN or Infinity
  const guardWin = createMockWindow();
  guardWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  global.window = guardWin.win;
  analytics.ensureConsentModeInitialized();
  const lenBeforeInvalid = guardWin.dataLayer.length;
  analytics.trackAddToCart(sampleProd, 0);
  analytics.trackAddToCart(sampleProd, -2);
  analytics.trackAddToCart(sampleProd, Number.MAX_SAFE_INTEGER, null, 100);
  analytics.trackRemoveFromCart(sampleProd, Number.NaN);
  assert.strictEqual(guardWin.dataLayer.length, lenBeforeInvalid);

  // Explicitly invalid purchase line (quantity: 0, negative, Infinity, invalid string, MAX_VALUE) is excluded;
  // missing quantity defaults to 1; multi-line order recalculates totals & discounts consistently
  const invalidOnlyPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_invalid_lines",
    orderNumber: "BB-INV-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    couponDiscount: Number.NaN,
    deliveryCharge: -10,
    taxAmount: Number.POSITIVE_INFINITY,
    items: [
      { productId: "p1", productName: "Zero Qty", unitPrice: 100, quantity: 0 },
      { productId: "p2", productName: "Neg Qty", unitPrice: 100, quantity: -1 },
      { productId: "p3", productName: "Max Price", unitPrice: Number.MAX_VALUE, quantity: 1 },
      { productId: "p4", productName: "Huge Qty", unitPrice: 100, quantity: Number.MAX_SAFE_INTEGER },
      { productId: "p5", productName: "Bad String Qty", unitPrice: 100, quantity: "abc" },
    ],
  });
  assert.strictEqual(invalidOnlyPayload.items.length, 0);
  assert.strictEqual(invalidOnlyPayload.value, 0);
  assert.strictEqual(invalidOnlyPayload.shipping, 0);
  assert.strictEqual(invalidOnlyPayload.tax, 0);

  const mixedLinesPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_mixed_lines",
    orderNumber: "BB-MIX-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    couponDiscount: 20,
    deliveryCharge: 25,
    taxAmount: 5,
    items: [
      { productId: "p_invalid_qty", productName: "Invalid", unitPrice: 500, quantity: 0 },
      { productId: "p_invalid_price", productName: "Bad Price", unitPrice: Number.NaN, quantity: 2 },
      { productId: "p_missing_qty", productName: "Default Qty", unitPrice: 100 },
      { productId: "p_valid", productName: "Valid Two", unitPrice: 50, quantity: 2 },
    ],
  });
  assert.strictEqual(mixedLinesPayload.items.length, 2);
  assert.strictEqual(mixedLinesPayload.items[0].item_id, "p_missing_qty");
  assert.strictEqual(mixedLinesPayload.items[0].quantity, 1);
  assert.strictEqual(mixedLinesPayload.items[1].item_id, "p_valid");
  assert.strictEqual(mixedLinesPayload.items[1].quantity, 2);
  assert.strictEqual(mixedLinesPayload.value, 180);
  assert.strictEqual(mixedLinesPayload.shipping, 25);
  assert.strictEqual(mixedLinesPayload.tax, 5);
  for (const field of [mixedLinesPayload.value, mixedLinesPayload.shipping, mixedLinesPayload.tax]) {
    assert.ok(Number.isFinite(field) && field >= 0);
  }

  // 8j. Failed purchase push does NOT mark order tracked; retry succeeds and subsequent calls deduplicate
  const purchaseRetryWin = createMockWindow();
  purchaseRetryWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  global.window = purchaseRetryWin.win;
  analytics.ensureConsentModeInitialized();

  const origPush = purchaseRetryWin.dataLayer.push.bind(purchaseRetryWin.dataLayer);
  let failPurchasePush = true;
  purchaseRetryWin.dataLayer.push = (entry) => {
    if (failPurchasePush && entry && entry.event === "purchase") {
      throw new Error("simulated dataLayer purchase push failure");
    }
    return origPush(entry);
  };

  const retryOrder = {
    id: "ord_retry_purchase_1",
    orderNumber: "BB-RET-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "COD_PENDING",
    paymentMethod: "COD",
    deliveryCharge: 20,
    taxAmount: 0,
    items: [{ productId: "p1", productName: "Bento", unitPrice: 200, quantity: 1 }],
  };

  // Initial push fails (even after { ecommerce: null } reset) -> returns false, not marked tracked
  assert.strictEqual(analytics.trackPurchaseFromOrder(retryOrder), false);
  assert.strictEqual(analytics.hasTrackedPurchase("ord_retry_purchase_1"), false);
  assert.strictEqual(purchaseRetryWin.dataLayer.some((d) => d && d.event === "purchase"), false);

  // Retry succeeds -> returns true, marks tracked, and third call deduplicates
  failPurchasePush = false;
  assert.strictEqual(analytics.trackPurchaseFromOrder(retryOrder), true);
  assert.strictEqual(analytics.hasTrackedPurchase("ord_retry_purchase_1"), true);
  assert.strictEqual(
    purchaseRetryWin.dataLayer.filter((d) => d && d.event === "purchase").length,
    1
  );
  assert.strictEqual(analytics.trackPurchaseFromOrder(retryOrder), false);
  assert.strictEqual(
    purchaseRetryWin.dataLayer.filter((d) => d && d.event === "purchase").length,
    1
  );

  // 8k. Overflow-safe proportional coupon allocation for large safe-integer line values
  // Each operand is a safe integer (~3e13 paise), while their product (~9e26) far exceeds Number.MAX_SAFE_INTEGER (~9e15).
  const largeUnitInr = 300000000000; // 3e11 INR = 3e13 paise
  const largeCouponInr = 100000000000.01; // 1e13 + 1 paise
  const largeCouponPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_large_safe",
    orderNumber: "BB-LRG-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    couponDiscount: largeCouponInr,
    deliveryCharge: 0,
    taxAmount: 0,
    items: [
      { productId: "p_a", productName: "Bulk A", unitPrice: largeUnitInr, quantity: 1 },
      { productId: "p_b", productName: "Bulk B", unitPrice: largeUnitInr, quantity: 1 },
      { productId: "p_c", productName: "Bulk C", unitPrice: largeUnitInr, quantity: 1 },
    ],
  });

  assert.strictEqual(largeCouponPayload.items.length, 3);
  const totalNetPaise = largeCouponPayload.items.reduce(
    (sum, it) => sum + Math.round(it.price * 100) * it.quantity,
    0
  );
  const totalDiscPaise = largeCouponPayload.items.reduce(
    (sum, it) => sum + Math.round((it.discount || 0) * 100) * it.quantity,
    0
  );
  const expectedNetPaise = 30000000000000 * 3 - 10000000000001;
  assert.strictEqual(Math.round(largeCouponPayload.value * 100), expectedNetPaise);
  assert.strictEqual(totalNetPaise, expectedNetPaise);
  assert.strictEqual(totalDiscPaise, 10000000000001);
  for (const it of largeCouponPayload.items) {
    assert.ok(Number.isFinite(it.price) && it.price >= 0);
    assert.ok(Number.isFinite(it.discount || 0) && (it.discount || 0) >= 0);
    assert.ok(Number.isSafeInteger(it.quantity) && it.quantity > 0);
  }

  // 8l. Repeated initDefaultConsentMode() is idempotent and does not clobber granted consent
  const idempotentWin = createMockWindow();
  idempotentWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  global.window = idempotentWin.win;
  assert.strictEqual(analytics.ensureConsentModeInitialized(), true);
  assert.strictEqual(analytics.initDefaultConsentMode(), true);
  assert.strictEqual(analytics.isConsentModeInitialized(), true);
  assert.strictEqual(
    toCmdList(idempotentWin.dataLayer).filter((c) => Array.isArray(c) && c[1] === "default").length,
    1
  );

  // 8m. sanitizeVercelUrl enforces same-origin policy and strips sensitive query params
  assert.strictEqual(
    analytics.sanitizeVercelUrl("https://evil.example.com/menu?category=bowls&token=secret123"),
    "https://www.bentobabu.com/menu?category=bowls"
  );
  assert.strictEqual(
    analytics.sanitizeVercelUrl("javascript:alert(1)"),
    "https://www.bentobabu.com/"
  );

  // 8n. Order eligibility edge cases: missing ID, lowercase statuses, unpaid/failed online, _id fallback, coupon > subtotal, equal remainders
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "",
      _id: "",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
    }),
    false
  );
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      _id: "mongo_only_id",
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "razorpay",
    }),
    true
  );
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "ord_unpaid_online",
      orderStatus: "confirmed",
      paymentStatus: "pending",
      paymentMethod: "razorpay",
    }),
    false
  );
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "ord_failed_online",
      orderStatus: "confirmed",
      paymentStatus: "failed",
      paymentMethod: "razorpay",
    }),
    false
  );
  assert.strictEqual(
    analytics.isOrderEligibleForPurchaseTracking({
      id: "ord_unconfirmed_cod",
      orderStatus: "pending",
      paymentStatus: "cod_pending",
      paymentMethod: "cod",
    }),
    false
  );

  // Coupon larger than subtotal caps at subtotal; equal remainders distribute deterministically
  const cappedCouponPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_capped_coupon",
    orderNumber: "BB-CAP-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    couponDiscount: 999,
    deliveryCharge: 0,
    taxAmount: 0,
    items: [
      { productId: "p1", productName: "Item 1", unitPrice: 100, quantity: 1 },
      { productId: "p2", productName: "Item 2", unitPrice: 100, quantity: 1 },
    ],
  });
  assert.strictEqual(cappedCouponPayload.value, 0);
  assert.strictEqual(cappedCouponPayload.items[0].price, 0);
  assert.strictEqual(cappedCouponPayload.items[0].discount, 100);
  assert.strictEqual(cappedCouponPayload.items[1].price, 0);
  assert.strictEqual(cappedCouponPayload.items[1].discount, 100);

  const equalRemPayload = analytics.buildPurchaseEcommercePayload({
    id: "ord_eq_rem",
    orderNumber: "BB-EQ-1",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    couponDiscount: 0.01,
    deliveryCharge: 0,
    taxAmount: 0,
    items: [
      { productId: "p1", productName: "Item 1", unitPrice: 100, quantity: 1 },
      { productId: "p2", productName: "Item 2", unitPrice: 100, quantity: 1 },
    ],
  });
  assert.strictEqual(equalRemPayload.value, 199.99);
  assert.strictEqual(equalRemPayload.items[0].discount, 0.01);
  assert.strictEqual(equalRemPayload.items[1].discount, undefined);

  // Invalid product / fractional quantity / empty cart guards do not throw
  analytics.trackSelectItem("menu", "Menu", null);
  analytics.trackAddToCart(sampleProd, 1.5);
  analytics.trackViewCart([], 0);
  analytics.trackViewItemList("menu", "Menu", []);

  // 8o. Defensive hardening for malformed order.items, nested product data, and mapProductToGa4Item inputs
  const defWin = createMockWindow();
  global.window = defWin.win;
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "true";
  analytics.ensureConsentModeInitialized();

  // 1) Null order item in trackPurchaseFromOrder -> skips null item, returns false if no valid items, never marks tracked
  assert.strictEqual(
    analytics.trackPurchaseFromOrder({
      id: "ord_null_item",
      orderNumber: "BB-NULL-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
      items: [null, undefined],
    }),
    false
  );
  assert.strictEqual(analytics.hasTrackedPurchase("ord_null_item"), false);

  // 2) Undefined order.items -> returns false safely, never throws or marks tracked
  assert.strictEqual(
    analytics.trackPurchaseFromOrder({
      id: "ord_undef_items",
      orderNumber: "BB-UNDEF-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
    }),
    false
  );
  assert.strictEqual(analytics.hasTrackedPurchase("ord_undef_items"), false);

  // 3) Non-iterable order.items -> returns false safely, never throws or marks tracked
  assert.strictEqual(
    analytics.trackPurchaseFromOrder({
      id: "ord_non_iter",
      orderNumber: "BB-NONITER-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "COD_PENDING",
      paymentMethod: "COD",
      items: { bad: true },
    }),
    false
  );
  assert.strictEqual(analytics.hasTrackedPurchase("ord_non_iter"), false);

  // 4) Malformed nested product data + valid item -> skips malformed item, tracks valid item, and deduplicates
  assert.strictEqual(
    analytics.trackPurchaseFromOrder({
      id: "ord_nested_malformed",
      orderNumber: "BB-NEST-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
      items: [
        null,
        { productId: "p_bad", product: 12345, unitPrice: "bad", quantity: 1 },
        { productId: "p_ok", product: { id: "p_ok", name: "Good Meal" }, productName: "Good Meal", unitPrice: 180, quantity: 1 },
      ],
    }),
    true
  );
  assert.strictEqual(analytics.hasTrackedPurchase("ord_nested_malformed"), true);
  assert.strictEqual(
    analytics.trackPurchaseFromOrder({
      id: "ord_nested_malformed",
      orderNumber: "BB-NEST-1",
      orderStatus: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "RAZORPAY",
      items: [{ productId: "p_ok", productName: "Good Meal", unitPrice: 180, quantity: 1 }],
    }),
    false
  );

  // 5 & 6) mapProductToGa4Item and trackAddToCart/trackRemoveFromCart with null/undefined/non-object, missing id/name, invalid price/quantity
  const lenBeforeBadCartCalls = defWin.dataLayer.length;
  analytics.trackAddToCart(null, 1);
  analytics.trackAddToCart(undefined, 1);
  analytics.trackAddToCart("bad-product", 1);
  analytics.trackRemoveFromCart(null, 1);
  analytics.trackRemoveFromCart(undefined, 1);
  analytics.trackRemoveFromCart(123, 1);
  assert.strictEqual(defWin.dataLayer.length, lenBeforeBadCartCalls);

  analytics.trackAddToCart({ id: "p_ok_cart", name: "Cart Bowl", price: 150 }, 2);
  analytics.trackRemoveFromCart({ id: "p_ok_cart", name: "Cart Bowl", price: 150 }, 1);
  assert.strictEqual(
    defWin.dataLayer.filter((d) => d && d.event === "add_to_cart").length,
    1
  );
  assert.strictEqual(
    defWin.dataLayer.filter((d) => d && d.event === "remove_from_cart").length,
    1
  );

  assert.strictEqual(analytics.mapProductToGa4Item(null, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item(undefined, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "", name: "No ID", price: 100 }, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "   ", price: 100 }, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "Bad Price", price: Number.NaN }, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "Neg Price", price: -10 }, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "Overflow", price: Number.MAX_VALUE }, 1), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "Zero Qty", price: 100 }, 0), null);
  assert.strictEqual(analytics.mapProductToGa4Item({ id: "p1", name: "Frac Qty", price: 100 }, 1.5), null);
  assert.deepStrictEqual(
    analytics.mapProductToGa4Item({ id: "p1", name: "Valid Bowl", price: 220, category: "Bowls" }, 2, { index: 0 }),
    { item_id: "p1", item_name: "Valid Bowl", item_category: "Bowls", price: 220, quantity: 2, index: 0 }
  );

  // 9) Checkout flow simulation: analytics failure/malformed order never interrupts clearCart or navigation
  let cartCleared = false;
  let navigatedTo = null;
  const runCheckoutCompletion = (order) => {
    analytics.trackPurchaseFromOrder(order);
    cartCleared = true;
    navigatedTo = `/order-success/${order.id}`;
  };
  runCheckoutCompletion({
    id: "ord_checkout_safe",
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    paymentMethod: "RAZORPAY",
    items: null,
  });
  assert.strictEqual(cartCleared, true);
  assert.strictEqual(navigatedTo, "/order-success/ord_checkout_safe");

  // 8h. Master gate disabled -> nothing initialized, dispatched, or tracked regardless of stored consent
  const disabledWin = createMockWindow();
  delete disabledWin.win.dataLayer;
  let disabledEventCount = 0;
  disabledWin.win.addEventListener(analytics.CONSENT_CHANGED_EVENT, () => {
    disabledEventCount += 1;
  });
  disabledWin.win.localStorage.setItem(
    analytics.CONSENT_STORAGE_KEY,
    JSON.stringify({ status: "granted" })
  );
  global.window = disabledWin.win;
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = "false";
  assert.strictEqual(analytics.initDefaultConsentMode(), false);
  assert.strictEqual(analytics.ensureConsentModeInitialized(), false);
  assert.strictEqual(analytics.hasAnalyticsConsent(), false);
  analytics.setAnalyticsConsent("granted");
  analytics.trackPageView("/");
  assert.strictEqual(disabledWin.win.dataLayer, undefined);
  assert.strictEqual(disabledEventCount, 0);

  console.log("✅ All 8 analytics unit test groups passed!\n");
}

run();
