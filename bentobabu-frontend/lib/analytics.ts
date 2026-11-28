import { Order, Product } from "@/types";

export type AnalyticsConsentStatus = "granted" | "denied" | "unset";

export const CONSENT_STORAGE_KEY = "bb_analytics_consent_v1";
export const PURCHASE_DEDUP_PREFIX = "bb_ga_purchased_";
export const CONSENT_CHANGED_EVENT = "bb:analytics-consent-changed";
export const OPEN_PRIVACY_SETTINGS_EVENT = "bb:open-privacy-settings";

const ALLOWLISTED_QUERY_PARAMS = new Set([
  "category",
  "dietary",
  "sort",
  "page",
  "date",
]);

const CONFIRMED_ORDER_STATUSES = new Set([
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ACCEPTED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

const memoryPurchasedOrderIds = new Set<string>();
const initializedConsentWindows = new WeakSet<object>();
const grantedUpdateQueuedWindows = new WeakSet<object>();

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown> | IArguments>;
    gtag?: (...args: unknown[]) => void;
  }
}

const GTM_ID_REGEX = /^GTM-[A-Z0-9]+$/;

export function isAnalyticsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true";
}

export function validateGtmId(rawId?: string): string {
  const trimmed = (rawId ?? "").trim();
  if (!trimmed || !GTM_ID_REGEX.test(trimmed)) {
    return "";
  }
  return trimmed;
}

export function getGtmId(): string {
  return validateGtmId(process.env.NEXT_PUBLIC_GTM_ID);
}

export function subscribeAnalyticsConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

export function requiresAnalyticsConsent(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_ANALYTICS_CONSENT !== "false";
}

export function getAnalyticsConsent(): AnalyticsConsentStatus {
  if (typeof window === "undefined") return "unset";
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return "unset";
    const parsed = JSON.parse(raw) as { status?: string };
    if (parsed?.status === "granted" || parsed?.status === "denied") {
      return parsed.status;
    }
    return "unset";
  } catch {
    return "unset";
  }
}

export function hasAnalyticsConsent(): boolean {
  if (!isAnalyticsEnabled()) return false;
  if (!requiresAnalyticsConsent()) return true;
  return getAnalyticsConsent() === "granted";
}

export function ensureDataLayerAndGtag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!window.dataLayer) {
      window.dataLayer = [];
    }
    if (typeof window.dataLayer.push !== "function") {
      return false;
    }
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };
    }
    return typeof window.gtag === "function";
  } catch {
    return false;
  }
}

export function isConsentModeInitialized(): boolean {
  if (typeof window === "undefined") return false;
  if (!initializedConsentWindows.has(window)) return false;
  if (hasAnalyticsConsent() && !grantedUpdateQueuedWindows.has(window)) return false;
  return true;
}

export function initDefaultConsentMode(): boolean {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return false;
  if (initializedConsentWindows.has(window)) return true;
  try {
    if (!ensureDataLayerAndGtag() || typeof window.gtag !== "function") {
      initializedConsentWindows.delete(window);
      grantedUpdateQueuedWindows.delete(window);
      return false;
    }
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500,
    });
    initializedConsentWindows.add(window);
    return true;
  } catch {
    initializedConsentWindows.delete(window);
    grantedUpdateQueuedWindows.delete(window);
    return false;
  }
}

export function ensureConsentModeInitialized(): boolean {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return false;
  try {
    let changed = false;
    if (!initializedConsentWindows.has(window)) {
      if (!initDefaultConsentMode()) {
        return false;
      }
      changed = true;
    }

    const granted = hasAnalyticsConsent();
    if (granted && !grantedUpdateQueuedWindows.has(window)) {
      if (!ensureDataLayerAndGtag() || typeof window.gtag !== "function") {
        return false;
      }
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      grantedUpdateQueuedWindows.add(window);
      changed = true;
    }

    if (changed) {
      window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
    }
    return isConsentModeInitialized() && granted;
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(status: "granted" | "denied"): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  if (!initializedConsentWindows.has(window)) {
    initDefaultConsentMode();
  }
  try {
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ status, updatedAt: new Date().toISOString() })
    );
  } catch {
    // ignore unavailable localStorage
  }

  if (status === "denied") {
    grantedUpdateQueuedWindows.delete(window);
  }

  try {
    if (status === "granted" && !initializedConsentWindows.has(window)) {
      window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { status } }));
      return;
    }
    if (ensureDataLayerAndGtag() && typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: status,
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      if (status === "granted") {
        grantedUpdateQueuedWindows.add(window);
      }
    }
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { status } }));
  } catch {
    if (status === "granted") {
      grantedUpdateQueuedWindows.delete(window);
    }
    try {
      window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { status } }));
    } catch {
      // ignore
    }
  }
}

