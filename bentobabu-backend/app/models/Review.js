const mongoose = require('mongoose');

const reviewImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    publicId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1 star'],
      max: [5, 'Rating cannot exceed 5 stars'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5',
      },
      index: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Review title cannot exceed 100 characters'],
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [5, 'Review comment must be at least 5 characters'],
      maxlength: [1000, 'Review comment cannot exceed 1000 characters'],
    },
    images: {
      type: [reviewImageSchema],
      default: [],
      validate: {
        validator: function (val) {
          return !val || val.length <= 3;
        },
        message: 'A maximum of 3 images can be attached to a review',
      },
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'],
        message: '{VALUE} is not a valid review status',
      },
      default: 'APPROVED',
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
      index: true,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    moderationNote: {
      type: String,
      default: '',
      maxlength: [500, 'Moderation note cannot exceed 500 characters'],
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

// Synchronize isApproved with status
reviewSchema.pre('save', function () {
  if (this.isModified('status')) {
    this.isApproved = this.status === 'APPROVED';
  }
});

// Unique compound index preventing duplicate reviews for the same purchase
reviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true });

// Performance index for product review feed and moderation list
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, rating: -1, createdAt: -1 });

/**
 * Recalculates product rating summary and updates the Product document
 */
reviewSchema.statics.calculateProductRatingSummary = async function (productId) {
  const Product = mongoose.model('Product');
  const objectId = mongoose.Types.ObjectId.isValid(productId)
    ? new mongoose.Types.ObjectId(productId)
    : null;

  if (!objectId) return null;

  const stats = await this.aggregate([
    {
      $match: {
        product: objectId,
        status: 'APPROVED',
      },
    },
    {
      $group: {
        _id: '$product',
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
      },
    },
  ]);

  const result = stats[0] || {
    totalReviews: 0,
    averageRating: 0,
    star5: 0,
    star4: 0,
    star3: 0,
    star2: 0,
    star1: 0,
  };

  const roundedAverage = Number((result.averageRating || 0).toFixed(1));

  // Update Product document with fresh cached rating aggregates
  await Product.findByIdAndUpdate(objectId, {
    $set: {
      averageRating: roundedAverage,
      totalReviews: result.totalReviews,
    },
  });

  return {
    productId: objectId.toString(),
    totalReviews: result.totalReviews,
    averageRating: roundedAverage,
    distribution: {
      5: result.star5,
      4: result.star4,
      3: result.star3,
      2: result.star2,
      1: result.star1,
    },
  };
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
