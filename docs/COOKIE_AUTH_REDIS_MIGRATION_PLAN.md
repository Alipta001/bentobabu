# BentoBabu — Secure HttpOnly Cookie Authentication & Redis Integration Migration Plan

## 1. Executive Summary

This document specifies the end-to-end migration of BentoBabu's authentication, session management, security, and caching infrastructure from browser-managed Bearer tokens and in-memory caches to a hardened **HttpOnly Cookie Authentication Architecture with Redis Integration**.

The migration spans all three projects:
1. `bentobabu-backend` (Node.js, Express 5, Mongoose 9, Redis 7+)
2. `bentobabu-frontend` (Next.js 16.4.5, React 19, Redux Toolkit, Axios)
3. `bentobabu-admin` (Next.js 16.4.5, React 19, TanStack React Query, Axios)

---

## 2. Current State vs. Target State

### Current State
- **Access Tokens:** Returned in JSON response body (`res.body.data.accessToken`); stored in browser `sessionStorage` (`bb_access_token` and `bb_admin_token`); transmitted manually via `Authorization: Bearer <token>` request headers. Exposed to client-side JavaScript and potential XSS vector.
- **Refresh Tokens:** Transmitted via HttpOnly cookie `refreshToken` with path `/api/v1/auth`. Returned in some responses.
- **CSRF Protection:** Relies solely on CORS and Custom Request Headers. Vulnerable if ambient authority (cookies) is introduced without explicit anti-CSRF measures.
- **Rate Limiting:** In-memory `express-rate-limit` per-process memory store. Does not scale across clustered instances and resets on process restart.
- **Caching:** No centralized distributed cache. Frequent catalog lookups and admin dashboard queries hit MongoDB repeatedly.

### Target State
- **Access Tokens:** 15-minute lifetime. Stored exclusively in an `HttpOnly`, `Secure`, `SameSite` cookie (`bb_access_token`). Never returned in JSON bodies. Never stored in `localStorage` or `sessionStorage`. Never accessible to frontend JavaScript.
- **Refresh Tokens:** 7-day lifetime. Stored in a dedicated `HttpOnly`, `Secure`, `SameSite` cookie (`bb_refresh_token`). Raw token is never returned in JSON. Persisted only as SHA-256 hash in MongoDB `RefreshSession` collection. Strict single-use rotation and reuse detection.
- **CSRF Protection:** Signed Double-Submit CSRF Token architecture.
  - Server exposes `GET /api/v1/auth/csrf-token` which sets a cookie and returns `{ csrfToken }`.
  - Frontend attaches `X-CSRF-Token` header on state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Server validates HMAC signature and matching token before processing state-changing cookie-authenticated requests.
  - Webhooks (e.g. Razorpay HMAC) and machine-to-machine requests remain verified via their native signature schemes.
- **Redis Infrastructure (`app/config/redis.js`):**
  - Distributed rate limiting via `rate-limit-redis`.
  - Security counters for failed logins (`auth:failed:<identifier>`) with automatic temporary lockouts.
  - Catalog caching (`cache:categories:all`, `cache:products:*`) with automatic invalidation on mutations.
  - Dashboard analytics caching (`cache:admin:dashboard:*`) with short TTLs (1–5 minutes) and mutation-driven invalidation.
  - Fail-safe operational policy: if Redis is unavailable, authentication fails safely while critical transactions fall back gracefully.

---

## 3. Cookie Configuration & Security Attributes

| Attribute | Access Token Cookie (`bb_access_token`) | Refresh Token Cookie (`bb_refresh_token`) | CSRF Token Cookie (`bb_csrf_token`) |
|---|---|---|---|
| **Name** | `process.env.ACCESS_TOKEN_COOKIE_NAME` (default: `bb_access_token`) | `process.env.REFRESH_TOKEN_COOKIE_NAME` (default: `bb_refresh_token`) | `bb_csrf_token` |
| **HttpOnly** | `true` (Inaccessible to JS) | `true` (Inaccessible to JS) | `false` (Accessible to JS for double-submit / header verification) |
| **Secure** | `true` in production (`https://`), configurable via `COOKIE_SECURE` | `true` in production (`https://`), configurable via `COOKIE_SECURE` | `true` in production |
| **SameSite** | `process.env.COOKIE_SAME_SITE` (default: `'lax'`) | `process.env.COOKIE_SAME_SITE` (default: `'lax'`) | `'lax'` |
| **Path** | `'/'` | `'/api/v1/auth'` | `'/'` |
| **Max-Age / TTL** | 15 minutes (`900` seconds / `900,000` ms) | 7 days (`604,800` seconds / `604,800,000` ms) | 2 hours (`7,200` seconds) |
| **Domain** | `process.env.COOKIE_DOMAIN` (Omitted in dev; shared root in prod e.g. `.bentobabu.in`) | `process.env.COOKIE_DOMAIN` | `process.env.COOKIE_DOMAIN` |

