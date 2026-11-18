/**
 * Idempotent Database Seeder for BentoBabu
 * Populates categories, wholesome bento products, delivery zones, slots, coupons, and system settings.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { validateEnv } = require('./app/config/env');
const {
  User,
  Category,
  Product,
  DeliveryZone,
  DeliverySlot,
  Coupon,
  SystemSetting,
  SupportFaq,
} = require('./app/models');

const env = validateEnv();

const connectDB = require('./app/config/db');

async function seedDatabase() {
  try {
    console.log('[Seeder] Connecting to database...');
    await connectDB();
    console.log('[Seeder] Connected successfully.');

    // 1. System Settings
    console.log('[Seeder] Seeding System Settings...');
    const settings = [
      { key: 'ORDER_ACCEPTANCE_ENABLED', value: true, description: 'Accepting incoming customer orders' },
      { key: 'MAINTENANCE_MODE', value: false, description: 'Platform maintenance mode' },
      { key: 'MINIMUM_ORDER_AMOUNT', value: 99, description: 'Global minimum order requirement in rupees' },
      { key: 'AUTO_CANCEL_UNPAID_MINUTES', value: 15, description: 'Minutes before unpaid orders auto-expire' },
    ];

    for (const setting of settings) {
      await SystemSetting.findOneAndUpdate(
        { key: setting.key },
        { $set: setting },
        { upsert: true }
      );
    }

    // 2. Categories
    console.log('[Seeder] Seeding Categories...');
    const categoriesData = [
      {
        name: 'Healthy Diet',
        slug: 'healthy-diet',
        description: 'Nutrient-dense, balanced whole meals designed for daily vitality and natural wellness.',
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
        isActive: true,
      },
      {
        name: 'Gym & Fitness',
        slug: 'gym-fitness',
        description: 'High-protein, clean-fuel bento boxes tailored for muscle recovery and athletic performance.',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
        isActive: true,
      },
      {
        name: 'Office Professionals',
        slug: 'office-professionals',
        description: 'Zero-slump, light yet energizing bento lunches to keep you sharp throughout your workday.',
        image: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80',
        isActive: true,
      },
      {
        name: 'Senior Citizens',
        slug: 'senior-citizens',
        description: 'Gentle, low-sodium, easy-to-digest traditional preparations enriched with ancient grains.',
        image: 'https://images.unsplash.com/photo-1505253758473-96b3015f240a?auto=format&fit=crop&w=800&q=80',
        isActive: true,
      },
    ];

    const categoryMap = {};
    for (const catData of categoriesData) {
      const cat = await Category.findOneAndUpdate(
        { slug: catData.slug },
        { $set: catData },
        { upsert: true, returnDocument: 'after' }
      );
      categoryMap[cat.slug] = cat._id;
    }

    // 3. Products
    console.log('[Seeder] Seeding Products...');
    const productsData = [
      {
        name: 'Grilled Herb Chicken & Quinoa Bento',
        slug: 'grilled-herb-chicken-quinoa-bowl',
        description: 'Tender chicken breast marinated in fresh rosemary, oregano, and olive oil, served over tri-color quinoa, sauteed zucchini, and roasted bell peppers.',
        price: 349,
        discountPrice: 319,
        category: categoryMap['gym-fitness'],
        images: [
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['NON_VEG', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 485,
          protein: 42,
          carbs: 38,
          fats: 14,
          fiber: 7,
        },
        ingredients: [
          'Chicken Breast (180g)',
          'Organic Quinoa',
          'Zucchini',
          'Bell Peppers',
          'Cold-Pressed Olive Oil',
          'Fresh Rosemary',
          'Lemon Juice',
          'Himalayan Pink Salt',
        ],
        allergens: [],
        stockQuantity: 50,
        preparationTime: 20,
        isAvailable: true,
        isFeatured: true,
      },
      {
        name: 'Tandoori Paneer Power Protein Bowl',
        slug: 'paneer-tikka-power-salad',
        description: 'Low-fat artisanal paneer cubes marinated in hung curd and roasted cumin, served over spiced brown basmati rice, steamed edamame, and crunchy red cabbage.',
        price: 299,
        discountPrice: 279,
        category: categoryMap['healthy-diet'],
        images: [
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEG', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 440,
          protein: 28,
          carbs: 42,
          fats: 16,
          fiber: 8,
        },
        ingredients: [
          'Artisanal Low-Fat Paneer',
          'Spiced Brown Rice',
          'Steamed Edamame',
          'Purple Cabbage',
          'Hung Curd',
          'Roasted Cumin',
          'Mint Chutney',
        ],
        allergens: ['DAIRY'],
        stockQuantity: 45,
        preparationTime: 18,
        isAvailable: true,
        isFeatured: true,
      },
      {
        name: 'Low-Sodium Yellow Lentil & Foxtail Millet Khichdi',
        slug: 'low-sodium-millet-khichdi',
        description: 'Slow-cooked yellow moong dal and foxtail millets tempered with A2 cow ghee, fresh ginger, and digestive cumin. Comforting, nourishing, and gentle on digestion.',
        price: 229,
        discountPrice: 199,
        category: categoryMap['senior-citizens'],
        images: [
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEG', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 320,
          protein: 14,
          carbs: 52,
          fats: 6,
          fiber: 9,
        },
        ingredients: [
          'Foxtail Millet',
          'Split Yellow Moong Dal',
          'A2 Cow Ghee',
          'Fresh Ginger',
          'Cumin Seeds',
          'Turmeric',
          'Rock Salt',
        ],
        allergens: ['DAIRY'],
        stockQuantity: 40,
        preparationTime: 15,
        isAvailable: true,
        isFeatured: true,
      },
      {
        name: 'Spiced Salmon & Steamed Edamame Bento',
        slug: 'spiced-salmon-edamame-bento',
        description: 'Pan-seared Atlantic salmon fillet glazed with ginger-tamari reduction, served with sesame edamame, steamed bok choy, and heirloom black rice.',
        price: 449,
        discountPrice: 419,
        category: categoryMap['office-professionals'],
        images: [
          'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['NON_VEG', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 510,
          protein: 44,
          carbs: 34,
          fats: 20,
          fiber: 6,
        },
        ingredients: [
          'Wild Atlantic Salmon',
          'Heirloom Black Rice',
          'Steamed Edamame',
          'Bok Choy',
          'Tamari (Gluten-Free)',
          'Toasted Sesame',
          'Ginger',
        ],
        allergens: ['FISH', 'SOY'],
        stockQuantity: 30,
        preparationTime: 22,
        isAvailable: true,
        isFeatured: true,
      },
      {
        name: 'Charred Tofu & Asian Greens Stir-Fry',
        slug: 'charred-tofu-asian-greens',
        description: 'Pressed organic tofu wok-tossed with fresh snow peas, broccoli florets, baby corn, and shiitake mushrooms in a light garlic-tamari glaze over soba noodles.',
        price: 279,
        discountPrice: 249,
        category: categoryMap['healthy-diet'],
        images: [
          'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEGAN', 'HIGH_PROTEIN'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 380,
          protein: 24,
          carbs: 46,
          fats: 11,
          fiber: 8,
        },
        ingredients: [
          'Organic Firm Tofu',
          'Broccoli',
          'Snow Peas',
          'Shiitake Mushrooms',
          'Soba Noodles',
          'Garlic',
          'Sesame Oil',
        ],
        allergens: ['SOY'],
        stockQuantity: 35,
        preparationTime: 18,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Millet Poha & Sprouted Moong Breakfast Box',
        slug: 'millet-poha-sprouted-moong-breakfast',
        description: 'Flattened red rice and jowar flakes tossed with sprouted green gram, roasted peanuts, curry leaves, and crunchy mustard seeds. Served with fresh coconut mint chutney.',
        price: 189,
        discountPrice: 169,
        category: categoryMap['office-professionals'],
        images: [
          'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEGAN', 'GLUTEN_FREE'],
        mealTypes: ['BREAKFAST', 'ALL_DAY'],
        nutrition: {
          calories: 290,
          protein: 12,
          carbs: 48,
          fats: 7,
          fiber: 6,
        },
        ingredients: [
          'Red Rice Poha',
          'Sprouted Moong',
          'Roasted Peanuts',
          'Curry Leaves',
          'Green Chillies',
          'Fresh Coconut',
          'Mustard Seeds',
        ],
        allergens: ['PEANUTS'],
        stockQuantity: 40,
        preparationTime: 12,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Smoked Chicken & Sweet Potato Recovery Bowl',
        slug: 'smoked-chicken-sweet-potato-bowl',
        description: 'Hickory-smoked chicken strips, roasted spiced sweet potato wedges, steamed french beans, and sweet corn salsa with a zesty chimichurri vinaigrette.',
        price: 329,
        discountPrice: 299,
        category: categoryMap['gym-fitness'],
        images: [
          'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['NON_VEG', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 460,
          protein: 38,
          carbs: 45,
          fats: 12,
          fiber: 8,
        },
        ingredients: [
          'Smoked Chicken Breast',
          'Roasted Sweet Potato',
          'French Beans',
          'Sweet Corn',
          'Parsley',
          'Garlic',
          'Extra Virgin Olive Oil',
        ],
        allergens: [],
        stockQuantity: 40,
        preparationTime: 20,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Ayurvedic Moong & Vegetable Healing Broth',
        slug: 'ayurvedic-moong-healing-broth',
        description: 'Gentle restorative soup prepared from simmered whole green moong, bottle gourd, ash gourd, and therapeutic spices including black pepper, ajwain, and pure cow ghee.',
        price: 199,
        discountPrice: 179,
        category: categoryMap['senior-citizens'],
        images: [
          'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEG', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER', 'ALL_DAY'],
        nutrition: {
          calories: 210,
          protein: 10,
          carbs: 32,
          fats: 5,
          fiber: 7,
        },
        ingredients: [
          'Green Moong',
          'Bottle Gourd (Lauki)',
          'Ash Gourd',
          'Black Pepper',
          'Ajwain',
          'Coriander',
          'A2 Cow Ghee',
        ],
        allergens: ['DAIRY'],
        stockQuantity: 35,
        preparationTime: 15,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Teriyaki Glazed Tofu & Soba Noodle Bento',
        slug: 'teriyaki-tofu-soba-bento',
        description: 'Pan-seared organic tofu steak glazed with house-made low-sodium teriyaki, paired with buckwheat soba noodles, steamed broccoli florets, and toasted sesame edamame.',
        price: 299,
        discountPrice: 269,
        category: categoryMap['gym-fitness'],
        images: [
          'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEGAN', 'HIGH_PROTEIN'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 430,
          protein: 30,
          carbs: 48,
          fats: 12,
          fiber: 7,
        },
        ingredients: [
          'Organic Firm Tofu',
          'Buckwheat Soba',
          'Broccoli',
          'Edamame',
          'Low-Sodium Tamari',
          'Sesame Seeds',
          'Cold-Pressed Sesame Oil',
        ],
        allergens: ['SOY'],
        stockQuantity: 40,
        preparationTime: 18,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Mediterranean Falafel & Hummus Balance Bowl',
        slug: 'mediterranean-falafel-hummus-bowl',
        description: 'Oven-baked herb chickpeas falafels, velvety beetroot hummus, tri-color quinoa tabbouleh, cherry tomatoes, and a light lemon-tahini dressing.',
        price: 319,
        discountPrice: 289,
        category: categoryMap['office-professionals'],
        images: [
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEGAN', 'HIGH_PROTEIN', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 420,
          protein: 18,
          carbs: 52,
          fats: 15,
          fiber: 10,
        },
        ingredients: [
          'Kabuli Chickpeas',
          'Beetroot Hummus',
          'Quinoa',
          'Parsley',
          'Cherry Tomatoes',
          'Tahini',
          'Extra Virgin Olive Oil',
        ],
        allergens: ['SESAME'],
        stockQuantity: 35,
        preparationTime: 15,
        isAvailable: true,
        isFeatured: true,
      },
      {
        name: 'Steamed Fish & Brown Rice Digestive Bento',
        slug: 'steamed-fish-brown-rice-bento',
        description: 'Delicate freshwater Bhetki fillet steamed with fresh ginger, turmeric, and tender curry leaves, served over aged brown basmati rice and stewed ridge gourd (turai). Gentle and easily digestible.',
        price: 389,
        discountPrice: 359,
        category: categoryMap['senior-citizens'],
        images: [
          'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['NON_VEG', 'GLUTEN_FREE'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 360,
          protein: 32,
          carbs: 38,
          fats: 8,
          fiber: 5,
        },
        ingredients: [
          'Fresh Bhetki Fillet',
          'Brown Basmati Rice',
          'Ridge Gourd (Turai)',
          'Ginger',
          'Curry Leaves',
          'Cold-Pressed Mustard Oil (drops)',
          'Himalayan Salt',
        ],
        allergens: ['FISH'],
        stockQuantity: 25,
        preparationTime: 20,
        isAvailable: true,
        isFeatured: false,
      },
      {
        name: 'Paneer Tikka & Multigrain Roti Bento',
        slug: 'paneer-tikka-multigrain-roti-bento',
        description: 'Char-grilled artisanal cottage cheese cubes with crisp bell peppers and onions, accompanied by two handmade multigrain rotis, fresh kachumber salad, and cooling mint curd dip.',
        price: 289,
        discountPrice: 259,
        category: categoryMap['healthy-diet'],
        images: [
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
        ],
        dietaryTags: ['VEG', 'HIGH_PROTEIN'],
        mealTypes: ['LUNCH', 'DINNER'],
        nutrition: {
          calories: 450,
          protein: 26,
          carbs: 46,
          fats: 16,
          fiber: 9,
        },
        ingredients: [
          'Low-Fat Paneer',
          'Multigrain Atta (Wheat, Ragi, Oats)',
          'Bell Peppers',
          'Cucumber & Tomato',
          'Hung Curd',
          'Mint',
          'Roasted Jeera',
        ],
        allergens: ['DAIRY', 'WHEAT'],
        stockQuantity: 45,
        preparationTime: 18,
        isAvailable: true,
        isFeatured: true,
      },
    ];

    for (const prodData of productsData) {
      await Product.findOneAndUpdate(
        { slug: prodData.slug },
        { $set: prodData },
        { upsert: true }
      );
    }

    // 4. Delivery Zone (Barrackpore & Kolkata North)
    console.log('[Seeder] Seeding Delivery Zones...');
    const zonesData = [
      {
        name: 'Barrackpore Central & Suburbs',
        pincodes: ['700120', '700121', '700122', '700123'],
        deliveryFee: 40,
        freeDeliveryThreshold: 499,
        minimumOrderAmount: 99,
        estimatedDeliveryTime: '35 - 45 mins',
        isActive: true,
      },
    ];

    for (const zoneData of zonesData) {
      await DeliveryZone.findOneAndUpdate(
        { name: zoneData.name },
        { $set: zoneData },
        { upsert: true }
      );
    }

    // 5. Delivery Slots (Today + Next 3 days)
    console.log('[Seeder] Seeding Delivery Slots...');
    const now = new Date();
    const slotTimes = [
      { startTime: '12:00 PM', endTime: '01:00 PM' },
      { startTime: '01:00 PM', endTime: '02:00 PM' },
      { startTime: '07:30 PM', endTime: '08:30 PM' },
      { startTime: '08:30 PM', endTime: '09:30 PM' },
    ];

    for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + dayOffset);
      const dateString = targetDate.toISOString().split('T')[0];

      for (const slot of slotTimes) {
        await DeliverySlot.findOneAndUpdate(
          { date: dateString, startTime: slot.startTime, endTime: slot.endTime },
          {
            $set: {
              date: dateString,
              startTime: slot.startTime,
              endTime: slot.endTime,
              capacity: 25,
              bookedCount: 0,
              isActive: true,
            },
          },
          { upsert: true }
        );
      }
    }

    // 6. Promotional Coupons
    console.log('[Seeder] Seeding Coupons...');
    const couponsData = [
      {
        code: 'WELCOME50',
        description: '50% off on your first nutritious order up to ₹150',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        maximumDiscount: 150,
        minimumOrderAmount: 199,
        usageLimitPerUser: 1,
        isFirstOrderOnly: true,
        isActive: true,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        code: 'BENTO100',
        description: 'Flat ₹100 off on high-protein fitness orders over ₹399',
        discountType: 'FIXED',
        discountValue: 100,
        minimumOrderAmount: 399,
        usageLimitPerUser: 3,
        isFirstOrderOnly: false,
        isActive: true,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        code: 'HEALTHY20',
        description: '20% off up to ₹80 on daily office and family bentos',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        maximumDiscount: 80,
        minimumOrderAmount: 249,
        usageLimitPerUser: 5,
        isFirstOrderOnly: false,
        isActive: true,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const coup of couponsData) {
      await Coupon.findOneAndUpdate(
        { code: coup.code },
        { $set: coup },
        { upsert: true }
      );
    }

    // 7. Seed Initial Roles & Users (Admin, Staff, Customer)
    console.log('[Seeder] Seeding Demo Users...');
    const usersData = [
      {
        name: 'BentoBabu Administrator',
        email: 'admin@bentobabu.in',
        phone: '9876543210',
        password: await bcrypt.hash('AdminPassword@123', 12),
        role: 'ADMIN',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
      {
        name: 'BentoBabu Kitchen Chef',
        email: 'kitchen@bentobabu.in',
        phone: '9876543211',
        password: await bcrypt.hash('KitchenPassword@123', 12),
        role: 'KITCHEN',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
      {
        name: 'BentoBabu Delivery Hero',
        email: 'delivery@bentobabu.in',
        phone: '9876543212',
        password: await bcrypt.hash('DeliveryPassword@123', 12),
        role: 'DELIVERY',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
      {
        name: 'Demo Customer',
        email: 'customer@bentobabu.in',
        phone: '9876543213',
        password: await bcrypt.hash('CustomerPassword@123', 12),
        role: 'CUSTOMER',
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    ];

    for (const userData of usersData) {
      try {
        await User.findOneAndUpdate(
          { email: userData.email },
          { $set: userData },
          { upsert: true }
        );
      } catch (userErr) {
        console.warn(`[Seeder] Skipped upserting user ${userData.email}: ${userErr.message}`);
      }
    }

    // 8. Support FAQs
    console.log('[Seeder] Seeding Support FAQs...');
    const faqCount = await SupportFaq.countDocuments();
    if (faqCount === 0) {
      const initialFaqs = [
        {
          category: 'ORDERING',
          question: 'How do I place an order on BentoBabu?',
          answer: 'Browse our menu of gourmet, balanced bento boxes, choose your desired meal and portion size, add items to cart, select your delivery slot, and complete checkout with online payment or Cash on Delivery.',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'ORDERING',
          question: 'Can I customize dietary preferences for my bento?',
          answer: 'Yes! Our menu features specific dietary tags including High-Protein, Low-Carb, Vegan, Gluten-Free, and Jain Friendly. You can also add special cooking notes during checkout.',
          orderIndex: 2,
          isPublished: true,
        },
        {
          category: 'DELIVERY',
          question: 'What are your operational delivery hours?',
          answer: 'We deliver fresh meals daily from 7:00 AM to 10:30 PM across Indiranagar, Koramangala, Whitefield, HSR Layout, and surrounding Bengaluru zones.',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'DELIVERY',
          question: 'How does the contactless delivery OTP work?',
          answer: 'When your order is out for delivery, a 6-digit delivery OTP appears on your live order tracking page. Simply share this OTP with our delivery partner upon arrival to confirm receipt.',
          orderIndex: 2,
          isPublished: true,
        },
        {
          category: 'PAYMENTS',
          question: 'What payment options are accepted?',
          answer: 'We accept all major UPI apps (Google Pay, PhonePe, Paytm), Credit/Debit cards, Net Banking through Razorpay, as well as Cash on Delivery (COD).',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'CANCELLATIONS',
          question: 'How do I cancel my order?',
          answer: 'You can cancel an order free of charge before the kitchen begins preparing your meal. Go to My Orders, select the active order, and click Cancel Order.',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'REFUNDS',
          question: 'When will I receive my refund?',
          answer: 'Online payment refunds are automatically credited back to your original payment method within 3 to 5 business days after cancellation confirmation.',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'FOOD_AND_INGREDIENTS',
          question: 'Are your meals prepared fresh daily?',
          answer: 'Every bento box is prepared from scratch each morning in our sanitized cloud kitchen using farm-fresh seasonal produce, cold-pressed oils, and zero artificial preservatives.',
          orderIndex: 1,
          isPublished: true,
        },
        {
          category: 'ACCOUNT_MANAGEMENT',
          question: 'How do I update my delivery address or phone number?',
          answer: 'Navigate to your Account section from the top navigation bar to manage saved delivery addresses and update profile information.',
          orderIndex: 1,
          isPublished: true,
        },
      ];

      await SupportFaq.insertMany(initialFaqs);
      console.log(`[Seeder] Seeded ${initialFaqs.length} initial FAQs.`);
    }

    console.log('[Seeder] ✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Seeder] ❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
