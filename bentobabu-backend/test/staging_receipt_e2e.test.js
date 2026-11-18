/**
 * BentoBabu — End-to-End Real Infrastructure Staging Verification Test
 * Uses LIVE MongoDB Atlas and LIVE Backblaze B2 Storage (bentobabu-storage).
 */

const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../app/config/db');
const { initRedis, disconnectRedis } = require('../app/config/redis');
const { User, Order, Product } = require('../app/models');
const b2Storage = require('../app/utils/b2Storage');
const orderReceiptService = require('../app/utils/orderReceiptService');
const receiptQueue = require('../app/utils/receiptQueue');

async function runStagingVerification() {
  console.log('\n==================================================================');
  console.log('--- STARTING LIVE STAGING END-TO-END VERIFICATION ---');
  console.log('==================================================================\n');

  try {
    await connectDB(process.env.MONGODB_URI);
    await initRedis();

    // Verify live B2 configuration
    assert(b2Storage.isB2Configured(), 'Backblaze B2 must be configured');
    console.log('✓ Step 0: Connected to live MongoDB Atlas and Backblaze B2 is configured');

    // Setup Test Customer
    await User.deleteMany({ email: 'staging_test_user@bentobabu.com' });
    const customer = await User.create({
      name: 'Staging Live Customer',
      email: 'staging_test_user@bentobabu.com',
      password: 'StagingPassword123!',
      role: 'CUSTOMER',
      isPhoneVerified: true,
      phone: '9876500000',
    });

    let dummyProd = await Product.findOne();
    if (!dummyProd) {
      dummyProd = await Product.create({
        name: 'Staging Bento Box',
        slug: 'staging-bento-box-' + Date.now(),
        category: new mongoose.Types.ObjectId(),
        price: 199,
        isVeg: true,
        isActive: true,
        isAvailable: true,
      });
    }

    // 1. Place a COD test order
    console.log('\n1. Placing COD Test Order...');
    const codOrder = await Order.create({
      user: customer._id,
      orderNumber: 'BB-STG-COD-' + Date.now().toString().slice(-6),
      items: [
        {
          product: dummyProd._id,
          productName: 'Staging Dal Khichdi Bento',
          quantity: 2,
          unitPrice: 160,
          subtotal: 320,
        },
      ],
      deliveryAddress: {
        fullName: 'Staging Customer',
        phone: '9876500000',
        addressLine: 'Chandanpukur Bazar',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 320,
      deliveryCharge: 0,
      taxAmount: 16,
      grandTotal: 336,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      orderStatus: 'CONFIRMED',
      receipt: { status: 'PENDING' },
    });
    console.log(`✓ COD Order created: ${codOrder.orderNumber} (${codOrder._id})`);

    // 2. Generate and store receipt in live Backblaze B2
    console.log('\n2. Generating & Uploading PDF Receipt to Backblaze B2...');
    const codResult = await orderReceiptService.generateAndStoreReceipt(codOrder._id);
    assert.strictEqual(codResult.status, 'STORED', 'Receipt status must be STORED');
    assert.ok(codResult.objectKey, 'Object key must be set');
    console.log(`✓ Uploaded to B2: ${codResult.objectKey}`);

    // 3. Verify PDF in private B2 bucket using HeadObject
    console.log('\n3. Verifying Object in Backblaze B2 via HeadObject...');
    const b2Check = await b2Storage.verifyObject(codResult.objectKey);
    assert.strictEqual(b2Check.exists, true, 'Object must exist in Backblaze B2');
    assert(b2Check.sizeBytes > 1000, `Object size must be > 1KB (got ${b2Check.sizeBytes} bytes)`);
    assert.strictEqual(b2Check.contentType, 'application/pdf');
    console.log(`✓ Verified in Backblaze B2: ${b2Check.sizeBytes} bytes, content-type: ${b2Check.contentType}`);

    // 4. Download through the authenticated download service
    console.log('\n4. Streaming Stored PDF from Backblaze B2...');
    const download = await orderReceiptService.getReceiptForDownload(codOrder._id);
    assert.strictEqual(download.fromStorage, true, 'Subsequent download must be served fromStorage');
    assert(download.buffer && download.buffer.length === b2Check.sizeBytes);
    assert(download.buffer.slice(0, 5).toString() === '%PDF-', 'Buffer must have valid PDF magic bytes');
    console.log(`✓ Downloaded from B2: ${download.buffer.length} bytes, verified PDF header (%PDF-)`);

    // 5. Place a Razorpay test order & verify payment confirmation receipt update
    console.log('\n5. Testing Online Payment Order Receipt Lifecycle...');
    const onlineOrder = await Order.create({
      user: customer._id,
      orderNumber: 'BB-STG-RZP-' + Date.now().toString().slice(-6),
      items: [
        {
          product: dummyProd._id,
          productName: 'Staging Royal Thali',
          quantity: 1,
          unitPrice: 280,
          subtotal: 280,
        },
      ],
      deliveryAddress: {
        fullName: 'Staging Customer',
        phone: '9876500000',
        addressLine: 'Barrackpore Station Road',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: '700120',
      },
      itemTotal: 280,
      deliveryCharge: 0,
      taxAmount: 14,
      grandTotal: 294,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING',
      paymentDetails: {
        razorpayOrderId: 'order_stg_rzp_' + Date.now(),
      },
      receipt: { status: 'PENDING' },
    });
    console.log(`✓ Online order created: ${onlineOrder.orderNumber}`);

    // Simulate payment confirmation: customer pays via Razorpay
    console.log('\n6. Confirming Payment and Regenerating Authoritative PAID Receipt...');
    const updatedOnlineOrder = await Order.findByIdAndUpdate(
      onlineOrder._id,
      {
        $set: {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          'paymentDetails.razorpayPaymentId': 'pay_stg_rzp_txn_' + Date.now(),
        },
      },
      { returnDocument: 'after' }
    );

    // Enqueue with forceRegenerate: true as done in paymentController
    const onlineResult = await orderReceiptService.generateAndStoreReceipt(updatedOnlineOrder._id, {
      forceRegenerate: true,
    });
    assert.strictEqual(onlineResult.status, 'STORED');

    const onlineB2Check = await b2Storage.verifyObject(onlineResult.objectKey);
    assert.strictEqual(onlineB2Check.exists, true);
    console.log(`✓ Online order receipt stored in B2: ${onlineResult.objectKey} (${onlineB2Check.sizeBytes} bytes)`);

    // 7. Verify Historical Preservation: Regenerating does not alter immutable snapshot
    console.log('\n7. Verifying Historical Receipt Snapshot Fidelity...');
    const originalSnapshot = onlineResult.order.receipt.snapshot;
    assert.ok(originalSnapshot && originalSnapshot.businessName);

    const regenHistorical = await orderReceiptService.generateAndStoreReceipt(onlineOrder._id, {
      forceRegenerate: true,
    });
    assert.strictEqual(regenHistorical.order.receipt.snapshot.businessName, originalSnapshot.businessName);
    assert.strictEqual(regenHistorical.order.receipt.snapshot.supportEmail, originalSnapshot.supportEmail);
    console.log('✓ Historical legal snapshot preserved intact across regeneration');

    // 8. Clean up test objects from live Backblaze B2 and MongoDB
    console.log('\n8. Cleaning Up Staging Test Artifacts...');
    await b2Storage.deleteFile(codResult.objectKey);
    await b2Storage.deleteFile(onlineResult.objectKey);
    console.log('✓ Deleted test receipts from Backblaze B2');

    await Order.deleteMany({ _id: { $in: [codOrder._id, onlineOrder._id] } });
    await User.deleteMany({ _id: customer._id });
    console.log('✓ Cleaned up test database records');

    console.log('\n==================================================================');
    console.log('ALL STAGING END-TO-END INFRASTRUCTURE CHECKS PASSED SUCCESSFULLY!');
    console.log('==================================================================\n');

    await disconnectRedis();
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ STAGING END-TO-END VERIFICATION FAILED:', err);
    await disconnectRedis();
    await mongoose.connection.close();
    process.exit(1);
  }
}

runStagingVerification();
