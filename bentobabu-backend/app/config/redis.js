/**
 * BentoBabu Redis Client & Cache Manager
 * Provides centralized connection management, automatic reconnection,
 * graceful shutdown, and caching/counter helpers.
 */

const { createClient } = require('redis');

let redisClient = null;
let isConnected = false;
let isConnecting = false;
let connectionPromise = null;

/**
 * Initializes and connects the Redis client
 */
const initRedis = async () => {
  const isEnabled = process.env.REDIS_ENABLED !== 'false';
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  if (!isEnabled) {
    console.log('[Redis] Redis is disabled via REDIS_ENABLED=false. Operating in standalone mode.');
    return null;
  }

  if (redisClient && isConnected && redisClient.isReady) {
    return redisClient;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    isConnecting = true;
    try {
      const clientOptions = {
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            // Exponential backoff capped at 3000ms with jitter, continuous retry
            const jitter = Math.floor(Math.random() * 200);
            const delay = Math.min(retries * 200, 3000) + jitter;
            if (retries <= 3 || retries % 10 === 0) {
              console.warn(`[Redis] Connection lost. Attempting reconnection #${retries} in ${delay}ms...`);
            }
            return delay;
          },
          connectTimeout: 5000,
        },
      };

      // If rediss:// is used, enable TLS options safely
      if (redisUrl.startsWith('rediss://')) {
        clientOptions.socket.tls = true;
        if (process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'false') {
          clientOptions.socket.rejectUnauthorized = false;
        }
      }

      redisClient = createClient(clientOptions);

      redisClient.on('connect', () => {
        console.log('[Redis] Connecting to Redis server...');
      });

      redisClient.on('ready', () => {
        isConnected = true;
        isConnecting = false;
        console.log('[Redis] Connected and ready.');
      });

      redisClient.on('error', (err) => {
        isConnected = false;
        console.error('[Redis] Error:', err.message);
      });

      redisClient.on('end', () => {
        isConnected = false;
        isConnecting = false;
        console.log('[Redis] Connection closed.');
      });

      await redisClient.connect();
      isConnected = true;
      return redisClient;
    } catch (err) {
      isConnected = false;
      redisClient = null;
      const maskedUrl = redisUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
      console.warn(`[Redis] Initial connection to ${maskedUrl} failed: ${err.message}. Application will fall back safely.`);
      return null;
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  })();

  return connectionPromise;
};

/**
 * Returns the raw Redis client instance
 */
const getRedisClient = () => redisClient;

/**
 * Checks whether Redis is currently connected and operational
 */
const isRedisReady = () => Boolean(isConnected && redisClient && redisClient.isReady);

/**
 * Gracefully disconnects Redis client
 */
const disconnectRedis = async () => {
  if (redisClient && (redisClient.isOpen || redisClient.isReady)) {
    try {
      await redisClient.quit();
      console.log('[Redis] Client disconnected gracefully.');
    } catch (err) {
      console.error('[Redis] Error during disconnect:', err.message);
    } finally {
      isConnected = false;
      isConnecting = false;
      redisClient = null;
      connectionPromise = null;
    }
  }
};

/**
 * Get value from Redis cache by key
 */
