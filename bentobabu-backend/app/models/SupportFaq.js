const mongoose = require('mongoose');

const supportFaqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'FAQ question is required'],
      trim: true,
      minlength: [5, 'Question must be at least 5 characters'],
      maxlength: [300, 'Question cannot exceed 300 characters'],
    },
    answer: {
      type: String,
      required: [true, 'FAQ answer is required'],
      trim: true,
      minlength: [10, 'Answer must be at least 10 characters'],
      maxlength: [3000, 'Answer cannot exceed 3000 characters'],
    },
    category: {
      type: String,
      enum: [
        'ORDERING',
        'PAYMENTS',
        'DELIVERY',
        'CANCELLATIONS',
        'REFUNDS',
        'FOOD_AND_INGREDIENTS',
        'ACCOUNT_MANAGEMENT',
        'GENERAL',
      ],
      default: 'GENERAL',
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    orderIndex: {
      type: Number,
      default: 0,
    },
    helpfulCount: {
      type: Number,
      default: 0,
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

supportFaqSchema.index({ category: 1, orderIndex: 1 });

const SupportFaq = mongoose.model('SupportFaq', supportFaqSchema);

module.exports = SupportFaq;
