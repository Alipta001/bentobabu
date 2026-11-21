const mongoose = require('mongoose');

const restockHistorySchema = new mongoose.Schema(
  {
    quantityAdded: {
      type: Number,
      required: [true, 'Quantity added is required'],
      min: [1, 'Restock quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Restock quantity must be an integer',
      },
    },
    previousTotalStock: {
      type: Number,
      required: true,
      min: 0,
    },
    newTotalStock: {
      type: Number,
      required: true,
      min: 0,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin reference is required'],
      index: true,
    },
    adminName: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Note cannot exceed 300 characters'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { _id: true }
);

const dailyInventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    serviceDate: {
      type: String, // 'YYYY-MM-DD' formatted in Asia/Kolkata
      required: [true, 'Service date (YYYY-MM-DD) is required'],
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Service date must be in YYYY-MM-DD format'],
      index: true,
    },
    initialStock: {
      type: Number,
      default: 0,
      min: [0, 'Initial stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Initial stock must be an integer',
      },
    },
    restockedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Restocked quantity cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Restocked quantity must be an integer',
      },
    },
    totalStock: {
      type: Number,
      default: 0,
      min: [0, 'Total stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Total stock must be an integer',
      },
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Reserved quantity cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Reserved quantity must be an integer',
      },
    },
    soldQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Sold quantity cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Sold quantity must be an integer',
      },
    },
    isManuallyDisabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Low stock threshold cannot be negative'],
    },
    restockHistory: {
      type: [restockHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Virtual: remainingStock = Math.max(0, totalStock - reservedQuantity)
dailyInventorySchema.virtual('remainingStock').get(function () {
  return Math.max(0, (this.totalStock || 0) - (this.reservedQuantity || 0));
});

// Virtual: isSoldOut
dailyInventorySchema.virtual('isSoldOut').get(function () {
  const remaining = Math.max(0, (this.totalStock || 0) - (this.reservedQuantity || 0));
  return remaining <= 0;
});

// Virtual: status label
dailyInventorySchema.virtual('status').get(function () {
  if (this.isManuallyDisabled) return 'MANUALLY_UNAVAILABLE';
  const remaining = Math.max(0, (this.totalStock || 0) - (this.reservedQuantity || 0));
  if (remaining <= 0) return 'SOLD_OUT';
  if (remaining <= (this.lowStockThreshold || 5)) return 'LOW_STOCK';
  return 'AVAILABLE';
});

// Compound unique index: Exactly one inventory record per product per service date
dailyInventorySchema.index({ product: 1, serviceDate: 1 }, { unique: true });
dailyInventorySchema.index({ serviceDate: 1, isManuallyDisabled: 1 });

const DailyInventory = mongoose.model('DailyInventory', dailyInventorySchema);

module.exports = DailyInventory;