---

## 4. Redis Architecture & Key Space

### Centralized Redis Client (`app/config/redis.js`)
- Uses the official `redis` npm package (v4+).
- Configurable via `REDIS_URL` (e.g. `redis://127.0.0.1:6379`) and `REDIS_ENABLED`.
- Supports TLS when `rediss://` protocol is used (Upstash, AWS ElastiCache, Redis Cloud).
- Automatic reconnection with exponential backoff (up to 3 seconds max retry interval).
- Graceful shutdown hook integrated into `server.js`.

### Key Namespace & TTL Table

| Namespace | Key Pattern | TTL | Purpose | Invalidation Triggers |
|---|---|---|---|---|
| **Rate Limit** | `rl:global:<ip>` | 15 min | Distributed IP rate limiting across API instances | Automatic expiry |
| **Rate Limit** | `rl:auth:<ip>` | 15 min | Stricter rate limit for `/auth/login`, `/register`, `/refresh` | Automatic expiry |
| **Security Counter** | `auth:failed:<identifier>` | 15 min | Track consecutive failed logins per email/phone. Locks out after 5 failures | Cleared on successful login; expired automatically |
| **Category Cache** | `cache:categories:all` | 1 hour | Public category listing | Category create, update, status change, delete |
| **Product Cache** | `cache:products:list:<query_hash>` | 30 min | Filtered catalog queries | Product create, update, availability/stock change, status change, delete |
| **Product Cache** | `cache:products:detail:<slug_or_id>` | 30 min | Individual product view | Product update, stock change, status change, delete |
| **Dashboard Cache**| `cache:admin:dashboard:overview` | 3 min | Aggregated admin KPIs | Order status changes, payments, inventory adjustments |
| **Dashboard Cache**| `cache:admin:dashboard:revenue:<period>` | 5 min | Revenue breakdown | Order status changes, refunds, payments |

---

## 5. Implementation Phases & Component Modifications

### Phase 1: Backend Infrastructure & Utilities
1. **`app/config/redis.js`**: Create resilient Redis connection manager, client getter, and cache helpers (`get`, `set`, `del`, `delPattern`).
2. **`app/config/env.js`**: Add Redis and cookie environment variables (`REDIS_URL`, `REDIS_ENABLED`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, `ACCESS_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_NAME`, `CSRF_SECRET`).
3. **`app/utils/token.js`**:
   - Provide `getAccessTokenCookieOptions()`, `getRefreshCookieOptions()`, `getCsrfCookieOptions()`.
   - Update cookie clear helpers with exact matching attributes.
4. **`app/middleware/csrfMiddleware.js`**:
   - Implement CSRF token generator (crypto HMAC) and verification middleware.
   - Exempt safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) and webhook endpoints with independent signatures.
5. **`app/middleware/rateLimiter.js`**:
   - Integrate `rate-limit-redis` store when Redis is connected; graceful fallback to memory store in local/test without Redis.
6. **`app/middleware/authMiddleware.js`**:
   - Authenticate requests by reading `req.cookies[ACCESS_TOKEN_COOKIE_NAME]`.
   - Fall back to `Authorization: Bearer` for non-browser/test clients.
   - Reject inactive/suspended users.

### Phase 2: Backend Auth & Controller Updates
1. **`app/controllers/authController.js`**:
   - Convert to clean class `AuthController` with `static async` methods.
   - `register`: Set `bb_access_token` and `bb_refresh_token` cookies. Response returns `{ user }` (no JWT in JSON).
   - `login`: Check failed login counter in Redis. Set cookies. Response returns `{ user }` (no JWT in JSON).
   - `refresh`: Read `bb_refresh_token` cookie. Perform atomic rotation. Set new cookies. Response returns `{ success: true, message }` (no JWT in JSON).
   - `logout`: Revoke session in MongoDB, clear both cookies.
   - `logoutAll`: Revoke all user sessions, clear both cookies.
   - `getCsrfToken`: Endpoint `GET /api/v1/auth/csrf-token` issuing CSRF token.
