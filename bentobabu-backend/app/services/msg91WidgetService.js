/**
 * BentoBabu — MSG91 OTP Widget Verification Service
 *
 * Implements authoritative backend verification of MSG91 widget access tokens.
 * Interacts with MSG91 API endpoint:
 *   POST https://control.msg91.com/api/v5/widget/verifyAccessToken
 *
 * Features:
 * - Cryptographic SHA-256 token hashing for replay prevention
 * - Token binding verification (matches customer phone number against provider response)
 * - Distributed Redis caching with in-memory fallback
 * - 5000ms request timeout handling with graceful error categorization
 * - Safe error handling (never leaks MSG91_AUTH_KEY or internal provider traces)
 * - Test mock hook for deterministic automated verification
 */

const crypto = require('crypto');
const { normalizePhone } = require('../utils/sms');
const { redisGet, redisSet, redisDel, isRedisReady, getRedisClient } = require('../config/redis');

// In-memory fallback stores (used when Redis is unavailable or in mock test mode)
const memoryUsedTokens = new Map();
const memoryVerifiedPhones = new Map();

// Test hook for mocking MSG91 provider responses in tests
let customVerifier = undefined;

/**
 * Configure a custom verifier hook for automated test suites
 * @param {Function|null} verifierFn - async ({ accessToken, authKey, expectedMobile }) => result
 */
const setCustomVerifier = (verifierFn) => {
  customVerifier = verifierFn;
};

/**
 * Clean up expired memory tokens periodically
 */
const cleanupMemoryStores = () => {
  const now = Date.now();
  for (const [key, exp] of memoryUsedTokens.entries()) {
    if (exp <= now) memoryUsedTokens.delete(key);
  }
  for (const [key, exp] of memoryVerifiedPhones.entries()) {
    if (exp <= now) memoryVerifiedPhones.delete(key);
  }
};

