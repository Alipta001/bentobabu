/**
 * BentoBabu Rate Limiter Middleware
 * Uses Redis distributed store when available, with resilient in-memory fallback.
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient, isRedisReady, initRedis } = require('../config/redis');

/**
 * Resilient Store combining Redis distributed rate-limiting with in-memory fallback.
 * Ensures a Redis outage never disables security-sensitive rate-limiting.
 */
class ResilientStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memoryStore = new rateLimit.MemoryStore();
    this.redisStore = new RedisStore({
      sendCommand: async (...args) => {
        let client = getRedisClient();
        if (!client || !client.isReady) {
          try {
            client = await initRedis();
          } catch {

            // ignore
          }
        }
        if (client && (client.isReady || client.isOpen)) {
          return client.sendCommand(args);
        }
        throw new Error('Redis not ready');
      },
      prefix,
    });
  }

  init(options) {
    this.options = options;
    this.memoryStore.init(options);
    Promise.resolve(this.redisStore.init(options)).catch(() => { });
  }

  async get(key) {
    if (isRedisReady()) {
      try {
        return await this.redisStore.get(key);
      } catch (err) {
        // Fall back to memory store on error
      }
    }
    return this.memoryStore.get(key);
  }

  async increment(key) {
    if (isRedisReady()) {
      try {
        return await this.redisStore.increment(key);
      } catch (err) {
        // Fall back to memory store on error
      }
    }
    return this.memoryStore.increment(key);
  }

  async decrement(key) {
    if (isRedisReady()) {
      try {
        return await this.redisStore.decrement(key);
      } catch (err) {
        // Fall back to memory store on error
      }
    }
    return this.memoryStore.decrement(key);
  }

  async resetKey(key) {
    if (isRedisReady()) {
      try {
        await this.redisStore.resetKey(key);
      } catch (err) {
        // Fall back to memory store on error
      }
    }
    return this.memoryStore.resetKey(key);
  }

  async resetAll() {
    if (typeof this.memoryStore.resetAll === 'function') {
      await this.memoryStore.resetAll();
    }
  }
}

const isDevOrTest =
  process.env.NODE_ENV === 'test' ||
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'staging' ||
  process.env.STAGING_LOAD_TEST === 'true';

/**
 * Global rate limiter to protect against brute-force and DoS attacks
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 50000 : 200, // Limit each IP
  standardHeaders: true, // draft-6/draft-7 RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  store: new ResilientStore('rl:global:'),
  passOnStoreError: false, // Do not bypass rate limiting on store errors
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

/**
 * Stricter rate limiter for sensitive authentication endpoints (login, register)
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:auth:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
});

/**
 * Dedicated rate limiter for token refresh operations
 */
const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 3000 : 120, // 120 refresh calls per 15 min per IP in prod
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:refresh:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many token refresh attempts from this IP, please try again after 15 minutes',
  },
});

/**
 * Rate limiter for OTP operations (Delivery / Verification)
 */
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:otp:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many OTP verification attempts. Please wait 10 minutes.',
  },
});

/**
 * Rate limiter for media upload and initialization operations
 */
const mediaUploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 1000 : 60, // 60 uploads per 15 min in prod
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:media:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many media upload attempts. Please wait 15 minutes.',
  },
});

/**
 * Rate limiter for push notification test endpoint
 */
const pushTestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 1000 : 10, // 10 test pushes per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:pushtest:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many test push attempts. Please wait 15 minutes.',
  },
});

/**
 * Rate limiter for support ticket creation and customer replies
 */
const supportTicketRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 1000 : 20, // 20 actions per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:support:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many support actions. Please wait a few minutes before submitting another request.',
  },
});

/**
 * Rate limiter for service expansion voting (prevents vote stuffing)
 */
const serviceExpansionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: isDevOrTest ? 1000 : 30, // 30 votes per 15 min per IP in prod
  standardHeaders: true,
  legacyHeaders: false,
  store: new ResilientStore('rl:expansion:'),
  passOnStoreError: false,
  message: {
    success: false,
    message: 'Too many voting requests from this network. Please try again after 15 minutes.',
  },
});

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  refreshRateLimiter,
  otpRateLimiter,
  mediaUploadRateLimiter,
  pushTestRateLimiter,
  supportTicketRateLimiter,
  serviceExpansionRateLimiter,
};
