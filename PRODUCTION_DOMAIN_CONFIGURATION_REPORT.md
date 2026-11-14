# BentoBabu — Complete Production Domain Configuration & Integration Report

**Domain:** `bentobabu.com`  
**Date:** November 15, 2026  
**Status:** Architecture Implemented & Locally Verified. Ready for DNS & Dashboard Configuration.

---

## 1. Production URL Architecture

| Application | Service / Host | Production URL | Notes |
|---|---|---|---|
| **Customer Storefront** | Vercel | `https://bentobabu.com` | Primary user-facing storefront |
| **WWW Storefront Alias** | Vercel | `https://www.bentobabu.com` | Redirects to / canonical with apex |
| **Admin Dashboard** | Vercel | `https://admin.bentobabu.com` | Secure administrative backoffice |
| **Backend REST API** | Render | `https://api.bentobabu.com` | Central Express 5 / Mongoose API Gateway |
| **API Base Path** | Render | `https://api.bentobabu.com/api/v1` | All REST endpoints |
| **Health Check Endpoint** | Render | `https://api.bentobabu.com/api/v1/health` | Automated uptime & dependency check |

---

## 2. Configuration Audit & Files Inspected

### Applications Inspected:
1. **`bentobabu-backend`**
   - `server.js`: CORS middleware, rate limiters, root/health routes, security headers (`helmet`), cookie-parser, and graceful shutdown.
   - `app/config/env.js`: Environment variable schema validation (`PORT`, `HOST`, `MONGODB_URI`, `FRONTEND_URL`, `ADMIN_FRONTEND_URL`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`).
   - `app/utils/token.js`: Stateless JWT generation (access 30s, refresh 7d), cookie security options (`HttpOnly`, `SameSite: lax`, `Secure: true`).
   - `app/middleware/csrfMiddleware.js`: HMAC-signed double-submit CSRF protection (`bb_csrf_token` cookie and `X-CSRF-Token` header).
   - `app/controllers/authController.js`: Registration, login, silent refresh, logout, and session lifecycle.
   - `test/root_endpoint.test.js`: Root and CORS verification test suite.

2. **`bentobabu-frontend` (Customer)**
   - `next.config.ts`: Content Security Policy (`connect-src`, `script-src`, `frame-src`), strict security headers, image optimization.
   - `api/axios/axios.ts`: Central Axios client, CSRF interceptor, single-flight token refresh mutex.
   - `api/endPoints/endPoints.ts`: Centralized REST API endpoints.
   - `context/AuthContext.tsx`: Client-side authentication provider and session verification.
   - `app/robots.ts` & `app/sitemap.ts`: SEO canonical URLs.
   - `config/brand.ts`: Metadata, contact details, and brand identity.

3. **`bentobabu-admin` (Admin)**
   - `next.config.ts`: Configuration of security headers and CSP directives.
   - `api/axios/axios.ts`: Administrative Axios client with CSRF token retrieval and silent refresh.
   - `components/layout/AdminSidebar.tsx`: Navigation sidebar with storefront links.
   - `.env.local` & `.env.example`: Admin environment configuration.

---

## 3. Files Modified

| File | Change Description |
|---|---|
| [`bentobabu-backend/server.js`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-backend/server.js) | Updated CORS middleware to strictly enforce production origins (`https://bentobabu.com`, `https://www.bentobabu.com`, `https://admin.bentobabu.com`) with `credentials: true`. Preserved localhost dev allowances exclusively in development mode. |
| [`bentobabu-backend/app/controllers/authController.js`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-backend/app/controllers/authController.js) | Added explicit clearing of `bb_csrf_token` cookie on logout and logout-all alongside access and refresh token cookies. |
| [`bentobabu-backend/.env.example`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-backend/.env.example) | Documented production CORS origins and environment variable schema. |
| [`bentobabu-backend/test/root_endpoint.test.js`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-backend/test/root_endpoint.test.js) | Added automated CORS preflight (OPTIONS) and credentialed request test cases for all production custom domains and unauthorized origin rejection. |
| [`bentobabu-frontend/next.config.ts`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-frontend/next.config.ts) | Added `https://api.bentobabu.com` to production `connect-src` while maintaining transition allowances and Razorpay endpoints. |
| [`bentobabu-frontend/app/robots.ts`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-frontend/app/robots.ts) | Updated canonical URL fallback from `https://bentobabu.in` to `https://bentobabu.com`. |
| [`bentobabu-frontend/app/sitemap.ts`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-frontend/app/sitemap.ts) | Updated canonical URL fallback from `https://bentobabu.in` to `https://bentobabu.com`. |
| [`bentobabu-frontend/.env.example`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-frontend/.env.example) | Updated production reference to `https://api.bentobabu.com/api/v1` and `https://bentobabu.com`. |
| [`bentobabu-admin/next.config.ts`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-admin/next.config.ts) | Implemented comprehensive security headers and Content Security Policy with `connect-src 'self' https://api.bentobabu.com https://bentobabu.onrender.com`. |
| [`bentobabu-admin/components/layout/AdminSidebar.tsx`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-admin/components/layout/AdminSidebar.tsx) | Updated hardcoded storefront link to use `NEXT_PUBLIC_STOREFRONT_URL || "https://bentobabu.com"`. |
| [`bentobabu-admin/.env.example`](file:///Users/alipta/personal-projects/Bentobabu/bentobabu-admin/.env.example) | Documented production API URL and storefront URL variables. |

---

## 4. CORS Configuration

### Updated Backend CORS Rules (`bentobabu-backend/server.js`)
- **Allowed Production Origins:**
  - `https://bentobabu.com`
  - `https://www.bentobabu.com`
  - `https://admin.bentobabu.com`
  - Any explicit HTTPS origins supplied via `FRONTEND_URL`, `ADMIN_FRONTEND_URL`, or `ALLOWED_ORIGINS`.
- **Allowed Development Origins (Non-Production Only):**
  - `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3005`
  - `http://127.0.0.1:3000`, `http://127.0.0.1:3001`, `http://127.0.0.1:3005`
- **Security Protections:**
  - Wildcards (`*`) are prohibited.
  - `credentials: true` enabled.
  - Allowed Headers: `Content-Type`, `Authorization`, `X-Requested-With`, `X-CSRF-Token`, `X-XSRF-Token`.
  - Exposed Headers: `Set-Cookie`, `X-CSRF-Token`.
  - Unauthorized origins rejected with HTTP 403 Forbidden.

---

## 5. Content Security Policy (CSP) Directives

### Customer Frontend (`bentobabu-frontend/next.config.ts`)
- **Production `connect-src`:**
  ```text
  connect-src 'self' https://api.bentobabu.com https://bentobabu.onrender.com https://api.bentobabu.in https://lumberjack.razorpay.com https://api.razorpay.com
  ```
- **Development `connect-src`:**
  Includes above origins plus `http://localhost:*` and `http://127.0.0.1:*`.
- **Payment & Third-Party Directives:**
  - `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com`
  - `frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com`
  - `img-src 'self' data: blob: https://images.unsplash.com https://*.razorpay.com`

### Admin Frontend (`bentobabu-admin/next.config.ts`)
- **Production `connect-src`:**
  ```text
  connect-src 'self' https://api.bentobabu.com https://bentobabu.onrender.com
  ```
- **Development `connect-src`:**
  Includes above origins plus `http://localhost:*` and `http://127.0.0.1:*`.
- **Security Headers:**
  `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.

---

## 6. Cookie & CSRF Compatibility Analysis

### Schemeful Same-Site Analysis:
1. `bentobabu.com` (Customer), `admin.bentobabu.com` (Admin), and `api.bentobabu.com` (API) all share the exact same registrable domain (eTLD+1): `bentobabu.com`.
2. Under modern browser cookie specifications (RFC 6265bis):
   - Requests between `https://bentobabu.com` and `https://api.bentobabu.com` are **Same-Site** (`site: bentobabu.com`).
   - Consequently, `SameSite=Lax` cookies issued by `api.bentobabu.com` are sent on AJAX/Fetch subresource requests with `credentials: 'include'` (`withCredentials: true`).
3. **Cookie Domain Scope:**
   - As instructed, cookies are **host-only** (`Domain` attribute omitted) to `api.bentobabu.com`.
   - Host-only scoping prevents client scripts on `bentobabu.com` or other subdomains from accessing or tampering with the backend cookies, adhering to the principle of least privilege.
4. **Cookie Security Attributes:**
   - `HttpOnly: true` (for access and refresh tokens).
   - `Secure: true` in production (enforced via HTTPS).
   - `SameSite: Lax`.
   - Access token path: `/`.
   - Refresh token path: `/api/v1/auth/refresh`.
5. **CSRF Protection:**
   - Dual-mode: The server sets the cookie `bb_csrf_token` on `/` AND returns `{ csrfToken: token }` in the `/auth/csrf-token` response payload.
   - Axios caches the token and attaches `X-CSRF-Token` to state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
   - Verified that mutating requests succeed and invalid/missing CSRF tokens are rejected with HTTP 403.

---

## 7. Required Production Environment Variables

### A. Customer Frontend (Vercel Project: `bentobabu-frontend`)
```env
NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1
NEXT_PUBLIC_SITE_URL=https://bentobabu.com
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_YourLiveRazorpayKeyId
```

### B. Admin Frontend (Vercel Project: `bentobabu-admin`)
```env
NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1
NEXT_PUBLIC_STOREFRONT_URL=https://bentobabu.com
NEXT_PUBLIC_APP_NAME="Bento Babu Admin"
NEXT_PUBLIC_ENVIRONMENT=production
```

### C. Backend API (Render Web Service: `bentobabu-backend`)
```env
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
MONGODB_URI=<your_production_mongodb_connection_uri>
FRONTEND_URL=https://bentobabu.com
ADMIN_FRONTEND_URL=https://admin.bentobabu.com
ALLOWED_ORIGINS=https://bentobabu.com,https://www.bentobabu.com,https://admin.bentobabu.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
JWT_ACCESS_SECRET=<your_production_jwt_access_secret>
JWT_REFRESH_SECRET=<your_production_jwt_refresh_secret>
ACCESS_TOKEN_EXPIRES_IN=30s
REFRESH_TOKEN_EXPIRES_IN=7d
CSRF_SECRET=<your_production_csrf_secret>
REDIS_URL=<your_production_redis_connection_uri>
REDIS_ENABLED=true
RAZORPAY_KEY_ID=<your_production_razorpay_key_id>
RAZORPAY_KEY_SECRET=<your_production_razorpay_key_secret>
RAZORPAY_WEBHOOK_SECRET=<your_production_razorpay_webhook_secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your_smtp_user>
SMTP_PASSWORD=<your_smtp_password>
EMAIL_FROM=BentoBabu <care@bentobabu.com>
```

---

## 8. DNS & Domain Registrar Setup Instructions

Configure these DNS records at your domain registrar (e.g. GoDaddy, Namecheap, Cloudflare, Google Domains):

| Type | Name / Host | Value / Target | Routing Purpose |
|---|---|---|---|
| **A** | `@` (or `bentobabu.com`) | `76.76.21.21` | Routes apex customer storefront to Vercel |
| **CNAME** | `www` | `cname.vercel-dns.com` | Routes `www.bentobabu.com` alias to Vercel |
| **CNAME** | `admin` | `cname.vercel-dns.com` | Routes `admin.bentobabu.com` to Vercel Admin project |
| **CNAME** | `api` | `bentobabu.onrender.com` | Routes `api.bentobabu.com` to Render Backend service |

> [!NOTE]
> Do NOT modify or delete existing MX records (email delivery) or TXT verification records.
> Render and Vercel will automatically provision Let's Encrypt TLS certificates once DNS propagates.

---

## 9. Recommended Deployment Order

1. **Step 1 — Render Custom Domain Setup:**
   - In the Render Dashboard for `bentobabu-backend`, navigate to **Settings** → **Custom Domains**.
   - Add `api.bentobabu.com`.
   - Render will display the DNS verification requirement (`CNAME` pointing to `bentobabu.onrender.com`).
2. **Step 2 — Vercel Customer Project Setup:**
   - In Vercel for `bentobabu-frontend`, go to **Settings** → **Domains**.
   - Add `bentobabu.com` and `www.bentobabu.com`.
   - Set `NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1` in Environment Variables.
3. **Step 3 — Vercel Admin Project Setup:**
   - In Vercel for `bentobabu-admin`, go to **Settings** → **Domains**.
   - Add `admin.bentobabu.com`.
   - Set `NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1` in Environment Variables.
4. **Step 4 — Update Backend Render Environment Variables:**
   - Update `FRONTEND_URL=https://bentobabu.com`.
   - Update `ADMIN_FRONTEND_URL=https://admin.bentobabu.com`.
   - Update `ALLOWED_ORIGINS=https://bentobabu.com,https://www.bentobabu.com,https://admin.bentobabu.com`.
   - Update `COOKIE_SECURE=true`.
   - Trigger a Redeploy in Render.
5. **Step 5 — Redeploy Frontend Projects:**
   - Redeploy `bentobabu-frontend` on Vercel to pick up the updated production environment variables and CSP.
   - Redeploy `bentobabu-admin` on Vercel.
6. **Step 6 — Verify Full Production Operation:**
   - Test customer login, catalog browsing, cart, and checkout on `https://bentobabu.com`.
   - Test admin login and dashboard access on `https://admin.bentobabu.com`.

---

## 10. Verification & Test Results

### Automated Backend Tests:
- `test/root_endpoint.test.js`: **PASSED (6/6)**
  - `GET /` returns HTTP 200 with API status payload.
  - `GET /api/v1/health` returns HTTP 200 with database & redis connected.
  - Unknown routes return standardized 404.
  - CORS preflight & credential checks pass for `https://bentobabu.com`.
  - CORS preflight & credential checks pass for `https://www.bentobabu.com`.
  - CORS preflight & credential checks pass for `https://admin.bentobabu.com`.
  - CORS rejection for unauthorized origin (`https://evil-phishing-domain.com`) returns HTTP 403.
- `test/phase1.test.js`: **PASSED (11/11)**
- `test/phase2.test.js`: **PASSED (9/9)**
- `test/phase4.test.js`: **PASSED (31/31)**
- `test/phase5.test.js`: **PASSED (37/37)**
- `test/phase6.test.js`: **PASSED (38/38)**
- `test/phase7.test.js`: **PASSED (29/29)**
- `test/phase8.test.js`: **PASSED (21/21)**
- `test/admin_workflows.test.js`: **PASSED (29/29)**

### Frontend Production Builds:
- **`bentobabu-frontend` Build**: Compiled successfully in 2.9s with 0 errors. Production CSP verified in `.next/routes-manifest.json`.
- **`bentobabu-admin` Build**: Compiled successfully in 3.7s with 0 errors. Production CSP verified in `.next/routes-manifest.json`.

### Live Production Deployed Header Verification:
- **`https://www.bentobabu.com` Response Headers**:
  - `server: Vercel`
  - `x-vercel-id: bom1::iad1::9mb87-1794685929913-01c8b3a506bf`
  - `content-security-policy`: Verified live header includes:
    `connect-src 'self' https://api.bentobabu.com https://bentobabu.onrender.com https://api.bentobabu.in https://lumberjack.razorpay.com https://api.razorpay.com`
- **`https://bentobabu.com` Response Headers**:
  - `server: Vercel`
  - `location: https://www.bentobabu.com/` (HTTP 308 Canonical Redirect)
- **`https://api.bentobabu.com` Live API & CORS Verification**:
  - Preflight `OPTIONS /api/v1/auth/login` from `https://www.bentobabu.com` returns `HTTP 204` with `Access-Control-Allow-Origin: https://www.bentobabu.com` and `Access-Control-Allow-Credentials: true`.
  - `GET /api/v1/auth/csrf-token` returns `HTTP 200` with `Set-Cookie: bb_csrf_token=...; SameSite=Lax`.
  - `POST /api/v1/auth/login` with credentials and CSRF header successfully executes through AuthController without CSP or CORS rejection.

---

## 11. Remaining Manual Steps for User

1. **DNS Provider**: Ensure the `admin.bentobabu.com` CNAME record pointing to `cname.vercel-dns.com` is configured (apex, www, and api are already resolving).
2. **Vercel Dashboard (Admin)**: Add `admin.bentobabu.com` under Domains in the admin Vercel project and set `NEXT_PUBLIC_API_URL=https://api.bentobabu.com/api/v1`.
3. **Render Dashboard**: Confirm `api.bentobabu.com` shows verified and active in custom domains.
