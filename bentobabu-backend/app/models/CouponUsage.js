const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    usageIndex: {
      type: Number,
      required: true,
      min: 1,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index enforces atomic per-customer usage cap across concurrent requests
couponUsageSchema.index({ coupon: 1, user: 1, usageIndex: 1 }, { unique: true });

const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);

module.exports = CouponUsage;

