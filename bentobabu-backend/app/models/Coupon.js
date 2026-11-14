const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    discountType: {
      type: String,
      enum: {
        values: ['PERCENTAGE', 'FIXED'],
        message: '{VALUE} is not a valid discount type',
      },
      required: [true, 'Discount type is required'],
      uppercase: true,
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value must be non-negative'],
      validate: {
        validator: function (val) {
          if (this.discountType === 'PERCENTAGE') {
            return val <= 100;
          }
          return true;
        },
        message: 'Percentage discount value cannot exceed 100%',
      },
    },
    minimumOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order amount must be non-negative'],
    },
    maximumDiscount: {
      type: Number,
      min: [0, 'Maximum discount must be non-negative'],
      default: null,
    },
    usageLimit: {
      type: Number,
      min: [1, 'Usage limit must be at least 1'],
      default: null,
    },
    usageLimitPerUser: {
      type: Number,
      min: [1, 'Per-user limit must be at least 1'],
      default: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, 'Used count cannot be negative'],
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
      index: true,
      validate: {
        validator: function (val) {
          if (!this.startDate) return true;
          return val > this.startDate;
        },
        message: 'Expiry date must be after start date',
      },
    },
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFirstOrderOnly: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
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

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
