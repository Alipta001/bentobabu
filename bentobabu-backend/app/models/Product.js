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
      required: [true, 'Category reference is required'],
      index: true,
    },
    images: {
      type: [String],
      default: [],
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

// Search and filtering compound indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, isAvailable: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isAvailable: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
