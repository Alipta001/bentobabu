# BentoBabu — Backblaze B2 PDF Receipt Storage Setup & Production Guide

This guide provides instructions for configuring, deploying, and maintaining BentoBabu's persistent PDF order receipt storage using **Backblaze B2 Cloud Storage** via its S3-compatible API.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────┐
│     Customer Places Order       │
│  (COD or Paid via Razorpay)     │
└────────────────┬────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│            BentoBabu Backend Server                    │
│             (Express 5 / Node.js)                      │
│                                                        │
│  1. PDFKit generates branded PDF buffer                │
│  2. S3Client streams PDF to Backblaze B2 bucket        │
│  3. Receipt metadata & immutable snapshot stored in DB │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│     Backblaze B2 Cloud Store    │
│  (Private S3-Compatible Bucket) │
│ receipts/{year}/{month}/...     │
└────────────────┬────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│             Secure Receipt Retrieval                   │
│                                                        │
│  - Customer: GET /api/v1/orders/:id/receipt            │
│    (Ownership strictly checked, proxied stream)        │
│  - Admin: GET /api/v1/orders/:id/receipt & Regenerate  │
│    (RBAC verified, audit metadata displayed)           │
└────────────────────────────────────────────────────────┘
```

### Storage Efficiency & Security Principles
1. **Single-Generation Persistence**: Receipts are generated and uploaded once per order. Subsequent downloads are streamed directly from Backblaze B2 without re-executing PDFKit.
2. **Private Bucket Security**: Buckets are configured as **Private**. Clients never communicate directly with Backblaze; all downloads are authenticated and proxied through the backend server.
3. **Deterministic Object Keys**: Files follow an immutable path convention:
   `receipts/{year}/{month}/{orderId}/{orderNumber}.pdf`
4. **Historical Snapshot Accuracy**: Even if catalog prices, delivery fees, or legal credentials change in the database, the order's immutable financial and legal snapshot guarantees the receipt always reflects the exact state at the time of purchase.
5. **Safe Error Handling & Fallback**: If Backblaze B2 experiences an outage or temporary timeout, the backend marks the order receipt status as `FAILED` while still delivering the in-memory PDF to the customer without crashing the request. Admins can retry generation at any time.

---

## 2. Backblaze B2 Account & Bucket Setup

### Step 1: Create an Account
1. Visit [backblaze.com/b2](https://www.backblaze.com/b2) and sign up for a B2 Cloud Storage account.
2. Complete email verification and log in to the Backblaze B2 console.

### Step 2: Create Storage Buckets
It is recommended to maintain separate buckets for staging/development and production:

1. In the left navigation, select **Buckets** under B2 Cloud Storage.
2. Click **Create a Bucket**.
3. Configure the bucket:
   * **Bucket Unique Name**:
     * Production: `bentobabu-receipts-prod`
     * Staging / Dev: `bentobabu-receipts-dev`
   * **Files in Bucket are**: Select **Private** (Crucial: Prevents public indexing or unauthorized direct downloads).
   * **Default Encryption**: Enable (SSE-B2 / AES-256).
   * **Object Lock**: Disabled (unless regulatory compliance requires WORM retention).
4. Click **Create a Bucket**.
5. Note the **Endpoint** displayed next to your bucket:
   * Example: `s3.us-east-005.backblazeb2.com`
   * Region: `us-east-005`

---

## 3. Application Key Generation

1. In the left menu, select **Application Keys**.
2. Scroll to the **Add a New Application Key** section and click **Add a New Application Key**.
3. Configure Key Parameters:
   * **Name of Key**: `bentobabu-backend-receipts`
   * **Allow access to Bucket(s)**: Select your private bucket (`bentobabu-receipts-prod`).
   * **Type of Access**: Select **Read and Write**.
   * **Allow List All Bucket Names**: Uncheck (principle of least privilege).
   * **File name prefix**: Leave blank (allows full access to `receipts/*`).
   * **Duration**: Leave blank (no expiration).
4. Click **Create New Key**.
5. **CRITICAL**: Copy the credentials immediately (they are only displayed once):
   * `keyID` -> This is your `B2_KEY_ID`.
   * `applicationKey` -> This is your `B2_APPLICATION_KEY`.

---

## 4. Backend Environment Variable Setup

Configure the following variables in `bentobabu-backend/.env` (and your production host environment, e.g. Render/Railway):

```env
# Backblaze B2 PDF Receipt Storage Configuration (S3 Compatible)
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_BUCKET_NAME=bentobabu-receipts-prod
B2_KEY_ID=your_key_id_here
B2_APPLICATION_KEY=your_application_key_here
B2_PUBLIC_BASE_URL=
```

*Note: Ensure `B2_ENDPOINT` includes the protocol `https://`.*

---

## 5. Order Schema & Lifecycle States

The Order Mongoose model includes a `receipt` subdocument:

```javascript
receipt: {
  status: 'PENDING' | 'GENERATING' | 'STORED' | 'FAILED',
  storageProvider: 'BACKBLAZE_B2',
  bucket: 'bentobabu-receipts-prod',
  objectKey: 'receipts/2026/11/673a.../BB-ORDER-001.pdf',
  fileName: 'BentoBabu-Receipt-BB-ORDER-001.pdf',
  contentType: 'application/pdf',
  fileSize: 45280,
  generatedAt: Date,
  uploadedAt: Date,
  lastError: null | String,
  lockToken: null | String,
  lockExpiresAt: null | Date,
  retryCount: Number,
  nextRetryAt: null | Date,
  generationAttempts: Number,
  snapshot: {
    businessName: String,
    businessAddress: String,
    supportEmail: String,
    supportPhone: String,
    websiteUrl: String,
    fssaiStatus: String,
    fssaiNumber: String,
    gstin: String
  }
}
```

### Lifecycle States & Concurrency Controls:
* `PENDING`: Order created; background job enqueued via Redis queue (`bentobabu:queue:receipts`).
* `GENERATING`: Distributed atomic lock acquired with lease `lockToken` and 60-second `lockExpiresAt`. Competing workers wait or skip. Stale workers are fenced out via CAS (`{ _id, 'receipt.lockToken': lockToken }`).
* `STORED`: Receipt successfully persisted to Backblaze B2 and verified. Fast-path serves directly from storage.
* `FAILED`: Storage upload hit transient error. System schedules bounded exponential backoff retry (`nextRetryAt`, capped at 5 retries). Admins can also force immediate regeneration.

### Durable Background Queue & Self-Healing:
* **Redis Durable Queue**: Uses Redis lists (`LPUSH`/`RPOP`) with 60s deduplication keys (`bentobabu:queue:receipt:dedup:<id>`).
* **Non-Blocking Checkout**: Payment confirmation and order placement never wait on B2 upload; background worker processes asynchronously.
* **Automatic Periodic Reconciliation**: Every 5 minutes and upon server startup, `reconcilePendingReceipts()` scans MongoDB for orphaned `PENDING`, expired `GENERATING`, or recoverable `FAILED` receipts from the past 7 days and re-enqueues them.
* **Pre-Generation Reconciliation**: Checks `verifyObject(objectKey)` in B2 before rendering; if B2 already has the PDF from an earlier run where MongoDB crashed, it automatically reconciles MongoDB to `STORED` without duplicate processing.
* **Graceful Fallback**: If Redis is offline, tasks safely execute inline via managed asynchronous queues without crashing or dropping jobs.

---

## 6. Verification & Health Check

### Automated Integration Test Suite
To verify the complete B2 storage lifecycle and reliability, run:

```bash
node bentobabu-backend/test/order_receipt_pdf.test.js
```

This verifies all 17 automated tests:
1. Generation and upload of receipts to S3-compatible storage.
2. Metadata persistence in MongoDB with deterministic objectKey and legal snapshot.
3. Subsequent download reuse without re-uploading.
4. Ownership isolation (403 for unauthorized customers).
5. Unauthenticated request rejection (401).
6. Administrative operational access.
7. Kitchen staff access.
8. Error handling on network timeout (bounded exponential backoff).
9. Admin regeneration endpoint (`POST /api/v1/orders/:id/receipt/regenerate`).
10. Missing object recovery (re-generating and restoring into B2).
11. Concurrency lock safety across parallel downloads.
12. Historical legal and financial snapshot fidelity.
13. Verification that credentials and secrets are never exposed in API outputs.
14. Pre-generation reconciliation healing MongoDB from pre-existing B2 objects.
15. Stale worker CAS fencing with `lockToken` preventing race conditions.
16. Queue resilience and idempotent non-blocking enqueue.
17. Durable background reconciliation recovering abandoned/crashed orders.

---

## 7. Troubleshooting & Recovery

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| `receipt.status` shows `FAILED` with `Backblaze B2 is not configured` | Missing or blank environment variables | Ensure `B2_ENDPOINT`, `B2_BUCKET_NAME`, `B2_KEY_ID`, and `B2_APPLICATION_KEY` are provided in the environment. |
| Customer receives PDF but `status` remains `FAILED` in admin | Upload timed out or S3 permission denied | Check B2 Application Key permissions. Ensure the key has Read & Write access to the target bucket. Use Admin "Regenerate" button to retry upload. |
| `NoSuchKey` / Missing object in B2 | File was deleted or moved from the bucket | The backend automatically detects missing objects during `getReceiptForDownload` and triggers an on-demand regeneration from the original order snapshot. |
| Corrupt or blank PDF download | PDF buffer truncated during transfer | The backend verifies the `%PDF-` header and computes `Content-Length` matching `fileSize`. |
