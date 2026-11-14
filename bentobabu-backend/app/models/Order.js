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

const paymentDetailsSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
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
        values: ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'COD_PENDING'],
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
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
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
        return ret;
      },
    },
  }
);

// Compound indexes for user order listing and administrative filtering
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;