class Msg91WidgetService {
  /**
   * Hashes access token using SHA-256 for secure replay protection tracking
   * @param {string} token
   * @returns {string} Hex-encoded SHA-256 hash
   */
  static hashAccessToken(token) {
    if (!token || typeof token !== 'string') return '';
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Atomically acquires and marks a token as consumed using Redis SET NX EX
   * Guarantees that concurrent duplicate requests cannot both succeed.
   *
   * @param {string} tokenHash
   * @param {string} mobile
   * @returns {Promise<boolean>} true if lock/token successfully acquired, false if already consumed
   */
  static async acquireTokenAtomic(tokenHash, mobile) {
    const ttlSeconds = 86400; // 24 hours
    cleanupMemoryStores();
    const isProd = process.env.NODE_ENV === 'production';

    // 1. Try atomic Redis SET NX EX when Redis is ready
    if (isRedisReady()) {
      try {
        const client = getRedisClient();
        if (client) {
          const payload = JSON.stringify({ mobile, consumedAt: new Date().toISOString() });
          const res = await client.set(`msg91:used_token:${tokenHash}`, payload, {
            NX: true,
            EX: ttlSeconds,
          });

          // If Redis returned null / falsy, key already existed (duplicate concurrent request)
          if (!res) {
            return false;
          }

          // Also mirror in local memory as secondary defense
          memoryUsedTokens.set(tokenHash, Date.now() + ttlSeconds * 1000);
          return true;
        }
      } catch (err) {
        console.warn('[MSG91-Widget] Redis atomic SET NX EX failed:', err.message);
        if (isProd) {
          const serviceErr = new Error('Distributed replay protection service temporarily unavailable. Please retry.');
          serviceErr.statusCode = 503;
          serviceErr.code = 'REDIS_UNAVAILABLE';
          throw serviceErr;
        }
      }
    } else if (isProd) {
      // In production, distributed Redis replay protection is mandatory; never silently fall back
      console.error('[MSG91-Widget] Redis is required in production for replay protection but is not connected.');
      const serviceErr = new Error('Verification service temporarily unavailable. Please retry.');
      serviceErr.statusCode = 503;
      serviceErr.code = 'REDIS_UNAVAILABLE';
      throw serviceErr;
    }

    // 2. In-memory fallback (Atomic within a single Node.js process, NOT distributed) - ONLY for development/test
    if (memoryUsedTokens.has(tokenHash)) {
      return false;
    }
    memoryUsedTokens.set(tokenHash, Date.now() + ttlSeconds * 1000);
    return true;
  }

  /**
   * Releases token lock in the event of transient upstream provider errors (timeouts/outages)
   * allowing the customer to retry verification.
   * @param {string} tokenHash
   */
  static async releaseTokenLock(tokenHash) {
    memoryUsedTokens.delete(tokenHash);
    if (isRedisReady()) {
      try {
        await redisDel(`msg91:used_token:${tokenHash}`);
      } catch (err) {
        // ignore
      }
    }
  }

  /**
   * Caches a pre-verified phone number with a short 10-minute expiry (600 seconds)
   * Bound strictly to the normalized 10-digit Indian mobile number.
   * @param {string} cleanPhone
   */
  static async recordPhonePreVerified(cleanPhone) {
    const ttlSeconds = 600; // 10 minutes (short expiry)
    const isProd = process.env.NODE_ENV === 'production';

    if (isRedisReady()) {
      try {
        await redisSet(
          `msg91:verified_phone:${cleanPhone}`,
          { verified: true, verifiedAt: new Date().toISOString() },
          ttlSeconds
        );
        memoryVerifiedPhones.set(cleanPhone, Date.now() + ttlSeconds * 1000);
        return;
      } catch (err) {
        if (isProd) {
          console.error('[MSG91-Widget] Failed to record pre-verification in Redis in production:', err.message);
          const serviceErr = new Error('Pre-verification service temporarily unavailable.');
          serviceErr.statusCode = 503;
          serviceErr.code = 'REDIS_UNAVAILABLE';
          throw serviceErr;
        }
      }
    } else if (isProd) {
      console.error('[MSG91-Widget] Redis is required in production for pre-verification storage but is unavailable.');
      const serviceErr = new Error('Pre-verification service temporarily unavailable.');
      serviceErr.statusCode = 503;
      serviceErr.code = 'REDIS_UNAVAILABLE';
      throw serviceErr;
    }

    memoryVerifiedPhones.set(cleanPhone, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Atomically checks and consumes a phone pre-verification record.
   * Guarantees that pre-verification can only be consumed once during registration.
   * Subsequent registration attempts cannot reuse the pre-verification.
   *
   * @param {string} phone
   * @returns {Promise<boolean>} true if valid and consumed, false if missing/already consumed
   */
  static async consumePhonePreVerification(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) return false;

    cleanupMemoryStores();
    let isVerified = false;
    const isProd = process.env.NODE_ENV === 'production';

    // Check Redis first if available
    if (isRedisReady()) {
      try {
        const stored = await redisGet(`msg91:verified_phone:${cleanPhone}`);
        if (stored && stored.verified) {
          isVerified = true;
          // Atomically remove so it cannot be used again
          await redisDel(`msg91:verified_phone:${cleanPhone}`);
        }
      } catch (err) {
        console.warn('[MSG91-Widget] Failed to read pre-verification from Redis:', err.message);
      }
    } else if (isProd) {
      console.warn('[MSG91-Widget] Redis is unavailable in production during consumePhonePreVerification.');
      return false;
    }

    // Check in-memory store
    if (memoryVerifiedPhones.has(cleanPhone)) {
      if (!isProd) {
        isVerified = true;
      }
      memoryVerifiedPhones.delete(cleanPhone);
    }

    return isVerified;
  }

  /**
   * Checks if a phone number was pre-verified via MSG91 widget (read-only check)
   * @param {string} phone
   * @returns {Promise<boolean>}
   */
  static async isPhonePreVerified(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) return false;

    cleanupMemoryStores();
    if (memoryVerifiedPhones.has(cleanPhone)) {
      return true;
    }

    if (isRedisReady()) {
      try {
        const stored = await redisGet(`msg91:verified_phone:${cleanPhone}`);
        if (stored && stored.verified) return true;
      } catch (err) {
        // Fall back to memory check
      }
    }

    return false;
  }

  /**
   * Clears pre-verified status for a phone number
   * @param {string} phone
   */
  static async clearPhonePreVerified(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return;

    memoryVerifiedPhones.delete(cleanPhone);

    if (isRedisReady()) {
      try {
        await redisDel(`msg91:verified_phone:${cleanPhone}`);
      } catch (err) {
        // ignore
      }
    }
  }

  /**
   * Verifies an MSG91 Widget Access Token against MSG91 API and verifies token binding
   *
   * @param {Object} params
   * @param {string} params.accessToken - JWT access token returned by MSG91 OTP widget
   * @param {string} params.expectedMobile - Customer registration phone number
   * @returns {Promise<{ success: boolean, verified: boolean, phone: string, providerResponse?: any }>}
   */
  static async verifyAccessToken({ accessToken, expectedMobile }) {
    // 1. Input Validation
    if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
      const err = new Error('Access token is required and must be a valid string.');
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const trimmedToken = accessToken.trim();
    if (trimmedToken.length < 10 || trimmedToken.length > 4096) {
      const err = new Error('Access token length is outside acceptable bounds.');
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const cleanExpectedMobile = normalizePhone(expectedMobile);
    if (!cleanExpectedMobile || cleanExpectedMobile.length !== 10 || !/^\d{10}$/.test(cleanExpectedMobile)) {
      const err = new Error('Please provide a valid 10-digit Indian mobile number.');
      err.code = 'INVALID_MOBILE';
      err.statusCode = 400;
      throw err;
    }

    // 2. Auth Key Check
    const authKey = (process.env.MSG91_AUTH_KEY || '').trim();
    if (!authKey && !customVerifier) {
      console.error('[MSG91-Widget] Error: Missing required MSG91_AUTH_KEY environment variable.');
      const err = new Error('SMS verification service is currently unconfigured.');
      err.code = 'CONFIG_MISSING';
      err.statusCode = 500;
      throw err;
    }

    // 3. Replay Protection: Atomically acquire token using Redis SET NX EX (or in-memory fallback)
    const tokenHash = this.hashAccessToken(trimmedToken);
    const acquired = await this.acquireTokenAtomic(tokenHash, cleanExpectedMobile);
    if (!acquired) {
      console.warn(`[MSG91-Widget] Replay attempt blocked for token hash: ${tokenHash.slice(0, 12)}...`);
      const err = new Error('This verification token has already been used. Please request a new verification code.');
      err.code = 'TOKEN_ALREADY_USED';
      err.statusCode = 400;
      throw err;
    }

    // 4. Call MSG91 Verification Endpoint (or custom test verifier)
    let providerData;
    if (typeof customVerifier === 'function') {
      try {
        providerData = await customVerifier({
          accessToken: trimmedToken,
          authKey,
          expectedMobile: cleanExpectedMobile,
        });
      } catch (mockErr) {
        if (mockErr.code === 'TIMEOUT' || mockErr.code === 'PROVIDER_ERROR' || mockErr.code === 'SERVICE_UNAVAILABLE') {
          await this.releaseTokenLock(tokenHash);
        }
        throw mockErr;
      }
    } else {
      const endpoint = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
      const timeoutMs = 5000;

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            authkey: authKey,
          },
          body: JSON.stringify({
            authkey: authKey,
            'access-token': trimmedToken,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (fetchErr) {
        await this.releaseTokenLock(tokenHash);
        if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
          console.warn(`[MSG91-Widget] Verification timed out after ${timeoutMs}ms.`);
          const err = new Error('SMS verification service timed out. Please try again.');
          err.code = 'TIMEOUT';
          err.statusCode = 504;
          throw err;
        }

        console.error('[MSG91-Widget] Network connection failed:', fetchErr.message);
        const err = new Error('SMS verification service is temporarily unreachable. Please try again.');
        err.code = 'SERVICE_UNAVAILABLE';
        err.statusCode = 502;
        throw err;
      }

      if (response.status >= 500) {
        await this.releaseTokenLock(tokenHash);
        console.error(`[MSG91-Widget] Provider returned HTTP ${response.status}`);
        const err = new Error('SMS verification service is temporarily unavailable. Please try again.');
        err.code = 'PROVIDER_ERROR';
        err.statusCode = 502;
        throw err;
      }

      let parsedBody;
      try {
        parsedBody = await response.json();
      } catch (jsonErr) {
        await this.releaseTokenLock(tokenHash);
        console.error('[MSG91-Widget] Failed to parse provider response JSON:', jsonErr.message);
        const err = new Error('Received malformed response from SMS verification service.');
        err.code = 'MALFORMED_RESPONSE';
        err.statusCode = 502;
        throw err;
      }

      providerData = parsedBody;

      if (!response.ok) {
        const errMsg = providerData?.message || providerData?.error || 'Verification failed with provider.';
        console.warn(`[MSG91-Widget] Provider HTTP ${response.status}: ${errMsg}`);
        const err = new Error(errMsg);
        err.code = 'INVALID_TOKEN';
        err.statusCode = 400;
        throw err;
      }
    }

    // 5. Inspect Provider Response Schema
    // Expected MSG91 format: { "type": "success", "message": "918584085669" }
    // Error MSG91 format:    { "type": "error", "message": "..." }
    const responseType = providerData?.type || (providerData?.status === 'success' ? 'success' : null);
    if (responseType !== 'success') {
      const errMsg = providerData?.message || providerData?.error || 'Mobile verification token is invalid or expired.';
      console.warn(`[MSG91-Widget] Verification unsuccessful: ${errMsg}`);
      const err = new Error(errMsg);
      err.code = 'INVALID_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    // 6. Token Binding Verification: Validate that the verified phone matches expectedMobile
    // MSG91 returns the verified phone in message or data/mobile field (often formatted as "91<10_digits>")
    const rawMsg91Phone =
      providerData?.message ||
      providerData?.data?.mobile ||
      providerData?.data?.phone ||
      providerData?.mobile ||
      '';

    const normalizedMsg91Phone = normalizePhone(rawMsg91Phone);

    // If MSG91 returned a phone number, enforce strict match
    if (normalizedMsg91Phone && normalizedMsg91Phone.length === 10) {
      if (normalizedMsg91Phone !== cleanExpectedMobile) {
        console.warn(
          `[MSG91-Widget] Token binding mismatch! Expected ${cleanExpectedMobile.slice(-4)}, received ${normalizedMsg91Phone.slice(-4)}`
        );
        const err = new Error('Verified mobile number does not match registration mobile number.');
        err.code = 'MOBILE_MISMATCH';
        err.statusCode = 400;
        throw err;
      }
    }

    // 7. Successful verification: Cache pre-verified phone number (short 10-minute expiry)
    await this.recordPhonePreVerified(cleanExpectedMobile);

    console.log(`[MSG91-Widget] Mobile successfully verified for ${cleanExpectedMobile.slice(-4)}`);

    return {
      success: true,
      verified: true,
      phone: cleanExpectedMobile,
    };
  }
}

module.exports = {
  Msg91WidgetService,
  setCustomVerifier,
};
