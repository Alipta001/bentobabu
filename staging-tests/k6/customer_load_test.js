/**
 * BentoBabu — Phase 1: k6 Customer Workflow Load Testing Script
 *
 * Simulates concurrent customer traffic across tiers (5, 10, 20, 35, 50 VUs).
 *
 * Workflow:
 * 1. Fetch CSRF Token (GET /auth/csrf-token)
 * 2. Login (POST /auth/login) -> sets auth cookies
 * 3. Fetch Categories (GET /categories)
 * 4. Fetch Products (GET /products)
 * 5. Fetch Product Details (GET /products/:slug)
 * 6. Cart Operations:
 *    - Add item (POST /cart/items)
 *    - Retrieve cart (GET /cart)
 * 7. Fetch Customer Addresses (GET /addresses)
 * 8. Checkout Summary (POST /orders/checkout-summary)
 * 9. Create Order (POST /orders) with COD
 * 10. Order Details & Status Tracking (GET /orders/:id)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom Metrics
const customerJourneyDuration = new Trend('customer_journey_duration_ms', true);
const successfulOrders = new Counter('successful_orders_created');
const failedOrders = new Counter('failed_orders_count');
const journeyErrorRate = new Rate('journey_error_rate');

// Environment Configuration with Sensible Defaults
const BASE_URL = __ENV.STAGING_BASE_URL || 'http://127.0.0.1:5050/api/v1';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '10', 10);
const STAGE_DURATION = __ENV.STAGE_DURATION || '12s';

const STAGING_PRODUCTS = [
  'staging-premium-bento',
  'staging-classic-chicken-bento',
  'staging-vegetarian-delight-bento',
  'staging-salmon-teriyaki-bento',
  'staging-crispy-tofu-bento',
  'staging-butter-chicken-bento',
  'staging-paneer-tikka-bento',
  'staging-egg-curry-bento',
  'staging-fish-katsu-bento',
  'staging-prawn-tempura-bento',
  'staging-katsu-curry-bento',
  'staging-miso-glazed-eggplant-bento',
  'staging-teriyaki-chicken-bento',
  'staging-mushroom-stroganoff-bento',
  'staging-dal-makhani-bento',
  'staging-chana-masala-bento',
  'staging-lamb-keema-bento',
  'staging-veggie-soba-bento',
  'staging-peri-peri-chicken-bento',
  'staging-shrimp-garlic-bento',
  'staging-bbq-tofu-bento',
  'staging-thai-green-curry-bento',
  'staging-honey-chilli-paneer-bento',
  'staging-smoked-salmon-bento',
  'staging-avocado-poke-bento',
];

function getProductSlug() {
  if (__ENV.STAGING_PRODUCT_SLUG) return __ENV.STAGING_PRODUCT_SLUG;
  const vuIndex = (__VU && __VU > 0) ? __VU : 1;
  return STAGING_PRODUCTS[(vuIndex - 1) % STAGING_PRODUCTS.length];
}

function getCustomerEmail() {
  if (__ENV.STAGING_CUSTOMER_EMAIL) return __ENV.STAGING_CUSTOMER_EMAIL;
  const vuIndex = (__VU && __VU > 0) ? __VU : 1;
  return `staging.customer.vu${vuIndex}@bentobabu.test`;
}

const CUSTOMER_PASSWORD = __ENV.STAGING_CUSTOMER_PASSWORD || 'StagingTestPass123!';

function getExecutionStages() {
  const profile = __ENV.LOAD_PROFILE || 'stepped';

  if (profile === 'single_tier') {
    return [
      { duration: '2s', target: TARGET_VUS },
      { duration: STAGE_DURATION, target: TARGET_VUS },
      { duration: '2s', target: 0 },
    ];
  }

  // Multi-tier stepped ramp (5 -> 10 -> 20 -> 35 -> 50)
  return [
    { duration: '3s', target: 5 },
    { duration: '10s', target: 5 },
    { duration: '3s', target: 10 },
    { duration: '10s', target: 10 },
    { duration: '3s', target: 20 },
    { duration: '10s', target: 20 },
    { duration: '3s', target: 35 },
    { duration: '10s', target: 35 },
    { duration: '3s', target: 50 },
    { duration: '15s', target: 50 },
    { duration: '3s', target: 0 },
  ];
}

const MAX_P50 = __ENV.K6_MAX_P50_MS || '500';
const MAX_P90 = __ENV.K6_MAX_P90_MS || '1000';
const MAX_P95 = __ENV.K6_MAX_P95_MS || '1500';
const MAX_P99 = __ENV.K6_MAX_P99_MS || '2500';
const MAX_ERR_RATE = __ENV.K6_MAX_ERROR_RATE || '0.01';

export const options = {
  stages: getExecutionStages(),
  thresholds: {
    http_req_duration: [
      `p(50)<${MAX_P50}`,
      `p(90)<${MAX_P90}`,
      `p(95)<${MAX_P95}`,
      `p(99)<${MAX_P99}`,
    ],
    http_req_failed: [`rate<${MAX_ERR_RATE}`],
  },
};

export default function () {
  const journeyStart = Date.now();
  let journeySuccess = true;
  let csrfToken = null;
  let targetProductId = null;
  let targetAddressId = null;
  let createdOrderId = null;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'X-Auth-Context': 'customer',
  };

  // 1. Fetch CSRF Token
  group('01_Fetch_CSRF_Token', function () {
    const res = http.get(`${BASE_URL}/auth/csrf-token`, { headers: defaultHeaders });
    const ok = check(res, {
      'csrf status is 200': (r) => r.status === 200,
    });

    if (ok) {
      try {
        const body = res.json();
        if (body.data && body.data.csrfToken) {
          csrfToken = body.data.csrfToken;
          defaultHeaders['X-CSRF-Token'] = csrfToken;
        }
      } catch {}
    } else {
      journeySuccess = false;
    }
  });

  if (!journeySuccess) {
    journeyErrorRate.add(1);
    sleep(1);
    return;
  }

  // 2. Customer Authentication
  group('02_Customer_Login', function () {
    const loginPayload = JSON.stringify({
      identifier: getCustomerEmail(),
      password: CUSTOMER_PASSWORD,
    });

    const res = http.post(`${BASE_URL}/auth/login`, loginPayload, {
      headers: defaultHeaders,
    });

    const ok = check(res, {
      'login status is 200': (r) => r.status === 200,
      'login success is true': (r) => {
        try {
          const body = r.json();
          return body.success === true;
        } catch {
          return false;
        }
      },
    });

    if (!ok) {
      journeySuccess = false;
    }
  });

  if (!journeySuccess) {
    journeyErrorRate.add(1);
    sleep(1);
    return;
  }

  // 3. Fetch Categories
  group('03_Fetch_Categories', function () {
    const res = http.get(`${BASE_URL}/categories`, { headers: defaultHeaders });
    check(res, {
      'categories status is 200': (r) => r.status === 200,
      'categories list returned': (r) => {
        try {
          const body = r.json();
          return Array.isArray(body.data) && body.data.length > 0;
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.05);

  // 4. Fetch Products
  group('04_Fetch_Products', function () {
    const res = http.get(`${BASE_URL}/products?limit=50`, { headers: defaultHeaders });
    const ok = check(res, {
      'products status is 200': (r) => r.status === 200,
      'products list returned': (r) => {
        try {
          const body = r.json();
          return Array.isArray(body.data) && body.data.length > 0;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      try {
        const body = res.json();
        const slug = getProductSlug();
        const found = body.data.find((p) => p.slug === slug) || body.data[0];
        if (found) {
          targetProductId = found._id || found.id;
        }
      } catch {}
    }
  });

  sleep(0.05);

  // 5. Fetch Product Details
  group('05_Product_Detail', function () {
    const res = http.get(`${BASE_URL}/products/${getProductSlug()}`, { headers: defaultHeaders });
    check(res, {
      'product detail status is 200': (r) => r.status === 200,
      'product is orderable': (r) => {
        try {
          const body = r.json();
          return body.data && body.data.isAvailable === true;
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.05);

  // 6. Cart Operations
  if (targetProductId) {
    group('06_Cart_Operations', function () {
      const addPayload = JSON.stringify({
        productId: targetProductId,
        quantity: 1,
      });

      const addRes = http.post(`${BASE_URL}/cart/items`, addPayload, {
        headers: defaultHeaders,
      });

      check(addRes, {
        'add to cart status is 200': (r) => r.status === 200,
      });

      const getCartRes = http.get(`${BASE_URL}/cart`, { headers: defaultHeaders });
      check(getCartRes, {
        'get cart status is 200': (r) => r.status === 200,
        'cart contains items': (r) => {
          try {
            const body = r.json();
            return body.data && body.data.items && body.data.items.length > 0;
          } catch {
            return false;
          }
        },
      });
    });
  }

  sleep(0.05);

  // 7. Fetch Customer Delivery Addresses
  group('07_Fetch_Addresses', function () {
    const res = http.get(`${BASE_URL}/addresses`, { headers: defaultHeaders });
    const ok = check(res, {
      'addresses status is 200': (r) => r.status === 200,
      'customer has addresses': (r) => {
        try {
          const body = r.json();
          return Array.isArray(body.data) && body.data.length > 0;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      try {
        const body = res.json();
        targetAddressId = body.data[0]._id || body.data[0].id;
      } catch {}
    }
  });

  // 8. Checkout Summary & Order Placement
  if (targetAddressId) {
    group('08_Checkout_And_Place_Order', function () {
      // 8a. Checkout Summary
      const summaryPayload = JSON.stringify({
        addressId: targetAddressId,
      });

      const summaryRes = http.post(`${BASE_URL}/orders/checkout-summary`, summaryPayload, {
        headers: defaultHeaders,
      });

      check(summaryRes, {
        'checkout summary status is 200': (r) => r.status === 200,
      });

      // 8b. Place Order
      const orderPayload = JSON.stringify({
        addressId: targetAddressId,
        paymentMethod: 'COD',
      });

      const orderRes = http.post(`${BASE_URL}/orders`, orderPayload, {
        headers: defaultHeaders,
      });

      const orderOk = check(orderRes, {
        'order creation status is 201 or 200': (r) => r.status === 201 || r.status === 200,
        'order response has id': (r) => {
          try {
            const body = r.json();
            const ord = body.data?.order || body.data;
            return Boolean(ord && (ord._id || ord.id));
          } catch {
            return false;
          }
        },
      });

      if (orderOk) {
        successfulOrders.add(1);
        try {
          const body = orderRes.json();
          const ord = body.data?.order || body.data;
          createdOrderId = ord._id || ord.id;
        } catch {}
      } else {
        failedOrders.add(1);
        if (orderRes.status !== 201 && orderRes.status !== 200) {
          console.warn(`[k6-VU${__VU}] Order failed: status=${orderRes.status} body=${orderRes.body}`);
        }
      }
    });
  }

  // 9. Order Details & Status Tracking
  if (createdOrderId) {
    group('09_Order_Tracking', function () {
      const res = http.get(`${BASE_URL}/orders/${createdOrderId}`, {
        headers: defaultHeaders,
      });

      check(res, {
        'order tracking status is 200': (r) => r.status === 200,
        'order has valid status': (r) => {
          try {
            const body = r.json();
            const ord = body.data?.order || body.data;
            return ['PENDING', 'CONFIRMED', 'PREPARING'].includes(ord.orderStatus);
          } catch {
            return false;
          }
        },
      });
    });
  }

  const journeyElapsed = Date.now() - journeyStart;
  customerJourneyDuration.add(journeyElapsed);
  journeyErrorRate.add(journeySuccess ? 0 : 1);

  sleep(0.5); // Realistic think time between journey loops
}