const redisGet = async (key) => {
  if (!isRedisReady()) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[Redis] Get failed for key "${key}":`, err.message);
    return null;
  }
};

/**
 * Set value in Redis cache with TTL in seconds
 */
const redisSet = async (key, value, ttlSeconds = 300) => {
  if (!isRedisReady()) return false;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redisClient.set(key, serialized, { EX: ttlSeconds });
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (err) {
    console.error(`[Redis] Set failed for key "${key}":`, err.message);
    return false;
  }
};

/**
 * Delete one or more keys from Redis
 */
const redisDel = async (...keys) => {
  if (!isRedisReady() || keys.length === 0) return 0;
  try {
    const validKeys = keys.filter(Boolean);
    if (validKeys.length === 0) return 0;
    return await redisClient.del(validKeys);
  } catch (err) {
    console.error('[Redis] Del failed:', err.message);
    return 0;
  }
};

/**
 * Deletes keys matching a wildcard pattern using SCAN
 */
const redisDelPattern = async (pattern) => {
  if (!isRedisReady()) return 0;
  try {
    const keys = [];
    for await (const chunk of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      if (Array.isArray(chunk)) {
        keys.push(...chunk);
      } else if (typeof chunk === 'string') {
        keys.push(chunk);
      }
    }
    if (keys.length > 0) {
      return await redisClient.del(keys);
    }
    return 0;
  } catch (err) {
    console.error(`[Redis] DelPattern failed for "${pattern}":`, err.message);
    return 0;
  }
};

// ==============================================================
// SECURITY COUNTER HELPERS (FAILED LOGINS & LOCKOUT)
// ==============================================================

const FAILED_LOGIN_PREFIX = 'auth:failed:';
const FAILED_LOGIN_WINDOW_SEC = 15 * 60; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

// In-memory fallback map for failed logins during Redis outage
const memoryFailedLogins = new Map();

const cleanMemoryFailedLogins = () => {
  const now = Date.now();
  for (const [key, val] of memoryFailedLogins.entries()) {
    if (val.expiresAt <= now) {
      memoryFailedLogins.delete(key);
    }
  }
};

/**
 * Increments failed login count for an identifier (email or phone)
 */
const recordFailedLogin = async (identifier) => {
  if (!identifier) return { count: 0, isLocked: false };
  const cleanId = identifier.toLowerCase().trim();

  if (isRedisReady()) {
    try {
      const key = `${FAILED_LOGIN_PREFIX}${cleanId}`;
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, FAILED_LOGIN_WINDOW_SEC);
      }
      return {
        count,
        isLocked: count >= MAX_FAILED_ATTEMPTS,
        attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - count),
      };
    } catch (err) {
      console.error('[Redis] recordFailedLogin error:', err.message);
    }
  }

  // Fallback to in-memory store if Redis is offline
  cleanMemoryFailedLogins();
  const existing = memoryFailedLogins.get(cleanId);
  const count = (existing && existing.expiresAt > Date.now() ? existing.count : 0) + 1;
  const expiresAt = Date.now() + FAILED_LOGIN_WINDOW_SEC * 1000;
  memoryFailedLogins.set(cleanId, { count, expiresAt });

  return {
    count,
    isLocked: count >= MAX_FAILED_ATTEMPTS,
    attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - count),
  };
};

/**
 * Checks if an identifier is temporarily locked out due to excessive failed logins
 */
const checkFailedLoginStatus = async (identifier) => {
  if (!identifier) return { isLocked: false, count: 0 };
  const cleanId = identifier.toLowerCase().trim();

  if (isRedisReady()) {
    try {
      const key = `${FAILED_LOGIN_PREFIX}${cleanId}`;
      const val = await redisClient.get(key);
      const count = parseInt(val || '0', 10);
      const ttl = count >= MAX_FAILED_ATTEMPTS ? await redisClient.ttl(key) : 0;
      return {
        isLocked: count >= MAX_FAILED_ATTEMPTS,
        count,
        ttlSecondsRemaining: ttl > 0 ? ttl : 0,
      };
    } catch (err) {
      console.error('[Redis] checkFailedLoginStatus error:', err.message);
    }
  }

  // Fallback to in-memory store if Redis is offline
  cleanMemoryFailedLogins();
  const existing = memoryFailedLogins.get(cleanId);
  if (existing && existing.expiresAt > Date.now()) {
    const isLocked = existing.count >= MAX_FAILED_ATTEMPTS;
    const ttlSecondsRemaining = Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / 1000));
    return {
      isLocked,
      count: existing.count,
      ttlSecondsRemaining,
    };
  }

  return { isLocked: false, count: 0 };
};

/**
 * Clears failed login counter on successful authentication
 */
const clearFailedLogin = async (identifier) => {
  if (!identifier) return;
  const cleanId = identifier.toLowerCase().trim();
  memoryFailedLogins.delete(cleanId);

  if (isRedisReady()) {
    try {
      const key = `${FAILED_LOGIN_PREFIX}${cleanId}`;
      await redisClient.del(key);
    } catch (err) {
      console.error('[Redis] clearFailedLogin error:', err.message);
    }
  }
};

// Auto-connect on module load if enabled
if (process.env.REDIS_ENABLED !== 'false') {
  initRedis().catch(() => {});
}

module.exports = {
  initRedis,
  getRedisClient,
  isRedisReady,
  disconnectRedis,
  redisGet,
  redisSet,
  redisDel,
  redisDelPattern,
  recordFailedLogin,
  checkFailedLoginStatus,
  clearFailedLogin,
  MAX_FAILED_ATTEMPTS,
};

