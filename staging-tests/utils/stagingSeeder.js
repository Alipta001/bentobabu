/**
 * BentoBabu Staging Environment Test Seeder & Teardown
 *
 * Prepares isolated test accounts, addresses, categories, products,
 * and daily menu records in the isolated staging MongoDB database.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { assertActiveConnectionIsStaging } = require('./stagingGuard');
const {
  User,
  Category,
  Product,
  DailyMenu,
  Address,
  Cart,
  Order,
  SystemSetting,
  DeliveryZone,
  DeliveryPartnerPresence,
  DeliveryApplication,
} = require('../../bentobabu-backend/app/models');
const { getKolkataDateString } = require('../../bentobabu-backend/app/utils/businessDate');

const STAGING_CONSTANTS = {
  CUSTOMER_EMAIL: 'staging.customer.loadtest@bentobabu.test',
  CUSTOMER_PASSWORD: 'StagingTestPass123!',
  CUSTOMER_PHONE: '9876543210',
  CATEGORY_SLUG: 'staging-bento-specials',
  PRODUCT_SLUG: 'staging-premium-bento',
  TEST_PINCODE: '700120',
};

async function seedStagingEnvironment() {
  assertActiveConnectionIsStaging();

  // 1. Ensure system settings permit ordering
  await SystemSetting.findOneAndUpdate(
    { key: 'MAINTENANCE_MODE' },
    { key: 'MAINTENANCE_MODE', value: false, description: 'Maintenance mode toggle' },
    { upsert: true }
  );

  await SystemSetting.findOneAndUpdate(
    { key: 'ORDER_ACCEPTANCE_ENABLED' },
    { key: 'ORDER_ACCEPTANCE_ENABLED', value: true, description: 'Order acceptance toggle' },
    { upsert: true }
  );

  // 2. Ensure test customers exist for up to 50 concurrent VUs
  const hashedPassword = await bcrypt.hash(STAGING_CONSTANTS.CUSTOMER_PASSWORD, 10);
  const vuUsers = [];

  for (let i = 1; i <= 50; i++) {
    const email = `staging.customer.vu${i}@bentobabu.test`;
    const phone = `98000000${String(i).padStart(2, '0')}`;
    vuUsers.push({ email, phone, name: `Staging VU ${i}` });
  }
  // Also include base test customer
  vuUsers.push({
    email: STAGING_CONSTANTS.CUSTOMER_EMAIL,
    phone: STAGING_CONSTANTS.CUSTOMER_PHONE,
    name: 'Staging LoadTest Customer',
  });

  const seededCustomers = [];
  for (const u of vuUsers) {
    let customer = await User.findOne({ email: u.email });
    if (!customer) {
      customer = await User.create({
        name: u.name,
        email: u.email,
        phone: u.phone,
        password: hashedPassword,
        role: 'CUSTOMER',
        isVerified: true,
        isPhoneVerified: true,
        status: 'ACTIVE',
      });
    } else {
      customer.name = u.name;
      customer.password = hashedPassword;
      customer.role = 'CUSTOMER';
      customer.status = 'ACTIVE';
      customer.isVerified = true;
      customer.isPhoneVerified = true;
      await customer.save();
    }
    seededCustomers.push(customer);

    // Ensure each customer has an address
    let address = await Address.findOne({
      user: customer._id,
      pincode: STAGING_CONSTANTS.TEST_PINCODE,
    });
    if (!address) {
      await Address.create({
        user: customer._id,
        fullName: u.name,
        phone: u.phone,
        addressLine: `123 Bento Test Boulevard, Suite ${customer._id.toString().slice(-4)}`,
        landmark: 'Near Central Kitchen Staging Zone',
        city: 'Barrackpore',
        state: 'West Bengal',
        pincode: STAGING_CONSTANTS.TEST_PINCODE,
        addressType: 'HOME',
        isDefault: true,
      });
    }

    // Initialize clean cart
    await Cart.findOneAndUpdate(
      { user: customer._id },
      { $set: { items: [], subtotal: 0, total: 0 } },
      { upsert: true }
    );
  }

  const primaryCustomer = seededCustomers[seededCustomers.length - 1];

  // 3. Ensure test category exists
  let category = await Category.findOne({ slug: STAGING_CONSTANTS.CATEGORY_SLUG });
  if (!category) {
    category = await Category.create({
      name: 'Staging Bento Specials',
      slug: STAGING_CONSTANTS.CATEGORY_SLUG,
      description: 'Automated performance and load testing specials',
      isActive: true,
      displayOrder: 1,
    });
  } else {
    category.isActive = true;
    await category.save();
  }

  // 4. Ensure test products exist with sufficient stock
  const productDefs = [
    { name: 'Staging Premium Bento', slug: 'staging-premium-bento', price: 299, dietary: 'non-vegetarian' },
    { name: 'Staging Classic Chicken Bento', slug: 'staging-classic-chicken-bento', price: 279, dietary: 'non-vegetarian' },
    { name: 'Staging Vegetarian Delight Bento', slug: 'staging-vegetarian-delight-bento', price: 249, dietary: 'vegetarian' },
    { name: 'Staging Salmon Teriyaki Bento', slug: 'staging-salmon-teriyaki-bento', price: 349, dietary: 'non-vegetarian' },
    { name: 'Staging Crispy Tofu Bento', slug: 'staging-crispy-tofu-bento', price: 239, dietary: 'vegan' },
    { name: 'Staging Butter Chicken Bento', slug: 'staging-butter-chicken-bento', price: 289, dietary: 'non-vegetarian' },
    { name: 'Staging Paneer Tikka Bento', slug: 'staging-paneer-tikka-bento', price: 269, dietary: 'vegetarian' },
    { name: 'Staging Egg Curry Bento', slug: 'staging-egg-curry-bento', price: 229, dietary: 'non-vegetarian' },
    { name: 'Staging Fish Katsu Bento', slug: 'staging-fish-katsu-bento', price: 319, dietary: 'non-vegetarian' },
    { name: 'Staging Prawn Tempura Bento', slug: 'staging-prawn-tempura-bento', price: 359, dietary: 'non-vegetarian' },
    { name: 'Staging Katsu Curry Bento', slug: 'staging-katsu-curry-bento', price: 299, dietary: 'non-vegetarian' },
    { name: 'Staging Miso Glazed Eggplant Bento', slug: 'staging-miso-glazed-eggplant-bento', price: 239, dietary: 'vegan' },
    { name: 'Staging Teriyaki Chicken Bento', slug: 'staging-teriyaki-chicken-bento', price: 279, dietary: 'non-vegetarian' },
    { name: 'Staging Mushroom Stroganoff Bento', slug: 'staging-mushroom-stroganoff-bento', price: 259, dietary: 'vegetarian' },
    { name: 'Staging Dal Makhani Bento', slug: 'staging-dal-makhani-bento', price: 219, dietary: 'vegetarian' },
    { name: 'Staging Chana Masala Bento', slug: 'staging-chana-masala-bento', price: 209, dietary: 'vegan' },
    { name: 'Staging Lamb Keema Bento', slug: 'staging-lamb-keema-bento', price: 369, dietary: 'non-vegetarian' },
    { name: 'Staging Veggie Soba Bento', slug: 'staging-veggie-soba-bento', price: 249, dietary: 'vegan' },
    { name: 'Staging Peri Peri Chicken Bento', slug: 'staging-peri-peri-chicken-bento', price: 289, dietary: 'non-vegetarian' },
    { name: 'Staging Shrimp Garlic Bento', slug: 'staging-shrimp-garlic-bento', price: 349, dietary: 'non-vegetarian' },
    { name: 'Staging BBQ Tofu Bento', slug: 'staging-bbq-tofu-bento', price: 239, dietary: 'vegan' },
    { name: 'Staging Thai Green Curry Bento', slug: 'staging-thai-green-curry-bento', price: 299, dietary: 'non-vegetarian' },
    { name: 'Staging Honey Chilli Paneer Bento', slug: 'staging-honey-chilli-paneer-bento', price: 269, dietary: 'vegetarian' },
    { name: 'Staging Smoked Salmon Bento', slug: 'staging-smoked-salmon-bento', price: 379, dietary: 'non-vegetarian' },
    { name: 'Staging Avocado Poke Bento', slug: 'staging-avocado-poke-bento', price: 329, dietary: 'vegan' },
  ];

  const seededProducts = [];
  for (const def of productDefs) {
    let p = await Product.findOne({ slug: def.slug });
    if (!p) {
      p = await Product.create({
        name: def.name,
        slug: def.slug,
        description: `${def.name} for automated load testing`,
        category: category._id,
        price: def.price,
        comparePrice: def.price + 50,
        stockQuantity: 999999,
        isAvailable: true,
        isActive: true,
        dietary: def.dietary,
      });
    } else {
      p.category = category._id;
      p.price = def.price;
      p.stockQuantity = 999999;
      p.isAvailable = true;
      p.isActive = true;
      await p.save();
    }
    seededProducts.push(p);
  }
  const product = seededProducts[0];

  // 5. Ensure today's daily menu includes all test products
  const todayStr = getKolkataDateString();
  let dailyMenu = await DailyMenu.findOne({ date: todayStr });
  const menuItems = seededProducts.map((p) => ({
    product: p._id,
    isAvailable: true,
    dailyStock: 999999,
  }));

  if (!dailyMenu) {
    dailyMenu = await DailyMenu.create({
      date: todayStr,
      isPublished: true,
      items: menuItems,
    });
  } else {
    dailyMenu.isPublished = true;
    for (const p of seededProducts) {
      const idx = dailyMenu.items.findIndex(
        (it) => it.product && it.product.toString() === p._id.toString()
      );
      if (idx === -1) {
        dailyMenu.items.push({ product: p._id, isAvailable: true, dailyStock: 999999 });
      } else {
        dailyMenu.items[idx].isAvailable = true;
        dailyMenu.items[idx].dailyStock = 999999;
      }
    }
    await dailyMenu.save();
  }

  // 6b. Ensure delivery zone covers test pincode
  let zone = await DeliveryZone.findOne({ pincodes: STAGING_CONSTANTS.TEST_PINCODE });
  if (!zone) {
    zone = await DeliveryZone.create({
      name: 'Staging Central Kitchen Zone',
      pincodes: [STAGING_CONSTANTS.TEST_PINCODE],
      deliveryCharge: 30,
      minimumOrderAmount: 0,
      estimatedDeliveryMinutes: 30,
      isActive: true,
      isDeleted: false,
    });
  } else {
    zone.isActive = true;
    zone.isDeleted = false;
    await zone.save();
  }

  const primaryAddress = await Address.findOne({ user: primaryCustomer._id });

  // 7. Ensure test Admin exists
  const adminPassword = await bcrypt.hash('StagingAdminPass123!', 10);
  let admin = await User.findOne({ email: 'staging.admin@bentobabu.test' });
  if (!admin) {
    admin = await User.create({
      name: 'Staging Admin',
      email: 'staging.admin@bentobabu.test',
      phone: '9899999999',
      password: adminPassword,
      role: 'ADMIN',
      isVerified: true,
      isPhoneVerified: true,
      status: 'ACTIVE',
    });
  } else {
    admin.role = 'ADMIN';
    admin.status = 'ACTIVE';
    admin.isVerified = true;
    await admin.save();
  }

  // 8. Ensure test Kitchen exists
  let kitchen = await User.findOne({ email: 'staging.kitchen@bentobabu.test' });
  if (!kitchen) {
    kitchen = await User.create({
      name: 'Staging Kitchen Chef',
      email: 'staging.kitchen@bentobabu.test',
      phone: '9888888888',
      password: adminPassword,
      role: 'KITCHEN',
      isVerified: true,
      isPhoneVerified: true,
      status: 'ACTIVE',
    });
  } else {
    kitchen.role = 'KITCHEN';
    kitchen.status = 'ACTIVE';
    kitchen.isVerified = true;
    await kitchen.save();
  }

  // 9. Ensure at least 5 Delivery Partner Riders exist and are ONLINE
  const riderPassword = await bcrypt.hash('StagingRiderPass123!', 10);
  const seededRiders = [];
  for (let i = 1; i <= 5; i++) {
    const riderEmail = `staging.rider.${i}@bentobabu.test`;
    const riderPhone = `987000000${i}`;
    let rider = await User.findOne({ email: riderEmail });
    if (!rider) {
      rider = await User.create({
        name: `Staging Rider ${i}`,
        email: riderEmail,
        phone: riderPhone,
        password: riderPassword,
        role: 'DELIVERY',
        isVerified: true,
        isPhoneVerified: true,
        status: 'ACTIVE',
      });
    } else {
      rider.role = 'DELIVERY';
      rider.status = 'ACTIVE';
      rider.isVerified = true;
      rider.isPhoneVerified = true;
      await rider.save();
    }

    let presence = await DeliveryPartnerPresence.findOne({ user: rider._id });
    if (!presence) {
      presence = await DeliveryPartnerPresence.create({
        user: rider._id,
        accountStatus: 'ACTIVE',
        availabilityStatus: 'ONLINE',
        intendedAvailability: 'ONLINE',
        currentOrderId: null,
        lastHeartbeat: new Date(),
        lastLocation: {
          latitude: 22.76,
          longitude: 88.37,
          updatedAt: new Date(),
        },
      });
    } else {
      presence.accountStatus = 'ACTIVE';
      presence.availabilityStatus = 'ONLINE';
      presence.intendedAvailability = 'ONLINE';
      presence.currentOrderId = null;
      presence.lastHeartbeat = new Date();
      await presence.save();
    }

    seededRiders.push({ rider, presence });
  }

  return {
    customer: primaryCustomer,
    customers: seededCustomers,
    admin,
    kitchen,
    riders: seededRiders,
    category,
    product,
    products: seededProducts,
    address: primaryAddress,
    constants: STAGING_CONSTANTS,
  };
}

async function cleanupStagingTestData(customerUserId) {
  assertActiveConnectionIsStaging();

  // Find all test customer accounts
  const testCustomers = await User.find({
    email: { $regex: /^staging\.customer\.(vu\d+|loadtest)@bentobabu\.test$/ },
  }).select('_id');

  const customerIds = testCustomers.map((c) => c._id);
  if (customerUserId && !customerIds.some((id) => id.toString() === customerUserId.toString())) {
    customerIds.push(customerUserId);
  }

  // Clean up all orders generated by the test customers during the load run
  const deleteResult = await Order.deleteMany({ user: { $in: customerIds } });

  // Reset all test carts
  await Cart.updateMany(
    { user: { $in: customerIds } },
    { $set: { items: [], subtotal: 0, total: 0 } }
  );

  return {
    cleanedOrdersCount: deleteResult.deletedCount,
  };
}

async function cleanupStage2TestData() {
  assertActiveConnectionIsStaging();

  // Find all test accounts
  const testUsers = await User.find({
    email: { $regex: /^staging\.(customer|rider|admin|kitchen)\..*@bentobabu\.test$/ },
  }).select('_id email role');

  const userIds = testUsers.map((u) => u._id);
  const riderIds = testUsers.filter((u) => u.role === 'DELIVERY').map((u) => u._id);

  // Delete all test orders
  const deleteOrders = await Order.deleteMany({
    $or: [{ user: { $in: userIds } }, { assignedDeliveryPartner: { $in: riderIds } }],
  });

  // Reset carts
  await Cart.updateMany(
    { user: { $in: userIds } },
    { $set: { items: [], subtotal: 0, total: 0 } }
  );

  // Reset rider presence to ONLINE and available
  await DeliveryPartnerPresence.updateMany(
    { user: { $in: riderIds } },
    {
      $set: {
        accountStatus: 'ACTIVE',
        availabilityStatus: 'ONLINE',
        intendedAvailability: 'ONLINE',
        currentOrderId: null,
        lastHeartbeat: new Date(),
      },
    }
  );

  // Restore test products stock
  await Product.updateMany(
    { slug: { $regex: /^staging-/ } },
    { $set: { stockQuantity: 999999, isAvailable: true, isActive: true } }
  );

  return {
    deletedOrders: deleteOrders.deletedCount,
  };
}

module.exports = {
  seedStagingEnvironment,
  cleanupStagingTestData,
  cleanupStage2TestData,
  STAGING_CONSTANTS,
};
