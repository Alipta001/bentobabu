# BentoBabu — HttpOnly Cookie Authentication Architecture & Security Specification

This document provides the definitive specification of the HttpOnly cookie-based authentication architecture implemented across the BentoBabu ecosystem:
- **Backend API**: Node.js / Express 5 (`bentobabu-backend`)
- **Customer Web Application**: Next.js 16 (App Router) (`bentobabu-frontend`)
- **Admin Operations Dashboard**: Next.js 16 (App Router) (`bentobabu-admin`)

---

## 1. Threat Model & Design Rationale

### Vulnerabilities Mitigated
1. **Cross-Site Scripting (XSS) Token Theft**:
   - In traditional SPAs storing JWTs in `localStorage` or `sessionStorage`, any injected third-party script, compromised npm package, or XSS flaw allows direct extraction of bearer credentials via `window.localStorage`.
   - By transitioning both Access and Refresh tokens to `HttpOnly` cookies, the browser runtime strictly prevents JavaScript (`document.cookie`) from reading or modifying authentication tokens.

2. **Cross-Site Request Forgery (CSRF)**:
   - Because ambient cookies are sent automatically by browsers on cross-site requests, cookie authentication introduces CSRF vulnerability.
   - BentoBabu mitigates this via a **Signed Double-Submit Cookie Pattern** coupled with `SameSite=Lax` (or `None` over HTTPS when partitioned across apex domains). Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require an unforgeable cryptographic HMAC signature validated by the server before controller execution.

3. **Replay & Session Hijacking**:
   - Refresh tokens are cryptographically randomized with unique `jti` nonces, hashed using SHA-256 before storage in MongoDB `RefreshSession` records, and rotated upon every single refresh. Reusing an old refresh token instantly invalidates the entire session family.

---

## 2. Cookie Specifications & Lifecycles

| Parameter | Access Token Cookie | Refresh Token Cookie | CSRF Token Cookie |
| :--- | :--- | :--- | :--- |
| **Cookie Name** | `bb_access_token` | `bb_refresh_token` | `bb_csrf_token` |
| **Storage Mechanism** | HttpOnly Cookie | HttpOnly Cookie | Readable Cookie (JS accessible) |
| **Payload** | Signed JWT (`id`, `role`, `email`) | Signed JWT (`id`, `sessionId`, `jti`) | `<rawToken>.<hmacSignature>` |
| **Token Lifetime** | 15 minutes (`900` seconds) | 7 days (`604,800` seconds) | 24 hours (`86,400` seconds) |
| **`HttpOnly`** | `true` | `true` | `false` (Must be read by Axios/fetch) |
| **`Secure`** | `true` in production (HTTPS); configurable via `COOKIE_SECURE` | `true` in production (HTTPS); configurable via `COOKIE_SECURE` | `true` in production (HTTPS); configurable via `COOKIE_SECURE` |
| **`SameSite`** | `Lax` (Default) or `None` (Cross-domain HTTPS) | `Lax` (Default) or `None` (Cross-domain HTTPS) | `Lax` (Default) or `None` (Cross-domain HTTPS) |
| **`Path`** | `/` | `/api/v1/auth` (Restricted to auth routes) | `/` |
| **`Domain`** | Set via `COOKIE_DOMAIN` (e.g. `.bentobabu.in`) | Set via `COOKIE_DOMAIN` (e.g. `.bentobabu.in`) | Set via `COOKIE_DOMAIN` (e.g. `.bentobabu.in`) |

---

## 3. Cryptographic CSRF Defense Specification

### Token Structure
The CSRF protection is implemented in `app/middleware/csrfMiddleware.js`.
- **Raw Token**: 32 bytes cryptographically secure pseudo-random hex string (`crypto.randomBytes(32)`).
- **HMAC Signature**: Generated using `SHA-256` keyed with `CSRF_SECRET`.
- **Cookie Value**: `${rawToken}.${signature}` stored in `bb_csrf_token`.

### Client-Side Handshake & Transmission
1. Frontend initializes or bootstraps by issuing `GET /api/v1/auth/csrf-token`.
2. The server sets the signed `bb_csrf_token` cookie and returns `{ success: true, data: { csrfToken: "<rawToken>" } }`.
3. Client-side HTTP interceptors extract the raw token from the cookie or JSON payload and attach it as the HTTP header:
   ```http
   X-CSRF-Token: <rawToken>
   ```

### Server-Side Verification
On mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`):
1. **Safe-method exemption**: `GET`, `HEAD`, `OPTIONS` bypass validation.
2. **Exempted paths**: Webhook endpoints (such as `/api/v1/payments/razorpay/webhook`, which use cryptographic HMAC-SHA256 signatures over request bodies) are exempted from CSRF checks.
3. **Double-submit check**:
   - The cookie `bb_csrf_token` is parsed into `rawToken` and `signature`.
   - The server verifies HMAC signature: `HMAC_SHA256(rawToken, CSRF_SECRET) === signature` using constant-time string comparison (`crypto.timingSafeEqual`).
   - The server verifies that the header `x-csrf-token` matches the cookie `rawToken`.
4. If validation fails, the request is immediately rejected with HTTP `403 Forbidden` (`CSRF token mismatch or invalid signature`).

---

## 4. Frontend Single-Flight 401 Refresh Architecture

Both frontend applications (`bentobabu-frontend` and `bentobabu-admin`) implement concurrent request queuing via Axios response interceptors:

```text
                  Incoming Request (mutating or read)
                                  │
                                  ▼
                        HTTP Request Dispatched
                       (withCredentials: true)
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
           HTTP 200 OK                     HTTP 401 Unauthorized
                 │                                 │
                 ▼                                 ▼
           Return Response           Is Refresh Already In Flight?
                                            │             │
                                      YES   │             │ NO
                                            ▼             ▼
                                  Encountered Queue   Set isRefreshing = true
                                  Wait for Promise    Dispatch POST /auth/refresh
                                            │             │
                                            │      ┌──────┴──────┐
                                            │      ▼             ▼
                                            │   Success       Failure
                                            │      │             │
                                            │      │      Logout & Redirect
                                            │      ▼             │
                                            └─► Retry Original Req ◄┘
```

### Key Rules
1. `withCredentials: true` is enabled on the global Axios instance.
2. The refresh request `POST /api/v1/auth/refresh` does not require access token headers; the browser passes `bb_refresh_token` automatically.
3. Responses to `/auth/login`, `/auth/register`, and `/auth/refresh` do NOT return JWTs in the JSON body. The response contains only `{ success: true, data: { user } }`.
4. Failed refresh immediately clears user profile storage, resets the queue, and redirects the user to `/auth/login` (or `/login` for admin).

---

## 5. Security Headers & Browser Hardening

The backend enforces standard HTTP security headers:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CORS headers configured strictly against registered origins (`FRONTEND_URL`, `ADMIN_URL`) with `Access-Control-Allow-Credentials: true`.

