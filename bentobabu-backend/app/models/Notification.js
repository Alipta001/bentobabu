const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: {
        values: ['EMAIL', 'WHATSAPP', 'IN_APP'],
        message: '{VALUE} is not a valid notification channel',
      },
      required: [true, 'Notification channel is required'],
      uppercase: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: {
        values: [
          'ORDER_PLACED',
          'PAYMENT_SUCCESS',
          'PAYMENT_FAILED',
          'ORDER_CONFIRMED',
          'ORDER_PREPARING',
          'ORDER_READY',
          'OUT_FOR_DELIVERY',
          'ORDER_DELIVERED',
          'ORDER_CANCELLED',
          'ORDER_EXPIRED',
          'DELIVERY_APPLICATION_SUBMITTED',
          'DELIVERY_APPLICATION_APPROVED',
          'DELIVERY_APPLICATION_REJECTED',
          'DELIVERY_APPLICATION_CORRECTIONS_REQUESTED',
          'DELIVERY_APPLICATION_SUSPENDED',
          'ORDER_REASSIGNED',
          'DELIVERY_ASSIGNMENT',
        ],
        message: '{VALUE} is not a valid notification event type',
      },
      required: [true, 'Event type is required'],
      uppercase: true,
      index: true,
    },
    recipient: {
      type: String,
      required: [true, 'Recipient contact is required'],
      trim: true,
    },
    subject: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    templateName: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'],
        message: '{VALUE} is not a valid notification status',
      },
      default: 'PENDING',
      uppercase: true,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      required: [true, 'Idempotency key is required'],
      unique: true,
      trim: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: [0, 'Attempts cannot be negative'],
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: [1, 'Max attempts must be at least 1'],
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
      maxlength: [500, 'Error message exceeds maximum length'],
    },
    sentAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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

// Compound indexes for performant queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ status: 1, nextRetryAt: 1 });
notificationSchema.index({ order: 1, eventType: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

