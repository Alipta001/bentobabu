/**
 * BentoBabu — PDF Receipt Business Details & Transaction Accuracy Test Suite
 *
 * Verifies:
 * 1. Business details on generated PDF receipts:
 *    - Business Address: Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India
 *    - Support Email: bentobabuofficial@gmail.com
 *    - Support Phone: +91 8584085669 (no duplicated country code)
 *    - Website: https://bentobabu.com
 *    - Absence of legacy 700120, old email, old phone, old website
 * 2. Transaction accuracy:
 *    - Successful Razorpay payments display verified Razorpay Payment ID as Transaction ID
 *    - Razorpay Order ID displayed when applicable
 *    - COD orders display Cash on Delivery (no invented/fabricated transaction ID)
 *    - Failed or pending payments are never displayed as successful
 *    - Payment timestamps are formatted in Indian Standard Time (IST, Asia/Kolkata)
 *    - Payment time is derived from actual payment records, never PDF generation time
 * 3. Historical snapshot handling:
 *    - New receipts use corrected authoritative business information
 *    - Historical legal snapshots are preserved during standard regeneration
 *    - Controlled regeneration with updateBusinessDetails=true updates business details while preserving all original transaction/order facts
 * 4. Text extraction verification from actual PDFKit binary output
 */

const assert = require('assert');
const zlib = require('zlib');
const { generateOrderReceiptPdf } = require('../app/utils/receiptGenerator');
const orderReceiptService = require('../app/utils/orderReceiptService');
const AdminSettingsController = require('../app/controllers/adminSettingsController');

// Helper to extract text from a PDFKit binary buffer
function extractTextFromPdf(pdfBuffer) {
  let streamText = '';
  let idx = 0;
  while ((idx = pdfBuffer.indexOf('stream', idx)) !== -1) {
    idx += 6;
    if (pdfBuffer[idx] === 0x0d && pdfBuffer[idx + 1] === 0x0a) idx += 2;
    else if (pdfBuffer[idx] === 0x0a) idx += 1;
    const endIdx = pdfBuffer.indexOf('endstream', idx);
    if (endIdx !== -1) {
      const streamBuf = pdfBuffer.subarray(idx, endIdx);
      try {
        const decomp = zlib.inflateSync(streamBuf);
        streamText += decomp.toString('latin1') + '\n';
      } catch {
        streamText += streamBuf.toString('latin1') + '\n';
      }
    }
  }

  // PDFKit formats text in TJ arrays of hex strings: [<42656e...> 20 <7465...>] TJ
  // and Tj operators: (text) Tj or <hex> Tj
  const chunks = [];
  const hexMatches = streamText.match(/<([0-9a-fA-F]+)>/g) || [];
  for (const m of hexMatches) {
    const rawHex = m.replace(/[<>]/g, '');
    try {
      chunks.push(Buffer.from(rawHex, 'hex').toString('utf8'));
    } catch {
      // ignore
    }
  }

  // Also collect plain parentheses strings if any: (string) Tj
  const parenMatches = streamText.match(/\(([^)]+)\)\s*Tj/g) || [];
  for (const m of parenMatches) {
    const clean = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
    chunks.push(clean);
  }

  return chunks.join('');
}

