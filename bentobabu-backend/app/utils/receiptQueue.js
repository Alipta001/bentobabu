/**
 * Durable Receipt Queue & Background Reconciliation Worker
 * Powered by Redis lists with automatic fallback and MongoDB durable reconciliation.
 */

const { isRedisReady, getRedisClient } = require('../config/redis');
const Order = require('../models/Order');

const QUEUE_KEY = 'bentobabu:queue:receipts';
const DEDUP_PREFIX = 'bentobabu:queue:receipt:dedup:';
const DEDUP_TTL_SEC = 60; // 60s deduplication window

let isWorkerRunning = false;
let shouldStop = false;
let reconciliationInterval = null;
let currentProcessingCount = 0;
const MAX_CONCURRENT_JOBS = 3;

/**
 * Structured logger helper
 */
function logQueueEvent(action, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    component: 'ReceiptQueue',
    action,
    ...payload,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Enqueue an order for background receipt generation & B2 persistence.
 * Safe, non-blocking, and idempotent.
 *
 * @param {string|Object} orderId
 * @param {Object} [options={}]
 * @returns {Promise<{ enqueued: boolean, queuedVia: string }>}
 */
async function enqueueReceipt(orderId, options = {}) {
  const cleanId = typeof orderId === 'object' && orderId._id ? orderId._id.toString() : String(orderId);

  // Lazy load orderReceiptService to avoid circular dependency
  const orderReceiptService = require('./orderReceiptService');

  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const dedupKey = `${DEDUP_PREFIX}${cleanId}`;

      // Deduplicate if already queued within the last 60 seconds (unless forceRegenerate is requested)
      if (!options.forceRegenerate) {
        const isNew = await redis.set(dedupKey, '1', { NX: true, EX: DEDUP_TTL_SEC });
        if (!isNew) {
          logQueueEvent('JOB_DEDUPLICATED', { orderId: cleanId });
          return { enqueued: false, queuedVia: 'REDIS_DEDUP_SKIP' };
        }
      }

      const jobPayload = JSON.stringify({
        orderId: cleanId,
        options,
        enqueuedAt: Date.now(),
      });

      await redis.lPush(QUEUE_KEY, jobPayload);
      logQueueEvent('JOB_ENQUEUED_REDIS', { orderId: cleanId });

      // Trigger worker tick to process immediately
      triggerWorkerTick();
      return { enqueued: true, queuedVia: 'REDIS' };
    } catch (redisErr) {
      logQueueEvent('REDIS_ENQUEUE_FALLBACK', {
        orderId: cleanId,
        error: redisErr.message,
      });
    }
  }

  // Fallback: If Redis is offline or disabled, execute in background with managed concurrency
  setImmediate(async () => {
    try {
      await orderReceiptService.generateAndStoreReceipt(cleanId, options);
    } catch (err) {
      logQueueEvent('INLINE_EXECUTION_FAILED', {
        orderId: cleanId,
        error: err.message,
      });
    }
  });

  return { enqueued: true, queuedVia: 'INLINE_ASYNC' };
}

/**
 * Trigger immediate queue processing if worker is not busy
 */
function triggerWorkerTick() {
  if (isWorkerRunning || shouldStop) return;
  processQueue().catch((err) => {
    logQueueEvent('WORKER_ERROR', { error: err.message });
  });
}

/**
 * Worker loop that processes jobs from the Redis queue with bounded concurrency
 */
async function processQueue() {
  if (isWorkerRunning || shouldStop) return;
  isWorkerRunning = true;

  const orderReceiptService = require('./orderReceiptService');

  try {
    while (!shouldStop && isRedisReady() && currentProcessingCount < MAX_CONCURRENT_JOBS) {
      const redis = getRedisClient();
      const rawJob = await redis.rPop(QUEUE_KEY);
      if (!rawJob) break;

      let job;
      try {
        job = JSON.parse(rawJob);
      } catch (parseErr) {
        logQueueEvent('MALFORMED_JOB_SKIPPED', { rawJob });
        continue;
      }

      currentProcessingCount++;
      (async () => {
        const startTime = Date.now();
        try {
          await orderReceiptService.generateAndStoreReceipt(job.orderId, job.options || {});
          logQueueEvent('JOB_COMPLETED', {
            orderId: job.orderId,
            durationMs: Date.now() - startTime,
          });
        } catch (jobErr) {
          logQueueEvent('JOB_FAILED', {
            orderId: job.orderId,
            error: jobErr.message,
            durationMs: Date.now() - startTime,
          });
        } finally {
          currentProcessingCount--;
          if (isRedisReady()) {
            const dedupKey = `${DEDUP_PREFIX}${job.orderId}`;
            redis.del(dedupKey).catch(() => {});
          }
          triggerWorkerTick();
        }
      })();
    }
  } catch (loopErr) {
    logQueueEvent('WORKER_LOOP_ERROR', { error: loopErr.message });
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Durable Database Reconciliation
 * Scans MongoDB for any orders left PENDING, with expired GENERATING locks,
 * or recoverable FAILED states (retryCount < 5) and enqueues them.
 *
 * Runs automatically on startup and periodically every 5 minutes.
 */
async function reconcilePendingReceipts(limit = 25) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recoverableOrders = await Order.find({
      createdAt: { $gte: sevenDaysAgo },
      $or: [
        { 'receipt.status': 'PENDING' },
        {
          'receipt.status': 'GENERATING',
          'receipt.lockExpiresAt': { $lt: now },
        },
        {
          'receipt.status': 'FAILED',
          'receipt.retryCount': { $lt: 5 },
          $or: [
            { 'receipt.nextRetryAt': { $lte: now } },
            { 'receipt.nextRetryAt': { $exists: false } },
            { 'receipt.nextRetryAt': null },
          ],
        },
        { receipt: { $exists: false } },
        { 'receipt.status': { $exists: false } },
      ],
    })
      .limit(limit)
      .select('_id orderNumber receipt');

    if (recoverableOrders.length > 0) {
      logQueueEvent('RECONCILIATION_FOUND_ORDERS', {
        count: recoverableOrders.length,
        orderIds: recoverableOrders.map((o) => o._id),
      });

      for (const ord of recoverableOrders) {
        await enqueueReceipt(ord._id);
      }
    }

    return { recoveredCount: recoverableOrders.length };
  } catch (err) {
    logQueueEvent('RECONCILIATION_ERROR', { error: err.message });
    return { recoveredCount: 0, error: err.message };
  }
}

/**
 * Start the receipt queue background worker and periodic reconciliation
 */
function startReceiptWorker() {
  shouldStop = false;
  logQueueEvent('WORKER_STARTED');

  // Trigger initial reconciliation 5 seconds after startup
  setTimeout(() => {
    reconcilePendingReceipts().catch(() => {});
  }, 5000);

  // Periodic reconciliation every 5 minutes
  if (!reconciliationInterval) {
    reconciliationInterval = setInterval(() => {
      reconcilePendingReceipts().catch(() => {});
    }, 5 * 60 * 1000);
  }

  triggerWorkerTick();
}

/**
 * Gracefully stop the worker
 */
function stopReceiptWorker() {
  shouldStop = true;
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
  }
  logQueueEvent('WORKER_STOPPED');
}

module.exports = {
  enqueueReceipt,
  triggerWorkerTick,
  reconcilePendingReceipts,
  startReceiptWorker,
  stopReceiptWorker,
};
