const mongoose = require('mongoose');

const orderItemSnapshotSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    productName: {
      type: String,
      required: [true, 'Product name snapshot is required'],
      trim: true,
    },
    image: {
      type: String,
      default: '',
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    variantName: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price snapshot is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
  },
  { _id: false }
);

const deliveryAddressSnapshotSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true,
    },
    addressLine: {
      type: String,
      required: [true, 'Address line is required'],
      trim: true,
    },
    landmark: {
      type: String,
      default: '',
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, 'PIN code is required'],
      trim: true,
    },
    addressType: {
      type: String,
      enum: ['HOME', 'WORK', 'OTHER'],
      default: 'HOME',
    },
  },
  { _id: false }
);

const cashCollectionRecordSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'CASH' },
    collectedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['COLLECTED_BY_RIDER', 'DEPOSITED'],
      default: 'COLLECTED_BY_RIDER',
    },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const paymentDetailsSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    razorpayRefundId: { type: String, default: null },
    refundStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'PROCESSED', 'FAILED'],
      default: 'NONE',
    },
    refundAmount: { type: Number, default: null },
    refundInitiatedAt: { type: Date, default: null },
    refundProcessedAt: { type: Date, default: null },
    refundError: { type: String, default: null },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectedAt: { type: Date, default: null },
    method: { type: String, default: null },
    cashCollection: {
      type: cashCollectionRecordSchema,
      default: null,
    },
  },
  { _id: false }
);

const orderReceiptSnapshotSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: null },
    businessAddress: { type: String, default: null },
    supportEmail: { type: String, default: null },
    supportPhone: { type: String, default: null },
    websiteUrl: { type: String, default: null },
    fssaiStatus: { type: String, default: null },
    fssaiNumber: { type: String, default: null },
    gstin: { type: String, default: null },
  },
  { _id: false }
);

const orderReceiptSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['PENDING', 'GENERATING', 'STORED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    storageProvider: {
      type: String,
      default: 'BACKBLAZE_B2',
    },
    bucket: { type: String, default: null },
    objectKey: { type: String, default: null },
    fileName: { type: String, default: null },
    contentType: { type: String, default: 'application/pdf' },
    fileSize: { type: Number, default: null },
    generatedAt: { type: Date, default: null },
    uploadedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lockToken: { type: String, default: null },
    lockExpiresAt: { type: Date, default: null, index: true },
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: null, index: true },
    generationAttempts: { type: Number, default: 0 },
    snapshot: {
      type: orderReceiptSnapshotSchema,
      default: null,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    items: {
      type: [orderItemSnapshotSchema],
      required: [true, 'Order must contain at least one item'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Order must contain at least one item',
      },
    },
    deliveryAddress: {
      type: deliveryAddressSnapshotSchema,
      required: [true, 'Delivery address snapshot is required'],
    },
    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      default: null,
    },
    deliverySlot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliverySlot',
      default: null,
    },
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      default: null,
    },
    couponDiscount: {
      type: Number,
      default: 0,
      min: [0, 'Coupon discount cannot be negative'],
    },
    itemTotal: {
      type: Number,
      required: [true, 'Item total is required'],
      min: [0, 'Item total cannot be negative'],
    },
    deliveryCharge: {
      type: Number,
      required: [true, 'Delivery charge is required'],
      default: 0,
      min: [0, 'Delivery charge cannot be negative'],
    },
    taxAmount: {
      type: Number,
      required: [true, 'Tax amount is required'],
      default: 0,
      min: [0, 'Tax amount cannot be negative'],
    },
    grandTotal: {
      type: Number,
      required: [true, 'Grand total is required'],
      min: [0, 'Grand total cannot be negative'],
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['RAZORPAY', 'COD'],
        message: '{VALUE} is not a valid payment method',
      },
      required: [true, 'Payment method is required'],
      uppercase: true,
    },
    paymentStatus: {
      type: String,
      enum: {
        values: [
          'PENDING',
          'PAID',
          'FAILED',
          'REFUNDED',
          'REFUND_PENDING',
          'REFUND_FAILED',
          'COD_PENDING',
          'COLLECTED_BY_RIDER',
        ],
        message: '{VALUE} is not a valid payment status',
      },
      default: 'PENDING',
      uppercase: true,
      index: true,
    },
    orderStatus: {
      type: String,
      enum: {
        values: [
          'PENDING',
          'CONFIRMED',
          'PREPARING',
          'READY_FOR_PICKUP',
          'READY_FOR_DISPATCH',
          'RIDER_ACCEPTED',
          'PICKED_UP',
          'OUT_FOR_DELIVERY',
          'DELIVERED',
          'CANCELLED',
        ],
        message: '{VALUE} is not a valid order status',
      },
      default: 'PENDING',
      uppercase: true,
      index: true,
    },
    paymentDetails: {
      type: paymentDetailsSchema,
      default: () => ({}),
    },
    assignedDeliveryPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        changedAt: { type: Date, default: Date.now },
        note: { type: String, default: '' },
      },
    ],
    cancellationRecovery: {
      stockRestored: { type: Boolean, default: false },
      slotRestored: { type: Boolean, default: false },
      couponRestored: { type: Boolean, default: false },
    },
    deliveryOTP: {
      type: String,
      select: false, // OTP hash never exposed in queries
      default: null,
    },
    deliveryOtpCode: {
      type: String,
      select: false, // Plain OTP code never exposed in normal queries
      default: null,
    },
    failedOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    deliveryOtpExpiresAt: {
      type: Date,
      select: false,
      default: null,
    },
    receipt: {
      type: orderReceiptSchema,
      default: () => ({ status: 'PENDING' }),
    },
    cancellationRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CancellationRequest',
      default: null,
      index: true,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      sparse: true,
      index: true,
    },
    idempotencyPayloadHash: {
      type: String,
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
        delete ret.deliveryOTP;
        delete ret.deliveryOtpCode;
        delete ret.failedOtpAttempts;
        delete ret.deliveryOtpExpiresAt;
        return ret;
      },
    },
  }
);

// Compound indexes for user order listing and administrative filtering
orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;

