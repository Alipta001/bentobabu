# BentoBabu — Redis Integration & Caching Strategy

This document details the Redis caching layer, distributed rate limiting, and brute-force security controls integrated into the BentoBabu backend (`bentobabu-backend`).

---

## 1. Connection Architecture & Resilience Policy

The centralized Redis client is managed in `app/config/redis.js` using `node-redis` (v4+).

### Resilient Fail-Safe Policy
Redis is treated as a **performance accelerator and ephemeral protection store**, never as an authoritative persistent data store.
- **Fail-Open Strategy**: If Redis is offline, disconnected, or times out, caching operations (`redisGet`, `redisSet`, `redisDel`) fail silently and gracefully pass through to MongoDB without halting request processing.
- **Rate-Limiter Fallback**: Distributed rate limiting through `rate-limit-redis` automatically falls back to an in-memory sliding-window store if the Redis connection drops.
- **Reconnection Strategy**: Exponential backoff with jitter:
  $$\text{delay} = \min(50 \cdot 2^{\text{attempt}}, 3000)\,\text{ms}$$
  capped at a maximum 3000ms delay between reconnection attempts.
- **TLS & Cloud Support**: Fully compatible with TLS connections (`rediss://`) on managed platforms (Upstash, AWS ElastiCache, Redis Cloud, Render Redis).

---

## 2. Key Namespace & TTL Catalog

All keys in Redis use structured hierarchical namespaces prefixed with `bb:` or domain prefixes to avoid collisions:

| Key Pattern | Description | TTL | Invalidation Trigger |
| :--- | :--- | :--- | :--- |
| `cache:categories:all` | Complete list of active public categories | 1 Hour (`3600s`) | Any Category create, update, reorder, or deletion |
| `cache:products:all:<hash>` | Paginated & filtered product search results | 30 Minutes (`1800s`) | Any Product create, update, inventory change, or deletion |
| `cache:products:detail:<id>` | Product detail by ID / slug | 30 Minutes (`1800s`) | Product update, status change, or deletion |
| `cache:admin:dashboard:overview` | Aggregated executive KPIs & order status counters | 3 Minutes (`180`s) | Order status transition, new order placement |
| `cache:admin:dashboard:revenue` | Aggregated revenue, gross sales, average order value | 5 Minutes (`300`s) | Order marked PAID, cancelled, or refunded |
| `auth:failed:<identifier>` | Counter for failed login attempts by email or IP | 15 Minutes (`900`s) | Successful login resets counter; reaches limit (5) triggers lockout |
| `rl:*` | Distributed API rate-limiting windows | 15 Minutes (`900`s) | Natural window sliding expiration |

---

## 3. Cache Invalidation Mechanisms

To avoid stale cache reads, the backend uses atomic and pattern-based invalidations:

### Atomic Key Invalidation
Used when modifying a single identifiable entity:
```javascript
await redisDel(`cache:products:detail:${productId}`);
```

### Pattern-Based Invalidation
When product attributes or categories change, all variations of paginated and filtered queries must be cleared. This is done safely via non-blocking `SCAN` iteration:
```javascript
await redisDelPattern('cache:products:all:*');
await redisDelPattern('cache:admin:dashboard:*');
```
*Note: The pattern deletion implementation utilizes iterative Redis `SCAN` with string cursors (`'0'`) to ensure production safety and prevent blocking the Redis event loop on large keyspaces.*

---

## 4. Authentication Security & Lockout Implementation

The `auth:failed:<identifier>` namespace protects against credential stuffing and brute-force attacks:
1. Upon failed login attempt (`POST /api/v1/auth/login`), `recordFailedLogin(identifier)` increments the counter and sets a 15-minute expiration.
2. When the counter exceeds `MAX_FAILED_LOGIN_ATTEMPTS` (5 attempts):
   - `checkFailedLoginStatus(identifier)` returns `isLocked: true` and remaining cooldown seconds.
   - The controller rejects incoming login attempts with HTTP `429 Too Many Requests` (`Too many failed attempts. Try again in X minutes.`).
3. Upon successful credential verification, `clearFailedLogin(identifier)` deletes the security key immediately.

---

## 5. Health Check & Monitoring

The system health endpoint `GET /api/v1/health` reports the operational status of the Redis subsystem:
```json
{
  "status": "UP",
  "timestamp": "2026-11-11T10:30:00.000Z",
  "database": "CONNECTED",
  "redis": "CONNECTED"
}
```
If Redis is disconnected while MongoDB remains healthy, the endpoint returns `status: "DEGRADED"` with `redis: "DISCONNECTED"`.

