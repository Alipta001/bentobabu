const mongoose = require('mongoose');
const { Product, Category, Media, DailyMenu } = require('../models');
const { slugify } = require('../utils/slugify');
const { sanitizeProductDescription } = require('../utils/sanitizeHtml');
const { redisGet, redisSet, redisDelPattern } = require('../config/redis');
const { deleteAsset } = require('../config/cloudinary');
const { deleteObject } = require('../config/r2');
const { getKolkataDateString, isValidDateString } = require('../utils/businessDate');

const normalizeDietaryTags = (tags = []) => {
  if (!Array.isArray(tags)) {
    if (typeof tags === 'string' && tags.trim()) {
      tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    } else {
      return [];
    }
  }
  const result = new Set();
  for (const t of tags) {
    if (!t || typeof t !== 'string') continue;
    const clean = t.trim();
    const upper = clean.toUpperCase().replace(/\s+/g, '_');
    if (upper === 'VEGETARIAN' || upper === 'VEG') {
      result.add('VEG');
    } else if (upper === 'NON_VEGETARIAN' || upper === 'NON_VEG' || upper === 'NON-VEG') {
      result.add('NON_VEG');
    } else if (upper === 'VEGAN') {
      result.add('VEGAN');
    } else if (upper === 'EGG' || upper === 'CONTAINS_EGG') {
      result.add('EGG');
    } else {
      result.add(upper);
    }
  }
  return Array.from(result);
};

const validateAndNormalizeVariants = (hasVariants, variantLabel, rawVariants) => {
  const isEnabled = Boolean(hasVariants);
  if (!isEnabled) {
    return {
      hasVariants: false,
      variantLabel: typeof variantLabel === 'string' && variantLabel.trim() ? variantLabel.trim() : 'Choose Option',
      variants: [],
    };
  }

  if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
    throw new Error('Products with variants must have at least one variant option');
  }

  const seenNames = new Set();
  const normalized = [];

  for (let i = 0; i < rawVariants.length; i++) {
    const v = rawVariants[i];
    if (!v || typeof v !== 'object') {
      throw new Error(`Variant at index ${i} is invalid`);
    }

    const name = typeof v.name === 'string' ? v.name.trim() : '';
    if (!name) {
      throw new Error(`Variant at position ${i + 1} must have a non-empty name`);
    }

    const canonicalName = name.toLowerCase();
    if (seenNames.has(canonicalName)) {
      throw new Error(`Duplicate variant name "${name}" is not permitted for the same product`);
    }
    seenNames.add(canonicalName);

    const price = typeof v.price === 'number' ? v.price : Number(v.price);
    if (isNaN(price) || price < 0) {
      throw new Error(`Variant "${name}" must have a valid non-negative price`);
    }

    const isAvailable = v.isAvailable !== undefined ? Boolean(v.isAvailable) : true;
    const sortOrder = Number.isInteger(Number(v.sortOrder)) ? Number(v.sortOrder) : i + 1;

    const variantDoc = {
      name,
      price,
      isAvailable,
      sortOrder,
    };

    if (v._id && mongoose.Types.ObjectId.isValid(v._id)) {
      variantDoc._id = v._id;
    } else if (v.id && mongoose.Types.ObjectId.isValid(v.id)) {
      variantDoc._id = v.id;
    }

    normalized.push(variantDoc);
  }

  const label = typeof variantLabel === 'string' && variantLabel.trim() ? variantLabel.trim() : 'Choose Option';

  return {
    hasVariants: true,
    variantLabel: label,
    variants: normalized,
  };
};

