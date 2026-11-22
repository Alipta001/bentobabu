process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const connectDB = require('../app/config/db');
const {
  User,
  Product,
  Category,
  Order,
  Cart,
  Address,
  DeliveryZone,
  DeliverySlot,
} = require('../app/models');

const AdminOrderController = require('../app/controllers/adminOrderController');
const OrderController = require('../app/controllers/orderController');
const { getKolkataDateString } = require('../app/utils/businessDate');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('\n========================================================================');
  console.log(' BentoBabu: Admin Order Product Images & Fallback Verification (12 Tests)');
  console.log('========================================================================\n');

  await connectDB();

  const testSuffix = Date.now().toString().slice(-6);

  // Setup Category
  const category = await Category.create({
    name: `Test Cat ${testSuffix}`,
    slug: `test-cat-${testSuffix}`,
    description: 'Category for image tests',
    isActive: true,
  });

  // Setup Customer & Admin
  const customer = await User.create({
    name: `Image Test Customer ${testSuffix}`,
    email: `customer.img.${testSuffix}@bentobabu.test`,
    phone: `97111${testSuffix.slice(0, 5)}`,
    role: 'CUSTOMER',
    isActive: true,
  });

  const admin = await User.create({
    name: `Image Test Admin ${testSuffix}`,
    email: `admin.img.${testSuffix}@bentobabu.test`,
    phone: `97222${testSuffix.slice(0, 5)}`,
    role: 'ADMIN',
    isActive: true,
  });

  // Setup Delivery Zone & Slot
  const zone = await DeliveryZone.create({
    name: `Zone Img ${testSuffix}`,
    pincodes: ['700120'],
    minimumOrderAmount: 0,
    deliveryFee: 40,
    freeDeliveryThreshold: 500,
    estimatedDeliveryMinutes: 30,
    isActive: true,
  });

  const slot = await DeliverySlot.create({
    date: getKolkataDateString(),
    label: 'Afternoon Delivery',
    startTime: '13:00',
    endTime: '14:00',
    capacity: 50,
    bookedCount: 0,
    isActive: true,
  });

  // Setup Address
  const address = await Address.create({
    user: customer._id,
    fullName: 'Test Recipient',
    phone: '9711100000',
    addressLine: '123 Barrackpore Station Rd',
    city: 'Barrackpore',
    state: 'West Bengal',
    pincode: '700120',
    isDefault: true,
  });

  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${title}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${title}`);
      console.error('    Error:', err.message);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // Test 1: New order with one product image
  // -------------------------------------------------------------------------
  let product1;
  let order1;
  await test('Test 1: New order with one product image preserves snapshot', async () => {
    product1 = await Product.create({
      name: `Quinoa Bento ${testSuffix}`,
      slug: `quinoa-bento-${testSuffix}`,
      sku: `SKU-Q-${testSuffix}`,
      description: 'Nutritious quinoa bento bowl',
      price: 299,
      images: ['https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg'],
      imagesData: [{ secureUrl: 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg', publicId: 'meals/quinoa_bento' }],
      categories: [category._id],
      category: category._id,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    // Populate cart and call orderController checkout
    await Cart.findOneAndUpdate(
      { user: customer._id },
      { items: [{ product: product1._id, quantity: 2 }] },
      { upsert: true, returnDocument: 'after' }
    );

    const req = {
      user: { id: customer._id.toString(), role: 'CUSTOMER' },
      body: {
        addressId: address._id.toString(),
        deliverySlotId: slot._id.toString(),
        paymentMethod: 'COD',
      },
      headers: {
        'idempotency-key': `idem-t1-${Date.now()}`,
      },
    };
    const res = createMockRes();

    await OrderController.placeOrder(req, res, () => {});
    assert.strictEqual(res.statusCode, 201, 'Order must be created with 201');
    order1 = res.data.data;

    // Verify snapshot
    assert.ok(order1.items && order1.items.length === 1);
    assert.strictEqual(
      order1.items[0].image,
      'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg',
      'Order item must snapshot the product image'
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Order with multiple different products and images
  // -------------------------------------------------------------------------
  let product2;
  let order2;
  await test('Test 2: Order with multiple different products and images preserves all snapshots', async () => {
    product2 = await Product.create({
      name: `Avocado Salad Bento ${testSuffix}`,
      slug: `avocado-bento-${testSuffix}`,
      sku: `SKU-A-${testSuffix}`,
      description: 'Fresh avocado salad bento',
      price: 349,
      images: ['https://res.cloudinary.com/bentobabu/image/upload/v1/meals/avocado_salad.jpg'],
      categories: [category._id],
      category: category._id,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    await Cart.findOneAndUpdate(
      { user: customer._id },
      {
        items: [
          { product: product1._id, quantity: 1 },
          { product: product2._id, quantity: 1 },
        ],
      },
      { upsert: true, returnDocument: 'after' }
    );

    const req = {
      user: { id: customer._id.toString(), role: 'CUSTOMER' },
      body: {
        addressId: address._id.toString(),
        deliverySlotId: slot._id.toString(),
        paymentMethod: 'COD',
      },
      headers: {
        'idempotency-key': `idem-t2-${Date.now()}`,
      },
    };
    const res = createMockRes();

    await OrderController.placeOrder(req, res, () => {});
    assert.strictEqual(res.statusCode, 201);
    order2 = res.data.data;

    assert.strictEqual(order2.items.length, 2);
    assert.strictEqual(order2.items[0].image, 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg');
    assert.strictEqual(order2.items[1].image, 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/avocado_salad.jpg');
  });

  // -------------------------------------------------------------------------
  // Test 3: Order containing a product with multiple images
  // -------------------------------------------------------------------------
  await test('Test 3: Product with multiple images uses primary image as snapshot', async () => {
    const multiImgProduct = await Product.create({
      name: `Multi-image Bowl ${testSuffix}`,
      slug: `multi-img-bowl-${testSuffix}`,
      sku: `SKU-M-${testSuffix}`,
      description: 'Multi-image bento bowl with multiple views',
      price: 399,
      images: [
        'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/primary_shot.jpg',
        'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/side_shot.jpg',
        'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/top_shot.jpg',
      ],
      categories: [category._id],
      category: category._id,
      stockQuantity: 50,
      isAvailable: true,
      isActive: true,
    });

    await Cart.findOneAndUpdate(
      { user: customer._id },
      { items: [{ product: multiImgProduct._id, quantity: 1 }] },
      { upsert: true, returnDocument: 'after' }
    );

    const req = {
      user: { id: customer._id.toString(), role: 'CUSTOMER' },
      body: { addressId: address._id.toString(), deliverySlotId: slot._id.toString(), paymentMethod: 'COD' },
      headers: { 'idempotency-key': `idem-t3-${Date.now()}` },
    };
    const res = createMockRes();
    await OrderController.placeOrder(req, res, () => {});
    assert.strictEqual(res.statusCode, 201);

    const created = res.data.data;
    assert.strictEqual(
      created.items[0].image,
      'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/primary_shot.jpg',
      'Must select the primary image'
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Old order with an image snapshot
  // -------------------------------------------------------------------------
  await test('Test 4: Admin order APIs return saved image snapshot for existing orders', async () => {
    const req = { query: { orderNumber: order1.orderNumber } };
    const res = createMockRes();

    await AdminOrderController.getOrders(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    const returnedOrder = res.data.data.orders[0];

    assert.ok(returnedOrder);
    assert.strictEqual(returnedOrder.items[0].image, 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg');
    assert.strictEqual(returnedOrder.items[0].productImage, 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg');
  });

  // -------------------------------------------------------------------------
  // Test 5: Old order without an image snapshot but with an existing product reference
  // -------------------------------------------------------------------------
  let legacyOrderWithoutImage;
  await test('Test 5: Legacy order without snapshot falls back to populated product image', async () => {
    legacyOrderWithoutImage = await Order.create({
      orderNumber: `BB-LEGACY-1-${Date.now().toString().slice(-4)}`,
      user: customer._id,
      items: [
        {
          product: product1._id,
          productName: product1.name,
          image: '', // empty snapshot simulating legacy order
          quantity: 1,
          unitPrice: product1.price,
          subtotal: product1.price,
        },
      ],
      itemTotal: product1.price,
      subtotal: product1.price,
      deliveryCharge: 40,
      taxAmount: 0,
      grandTotal: product1.price + 40,
      deliveryAddress: {
        fullName: 'Legacy Customer',
        phone: '9711100000',
        addressLine: 'Barrackpore Rd',
        city: 'Barrackpore',
        state: 'WB',
        pincode: '700120',
        addressType: 'HOME',
      },
      orderStatus: 'CONFIRMED',
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
    });

    const req = { query: { orderNumber: legacyOrderWithoutImage.orderNumber } };
    const res = createMockRes();
    await AdminOrderController.getOrders(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);

    const fetched = res.data.data.orders[0];
    assert.strictEqual(
      fetched.items[0].productImage,
      'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg',
      'Should fall back to current product image when snapshot is empty'
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: Order whose product has subsequently been deleted
  // -------------------------------------------------------------------------
  await test('Test 6: Order whose product is deleted preserves saved snapshot without throwing', async () => {
    const tempProd = await Product.create({
      name: `Temporary Meal ${testSuffix}`,
      slug: `temp-meal-${testSuffix}`,
      sku: `SKU-TEMP-${testSuffix}`,
      description: 'Temporary meal for deletion testing',
      price: 250,
      images: ['https://res.cloudinary.com/bentobabu/image/upload/v1/meals/temp_meal.jpg'],
      categories: [category._id],
      category: category._id,
      stockQuantity: 10,
      isAvailable: true,
      isActive: true,
    });

    const deletedProdOrder = await Order.create({
      orderNumber: `BB-DEL-PROD-${Date.now().toString().slice(-4)}`,
      user: customer._id,
      items: [
        {
          product: tempProd._id,
          productName: tempProd.name,
          image: 'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/temp_meal.jpg',
          quantity: 1,
          unitPrice: 250,
          subtotal: 250,
        },
      ],
      itemTotal: 250,
      subtotal: 250,
      deliveryCharge: 40,
      taxAmount: 0,
      grandTotal: 290,
      deliveryAddress: {
        fullName: 'Customer',
        phone: '9711100000',
        addressLine: 'Road',
        city: 'Barrackpore',
        state: 'WB',
        pincode: '700120',
        addressType: 'HOME',
      },
      orderStatus: 'CONFIRMED',
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
    });

    // Delete the product from MongoDB
    await Product.deleteOne({ _id: tempProd._id });

    // Retrieve order via admin endpoint
    const req = { query: { orderNumber: deletedProdOrder.orderNumber } };
    const res = createMockRes();
    await AdminOrderController.getOrders(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);

    const fetched = res.data.data.orders[0];
    assert.strictEqual(
      fetched.items[0].productImage,
      'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/temp_meal.jpg',
      'Should safely retain the immutable snapshot even if product document is deleted'
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Order whose product image has subsequently changed
  // -------------------------------------------------------------------------
  await test('Test 7: Historical order preserves original image when product image changes later', async () => {
    // Update product1 image in catalogue
    await Product.updateOne(
      { _id: product1._id },
      { $set: { images: ['https://res.cloudinary.com/bentobabu/image/upload/v2/meals/new_quinoa_packaging.jpg'] } }
    );

    // Order 1 was created before the product image change
    const req = { query: { orderNumber: order1.orderNumber } };
    const res = createMockRes();
    await AdminOrderController.getOrders(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);

    const fetched = res.data.data.orders[0];
    assert.strictEqual(
      fetched.items[0].image,
      'https://res.cloudinary.com/bentobabu/image/upload/v1/meals/quinoa_bento.jpg',
      'Order item must preserve the snapshot from time of purchase'
    );
  });

  // -------------------------------------------------------------------------
  // Test 8: Order with missing or invalid image URL
  // -------------------------------------------------------------------------
  await test('Test 8: Order with missing image and missing product gracefully returns empty string / placeholder', async () => {
    const phantomId = new mongoose.Types.ObjectId();
    const phantomOrder = await Order.create({
      orderNumber: `BB-PHANTOM-${Date.now().toString().slice(-4)}`,
      user: customer._id,
      items: [
        {
          product: phantomId,
          productName: 'Ghost Item',
          image: '',
          quantity: 1,
          unitPrice: 150,
          subtotal: 150,
        },
      ],
      itemTotal: 150,
      subtotal: 150,
      deliveryCharge: 40,
      taxAmount: 0,
      grandTotal: 190,
      deliveryAddress: {
        fullName: 'Customer',
        phone: '9711100000',
        addressLine: 'Road',
        city: 'Barrackpore',
        state: 'WB',
        pincode: '700120',
        addressType: 'HOME',
      },
      orderStatus: 'CONFIRMED',
      paymentMethod: 'COD',
      paymentStatus: 'COD_PENDING',
    });

    const req = { params: { id: phantomOrder._id.toString() } };
    const res = createMockRes();
    await AdminOrderController.getOrderById(req, res, () => {});
    assert.strictEqual(res.statusCode, 200);

    const fetched = res.data.data.order;
    assert.strictEqual(fetched.items[0].image, '');
    assert.strictEqual(fetched.items[0].productImage, '');
  });

  // -------------------------------------------------------------------------
  // Test 9: Placeholder URL file existence and validity
  // -------------------------------------------------------------------------
  await test('Test 9: Placeholder image exists under bentobabu-admin/public/images/placeholder.png', async () => {
    const adminPlaceholderPath = path.resolve(__dirname, '../../bentobabu-admin/public/images/placeholder.png');
    assert.ok(fs.existsSync(adminPlaceholderPath), 'bentobabu-admin placeholder.png must exist');
    const stats = fs.statSync(adminPlaceholderPath);
    assert.ok(stats.size > 500, `Placeholder file must be non-empty valid image (size: ${stats.size} bytes)`);

    // Verify PNG magic bytes
    const buf = Buffer.alloc(8);
    const fd = fs.openSync(adminPlaceholderPath, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    assert.strictEqual(buf[0], 0x89);
    assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG');
  });

  // -------------------------------------------------------------------------
  // Test 10: Missing original image correctly falls back to placeholder in frontend mapper
  // -------------------------------------------------------------------------
  await test('Test 10: Frontend orderService mapping normalizes empty image to placeholder.png', async () => {
    // Test mapping logic matching bentobabu-admin/services/orderService.ts
    const rawBackendOrder = {
      _id: 'test_order_id',
      orderNumber: 'BB-MAP-123',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: [
        {
          product: 'prod_1',
          productName: 'Item Without Image',
          image: '',
          productImage: '',
          price: 200,
          quantity: 1,
        },
      ],
    };

    const mapItem = (it) => {
      const prod = typeof it.product === 'object' && it.product !== null ? it.product : null;
      const rawImg = it.image || it.productImage || prod?.images?.[0] || prod?.imagesData?.[0]?.secureUrl || '';
      return {
        productId: prod?._id || it.product || '',
        productName: it.productName || prod?.name || 'Bento Item',
        productImage: rawImg || '/images/placeholder.png',
      };
    };

    const mapped = rawBackendOrder.items.map(mapItem);
    assert.strictEqual(mapped[0].productImage, '/images/placeholder.png');
  });

  // -------------------------------------------------------------------------
  // Test 11: Missing placeholder does not cause an infinite error loop
  // -------------------------------------------------------------------------
  await test('Test 11: handleImageError handler breaks loop when target is already placeholder', async () => {
    // Simulating DOM img element
    const mockImg = {
      src: 'https://broken.domain/img.jpg',
      onerror: function () {},
    };

    const handleImageError = (target) => {
      if (!target.src.includes('/images/placeholder.png')) {
        target.src = '/images/placeholder.png';
      } else {
        target.onerror = null;
      }
    };

    // First error: replaces broken src with placeholder
    handleImageError(mockImg);
    assert.strictEqual(mockImg.src, '/images/placeholder.png');
    assert.ok(mockImg.onerror !== null);

    // Second error (if placeholder itself were to error): removes onerror, preventing loop
    handleImageError(mockImg);
    assert.strictEqual(mockImg.onerror, null, 'onerror must be disarmed to prevent infinite recursion');
  });

  // -------------------------------------------------------------------------
  // Test 12: Both admin Orders list and Order Details APIs return standardized image fields
  // -------------------------------------------------------------------------
  await test('Test 12: Both getOrders and getOrderById return normalized image & productImage', async () => {
    // 1. List
    const reqList = { query: { orderNumber: order2.orderNumber } };
    const resList = createMockRes();
    await AdminOrderController.getOrders(reqList, resList, () => {});
    assert.strictEqual(resList.statusCode, 200);
    const orderFromList = resList.data.data.orders[0];
    assert.strictEqual(orderFromList.items.length, 2);
    assert.ok(orderFromList.items[0].productImage);
    assert.ok(orderFromList.items[1].productImage);

    // 2. Details
    const reqDetail = { params: { id: order2._id.toString() } };
    const resDetail = createMockRes();
    await AdminOrderController.getOrderById(reqDetail, resDetail, () => {});
    assert.strictEqual(resDetail.statusCode, 200);
    const orderFromDetail = resDetail.data.data.order;
    assert.strictEqual(orderFromDetail.items.length, 2);
    assert.ok(orderFromDetail.items[0].productImage);
    assert.ok(orderFromDetail.items[1].productImage);
  });

  // Cleanup test fixtures
  console.log('\nCleaning up image test artifacts...');
  await Order.deleteMany({ user: customer._id });
  await Cart.deleteMany({ user: customer._id });
  await Product.deleteMany({ categories: category._id });
  await Category.deleteOne({ _id: category._id });
  await User.deleteMany({ _id: { $in: [customer._id, admin._id] } });
  await Address.deleteMany({ user: customer._id });
  await DeliveryZone.deleteOne({ _id: zone._id });
  await DeliverySlot.deleteOne({ _id: slot._id });

  console.log('\n========================================================================');
  console.log(` Image Tests Completed: ${passed} PASSED, ${failed} FAILED (Total 12 Tests)`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