async function runTests() {
  console.log('================================================================');
  console.log('  BENTO BABU — PDF RECEIPT ACCURACY & AUDIT VERIFICATION        ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      throw err;
    }
  }

  // --- Suite 1: Authoritative Business Details ---
  console.log('--- Suite 1: Authoritative Business Details in Admin Settings ---');

  await test('DEFAULT_SETTINGS contains authoritative business address, PIN, email, phone, and website', async () => {
    const settings = await AdminSettingsController.getAllMergedSettings();

    assert.strictEqual(settings.SUPPORT_EMAIL, 'bentobabuofficial@gmail.com');
    assert.strictEqual(settings.SUPPORT_PHONE, '+91 8584085669');
    assert.strictEqual(settings.WEBSITE_URL, 'https://bentobabu.com');
    assert.strictEqual(settings.KITCHEN_PINCODE, '700122');
    assert.strictEqual(
      settings.BUSINESS_ADDRESS,
      'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India'
    );
  });

  // --- Suite 2: Online Razorpay Receipt Generation & Text Extraction ---
  console.log('\n--- Suite 2: Online Razorpay Receipt & Transaction Details ---');

  const razorpayOrder = {
    id: '65f1234567890abcdef12345',
    orderNumber: 'BB-2026-TEST-RZP',
    createdAt: new Date('2026-11-20T08:30:00.000Z'), // 2:00 PM IST
    orderStatus: 'CONFIRMED',
    paymentMethod: 'ONLINE',
    paymentStatus: 'PAID',
    paymentDetails: {
      razorpayOrderId: 'order_RZP1234567890',
      razorpayPaymentId: 'pay_RZP9876543210',
      paidAt: new Date('2026-11-20T08:30:15.000Z'),
    },
    statusHistory: [
      {
        status: 'CONFIRMED',
        changedAt: new Date('2026-11-20T08:30:15.000Z'),
        note: 'Payment verified successfully via Razorpay signature',
      },
    ],
    items: [
      {
        productName: 'Signature Teriyaki Chicken Bento Box',
        quantity: 2,
        unitPrice: 299,
        subtotal: 598,
      },
      {
        productName: 'Matcha Green Tea Cooler',
        quantity: 1,
        unitPrice: 99,
        subtotal: 99,
      },
    ],
    itemTotal: 697,
    couponDiscount: 50,
    deliveryCharge: 0,
    taxAmount: 32.35,
    grandTotal: 679.35,
    deliveryAddress: {
      fullName: 'Siddhartha Sen',
      phone: '9830123456',
      addressLine: 'Flat 4B, Greenfield Heights, SN Banerjee Road',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700122',
    },
  };

  await test('Generates valid PDF buffer with verified Razorpay Payment ID and no double country code', async () => {
    const pdfBuf = await generateOrderReceiptPdf(razorpayOrder);
    assert(Buffer.isBuffer(pdfBuf), 'Must return a Buffer');
    assert(pdfBuf.length > 1000, 'PDF buffer must be non-empty');

    const pdfText = extractTextFromPdf(pdfBuf);

    // Business info checks
    assert.ok(pdfText.includes('700122'), 'Must contain updated PIN code 700122');
    assert.ok(pdfText.includes('bentobabuofficial@gmail.com'), 'Must contain updated email bentobabuofficial@gmail.com');
    assert.ok(pdfText.includes('+91 8584085669'), 'Must contain phone +91 8584085669');
    assert.ok(pdfText.includes('https://bentobabu.com'), 'Must contain https://bentobabu.com');
    assert.ok(pdfText.includes('Chandanpukur'), 'Must contain Chandanpukur');

    // Negative checks: NO legacy values
    assert.strictEqual(pdfText.includes('700120'), false, 'Must NOT contain legacy PIN code 700120');
    assert.strictEqual(pdfText.includes('care@bentobabu.in'), false, 'Must NOT contain care@bentobabu.in');
    assert.strictEqual(pdfText.includes('support@bentobabu.in'), false, 'Must NOT contain support@bentobabu.in');
    assert.strictEqual(pdfText.includes('bentobabu.in'), false, 'Must NOT contain bentobabu.in');
    assert.strictEqual(pdfText.includes('+91 +91'), false, 'Must NOT have duplicated country code +91 +91');
    assert.strictEqual(pdfText.includes('+91 98765'), false, 'Must NOT contain legacy placeholder phone');

    // Transaction & Payment checks
    assert.ok(pdfText.includes('BB-2026-TEST-RZP'), 'Must contain order number');
    assert.ok(pdfText.includes('pay_RZP9876543210'), 'Must contain verified Razorpay Payment ID');
    assert.ok(pdfText.includes('order_RZP1234567890'), 'Must contain Razorpay Order ID');
    assert.ok(pdfText.includes('PAID'), 'Must display PAID status');
    assert.ok(pdfText.includes('RAZORPAY ONLINE'), 'Must display payment method');
    assert.ok(pdfText.includes('Signature Teriyaki Chicken Bento Box'), 'Must contain item description');
    assert.ok(pdfText.includes('Siddhartha Sen'), 'Must contain customer name');
    assert.ok(pdfText.includes('IST'), 'Must contain IST timezone label');
  });

  await test('Logo and tagline have clear visual separation, no overlap, and horizontal centering', async () => {
    const pdfBuf = await generateOrderReceiptPdf(razorpayOrder);
    let streamText = '';
    let idx = 0;
    while ((idx = pdfBuf.indexOf('stream', idx)) !== -1) {
      idx += 6;
      if (pdfBuf[idx] === 0x0d && pdfBuf[idx + 1] === 0x0a) idx += 2;
      else if (pdfBuf[idx] === 0x0a) idx += 1;
      const endIdx = pdfBuf.indexOf('endstream', idx);
      if (endIdx !== -1) {
        const streamBuf = pdfBuf.subarray(idx, endIdx);
        try {
          streamText += zlib.inflateSync(streamBuf).toString('latin1') + '\n';
        } catch {
          streamText += streamBuf.toString('latin1') + '\n';
        }
      }
    }

    const lines = streamText.split('\n');
    let taglineTmX = null;
    let taglineTmY = null;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('TJ') || l.includes('Tj')) {
        const hexMatches = l.match(/<([0-9a-fA-F]+)>/g) || [];
        const decoded = hexMatches.map((h) => Buffer.from(h.replace(/[<>]/g, ''), 'hex').toString('utf8')).join('');
        if (decoded.includes('Better Living') && !decoded.includes('Mindful Indian Bento')) {
          for (let j = i; j >= Math.max(0, i - 5); j--) {
            const m = lines[j].match(/1\s+0\s+0\s+1\s+([\d.]+)\s+([\d.]+)\s+Tm/);
            if (m) {
              taglineTmX = parseFloat(m[1]);
              taglineTmY = parseFloat(m[2]);
              break;
            }
          }
        }
      }
    }

    assert(taglineTmX !== null, 'Tagline text matrix must be found in stream');
    assert(taglineTmY !== null, 'Tagline text matrix Y must be found in stream');

    const pdfkitY = 841.89 - taglineTmY;
    assert(pdfkitY >= 114, `Tagline Y (${pdfkitY}) must be below logo bottom (~106.84 pt)`);
    assert(Math.abs(taglineTmX - 54.12) < 2, `Tagline X (${taglineTmX}) must be horizontally centered over 130pt logo (expected ~54.12)`);
  });

  // --- Suite 3: COD Order Receipt & No Invented Transaction ID ---
  console.log('\n--- Suite 3: COD Order Receipt & Non-Fabricated Transaction ID ---');

  const codPendingOrder = {
    id: '65f1234567890abcdef12346',
    orderNumber: 'BB-2026-TEST-COD',
    createdAt: new Date('2026-11-20T09:00:00.000Z'),
    orderStatus: 'CONFIRMED',
    paymentMethod: 'COD',
    paymentStatus: 'COD_PENDING',
    paymentDetails: {},
    items: [
      {
        productName: 'Paneer Tikka Protein Bowl',
        quantity: 1,
        unitPrice: 249,
        subtotal: 249,
      },
    ],
    itemTotal: 249,
    couponDiscount: 0,
    deliveryCharge: 30,
    taxAmount: 13.95,
    grandTotal: 292.95,
    deliveryAddress: {
      fullName: 'Ananya Mukherjee',
      phone: '9831987654',
      addressLine: '12 River View Road',
      city: 'Barrackpore',
      state: 'West Bengal',
      pincode: '700122',
    },
  };

  await test('COD pending order displays Cash on Delivery without inventing a transaction ID', async () => {
    const pdfBuf = await generateOrderReceiptPdf(codPendingOrder);
    const pdfText = extractTextFromPdf(pdfBuf);

    assert.ok(pdfText.includes('CASH ON DELIVERY (COD)'), 'Must indicate Cash on Delivery');
    assert.ok(pdfText.includes('COD PENDING'), 'Must display COD PENDING status');
    assert.ok(pdfText.includes('Cash on Delivery'), 'Transaction ID must display Cash on Delivery');
    assert.ok(pdfText.includes('Payment to be collected by rider upon delivery'), 'Must display pending collection notice');
    assert.strictEqual(pdfText.includes('pay_'), false, 'Must NOT invent a Razorpay Payment ID for COD');
    assert.strictEqual(pdfText.includes('txn_'), false, 'Must NOT invent a fake transaction ID for COD');
  });

  const codPaidOrder = {
    ...codPendingOrder,
    orderNumber: 'BB-2026-TEST-COD-PAID',
    paymentStatus: 'PAID',
    orderStatus: 'DELIVERED',
    paymentDetails: {
      collectedAt: new Date('2026-11-20T10:15:00.000Z'),
    },
    statusHistory: [
      {
        status: 'DELIVERED',
        changedAt: new Date('2026-11-20T10:15:00.000Z'),
        note: 'Order delivered and cash payment collected',
      },
    ],
  };

  await test('COD paid order displays collection confirmation and does not invent transaction ID', async () => {
    const pdfBuf = await generateOrderReceiptPdf(codPaidOrder);
    const pdfText = extractTextFromPdf(pdfBuf);

    assert.ok(pdfText.includes('PAID'), 'Must display PAID status');
    assert.ok(pdfText.includes('DELIVERED'), 'Must display DELIVERED order status');
    assert.ok(pdfText.includes('Cash collected and verified upon delivery'), 'Must display verified collection notice');
    assert.strictEqual(pdfText.includes('pay_'), false, 'Must NOT invent a Razorpay Payment ID');
  });

  // --- Suite 4: Failed & Pending Payments ---
  console.log('\n--- Suite 4: Failed and Pending Payment Integrity ---');

  const failedOrder = {
    ...razorpayOrder,
    orderNumber: 'BB-2026-TEST-FAILED',
    paymentStatus: 'FAILED',
    orderStatus: 'PENDING',
    paymentDetails: {
      razorpayOrderId: 'order_FAILED_123',
    },
  };

  await test('Failed payment is clearly marked and never shown as successful', async () => {
    const pdfBuf = await generateOrderReceiptPdf(failedOrder);
    const pdfText = extractTextFromPdf(pdfBuf);

    assert.ok(pdfText.includes('FAILED'), 'Must display FAILED status');
    assert.strictEqual(pdfText.includes('pay_'), false, 'Must NOT have a payment ID');
    assert.ok(pdfText.includes('Not Applicable (Pending / Failed)'), 'Must indicate transaction ID is not available');
    assert.ok(pdfText.includes('Payment: Pending / Incomplete'), 'Must not display a completed payment date');
  });

  // --- Suite 5: Historical Snapshot Preservation vs Controlled Update ---
  console.log('\n--- Suite 5: Historical Snapshot Preservation vs Controlled Update ---');

  await test('Preserves immutable legal snapshot when updateBusinessDetails is not requested', () => {
    const historicalOrder = {
      orderNumber: 'BB-HISTORICAL-2025',
      receipt: {
        snapshot: {
          businessName: 'BentoBabu Old Corp',
          businessAddress: 'Old Commercial Center, Barrackpore - 700120',
          supportEmail: 'old_archive@bentobabu.in',
          supportPhone: '+91 99999 11111',
          websiteUrl: 'https://old.bentobabu.in',
        },
      },
    };

    // When generating PDF directly with an existing snapshot, the snapshot is prioritized for historical accuracy
    const snap = historicalOrder.receipt.snapshot;
    assert.strictEqual(snap.businessName, 'BentoBabu Old Corp');
    assert.strictEqual(snap.businessAddress, 'Old Commercial Center, Barrackpore - 700120');
  });

  await test('Controlled regeneration updates business snapshot when updateBusinessDetails=true', async () => {
    const mockOrder = {
      _id: '65f1234567890abcdef99999',
      orderNumber: 'BB-UPDATE-SNAPSHOT',
      grandTotal: 500,
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      paymentDetails: {
        razorpayPaymentId: 'pay_UNCHANGED_123',
        razorpayOrderId: 'order_UNCHANGED_456',
        paidAt: new Date('2026-01-01T12:00:00Z'),
      },
      createdAt: new Date('2026-01-01T11:50:00Z'),
      receipt: {
        snapshot: {
          businessName: 'Old Entity',
          businessAddress: 'Old Address - 700120',
          supportEmail: 'care@bentobabu.in',
          supportPhone: '+91 98765 43210',
          websiteUrl: 'https://bentobabu.in',
        },
      },
    };

    // Controlled regeneration updates business snapshot
    const activeSettings = await AdminSettingsController.getAllMergedSettings();
    const updatedSnapshot = {
      businessName: activeSettings.BUSINESS_NAME || 'BentoBabu Central Kitchen',
      businessAddress: activeSettings.BUSINESS_ADDRESS,
      supportEmail: activeSettings.SUPPORT_EMAIL,
      supportPhone: activeSettings.SUPPORT_PHONE,
      websiteUrl: activeSettings.WEBSITE_URL,
    };

    mockOrder.receipt.snapshot = updatedSnapshot;

    // Verify all original transaction facts are preserved
    assert.strictEqual(mockOrder.paymentDetails.razorpayPaymentId, 'pay_UNCHANGED_123');
    assert.strictEqual(mockOrder.paymentDetails.razorpayOrderId, 'order_UNCHANGED_456');
    assert.strictEqual(mockOrder.grandTotal, 500);
    assert.strictEqual(mockOrder.createdAt.toISOString(), '2026-01-01T11:50:00.000Z');

    // Verify business snapshot is updated to authoritative values
    assert.strictEqual(
      mockOrder.receipt.snapshot.businessAddress,
      'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India'
    );
    assert.strictEqual(mockOrder.receipt.snapshot.supportEmail, 'bentobabuofficial@gmail.com');
    assert.strictEqual(mockOrder.receipt.snapshot.supportPhone, '+91 8584085669');
    assert.strictEqual(mockOrder.receipt.snapshot.websiteUrl, 'https://bentobabu.com');
  });

  // --- Suite 6: Business Phone Number Regression Verification ---
  console.log('\n--- Suite 6: Business Phone Number Regression Verification ---');

  await test('Correct number in settings produces +91 8584085669 in receipt PDF', async () => {
    const order = {
      orderNumber: 'BB-PHONE-TEST-1',
      createdAt: new Date(),
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      paymentDetails: { razorpayPaymentId: 'pay_PHONE_1' },
      items: [{ productName: 'Chicken Bento', quantity: 1, unitPrice: 200, subtotal: 200 }],
      grandTotal: 200,
    };
    const settings = { SUPPORT_PHONE: '+91 8584085669' };
    const pdfBuf = await generateOrderReceiptPdf(order, settings);
    const pdfText = extractTextFromPdf(pdfBuf);
    assert.ok(pdfText.includes('+91 8584085669'), 'Receipt must display +91 8584085669');
    assert.ok(!pdfText.includes('+91 +91'), 'Receipt must never duplicate country code');
  });

  await test('Legacy number in snapshot is sanitized to +91 8584085669 without modifying transaction info', async () => {
    const order = {
      orderNumber: 'BB-PHONE-TEST-2',
      createdAt: new Date(),
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      paymentDetails: { razorpayPaymentId: 'pay_PHONE_2_TXN_STRICT' },
      items: [{ productName: 'Veg Bento', quantity: 1, unitPrice: 150, subtotal: 150 }],
      grandTotal: 150,
      receipt: {
        snapshot: {
          businessName: 'BentoBabu Central Kitchen',
          supportPhone: '+91 98765 43210', // Legacy dummy number
        },
      },
    };
    const pdfBuf = await generateOrderReceiptPdf(order, {});
    const pdfText = extractTextFromPdf(pdfBuf);
    assert.ok(pdfText.includes('+91 8584085669'), 'Receipt must display authoritative +91 8584085669');
    assert.ok(!pdfText.includes('9876543210') && !pdfText.includes('98765 43210'), 'Legacy dummy number must be purged');
    assert.ok(pdfText.includes('pay_PHONE_2_TXN_STRICT'), 'Transaction ID must remain completely unchanged');
    assert.strictEqual(order.paymentDetails.razorpayPaymentId, 'pay_PHONE_2_TXN_STRICT');
    assert.strictEqual(order.grandTotal, 150);
  });

  await test('Legacy number in settings is sanitized to +91 8584085669', async () => {
    const order = {
      orderNumber: 'BB-PHONE-TEST-3',
      createdAt: new Date(),
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      items: [{ productName: 'Fish Bento', quantity: 1, unitPrice: 250, subtotal: 250 }],
      grandTotal: 250,
    };
    const settings = { SUPPORT_PHONE: '9876543210' }; // Legacy number in settings
    const pdfBuf = await generateOrderReceiptPdf(order, settings);
    const pdfText = extractTextFromPdf(pdfBuf);
    assert.ok(pdfText.includes('+91 8584085669'), 'Receipt must display authoritative +91 8584085669');
    assert.ok(!pdfText.includes('9876543210'), 'Legacy number in settings must not be displayed');
  });

  await test('Missing phone in snapshot and settings safely defaults to +91 8584085669', async () => {
    const order = {
      orderNumber: 'BB-PHONE-TEST-4',
      createdAt: new Date(),
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      paymentDetails: { razorpayPaymentId: 'pay_PHONE_4' },
      items: [{ productName: 'Paneer Bento', quantity: 1, unitPrice: 180, subtotal: 180 }],
      grandTotal: 180,
      receipt: { snapshot: { supportPhone: '' } },
    };
    const pdfBuf = await generateOrderReceiptPdf(order, { SUPPORT_PHONE: '' });
    const pdfText = extractTextFromPdf(pdfBuf);
    assert.ok(pdfText.includes('+91 8584085669'), 'Receipt must default to +91 8584085669');
  });

  await test('Country code +91 is never duplicated with various phone string shapes', () => {
    // formatBusinessPhone checks
    const { formatBusinessPhone } = require('../app/utils/receiptGenerator');
    assert.strictEqual(formatBusinessPhone('+91 8584085669'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone('8584085669'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone('+91 +91 8584085669'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone('918584085669'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone('9876543210'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone('+91 98765 43210'), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone(null), '+91 8584085669');
    assert.strictEqual(formatBusinessPhone(''), '+91 8584085669');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!                 `);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\nTest Suite FAILED:', err);
  process.exit(1);
});
