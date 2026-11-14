const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Zone name is required'],
      trim: true,
      maxlength: [100, 'Zone name cannot exceed 100 characters'],
    },
    pincodes: {
      type: [String],
      required: [true, 'At least one PIN code is required'],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0 && v.every((pin) => /^[1-9][0-9]{5}$/.test(pin));
        },
        message: 'Each PIN code must be a valid 6-digit Indian postal code',
      },
      index: true,
    },
    deliveryCharge: {
      type: Number,
      required: [true, 'Delivery charge is required'],
      min: [0, 'Delivery charge must be non-negative'],
      default: 30,
    },
    minimumOrderAmount: {
      type: Number,
      required: [true, 'Minimum order amount is required'],
      min: [0, 'Minimum order amount must be non-negative'],
      default: 0,
    },
    estimatedDeliveryMinutes: {
      type: Number,
      required: [true, 'Estimated delivery time is required'],
      min: [1, 'Estimated delivery time must be at least 1 minute'],
      default: 35,
    },
    isActive: {
      type: Boolean,
      default: true,
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

const DeliveryZone = mongoose.model('DeliveryZone', deliveryZoneSchema);

module.exports = DeliveryZone;
