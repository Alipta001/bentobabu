# BentoBabu — Authentication & Production Deployment Checklist

This guide provides the complete operational roadmap for deploying BentoBabu with HttpOnly cookies, CSRF protection, and Redis across modern cloud providers (e.g. Render for backend/Redis, Vercel for frontends).

---

## 1. Domain & Cookie Architecture Plan

To ensure seamless browser cookie transmission across the API and frontend applications without third-party cookie restrictions, BentoBabu uses a unified apex domain structure.

### Recommended Domain Hierarchy
- **Customer Web Store**: `https://bentobabu.in` or `https://www.bentobabu.in`
- **Admin Dashboard**: `https://admin.bentobabu.in`
- **Backend API**: `https://api.bentobabu.in`

### Production Cookie Configuration
By setting `COOKIE_DOMAIN=.bentobabu.in` (with the leading dot):
- `bb_access_token` and `bb_refresh_token` are sent automatically by browsers to `api.bentobabu.in` from both `bentobabu.in` and `admin.bentobabu.in`.
- `COOKIE_SAME_SITE=Lax` works reliably because requests between subdomains sharing a registrable domain are considered **same-site**.
- `COOKIE_SECURE=true` ensures cookies are strictly transmitted over HTTPS.

> **Note on Cross-Origin Cloud Domains (e.g. Vercel + Render without custom domains)**:
> If hosting on different domains (e.g. `bentobabu.vercel.app` and `bentobabu-api.onrender.com`), browsers treat them as **cross-site**.
> In this scenario:
> 1. Set `COOKIE_SAME_SITE=None`
> 2. Set `COOKIE_SECURE=true`
> 3. Leave `COOKIE_DOMAIN` unset (or omitted) so the browser binds the cookie strictly to the API host.

---

## 2. Environment Variables Checklist

### Backend (`bentobabu-backend`)
Configure in Render / Railway / AWS ECS environment settings:

| Variable | Description | Example Production Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | HTTP port | `5000` |
| `MONGODB_URI` | MongoDB Atlas replica set URI | `mongodb+srv://user:pass@cluster.mongodb.net/bentobabu?retryWrites=true&w=majority` |
| `REDIS_URL` | Managed Redis connection string | `rediss://default:token@cluster.upstash.io:6379` |
| `REDIS_ENABLED` | Toggle Redis layer | `true` |
| `JWT_ACCESS_SECRET` | 256-bit cryptographically random secret | *(Generate with `openssl rand -hex 32`)* |
| `JWT_REFRESH_SECRET` | 256-bit cryptographically random secret | *(Generate with `openssl rand -hex 32`)* |
| `CSRF_SECRET` | 256-bit secret for signing CSRF tokens | *(Generate with `openssl rand -hex 32`)* |
| `FRONTEND_URL` | Customer frontend origin for CORS | `https://bentobabu.in` |
| `ADMIN_URL` | Admin frontend origin for CORS | `https://admin.bentobabu.in` |
| `COOKIE_SECURE` | Enforce HTTPS-only cookie transmission | `true` |
| `COOKIE_SAME_SITE` | Cookie SameSite enforcement | `Lax` (or `None` for cross-apex setups) |
| `COOKIE_DOMAIN` | Apex domain for cookie sharing | `.bentobabu.in` |
| `ACCESS_TOKEN_COOKIE_NAME` | Access token cookie name | `bb_access_token` |
| `REFRESH_TOKEN_COOKIE_NAME` | Refresh token cookie name | `bb_refresh_token` |

### Customer Frontend (`bentobabu-frontend`)
Configure in Vercel / Cloudflare Pages environment settings:

| Variable | Description | Example Production Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base URL for backend API | `https://api.bentobabu.in/api/v1` |

### Admin Frontend (`bentobabu-admin`)
Configure in Vercel / Cloudflare Pages environment settings:

| Variable | Description | Example Production Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base URL for backend API | `https://api.bentobabu.in/api/v1` |

---

## 3. Zero-Downtime Rollout Sequence

To ensure users already browsing or operating the system do not experience authentication failures during deployment, execute in the following order:

```text
Step 1: Redis Provisioning
        Verify connectivity and health checks with node-redis.
                │
                ▼
Step 2: Backend API Deployment
        Deploy bentobabu-backend with backwards compatibility active.
        (Reads both cookies and Authorization: Bearer headers).
                │
                ▼
Step 3: Frontend Deployment (Customer & Admin)
        Deploy bentobabu-frontend and bentobabu-admin with withCredentials: true
        and CSRF token handshake.
                │
                ▼
Step 4: End-to-End Verification
        Verify login, token refresh, and CSRF protection in browser devtools.
```

---

## 4. Post-Deployment Verification Protocol

1. **Verify CORS & Headers**:
   ```bash
   curl -I -X OPTIONS https://api.bentobabu.in/api/v1/auth/csrf-token \
     -H "Origin: https://bentobabu.in" \
     -H "Access-Control-Request-Method: GET"
   ```
   *Expected Response*: Status `204 No Content` or `200 OK`, with `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Origin: https://bentobabu.in`.

2. **Verify CSRF Handshake**:
   ```bash
   curl -I https://api.bentobabu.in/api/v1/auth/csrf-token
   ```
   *Expected Response*: `Set-Cookie: bb_csrf_token=...; Path=/; SameSite=Lax`

3. **Verify Login Cookie Delivery**:
   Inspect browser devtools Application > Cookies tab upon logging in. Verify:
   - `bb_access_token`: `HttpOnly: true`, `Secure: true`, `SameSite: Lax`
   - `bb_refresh_token`: `HttpOnly: true`, `Secure: true`, `SameSite: Lax`, `Path: /api/v1/auth`

4. **Verify Health Endpoint**:
   ```bash
   curl https://api.bentobabu.in/api/v1/health
   ```
   *Expected Response*: `{"status":"UP","database":"CONNECTED","redis":"CONNECTED"}`