2. **Catalog & Dashboard Caching**:
   - `categoryController.js` & `productController.js`: Cache reads with Redis, invalidate caches on write mutations.
   - `adminDashboardController.js`: Cache overview and revenue with short TTLs; invalidate on order status transitions.
3. **`server.js`**:
   - Connect Redis during startup.
   - Register CSRF verification middleware.
   - Register Redis teardown in graceful shutdown.

### Phase 3: Customer Frontend Migration (`bentobabu-frontend`)
1. **`api/axios/axios.ts`**:
   - Remove `sessionStorage.getItem("bb_access_token")` and `inMemoryAccessToken`.
   - Ensure `withCredentials: true` is enabled on all requests.
   - Implement CSRF token lifecycle: pre-fetch CSRF token on boot/before mutating requests; attach `X-CSRF-Token` header.
   - Update 401 response interceptor: single-flight refresh queue calling `POST /auth/refresh` without expecting tokens in the body. Upon 200, replay pending requests.
   - On refresh failure (401), wipe user Redux state and redirect to `/login`.
2. **`services/authService.ts`**:
   - Remove references to storing access tokens in `localStorage` or `sessionStorage`.
   - Update `login` and `register` to store only user profile details (`bb_user`) in state/localStorage.
   - `logout`: call `POST /auth/logout`, clear Redux state and local profile.

### Phase 4: Admin Frontend Migration (`bentobabu-admin`)
1. **`api/axios/axios.ts`**:
   - Remove `sessionStorage.getItem("bb_admin_token")`.
   - Remove manual `Authorization: Bearer` header attachment.
   - Enable `withCredentials: true`.
   - Integrate CSRF token fetching and `X-CSRF-Token` header attachment.
   - Update 401 interceptor: single-flight refresh with cookie rotation.
2. **`services/authService.ts`**:
   - Update `login` to return `{ admin: user }` without expecting `accessToken`.
   - Remove `sessionStorage.setItem("bb_admin_token", ...)`.
   - Rehydrate session via `GET /auth/me` relying on HttpOnly cookie.
   - Enforce `user.role === 'ADMIN'` from backend response.

---

## 6. Deployment & Domain Topology

### Development Environment (Localhost)
- Backend: `http://127.0.0.1:5000`
- Customer Frontend: `http://localhost:3000`
- Admin Frontend: `http://localhost:3001`
- `COOKIE_SECURE=false`
- `COOKIE_SAME_SITE=lax`
- `COOKIE_DOMAIN=` (unset for localhost)
- `CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001`

### Recommended Production Topology (Same-Site Subdomains)
To ensure reliable cookie exchange without third-party cookie blocking:
- Backend API: `https://api.bentobabu.in`
- Customer Web: `https://bentobabu.in` (or `https://www.bentobabu.in`)
- Admin Portal: `https://admin.bentobabu.in`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=lax`
- `COOKIE_DOMAIN=.bentobabu.in`
- With `COOKIE_DOMAIN=.bentobabu.in`, cookies set by `api.bentobabu.in` are treated as first-party same-site cookies and reliably transmitted to `api.bentobabu.in` from both `bentobabu.in` and `admin.bentobabu.in`.

---

## 7. Migration Sequence & Backward Compatibility

1. **User Accounts & Password Hashes:** Remain completely unchanged in MongoDB.
2. **Existing Refresh Sessions:** Kept intact. Old sessions will rotate to the new HttpOnly cookie format on their next refresh.
3. **Old Browser Tokens:** Browsers holding old `sessionStorage` tokens will discard them on frontend reload. Users simply log in once or refresh their existing valid cookie session.
4. **Zero Downtime Deployment Order:**
   - Step 1: Deploy Redis cluster / provision Redis URL.
   - Step 2: Deploy updated `bentobabu-backend` (accepts both cookies and legacy Bearer tokens).
   - Step 3: Deploy updated `bentobabu-admin`.
   - Step 4: Deploy updated `bentobabu-frontend`.

