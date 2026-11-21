/**
 * Order Receipt Service
 * Orchestrates branded PDF generation, Backblaze B2 persistent storage,
 * distributed atomic concurrency locking, historical accuracy snapshotting,
 * and automatic failure reconciliation.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const AdminSettingsController = require('../controllers/adminSettingsController');
const { validateEnv } = require('../config/env');
const { generateOrderReceiptPdf } = require('./receiptGenerator');
const b2Storage = require('./b2Storage');

const MAX_RETRIES = 5;
const LOCK_LEASE_MS = 60000; // 60 seconds lease for distributed lock

function formatBusinessPhone(rawPhone) {
  if (!rawPhone) return '+91 8584085669';
  const str = String(rawPhone).trim();
  const digits = str.replace(/\D/g, '');
  if (digits.includes('9876543210') || digits.includes('98765') || digits.includes('99999')) {
    return '+91 8584085669';
  }
  const cleaned = str.replace(/^(\+?91[\s-]*)*/, '').trim();
  return `+91 ${cleaned || '8584085669'}`;
}

/**
 * Structured logger helper
 */
function logReceiptEvent(action, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'OrderReceiptService',
    action,
    ...payload,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Helper to sleep for ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ensure the order is populated with slots, zones, coupons.
 */
async function loadFullOrder(orderOrId) {
  if (orderOrId && typeof orderOrId === 'object' && orderOrId.items && orderOrId.deliveryAddress) {
    return orderOrId;
  }

  const orderId = orderOrId;
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderId)) {
    order = await Order.findById(orderId)
      .populate('deliverySlot', 'label startTime endTime date')
      .populate('deliveryZone', 'name estimatedDeliveryMinutes')
      .populate('coupon', 'code discountType discountValue');
  } else {
    order = await Order.findOne({ orderNumber: String(orderId).trim().toUpperCase() })
      .populate('deliverySlot', 'label startTime endTime date')
      .populate('deliveryZone', 'name estimatedDeliveryMinutes')
      .populate('coupon', 'code discountType discountValue');
  }

  return order;
}

/**
 * Generate a PDF receipt for an order and persist it to Backblaze B2.
 * Idempotent, thread-safe, and preserves historical snapshots.
 *
 * @param {string|Object} orderOrId - Order ID or Order Mongoose document
 * @param {Object} [options={}]
 * @param {boolean} [options.forceRegenerate=false] - Force regeneration even if STORED
 * @returns {Promise<{ order: Object, buffer: Buffer, status: string, objectKey: string, fromStorage: boolean }>}
 */
