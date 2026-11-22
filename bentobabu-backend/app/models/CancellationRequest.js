const mongoose = require('mongoose');

const cancellationRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Cancellation reason is required'],
      trim: true,
      minlength: [5, 'Reason must be at least 5 characters'],
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED'],
        message: '{VALUE} is not a valid cancellation request status',
      },
      default: 'PENDING',
      uppercase: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    refundStatus: {
      type: String,
      enum: {
        values: ['NOT_REQUIRED', 'PENDING', 'PROCESSING', 'INITIATED', 'SUCCESS', 'FAILED'],
        message: '{VALUE} is not a valid refund status',
      },
      default: 'NOT_REQUIRED',
      uppercase: true,
      index: true,
    },
    razorpayRefundId: {
      type: String,
      default: null,
      trim: true,
    },
    refundAmount: {
      type: Number,
      default: 0,
      min: [0, 'Refund amount cannot be negative'],
    },
    failureReason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate pending cancellation requests for the exact same order
cancellationRequestSchema.index(
  { order: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
  }
);

// Support quick dashboard queries sorted by creation time
cancellationRequestSchema.index({ status: 1, createdAt: -1 });
cancellationRequestSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('CancellationRequest', cancellationRequestSchema);
