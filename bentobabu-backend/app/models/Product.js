const mongoose = require('mongoose');

const nutritionSchema = new mongoose.Schema(
  {
    calories: {
      type: Number,
      min: [0, 'Calories cannot be negative'],
      default: 0,
    },
    protein: {
      type: Number,
      min: [0, 'Protein cannot be negative'],
      default: 0, // in grams
    },
    carbohydrates: {
      type: Number,
      min: [0, 'Carbohydrates cannot be negative'],
      default: 0, // in grams
    },
    fat: {
      type: Number,
      min: [0, 'Fat cannot be negative'],
      default: 0, // in grams
    },
    fibre: {
      type: Number,
      min: [0, 'Fibre cannot be negative'],
      default: 0, // in grams
    },
  },
  { _id: false }
);

const productVariantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Variant name is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Variant price is required'],
      min: [0, 'Variant price cannot be negative'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 1,
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      index: true,
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        index: true,
      },
    ],
    images: {
      type: [String],
      default: [],
    },
    imagesData: [
      {
        publicId: { type: String, trim: true },
        secureUrl: { type: String, trim: true },
        format: { type: String, trim: true },
        width: Number,
        height: Number,
        bytes: Number,
        version: Number,
        _id: false,
      },
    ],
    video: {
      secureUrl: { type: String, trim: true, default: '' },
      objectKey: { type: String, trim: true, default: '' },
      mimeType: { type: String, default: 'video/mp4' },
      sizeBytes: { type: Number, default: 0 },
      durationSeconds: { type: Number, default: null },
      posterUrl: { type: String, trim: true, default: '' },
      mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be non-negative'],
    },
    compareAtPrice: {
      type: Number,
      min: [0, 'Compare-at price must be non-negative'],
      default: null,
    },
    ingredients: {
      type: [String],
      default: [],
    },
    portionSize: {
      type: String,
      default: '',
      trim: true,
    },
    dietaryTags: {
      type: [String],
      default: [],
      index: true,
    },
    mealTypes: {
      type: [String],
      default: [],
      index: true,
    },
    nutrition: {
      type: nutritionSchema,
      default: () => ({ calories: 0, protein: 0, carbohydrates: 0, fat: 0, fibre: 0 }),
    },
    allergens: {
      type: [String],
      default: [],
    },
    hasVariants: {
      type: Boolean,
      default: false,
      index: true,
    },
    variantLabel: {
      type: String,
      default: 'Choose Option',
      trim: true,
    },
    variants: {
      type: [productVariantSchema],
      default: [],
    },
    preparationTime: {
      type: Number,
      min: [1, 'Preparation time must be at least 1 minute'],
      max: [300, 'Preparation time cannot exceed 300 minutes'],
      default: null,
      index: true,
    },
    stockQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Stock quantity cannot be negative'],
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Low stock threshold cannot be negative'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isSignatureItem: {
      type: Boolean,
      default: false,
      index: true,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Average rating cannot be negative'],
      max: [5, 'Average rating cannot exceed 5'],
      index: true,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: [0, 'Total reviews cannot be negative'],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Image URL and metadata deduplication helpers
function getCanonicalImageKey(urlOrObj) {
  if (!urlOrObj) return '';
  if (typeof urlOrObj === 'object') {
    if (urlOrObj.publicId && typeof urlOrObj.publicId === 'string' && urlOrObj.publicId.trim()) {
      return urlOrObj.publicId.trim();
    }
    if (urlOrObj.secureUrl && typeof urlOrObj.secureUrl === 'string') {
      return getCanonicalImageKey(urlOrObj.secureUrl);
    }
    return '';
  }
  if (typeof urlOrObj !== 'string') return '';
  const cleanUrl = urlOrObj.split('?')[0].trim();
  const uploadIndex = cleanUrl.indexOf('/upload/');
  if (uploadIndex !== -1) {
    const afterUpload = cleanUrl.substring(uploadIndex + 8);
    const parts = afterUpload.split('/');
    const nonTransformParts = parts.filter(
      (p) => !/^v\d+$/.test(p) && !p.includes(',') && !/^[a-z]_[a-z0-9_]+$/i.test(p)
    );
    if (nonTransformParts.length > 0) {
      return nonTransformParts.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
    }
  }
  return cleanUrl;
}

function deduplicateUrls(urls) {
  if (!Array.isArray(urls)) return [];
  const seen = new Set();
  const result = [];
  for (const item of urls) {
    if (!item || typeof item !== 'string') continue;
    const key = getCanonicalImageKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function deduplicateImagesData(imagesData) {
  if (!Array.isArray(imagesData)) return [];
  const seen = new Set();
  const result = [];
  for (const item of imagesData) {
    if (!item) continue;
    const key = getCanonicalImageKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

productSchema.pre('validate', function (next) {
  if (Array.isArray(this.images)) {
    this.images = deduplicateUrls(this.images);
  }
  if (Array.isArray(this.imagesData)) {
    this.imagesData = deduplicateImagesData(this.imagesData);
  }

  // Deduplicate and synchronize category / categories
  if (Array.isArray(this.categories) && this.categories.length > 0) {
    const rawIds = this.categories
      .map((c) => (c?._id ? c._id.toString() : c ? c.toString() : ''))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const uniqueIds = [...new Set(rawIds)];
    this.categories = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
    if (!this.category && uniqueIds.length > 0) {
      this.category = this.categories[0];
    }
  } else if (this.category) {
    const catId = this.category._id ? this.category._id.toString() : this.category.toString();
    if (mongoose.Types.ObjectId.isValid(catId)) {
      this.categories = [new mongoose.Types.ObjectId(catId)];
    }
  }

  if (typeof next === 'function') {
    return next();
  }
});

// Search and filtering compound indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, isAvailable: 1, isActive: 1 });
productSchema.index({ categories: 1, isAvailable: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isAvailable: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);

Product.getCanonicalImageKey = getCanonicalImageKey;
Product.deduplicateUrls = deduplicateUrls;
Product.deduplicateImagesData = deduplicateImagesData;

module.exports = Product;