async function generateAndStoreReceipt(orderOrId, options = {}) {
  const startTime = Date.now();
  let order = await loadFullOrder(orderOrId);
  if (!order) {
    throw new Error('Order not found');
  }

  const objectKey = b2Storage.buildReceiptObjectKey(order);
  const fileName = `BentoBabu-Receipt-${order.orderNumber || order._id}.pdf`;

  // 1. FAST PATH: If order says STORED and not forcing regeneration, verify B2 object
  let isMissingFromB2 = false;
  if (order.receipt && order.receipt.status === 'STORED' && order.receipt.objectKey && !options.forceRegenerate) {
    try {
      const verification = await b2Storage.verifyObject(order.receipt.objectKey);
      if (verification.exists && verification.sizeBytes > 0) {
        logReceiptEvent('RECEIPT_REUSED_CACHE', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          objectKey: order.receipt.objectKey,
        });
        return {
          order,
          buffer: null,
          status: 'STORED',
          objectKey: order.receipt.objectKey,
          fromStorage: true,
        };
      }
      isMissingFromB2 = true;
      logReceiptEvent('MISSING_B2_OBJECT_RECOVERY', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        objectKey: order.receipt.objectKey,
      });
    } catch (verErr) {
      logReceiptEvent('B2_VERIFY_WARNING', {
        orderId: order._id,
        error: verErr.message,
      });
    }
  }

  // 2. PRE-GENERATION RECONCILIATION:
  // Check if B2 object already exists (e.g. from a previous run where B2 upload succeeded but MongoDB write failed)
  if (!options.forceRegenerate) {
    try {
      const existingInB2 = await b2Storage.verifyObject(objectKey);
      if (existingInB2.exists && existingInB2.sizeBytes > 0) {
        logReceiptEvent('RECONCILED_EXISTING_B2_OBJECT', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          objectKey,
          fileSize: existingInB2.sizeBytes,
        });

        const reconciled = await Order.findByIdAndUpdate(
          order._id,
          {
            $set: {
              'receipt.status': 'STORED',
              'receipt.storageProvider': 'BACKBLAZE_B2',
              'receipt.objectKey': objectKey,
              'receipt.fileName': fileName,
              'receipt.fileSize': existingInB2.sizeBytes,
              'receipt.uploadedAt': new Date(),
              'receipt.lastError': null,
              'receipt.lockToken': null,
              'receipt.lockExpiresAt': null,
            },
          },
          { returnDocument: 'after' }
        );

        return {
          order: reconciled || order,
          buffer: null,
          status: 'STORED',
          objectKey,
          fromStorage: true,
        };
      }
    } catch (e) {
      // Non-fatal, continue with normal acquisition
    }
  }

  // 3. DISTRIBUTED ATOMIC LOCK ACQUISITION
  const lockToken = crypto.randomUUID();
  const lockExpiresAt = new Date(Date.now() + LOCK_LEASE_MS);

  const lockFilter = {
    _id: order._id,
    $or: [
      { 'receipt.status': { $in: ['PENDING', 'FAILED'] } },
      { 'receipt.status': 'GENERATING', 'receipt.lockExpiresAt': { $lt: new Date() } },
      { 'receipt.status': 'GENERATING', 'receipt.generatedAt': { $lt: new Date(Date.now() - LOCK_LEASE_MS) } },
      { 'receipt.status': { $exists: false } },
      { receipt: { $exists: false } },
    ],
  };

  if (options.forceRegenerate || isMissingFromB2) {
    lockFilter.$or.push({ 'receipt.status': 'STORED' });
  }

  let lockedOrder = await Order.findOneAndUpdate(
    lockFilter,
    {
      $set: {
        'receipt.status': 'GENERATING',
        'receipt.lockToken': lockToken,
        'receipt.lockExpiresAt': lockExpiresAt,
        'receipt.generatedAt': new Date(),
        'receipt.lastError': null,
      },
      $inc: { 'receipt.generationAttempts': 1 },
    },
    { returnDocument: 'after' }
  );

  // If lock acquisition failed, another worker currently holds an unexpired lease
  if (!lockedOrder) {
    logReceiptEvent('LOCK_HELD_BY_ANOTHER_WORKER', {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });

    // Wait up to 5 seconds (10 x 500ms) for the active worker to finish
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const recheck = await Order.findById(order._id);
      if (recheck && recheck.receipt && recheck.receipt.status === 'STORED') {
        return {
          order: recheck,
          buffer: null,
          status: 'STORED',
          objectKey: recheck.receipt.objectKey,
          fromStorage: true,
        };
      }
    }

    // Reload order to current state if still not stored
    order = await Order.findById(order._id);
    return {
      order,
      buffer: null,
      status: order?.receipt?.status || 'PENDING',
      objectKey: order?.receipt?.objectKey || null,
      fromStorage: false,
    };
  }

  // Heartbeat lease renewal for long-running jobs (renews 60s lease every 20s while job is active)
  let heartbeat = setInterval(async () => {
    try {
      await Order.updateOne(
        { _id: lockedOrder._id, 'receipt.lockToken': lockToken },
        { $set: { 'receipt.lockExpiresAt': new Date(Date.now() + LOCK_LEASE_MS) } }
      );
    } catch (e) {
      // Non-fatal, existing lockExpiresAt remains authoritative
    }
  }, 20000);
  if (heartbeat.unref) heartbeat.unref();

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  // 4. HISTORICAL ACCURACY & IMMUTABLE LEGAL SNAPSHOT
  const activeSettings = await AdminSettingsController.getAllMergedSettings();

  // If order already has an immutable legal snapshot, prioritize it to ensure 100% historical accuracy
  // unless options.updateBusinessDetails is explicitly requested for controlled correction
  let snapshot;
  if (!options.updateBusinessDetails && lockedOrder.receipt && lockedOrder.receipt.snapshot && lockedOrder.receipt.snapshot.businessName) {
    snapshot = lockedOrder.receipt.snapshot;
  } else {
    let rawAddress =
      activeSettings.BUSINESS_ADDRESS ||
      activeSettings.KITCHEN_ADDRESS ||
      'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';
    if (rawAddress.includes('700120')) {
      rawAddress = rawAddress.replace('700120', '700122');
    }

    let rawEmail = activeSettings.SUPPORT_EMAIL || 'bentobabuofficial@gmail.com';
    if (rawEmail === 'bentobabuofficial@gmail.com' || rawEmail === 'bentobabuofficial@gmail.com') {
      rawEmail = 'bentobabuofficial@gmail.com';
    }

    let rawPhone = activeSettings.SUPPORT_PHONE || '+91 8584085669';
    const rawDigits = String(rawPhone).replace(/\D/g, '');
    if (rawDigits.includes('9876543210') || rawDigits.includes('98765') || rawDigits.includes('99999')) {
      rawPhone = '+91 8584085669';
    }
    const formattedPhone = formatBusinessPhone(rawPhone);

    let rawWebsite = activeSettings.WEBSITE_URL || 'https://bentobabu.com';
    if (rawWebsite.includes('bentobabu.in')) {
      rawWebsite = rawWebsite.replace('bentobabu.in', 'bentobabu.com');
    }

    snapshot = {
      businessName: activeSettings.BUSINESS_NAME || 'BentoBabu Central Kitchen',
      businessAddress: rawAddress,
      supportEmail: rawEmail,
      supportPhone: formattedPhone,
      websiteUrl: rawWebsite,
      fssaiStatus: activeSettings.FSSAI_STATUS || 'APPLICATION_SUBMITTED',
      fssaiNumber: activeSettings.FSSAI_NUMBER ? String(activeSettings.FSSAI_NUMBER).trim() : '',
      gstin: activeSettings.GSTIN ? String(activeSettings.GSTIN).trim() : '',
    };
  }

  if (!lockedOrder.receipt) lockedOrder.receipt = {};
  lockedOrder.receipt.snapshot = snapshot;

  // 5. GENERATE BRANDED PDF BUFFER
  let pdfBuffer;
  try {
    pdfBuffer = await generateOrderReceiptPdf(lockedOrder, activeSettings);
  } catch (pdfErr) {
    logReceiptEvent('PDF_GENERATION_FAILED', {
      orderId: lockedOrder._id,
      error: pdfErr.message,
    });

    await Order.findOneAndUpdate(
      { _id: lockedOrder._id, 'receipt.lockToken': lockToken },
      {
        $set: {
          'receipt.status': 'FAILED',
          'receipt.lastError': `PDF Generation failed: ${pdfErr.message}`,
          'receipt.lockToken': null,
          'receipt.lockExpiresAt': null,
        },
      }
    );
    stopHeartbeat();
    throw pdfErr;
  }

  // 6. UPLOAD TO BACKBLAZE B2
  let uploadResult = null;
  let uploadError = null;

  try {
    uploadResult = await b2Storage.uploadFile({
      objectKey,
      body: pdfBuffer,
      contentType: 'application/pdf',
      contentDisposition: `attachment; filename="${fileName}"`,
      metadata: {
        orderId: lockedOrder._id.toString(),
        orderNumber: String(lockedOrder.orderNumber || ''),
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    uploadError = err;
    logReceiptEvent('B2_UPLOAD_ERROR', {
      orderId: lockedOrder._id,
      orderNumber: lockedOrder.orderNumber,
      error: err.message,
    });
  }

  // 7. FENCED COMPLETION (CAS CHECK ON lockToken)
  if (uploadResult && !uploadError) {
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: lockedOrder._id, 'receipt.lockToken': lockToken },
      {
        $set: {
          'receipt.status': 'STORED',
          'receipt.storageProvider': 'BACKBLAZE_B2',
          'receipt.bucket': uploadResult.bucket,
          'receipt.objectKey': uploadResult.objectKey,
          'receipt.fileName': fileName,
          'receipt.contentType': 'application/pdf',
          'receipt.fileSize': uploadResult.fileSize || pdfBuffer.length,
          'receipt.uploadedAt': new Date(),
          'receipt.lastError': null,
          'receipt.lockToken': null,
          'receipt.lockExpiresAt': null,
          'receipt.snapshot': snapshot,
          'receipt.retryCount': 0,
          'receipt.nextRetryAt': null,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updatedOrder) {
      logReceiptEvent('STALE_WORKER_UPDATE_IGNORED', {
        orderId: lockedOrder._id,
        lockToken,
      });
    } else {
      logReceiptEvent('RECEIPT_STORED_SUCCESS', {
        orderId: lockedOrder._id,
        orderNumber: lockedOrder.orderNumber,
        objectKey: uploadResult.objectKey,
        fileSize: uploadResult.fileSize,
        durationMs: Date.now() - startTime,
      });
    }

    stopHeartbeat();
    return {
      order: updatedOrder || lockedOrder,
      buffer: pdfBuffer,
      status: 'STORED',
      objectKey: uploadResult.objectKey,
      fromStorage: false,
    };
  } else {
    // Bounded Exponential Backoff Retry Calculation
    const currentRetries = lockedOrder.receipt?.retryCount || 0;
    const nextRetryCount = currentRetries + 1;
    const backoffMs = Math.min(Math.pow(2, nextRetryCount) * 1000, 300000); // 2s, 4s, 8s, 16s... max 5m
    const nextRetryAt = nextRetryCount < MAX_RETRIES ? new Date(Date.now() + backoffMs) : null;
    const errorMsg = uploadError ? uploadError.message : 'Unknown storage error';

    const failedOrder = await Order.findOneAndUpdate(
      { _id: lockedOrder._id, 'receipt.lockToken': lockToken },
      {
        $set: {
          'receipt.status': 'FAILED',
          'receipt.lastError': errorMsg,
          'receipt.snapshot': snapshot,
          'receipt.lockToken': null,
          'receipt.lockExpiresAt': null,
          'receipt.retryCount': nextRetryCount,
          'receipt.nextRetryAt': nextRetryAt,
        },
      },
      { returnDocument: 'after' }
    );

    logReceiptEvent('RECEIPT_MARKED_FAILED', {
      orderId: lockedOrder._id,
      orderNumber: lockedOrder.orderNumber,
      retryCount: nextRetryCount,
      nextRetryAt,
      error: errorMsg,
    });

    stopHeartbeat();
    return {
      order: failedOrder || lockedOrder,
      buffer: pdfBuffer, // Still return buffer so active HTTP request gets the PDF
      status: 'FAILED',
      objectKey: null,
      fromStorage: false,
      error: errorMsg,
    };
  }
}

/**
 * Retrieve a stored PDF receipt for streaming to client.
 * Falls back to generation / recovery if needed.
 *
 * @param {string|Object} orderOrId
 * @returns {Promise<{ buffer: Buffer, fileName: string, contentType: string, fromStorage: boolean }>}
 */
async function getReceiptForDownload(orderOrId) {
  const order = await loadFullOrder(orderOrId);
  if (!order) {
    throw new Error('Order not found');
  }

  const fileName = `BentoBabu-Receipt-${order.orderNumber || order._id}.pdf`;

  // 1. If marked STORED in B2, fetch from storage
  if (order.receipt && order.receipt.status === 'STORED' && order.receipt.objectKey) {
    try {
      const fileData = await b2Storage.getFile(order.receipt.objectKey);
      return {
        buffer: fileData.buffer,
        fileName,
        contentType: fileData.contentType || 'application/pdf',
        fromStorage: true,
      };
    } catch (b2Err) {
      let targetBucket = 'unconfigured';
      try {
        const env = validateEnv();
        targetBucket = env.b2BucketName || 'unconfigured';
      } catch {}

      logReceiptEvent('B2_STREAM_FAILED_FALLBACK_RECOVERY', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        objectKey: order.receipt.objectKey,
        targetBucket,
        recordedBucket: order.receipt.bucket || null,
        recordedUploadedAt: order.receipt.uploadedAt || null,
        errorCode: b2Err.name || b2Err.code || 'UNKNOWN_STORAGE_ERROR',
        errorMessage: b2Err.message,
        recoveryAction: 'AUTO_REGENERATE_AND_PERSIST',
      });
      // Controlled recovery: object missing from B2 or damaged -> force regenerate to restore to B2
      const recovered = await generateAndStoreReceipt(order, { forceRegenerate: true });
      if (recovered.buffer) {
        return {
          buffer: recovered.buffer,
          fileName,
          contentType: 'application/pdf',
          fromStorage: false,
        };
      }
    }
  }

  // 2. Not stored or recovery needed: generate, attempt store, and return buffer
  const result = await generateAndStoreReceipt(order, { forceRegenerate: false });
  if (result.buffer) {
    return {
      buffer: result.buffer,
      fileName,
      contentType: 'application/pdf',
      fromStorage: false,
    };
  }

  // If another worker completed storage while we waited, fetch the newly stored buffer from B2
  if (result.objectKey) {
    try {
      const fileData = await b2Storage.getFile(result.objectKey);
      return {
        buffer: fileData.buffer,
        fileName,
        contentType: fileData.contentType || 'application/pdf',
        fromStorage: true,
      };
    } catch (fetchErr) {
      logReceiptEvent('B2_STREAM_CONCURRENT_RETRY_FALLBACK', {
        orderId: order._id,
        objectKey: result.objectKey,
        error: fetchErr.message,
      });
    }
  }

  // Direct fallback generation on-the-fly to guarantee the customer/admin always gets their PDF
  const activeSettings = await AdminSettingsController.getAllMergedSettings();
  const directBuffer = await generateOrderReceiptPdf(result.order || order, activeSettings);
  return {
    buffer: directBuffer,
    fileName,
    contentType: 'application/pdf',
    fromStorage: false,
  };
}

module.exports = {
  loadFullOrder,
  generateAndStoreReceipt,
  getReceiptForDownload,
  logReceiptEvent,
};