export function openPrivacySettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PRIVACY_SETTINGS_EVENT));
  } catch {
    // ignore
  }
}

export function sanitizeUrlPath(
  pathname: string,
  searchParams?: URLSearchParams | string | null
): string {
  const cleanPath = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (!searchParams) return cleanPath;

  try {
    const params =
      typeof searchParams === "string"
        ? new URLSearchParams(searchParams)
        : searchParams;
    const safeParams = new URLSearchParams();
    for (const [key, val] of params.entries()) {
      if (ALLOWLISTED_QUERY_PARAMS.has(key) && val) {
        safeParams.set(key, val.slice(0, 64));
      }
    }
    const qs = safeParams.toString();
    return qs ? `${cleanPath}?${qs}` : cleanPath;
  } catch {
    return cleanPath;
  }
}

export function sanitizeVercelUrl(rawUrl: string): string {
  const canonicalOrigin =
    typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
      ? window.location.origin
      : "https://www.bentobabu.com";
  try {
    const parsed = new URL(rawUrl, canonicalOrigin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${canonicalOrigin}/`;
    }
    const safePath = sanitizeUrlPath(parsed.pathname, parsed.searchParams);
    const normalizedPath = safePath.startsWith("/") ? safePath : `/${safePath}`;
    return `${canonicalOrigin}${normalizedPath}`;
  } catch {
    return `${canonicalOrigin}/`;
  }
}

export function sanitizeSearchTerm(rawTerm: string): string {
  const trimmed = String(rawTerm || "").trim().slice(0, 100);
  if (!trimmed) return "";
  // Redact accidental email addresses, 10-digit phones, or 6-digit pincodes
  if (
    /\S+@\S+\.\S+/.test(trimmed) ||
    /\b\d{10}\b/.test(trimmed) ||
    /\b\d{6}\b/.test(trimmed)
  ) {
    return "[redacted]";
  }
  return trimmed;
}

export function pushToDataLayer(
  eventName: string,
  params: Record<string, unknown> = {},
  isEcommerce = false
): boolean {
  if (!hasAnalyticsConsent() || typeof window === "undefined") return false;
  try {
    if (!ensureConsentModeInitialized() || !ensureDataLayerAndGtag() || !window.dataLayer) {
      return false;
    }
    if (isEcommerce) {
      window.dataLayer.push({ ecommerce: null });
    }
    window.dataLayer.push({
      event: eventName,
      ...params,
    });
    return true;
  } catch {
    return false;
  }
}

export interface Ga4Item {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  discount?: number;
  quantity: number;
  index?: number;
}

function toNonNegativePaise(amount: unknown): number {
  if (typeof amount === "string" && amount.trim() === "") return 0;
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const scaled = n * 100;
  if (!Number.isFinite(scaled)) return 0;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || rounded < 0) return 0;
  return rounded;
}

function parseExplicitNonNegativePaise(amount: unknown): number | null {
  if (amount === undefined || amount === null) return 0;
  if (typeof amount === "string" && amount.trim() === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  const scaled = n * 100;
  if (!Number.isFinite(scaled)) return null;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || rounded < 0) return null;
  return rounded;
}

function toNonNegativeRupees(amount: unknown): number {
  return toNonNegativePaise(amount) / 100;
}

function toPositiveQuantity(quantity: unknown): number {
  const n = Math.floor(Number(quantity));
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

function parsePurchaseQuantity(quantity: unknown): number | null {
  if (quantity === undefined || quantity === null) return 1;
  if (typeof quantity === "string" && quantity.trim() === "") return null;
  const n = Number(quantity);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || !Number.isSafeInteger(n)) {
    return null;
  }
  return n;
}

function mulDivFloorAndRemainder(
  a: number,
  b: number,
  divisor: number
): { floored: number; remainder: number } {
  if (a <= 0 || b <= 0 || divisor <= 0) {
    return { floored: 0, remainder: 0 };
  }
  if (a >= divisor) {
    return { floored: b, remainder: 0 };
  }
  if (b >= divisor) {
    return { floored: a, remainder: 0 };
  }

  let q = 0;
  let r = 0;
  let curQ = 0;
  let curR = a;
  let remB = b;

  while (remB > 0) {
    if (remB % 2 === 1) {
      q += curQ;
      if (r >= divisor - curR) {
        r -= divisor - curR;
        q += 1;
      } else {
        r += curR;
      }
    }
    remB = Math.floor(remB / 2);
    if (remB > 0) {
      curQ *= 2;
      if (curR >= divisor - curR) {
        curR -= divisor - curR;
        curQ += 1;
      } else {
        curR += curR;
      }
    }
  }

  return { floored: q, remainder: r };
}

function toSafePaiseProduct(unitPaise: number, quantity: number): number | null {
  if (!Number.isSafeInteger(unitPaise) || unitPaise < 0) return null;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
  const total = unitPaise * quantity;
  if (!Number.isFinite(total) || !Number.isSafeInteger(total) || total < 0) return null;
  return total;
}

export function mapProductToGa4Item(
  product: Product,
  quantity = 1,
  options?: {
    variantName?: string | null;
    unitPrice?: number;
    index?: number;
  }
): Ga4Item {
  const safePrice = toNonNegativeRupees(options?.unitPrice ?? product.price ?? 0);
  const safeQuantity = toPositiveQuantity(quantity);
  const item: Ga4Item = {
    item_id: String(product.id || product._id || product.slug || ""),
    item_name: product.name || "Bento Meal",
    price: safePrice,
    quantity: safeQuantity,
  };
  const categoryName =
    typeof product.category === "string"
      ? product.category
      : product.category?.name;
  if (categoryName) {
    item.item_category = categoryName;
  }
  if (options?.variantName) {
    item.item_variant = options.variantName;
  }
  if (typeof options?.index === "number") {
    item.index = options.index;
  }
  return item;
}

export function trackPageView(path: string, title?: string): void {
  if (!hasAnalyticsConsent() || typeof window === "undefined") return;
  try {
    const cleanPath = sanitizeUrlPath(path.split("?")[0], path.includes("?") ? path.split("?")[1] : null);
    pushToDataLayer("page_view", {
      page_path: cleanPath,
      page_location: `${window.location.origin}${cleanPath}`,
      page_title: title || document.title || "BentoBabu",
    });
  } catch {
    // ignore
  }
}

export function trackViewItemList(
  listId: string,
  listName: string,
  products: Product[]
): void {
  if (!Array.isArray(products) || products.length === 0) return;
  const items = products
    .filter((p): p is Product => Boolean(p))
    .slice(0, 50)
    .map((p, index) => mapProductToGa4Item(p, 1, { index }));
  if (items.length === 0) return;
  pushToDataLayer(
    "view_item_list",
    {
      ecommerce: {
        item_list_id: listId,
        item_list_name: listName,
        items,
      },
    },
    true
  );
}

export function trackSelectItem(
  listId: string,
  listName: string,
  product: Product,
  index?: number
): void {
  if (!product) return;
  pushToDataLayer(
    "select_item",
    {
      ecommerce: {
        item_list_id: listId,
        item_list_name: listName,
        items: [mapProductToGa4Item(product, 1, { index })],
      },
    },
    true
  );
}

export function trackViewItem(product: Product, unitPrice?: number, variantName?: string | null): void {
  if (!product) return;
  const value = toNonNegativeRupees(unitPrice ?? product.price ?? 0);
  pushToDataLayer(
    "view_item",
    {
      ecommerce: {
        currency: "INR",
        value,
        items: [mapProductToGa4Item(product, 1, { unitPrice: value, variantName })],
      },
    },
    true
  );
}

export function trackAddToCart(
  product: Product,
  quantity: number,
  variantName?: string | null,
  unitPrice?: number
): void {
  if (!product || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(quantity)) {
    return;
  }
  const unitPaise = toNonNegativePaise(unitPrice ?? product.price ?? 0);
  const linePaise = toSafePaiseProduct(unitPaise, quantity);
  if (linePaise === null) return;
  const value = linePaise / 100;
  pushToDataLayer(
    "add_to_cart",
    {
      ecommerce: {
        currency: "INR",
        value,
        items: [mapProductToGa4Item(product, quantity, { unitPrice: unitPaise / 100, variantName })],
      },
    },
    true
  );
}

export function trackRemoveFromCart(
  product: Product,
  quantity: number,
  variantName?: string | null,
  unitPrice?: number
): void {
  if (!product || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(quantity)) {
    return;
  }
  const unitPaise = toNonNegativePaise(unitPrice ?? product.price ?? 0);
  const linePaise = toSafePaiseProduct(unitPaise, quantity);
  if (linePaise === null) return;
  const value = linePaise / 100;
  pushToDataLayer(
    "remove_from_cart",
    {
      ecommerce: {
        currency: "INR",
        value,
        items: [mapProductToGa4Item(product, quantity, { unitPrice: unitPaise / 100, variantName })],
      },
    },
    true
  );
}

export function trackViewCart(items: Ga4Item[], valueInr: number): void {
  if (!Array.isArray(items) || items.length === 0) return;
  pushToDataLayer(
    "view_cart",
    {
      ecommerce: {
        currency: "INR",
        value: toNonNegativeRupees(valueInr),
        items,
      },
    },
    true
  );
}

export function trackBeginCheckout(
  items: Ga4Item[],
  valueInr: number,
  couponCode?: string | null
): void {
  if (!Array.isArray(items) || items.length === 0) return;
  pushToDataLayer(
    "begin_checkout",
    {
      ecommerce: {
        currency: "INR",
        value: toNonNegativeRupees(valueInr),
        ...(couponCode ? { coupon: couponCode } : {}),
        items,
      },
    },
    true
  );
}

export function trackAddShippingInfo(
  items: Ga4Item[],
  valueInr: number,
  shippingTier: string,
  couponCode?: string | null
): void {
  if (!Array.isArray(items) || items.length === 0 || !shippingTier) return;
  pushToDataLayer(
    "add_shipping_info",
    {
      ecommerce: {
        currency: "INR",
        value: toNonNegativeRupees(valueInr),
        shipping_tier: shippingTier,
        ...(couponCode ? { coupon: couponCode } : {}),
        items,
      },
    },
    true
  );
}

export function trackSearch(rawSearchTerm: string): void {
  const searchTerm = sanitizeSearchTerm(rawSearchTerm);
  if (!searchTerm) return;
  pushToDataLayer("search", { search_term: searchTerm });
}

export function trackLogin(method: "password" | "google"): void {
  pushToDataLayer("login", { method });
}

export function trackSignUp(method: "email_otp" | "phone_otp" | "google"): void {
  pushToDataLayer("sign_up", { method });
}

export function isOrderEligibleForPurchaseTracking(order: Order | null | undefined): boolean {
  if (!order) return false;
  const orderId = String(order.id || order._id || "").trim();
  if (!orderId) return false;
  const status = String(order.orderStatus || order.status || "").toUpperCase();
  const paymentStatus = String(order.paymentStatus || "").toUpperCase();
  const paymentMethod = String(order.paymentMethod || "").toUpperCase();

  if (!CONFIRMED_ORDER_STATUSES.has(status)) return false;
  if (paymentMethod === "COD") return true;
  return paymentStatus === "PAID";
}

export function hasTrackedPurchase(orderId: string): boolean {
  if (!orderId) return false;
  if (memoryPurchasedOrderIds.has(orderId)) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${PURCHASE_DEDUP_PREFIX}${orderId}`) === "1";
  } catch {
    return false;
  }
}

