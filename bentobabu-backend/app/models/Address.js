const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\d{10}$/, 'Please enter a valid 10-digit Indian phone number'],
    },
    addressLine: {
      type: String,
      required: [true, 'Address line is required'],
      trim: true,
      maxlength: [250, 'Address cannot exceed 250 characters'],
    },
    landmark: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Landmark cannot exceed 100 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      default: 'Barrackpore',
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      default: 'West Bengal',
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, 'PIN code is required'],
      trim: true,
      match: [/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code'],
      index: true,
    },
    addressType: {
      type: String,
      enum: {
        values: ['HOME', 'WORK', 'OTHER'],
        message: '{VALUE} is not a valid address type',
      },
      default: 'HOME',
      uppercase: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    isDefault: {
      type: Boolean,
      default: false,
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

addressSchema.index({ user: 1, isDefault: 1 });

const Address = mongoose.model('Address', addressSchema);

module.exports = Address;