class ProductController {
  /**
   * GET /api/v1/products
   * Public: List active products with pagination, search, filters, and sorting (cached)
   */
  static async getProducts(req, res, next) {
    try {
      const skipCache = req.query.skipCache === 'true' || req.headers['x-skip-cache'] === 'true';
      const cacheKey = 'cache:products:list:' + Buffer.from(JSON.stringify(req.query)).toString('base64');
      
      if (!skipCache) {
        const cached = await redisGet(cacheKey);
        if (cached) {
          return res.status(200).json(cached);
        }
      }
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const skip = (page - 1) * limit;

      // Base query: Only active products are visible publicly, unless includeInactive is requested (e.g. admin)
      const filter = {};
      if (req.query.includeInactive !== 'true' && req.query.allStatus !== 'true') {
        filter.isActive = true;
      }

      if (req.query.isSignatureItem === 'true') {
        filter.isSignatureItem = true;
      } else if (req.query.isSignatureItem === 'false') {
        filter.isSignatureItem = false;
      }

      // Resolve business date and daily menu availability
      const businessDate =
        req.query.date && typeof req.query.date === 'string' && isValidDateString(req.query.date.trim())
          ? req.query.date.trim()
          : getKolkataDateString();

      const dailyMenu = await DailyMenu.findOne({ date: businessDate, isPublished: true }).lean();
      const dailyMap = new Map();
      const dailyUnavailableIds = [];

      if (dailyMenu && Array.isArray(dailyMenu.items)) {
        dailyMenu.items.forEach((it) => {
          const prodId = it.product?._id ? it.product._id.toString() : it.product?.toString();
          if (prodId && mongoose.Types.ObjectId.isValid(prodId)) {
            dailyMap.set(prodId, Boolean(it.isAvailable));
            if (it.isAvailable === false) {
              dailyUnavailableIds.push(new mongoose.Types.ObjectId(prodId));
            }
          }
        });
      }

      // Explicit availability filter if requested by caller
      if (req.query.isAvailable === 'true') {
        filter.isAvailable = true;
        if (dailyUnavailableIds.length > 0) {
          filter._id = { $nin: dailyUnavailableIds };
        }
      } else if (req.query.isAvailable === 'false') {
        if (dailyUnavailableIds.length > 0) {
          filter.$or = [{ isAvailable: false }, { _id: { $in: dailyUnavailableIds } }];
        } else {
          filter.isAvailable = false;
        }
      }
      // If req.query.isAvailable is not specified, all active products are returned so unavailable products
      // remain visible with a clear "Currently Unavailable" badge in the customer menu.

      // Keyword Search: Sanitize string to prevent ReDoS / NoSQL injection
      if (req.query.search && typeof req.query.search === 'string') {
        const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sanitized) {
          filter.$or = [
            { name: { $regex: sanitized, $options: 'i' } },
            { description: { $regex: sanitized, $options: 'i' } },
          ];
        }
      }

      // Category Filter: Supports either Category Slug or Category ObjectId (ignores "all" or empty)
      const rawCatQuery = req.query.category || req.query.categoryId;
      if (rawCatQuery && typeof rawCatQuery === 'string') {
        const catParam = rawCatQuery.trim();
        if (catParam && catParam.toLowerCase() !== 'all') {
          let catId = null;
          if (mongoose.Types.ObjectId.isValid(catParam)) {
            catId = new mongoose.Types.ObjectId(catParam);
          } else {
            const categoryDoc = await Category.findOne({ slug: catParam.toLowerCase() });
            if (categoryDoc) {
              catId = categoryDoc._id;
            } else {
              // Non-existent category slug produces empty results safely
              catId = new mongoose.Types.ObjectId();
            }
          }

          const catCondition = {
            $or: [{ categories: catId }, { category: catId }],
          };

          if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, catCondition];
            delete filter.$or;
          } else if (filter.$and) {
            filter.$and.push(catCondition);
          } else {
            filter.$or = catCondition.$or;
          }
        }
      }

      // Dietary Tags / Dietary Filter: Supports comma-separated string, array, or multiple query params
      const rawDietary = req.query.dietaryTags || req.query.dietary;
      if (rawDietary) {
        const inputTags = Array.isArray(rawDietary)
          ? rawDietary
          : String(rawDietary).split(',').map((t) => t.trim()).filter(Boolean);

        const synonymsMap = {
          VEG: ['VEG', 'VEGETARIAN', 'veg', 'vegetarian'],
          VEGETARIAN: ['VEG', 'VEGETARIAN', 'veg', 'vegetarian'],
          NON_VEG: ['NON_VEG', 'NON_VEGETARIAN', 'NON-VEG', 'non_veg', 'non-veg', 'non-vegetarian'],
          'NON-VEG': ['NON_VEG', 'NON_VEGETARIAN', 'NON-VEG', 'non_veg', 'non-veg', 'non-vegetarian'],
          NON_VEGETARIAN: ['NON_VEG', 'NON_VEGETARIAN', 'NON-VEG', 'non_veg', 'non-veg', 'non-vegetarian'],
          VEGAN: ['VEGAN', 'vegan'],
          EGG: ['EGG', 'CONTAINS_EGG', 'egg', 'contains_egg', 'contains-egg'],
          CONTAINS_EGG: ['EGG', 'CONTAINS_EGG', 'egg', 'contains_egg', 'contains-egg'],
        };

        const targetTags = new Set();
        for (const t of inputTags) {
          const upper = t.toUpperCase().replace(/\s+/g, '_');
          if (synonymsMap[upper]) {
            synonymsMap[upper].forEach((s) => targetTags.add(s));
          } else if (synonymsMap[t.toLowerCase()]) {
            synonymsMap[t.toLowerCase()].forEach((s) => targetTags.add(s));
          } else {
            targetTags.add(t);
            targetTags.add(t.toUpperCase());
            targetTags.add(t.toLowerCase());
          }
        }

        if (targetTags.size > 0) {
          filter.dietaryTags = { $in: Array.from(targetTags) };
        }
      }

      // Meal Types Filter: Supports comma-separated string or array
      if (req.query.mealTypes) {
        const meals = Array.isArray(req.query.mealTypes)
          ? req.query.mealTypes
          : req.query.mealTypes.split(',').map((m) => m.trim()).filter(Boolean);
        if (meals.length > 0) {
          filter.mealTypes = { $in: meals };
        }
      }

      // Price Range Filter
      if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
        filter.price = {};
        if (req.query.minPrice !== undefined) {
          const min = Number(req.query.minPrice);
          if (!isNaN(min) && min >= 0) {
            filter.price.$gte = min;
          }
        }
        if (req.query.maxPrice !== undefined) {
          const max = Number(req.query.maxPrice);
          if (!isNaN(max) && max >= 0) {
            filter.price.$lte = max;
          }
        }
        if (Object.keys(filter.price).length === 0) {
          delete filter.price;
        }
      }

      // Sorting Options
      let sort = { createdAt: -1 };
      const sortBy = req.query.sortBy;
      if (sortBy === 'price_low_to_high' || sortBy === 'price_asc') {
        sort = { price: 1 };
      } else if (sortBy === 'price_high_to_low' || sortBy === 'price_desc') {
        sort = { price: -1 };
      } else if (sortBy === 'name') {
        sort = { name: 1 };
      } else if (sortBy === 'newest') {
        sort = { createdAt: -1 };
      } else if (sortBy === 'popularity' || sortBy === 'rating_desc') {
        sort = { isFeatured: -1, isBestseller: -1, createdAt: -1 };
      }

      const [rawProducts, total] = await Promise.all([
        Product.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('category', 'name slug')
          .populate('categories', 'name slug')
          .lean(),
        Product.countDocuments(filter),
      ]);

      const products = rawProducts.map((p) => {
        const pIdStr = p._id ? p._id.toString() : '';
        const isAvailableToday =
          Boolean(p.isAvailable) &&
          (!dailyMap.has(pIdStr) || dailyMap.get(pIdStr) === true);

        const populatedCategories = Array.isArray(p.categories) && p.categories.length > 0
          ? p.categories
          : p.category ? [p.category] : [];
        const primaryCategory = p.category || (populatedCategories.length > 0 ? populatedCategories[0] : null);

        return {
          ...p,
          category: primaryCategory,
          categories: populatedCategories,
          isAvailable: isAvailableToday,
          isSignatureItem: Boolean(p.isSignatureItem),
        };
      });

      const responsePayload = {
        success: true,
        data: products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      };

      if (!skipCache && req.query.includeInactive !== 'true' && req.query.allStatus !== 'true') {
        await redisSet(cacheKey, responsePayload, 600); // 10 minutes TTL
      }

      res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/products/featured
   * Public: Return a curated collection of featured, active, and available items
   */
  static async getFeaturedProducts(req, res, next) {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));

      const todayStr = getKolkataDateString();
      const dailyMenu = await DailyMenu.findOne({ date: todayStr, isPublished: true }).lean();
      const unavailableIds = [];
      if (dailyMenu && Array.isArray(dailyMenu.items)) {
        dailyMenu.items.forEach((it) => {
          if (it.isAvailable === false && it.product) {
            const pid = it.product?._id ? it.product._id.toString() : it.product?.toString();
            if (mongoose.Types.ObjectId.isValid(pid)) {
              unavailableIds.push(new mongoose.Types.ObjectId(pid));
            }
          }
        });
      }

      const filter = {
        isActive: true,
        isAvailable: true,
        $or: [{ isFeatured: true }, { isBestseller: true }],
      };
      if (unavailableIds.length > 0) {
        filter._id = { $nin: unavailableIds };
      }

      const featuredProducts = await Product.find(filter)
        .limit(limit)
        .populate('category', 'name slug')
        .lean();

      const mapped = featuredProducts.map((p) => ({
        ...p,
        isAvailable: true,
      }));

      res.status(200).json({
        success: true,
        data: mapped,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/products/:slug
   * Public: Fetch an active product by slug with category details
   */
  static async getProductBySlug(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Product slug is required',
        });
      }

      const targetDate =
        req.query.date && typeof req.query.date === 'string' && isValidDateString(req.query.date.trim())
          ? req.query.date.trim()
          : getKolkataDateString();

      const cacheKey = `cache:products:detail:${slug.toLowerCase().trim()}:${targetDate}`;
      const cached = await redisGet(cacheKey);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached,
        });
      }

      const product = await Product.findOne({
        slug: slug.toLowerCase().trim(),
        isActive: true,
      })
        .populate('category', 'name slug')
        .populate('categories', 'name slug');

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or unavailable',
        });
      }

      // Check target date's daily menu availability
      const dailyMenu = await DailyMenu.findOne({ date: targetDate, isPublished: true }).lean();
      let isAvailableToday = Boolean(product.isAvailable);
      if (isAvailableToday && dailyMenu && Array.isArray(dailyMenu.items)) {
        const itemEntry = dailyMenu.items.find((it) => {
          const idStr = it.product?._id ? it.product._id.toString() : it.product?.toString();
          return idStr === product._id.toString();
        });
        if (itemEntry !== undefined) {
          isAvailableToday = Boolean(itemEntry.isAvailable);
        }
      }

      const productResponse = product.toObject ? product.toObject() : { ...product };
      const populatedCategories = Array.isArray(product.categories) && product.categories.length > 0
        ? product.categories
        : product.category ? [product.category] : [];
      productResponse.category = product.category || (populatedCategories.length > 0 ? populatedCategories[0] : null);
      productResponse.categories = populatedCategories;
      productResponse.isAvailable = isAvailableToday;
      productResponse.isSignatureItem = Boolean(product.isSignatureItem);

      res.status(200).json({
        success: true,
        data: productResponse,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/products
   * ADMIN only: Create a new product
   */
  static async createProduct(req, res, next) {
    try {
      const {
        name,
        slug,
        description,
        category,
        images,
        imagesData,
        video,
        price,
        compareAtPrice,
        ingredients,
        portionSize,
        dietaryTags,
        mealTypes,
        nutrition,
        allergens,
        stockQuantity,
        isAvailable,
        isFeatured,
        isSignatureItem,
        isActive,
        preparationTime,
        preparationTimeMinutes,
        hasVariants,
        variantLabel,
        variants,
      } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Product name is required and must be a non-empty string',
        });
      }

      if (isSignatureItem !== undefined && typeof isSignatureItem !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isSignatureItem must be a boolean value',
        });
      }

      let normalizedVariantsData;
      try {
        normalizedVariantsData = validateAndNormalizeVariants(
          hasVariants,
          variantLabel,
          variants
        );
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }

      let resolvedPrice = price;
      if (normalizedVariantsData.hasVariants) {
        if (resolvedPrice === undefined || typeof resolvedPrice !== 'number' || resolvedPrice < 0) {
          resolvedPrice = Math.min(...normalizedVariantsData.variants.map((v) => v.price));
        }
      } else {
        if (resolvedPrice === undefined || typeof resolvedPrice !== 'number' || resolvedPrice < 0) {
          return res.status(400).json({
            success: false,
            message: 'A valid non-negative product price is required',
          });
        }
      }

      // Support multiple categories or legacy single category assignment
      const rawCategories = Array.isArray(req.body.categories) && req.body.categories.length > 0
        ? req.body.categories
        : Array.isArray(req.body.categoryIds) && req.body.categoryIds.length > 0
        ? req.body.categoryIds
        : category ? [category] : [];

      if (rawCategories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one valid Category identifier is required',
        });
      }

      const resolvedCategoryIds = [];
      const seenIds = new Set();

      for (const item of rawCategories) {
        if (!item) continue;
        let catDoc = null;
        if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item.trim())) {
          catDoc = await Category.findById(item.trim());
        } else if (item && item._id && mongoose.Types.ObjectId.isValid(item._id)) {
          catDoc = await Category.findById(item._id);
        } else if (typeof item === 'string') {
          catDoc = await Category.findOne({
            $or: [
              { slug: item.trim().toLowerCase() },
              { name: new RegExp('^' + item.trim() + '$', 'i') },
            ],
          });
        }

        if (!catDoc || !catDoc.isActive) {
          return res.status(400).json({
            success: false,
            message: `Category "${typeof item === 'string' ? item : item?._id}" does not exist or is inactive`,
          });
        }

        const idStr = catDoc._id.toString();
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          resolvedCategoryIds.push(catDoc._id);
        }
      }

      if (resolvedCategoryIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one valid Category assignment is required',
        });
      }

      const generatedSlug = slugify(slug || name);
      if (!generatedSlug) {
        return res.status(400).json({
          success: false,
          message: 'A valid URL-friendly slug is required',
        });
      }

      const existingProduct = await Product.findOne({ slug: generatedSlug });
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'A product with this slug already exists',
        });
      }

      const initialStock = Number.isInteger(stockQuantity) && stockQuantity >= 0 ? stockQuantity : 0;
      const initialAvailability = initialStock === 0 ? false : (isAvailable !== undefined ? Boolean(isAvailable) : true);

      // Validate preparationTime if provided
      const rawPrepTime = preparationTime !== undefined ? preparationTime : preparationTimeMinutes;
      let parsedPrepTime = null;
      if (rawPrepTime !== undefined && rawPrepTime !== null && rawPrepTime !== '') {
        const p = Number(rawPrepTime);
        if (!Number.isInteger(p) || p < 1 || p > 300) {
          return res.status(400).json({
            success: false,
            message: 'Preparation time must be an integer between 1 and 300 minutes',
          });
        }
        parsedPrepTime = p;
      }

      // Determine images array and imagesData with deduplication
      let resolvedImages = Array.isArray(images) ? Product.deduplicateUrls(images) : [];
      let resolvedImagesData = Array.isArray(imagesData) ? Product.deduplicateImagesData(imagesData) : [];
      if (resolvedImages.length === 0 && resolvedImagesData.length > 0) {
        resolvedImages = Product.deduplicateUrls(resolvedImagesData.map((img) => img.secureUrl).filter(Boolean));
      }

      const rawDietaryInput = dietaryTags !== undefined
        ? dietaryTags
        : req.body.dietary !== undefined
        ? (Array.isArray(req.body.dietary) ? req.body.dietary : [req.body.dietary])
        : [];
      const resolvedDietaryTags = normalizeDietaryTags(rawDietaryInput);

      const product = await Product.create({
        name: name.trim(),
        slug: generatedSlug,
        description: typeof description === 'string' ? sanitizeProductDescription(description) : '',
        category: resolvedCategoryIds[0],
        categories: resolvedCategoryIds,
        images: resolvedImages,
        imagesData: resolvedImagesData,
        video: video && typeof video === 'object' && video.secureUrl ? video : undefined,
        price: resolvedPrice,
        compareAtPrice: typeof compareAtPrice === 'number' && compareAtPrice >= 0 ? compareAtPrice : null,
        ingredients: Array.isArray(ingredients) ? ingredients : [],
        portionSize: typeof portionSize === 'string' ? portionSize.trim() : '',
        dietaryTags: resolvedDietaryTags,
        mealTypes: Array.isArray(mealTypes) ? mealTypes : [],
        nutrition: nutrition && typeof nutrition === 'object' ? nutrition : undefined,
        allergens: Array.isArray(allergens) ? allergens : [],
        preparationTime: parsedPrepTime,
        stockQuantity: initialStock,
        isAvailable: initialAvailability,
        isFeatured: Boolean(isFeatured),
        isSignatureItem: Boolean(isSignatureItem),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        hasVariants: normalizedVariantsData.hasVariants,
        variantLabel: normalizedVariantsData.variantLabel,
        variants: normalizedVariantsData.variants,
      });

      // Link any uploaded Media assets to this product
      if (resolvedImagesData.length > 0) {
        const publicIds = resolvedImagesData.map((img) => img.publicId).filter(Boolean);
        if (publicIds.length > 0) {
          await Media.updateMany({ publicId: { $in: publicIds } }, { product: product._id });
        }
      }
      if (video && (video.mediaId || video.objectKey)) {
        await Media.updateMany(
          { $or: [{ _id: video.mediaId }, { objectKey: video.objectKey }] },
          { product: product._id }
        );
      }

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      await product.populate('category', 'name slug');
      await product.populate('categories', 'name slug');

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/products/:id
   * ADMIN only: Update permitted product fields
   */
  static async updateProduct(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product identifier format',
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      const {
        name,
        slug,
        description,
        category,
        images,
        imagesData,
        video,
        price,
        compareAtPrice,
        ingredients,
        portionSize,
        dietaryTags,
        mealTypes,
        nutrition,
        allergens,
        isFeatured,
        isSignatureItem,
        preparationTime,
        preparationTimeMinutes,
        hasVariants,
        variantLabel,
        variants,
      } = req.body;

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ success: false, message: 'Name must be a non-empty string' });
        }
        product.name = name.trim();
      }

      if (slug !== undefined) {
        const newSlug = slugify(slug);
        if (!newSlug) {
          return res.status(400).json({ success: false, message: 'Slug cannot be empty' });
        }
        const duplicate = await Product.findOne({ slug: newSlug, _id: { $ne: id } });
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'A product with this slug already exists' });
        }
        product.slug = newSlug;
      }

      const rawCategoriesToUpdate = req.body.categories !== undefined
        ? req.body.categories
        : req.body.categoryIds !== undefined
        ? req.body.categoryIds
        : req.body.category !== undefined
        ? (Array.isArray(req.body.category) ? req.body.category : [req.body.category])
        : undefined;

      if (rawCategoriesToUpdate !== undefined) {
        if (!Array.isArray(rawCategoriesToUpdate) || rawCategoriesToUpdate.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one valid Category assignment is required',
          });
        }

        const resolvedCategoryIds = [];
        const seenIds = new Set();

        for (const item of rawCategoriesToUpdate) {
          if (!item) continue;
          let catDoc = null;
          if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item.trim())) {
            catDoc = await Category.findById(item.trim());
          } else if (item && item._id && mongoose.Types.ObjectId.isValid(item._id)) {
            catDoc = await Category.findById(item._id);
          } else if (typeof item === 'string') {
            catDoc = await Category.findOne({
              $or: [
                { slug: item.trim().toLowerCase() },
                { name: new RegExp('^' + item.trim() + '$', 'i') },
              ],
            });
          }

          if (!catDoc || !catDoc.isActive) {
            return res.status(400).json({
              success: false,
              message: `Category "${typeof item === 'string' ? item : item?._id}" does not exist or is inactive`,
            });
          }

          const idStr = catDoc._id.toString();
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            resolvedCategoryIds.push(catDoc._id);
          }
        }

        if (resolvedCategoryIds.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one valid Category assignment is required',
          });
        }

        product.categories = resolvedCategoryIds;
        product.category = resolvedCategoryIds[0];
      }

      if (price !== undefined) {
        if (typeof price !== 'number' || price < 0) {
          return res.status(400).json({ success: false, message: 'Price must be a non-negative number' });
        }
        product.price = price;
      }

      if (compareAtPrice !== undefined) {
        product.compareAtPrice = typeof compareAtPrice === 'number' && compareAtPrice >= 0 ? compareAtPrice : null;
      }

      if (description !== undefined) {
        product.description = typeof description === 'string' ? sanitizeProductDescription(description) : '';
      }

      // Handle imagesData replacement and Cloudinary cleanup
      if (imagesData !== undefined && Array.isArray(imagesData)) {
        const cleanImagesData = Product.deduplicateImagesData(imagesData);
        const newPublicIds = new Set(cleanImagesData.map((img) => img.publicId).filter(Boolean));
        const oldImages = product.imagesData || [];

        // Clean up removed image assets
        for (const oldImg of oldImages) {
          if (oldImg.publicId && !newPublicIds.has(oldImg.publicId)) {
            try {
              await deleteAsset(oldImg.publicId);
              await Media.updateOne({ publicId: oldImg.publicId }, { status: 'DELETED' });
            } catch (delErr) {
              console.error('[ProductController] Error deleting old image asset:', delErr);
            }
          }
        }

        product.imagesData = cleanImagesData;
        product.images = Product.deduplicateUrls(cleanImagesData.map((img) => img.secureUrl).filter(Boolean));

        // Link new media items to product
        if (newPublicIds.size > 0) {
          await Media.updateMany({ publicId: { $in: Array.from(newPublicIds) } }, { product: product._id });
        }
      } else if (images !== undefined && Array.isArray(images)) {
        product.images = Product.deduplicateUrls(images);
      }

      // Handle video replacement and R2 cleanup
      if (video !== undefined) {
        if (!video || !video.secureUrl) {
          if (product.video && product.video.objectKey) {
            try {
              await deleteObject(product.video.objectKey);
              await Media.updateOne({ objectKey: product.video.objectKey }, { status: 'DELETED' });
            } catch (vidErr) {
              console.error('[ProductController] Error deleting product video:', vidErr);
            }
          }
          product.video = undefined;
        } else if (video && video.secureUrl) {
          if (product.video && product.video.objectKey && product.video.objectKey !== video.objectKey) {
            try {
              await deleteObject(product.video.objectKey);
              await Media.updateOne({ objectKey: product.video.objectKey }, { status: 'DELETED' });
            } catch (vidErr) {
              console.error('[ProductController] Error replacing product video:', vidErr);
            }
          }
          product.video = video;
          await Media.updateMany(
            { $or: [{ _id: video.mediaId }, { objectKey: video.objectKey }] },
            { product: product._id }
          );
        }
      }

      if (ingredients !== undefined && Array.isArray(ingredients)) product.ingredients = ingredients;
      if (portionSize !== undefined) product.portionSize = typeof portionSize === 'string' ? portionSize.trim() : '';
      const rawDietaryToUpdate = dietaryTags !== undefined
        ? dietaryTags
        : req.body.dietary !== undefined
        ? (Array.isArray(req.body.dietary) ? req.body.dietary : [req.body.dietary])
        : undefined;
      if (rawDietaryToUpdate !== undefined) product.dietaryTags = normalizeDietaryTags(rawDietaryToUpdate);
      if (mealTypes !== undefined && Array.isArray(mealTypes)) product.mealTypes = mealTypes;
      if (nutrition !== undefined && typeof nutrition === 'object') product.nutrition = nutrition;
      if (allergens !== undefined && Array.isArray(allergens)) product.allergens = allergens;
      if (isFeatured !== undefined) product.isFeatured = Boolean(isFeatured);
      if (isSignatureItem !== undefined) {
        if (typeof isSignatureItem !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: 'isSignatureItem must be a boolean value',
          });
        }
        product.isSignatureItem = isSignatureItem;
      }

      const rawPrepTime = preparationTime !== undefined ? preparationTime : preparationTimeMinutes;
      if (rawPrepTime !== undefined) {
        if (rawPrepTime === null || rawPrepTime === '') {
          product.preparationTime = null;
        } else {
          const p = Number(rawPrepTime);
          if (!Number.isInteger(p) || p < 1 || p > 300) {
            return res.status(400).json({
              success: false,
              message: 'Preparation time must be an integer between 1 and 300 minutes',
            });
          }
          product.preparationTime = p;
        }
      }

      if (hasVariants !== undefined || variants !== undefined || variantLabel !== undefined) {
        const targetHasVariants = hasVariants !== undefined ? Boolean(hasVariants) : Boolean(product.hasVariants);
        const targetLabel = variantLabel !== undefined ? variantLabel : product.variantLabel;
        const targetVariants = variants !== undefined ? variants : product.variants;

        let normalizedVariantsData;
        try {
          normalizedVariantsData = validateAndNormalizeVariants(
            targetHasVariants,
            targetLabel,
            targetVariants
          );
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: err.message,
          });
        }

        product.hasVariants = normalizedVariantsData.hasVariants;
        product.variantLabel = normalizedVariantsData.variantLabel;
        product.variants = normalizedVariantsData.variants;

        if (product.hasVariants && product.variants.length > 0) {
          if (price === undefined && (product.price === undefined || product.price === null || product.price === 0)) {
            product.price = Math.min(...product.variants.map((v) => v.price));
          }
        }
      }

      await product.save();

      await product.populate('category', 'name slug');
      await product.populate('categories', 'name slug');

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/products/:id/status
   * ADMIN only: Toggle or set product active status
   */
  static async updateProductStatus(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product identifier format',
        });
      }

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive status must be a boolean (true or false)',
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      product.isActive = isActive;
      await product.save();

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/products/:id/availability
   * ADMIN only: Toggle or set ordering availability
   */
  static async updateProductAvailability(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product identifier format',
        });
      }

      const { isAvailable } = req.body;
      if (typeof isAvailable !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isAvailable status must be a boolean (true or false)',
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      product.isAvailable = isAvailable;
      await product.save();

      // Sync with today's DailyMenu if one exists
      const todayStr = getKolkataDateString();
      await DailyMenu.updateMany(
        { date: todayStr, 'items.product': product._id },
        { $set: { 'items.$.isAvailable': isAvailable } }
      );

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: `Product ordering ${isAvailable ? 'enabled' : 'disabled'} successfully`,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/products/:id/stock
   * ADMIN only: Update inventory stock quantity
   */
  static async updateProductStock(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product identifier format',
        });
      }

      const { stockQuantity } = req.body;
      if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock quantity must be a non-negative integer',
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      product.stockQuantity = stockQuantity;
      // If stock reaches 0, automatically mark as unavailable
      if (stockQuantity === 0) {
        product.isAvailable = false;
        const todayStr = getKolkataDateString();
        await DailyMenu.updateMany(
          { date: todayStr, 'items.product': product._id },
          { $set: { 'items.$.isAvailable': false } }
        );
      }
      await product.save();

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: 'Product stock updated successfully',
        data: product,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/products/:id
   * ADMIN only: Soft-delete product (sets isActive = false)
   */
  static async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product identifier format',
        });
      }

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        });
      }

      // Permanent deletion if explicitly requested
      if (req.query.permanent === 'true') {
        // Delete all associated Cloudinary images
        for (const img of product.imagesData || []) {
          if (img.publicId) {
            try {
              await deleteAsset(img.publicId);
              await Media.updateOne({ publicId: img.publicId }, { status: 'DELETED' });
            } catch (imgErr) {
              console.error('[ProductController] Error deleting image on permanent product delete:', imgErr);
            }
          }
        }

        // Delete associated R2 video
        if (product.video && product.video.objectKey) {
          try {
            await deleteObject(product.video.objectKey);
            await Media.updateOne({ objectKey: product.video.objectKey }, { status: 'DELETED' });
          } catch (vidErr) {
            console.error('[ProductController] Error deleting video on permanent product delete:', vidErr);
          }
        }

        await Product.findByIdAndDelete(id);

        await redisDelPattern('cache:products:*');
        await redisDelPattern('cache:admin:dashboard:*');

        return res.status(200).json({
          success: true,
          message: 'Product permanently deleted with associated media',
        });
      }

      // Soft deletion: preserve record for historical order integrity
      product.isActive = false;
      product.isAvailable = false;
      await product.save();

      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: 'Product soft-deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ProductController;