export function markPurchaseTracked(orderId: string): void {
  if (!orderId) return;
  memoryPurchasedOrderIds.add(orderId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PURCHASE_DEDUP_PREFIX}${orderId}`, "1");
  } catch {
    // ignore unavailable localStorage
  }
}

export function buildPurchaseEcommercePayload(
  order: Order,
  couponCode?: string | null
) {
  const orderId = String(order.id || order._id || "");
  const rawLines: Array<{
    item_id: string;
    item_name: string;
    item_variant?: string;
    unitPricePaise: number;
    quantity: number;
    lineGrossPaise: number;
  }> = [];
  let rawItemsTotalPaise = 0;

  for (const it of order.items || []) {
    const unitPricePaise = parseExplicitNonNegativePaise(it.unitPrice ?? it.price);
    const quantity = parsePurchaseQuantity(it.quantity);
    if (unitPricePaise === null || quantity === null) continue;

    const lineGrossPaise = toSafePaiseProduct(unitPricePaise, quantity);
    if (lineGrossPaise === null) continue;

    const nextTotalPaise = rawItemsTotalPaise + lineGrossPaise;
    if (!Number.isSafeInteger(nextTotalPaise) || nextTotalPaise < 0) continue;

    rawItemsTotalPaise = nextTotalPaise;
    rawLines.push({
      item_id: String(it.productId || ""),
      item_name: it.productName || "Bento Meal",
      item_variant: it.variantName || undefined,
      unitPricePaise,
      quantity,
      lineGrossPaise,
    });
  }

  const couponDiscountPaise = Math.min(
    rawItemsTotalPaise,
    toNonNegativePaise(order.couponDiscount ?? order.discount ?? 0)
  );

  // Allocate order-level coupon discount proportionally across lines using overflow-safe largest-remainder (paise-exact)
  const lineDiscountsPaise = new Array<number>(rawLines.length).fill(0);
  if (couponDiscountPaise > 0 && rawItemsTotalPaise > 0) {
    const remainders = rawLines.map((line, idx) => {
      const { floored: rawFloored, remainder } = mulDivFloorAndRemainder(
        couponDiscountPaise,
        line.lineGrossPaise,
        rawItemsTotalPaise
      );
      const floored = Math.min(line.lineGrossPaise, rawFloored);
      lineDiscountsPaise[idx] = floored;
      return { idx, rem: remainder };
    });
    let remainingPaise =
      couponDiscountPaise - lineDiscountsPaise.reduce((a, b) => a + b, 0);
    remainders.sort((a, b) => b.rem - a.rem || a.idx - b.idx);
    for (let i = 0; i < remainders.length && remainingPaise > 0; i++) {
      const targetIdx = remainders[i].idx;
      if (lineDiscountsPaise[targetIdx] < rawLines[targetIdx].lineGrossPaise) {
        lineDiscountsPaise[targetIdx] += 1;
        remainingPaise -= 1;
      }
    }
  }

  // Build GA4 items where item.price is the net discounted unit price and sum(price * quantity) === value
  const gaItems: Ga4Item[] = [];
  rawLines.forEach((line, idx) => {
    const lineDisc = lineDiscountsPaise[idx];
    if (lineDisc === 0) {
      const item: Ga4Item = {
        item_id: line.item_id,
        item_name: line.item_name,
        price: line.unitPricePaise / 100,
        quantity: line.quantity,
      };
      if (line.item_variant) item.item_variant = line.item_variant;
      gaItems.push(item);
      return;
    }

    const baseDiscPerUnit = Math.floor(lineDisc / line.quantity);
    const extraUnits = lineDisc % line.quantity;
    const regularUnits = line.quantity - extraUnits;

    if (regularUnits > 0) {
      const netUnitPaise = Math.max(0, line.unitPricePaise - baseDiscPerUnit);
      const item: Ga4Item = {
        item_id: line.item_id,
        item_name: line.item_name,
        price: netUnitPaise / 100,
        discount: baseDiscPerUnit / 100,
        quantity: regularUnits,
      };
      if (line.item_variant) item.item_variant = line.item_variant;
      gaItems.push(item);
    }

    if (extraUnits > 0) {
      const netUnitPaise = Math.max(0, line.unitPricePaise - (baseDiscPerUnit + 1));
      const item: Ga4Item = {
        item_id: line.item_id,
        item_name: line.item_name,
        price: netUnitPaise / 100,
        discount: (baseDiscPerUnit + 1) / 100,
        quantity: extraUnits,
      };
      if (line.item_variant) item.item_variant = line.item_variant;
      gaItems.push(item);
    }
  });

  const netItemValuePaise = gaItems.reduce(
    (sum, it) => sum + Math.round(it.price * 100) * it.quantity,
    0
  );
  const shippingPaise = toNonNegativePaise(order.deliveryCharge ?? order.deliveryFee ?? 0);
  const taxPaise = toNonNegativePaise(order.taxAmount ?? order.tax ?? 0);

  const transactionId = order.orderNumber || orderId;
  const resolvedCoupon =
    couponCode ||
    (typeof order.coupon === "object" && order.coupon ? order.coupon.code : undefined);

  return {
    transaction_id: transactionId,
    currency: "INR",
    value: netItemValuePaise / 100,
    shipping: shippingPaise / 100,
    tax: taxPaise / 100,
    ...(resolvedCoupon ? { coupon: resolvedCoupon } : {}),
    items: gaItems,
  };
}

export function trackPurchaseFromOrder(
  order: Order,
  couponCode?: string | null
): boolean {
  if (!hasAnalyticsConsent()) return false;
  if (!isOrderEligibleForPurchaseTracking(order)) return false;

  const orderId = String(order.id || order._id || "");
  if (!orderId || hasTrackedPurchase(orderId)) return false;

  const ecommerce = buildPurchaseEcommercePayload(order, couponCode);
  if (!pushToDataLayer("purchase", { ecommerce }, true)) {
    return false;
  }
  markPurchaseTracked(orderId);
  return true;
}
