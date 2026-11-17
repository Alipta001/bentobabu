const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'KITCHEN'],
      default: 'ADMIN',
      index: true,
    },
    token: {
      type: String,
      required: [true, 'Device push token is required'],
      unique: true,
      trim: true,
      index: true,
    },
    platform: {
      type: String,
      enum: {
        values: ['WEB', 'ANDROID', 'IOS'],
        message: '{VALUE} is not a valid device platform',
      },
      default: 'WEB',
      uppercase: true,
      index: true,
    },
    deviceName: {
      type: String,
      trim: true,
      default: 'Web Browser',
      maxlength: [100, 'Device name cannot exceed 100 characters'],
    },
    browser: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Browser name cannot exceed 100 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deactivationReason: {
      type: String,
      enum: ['USER_REVOKED', 'UNREGISTERED', 'INVALID_TOKEN', null],
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        // Mask the actual FCM token in API responses for security
        if (ret.token) {
          ret.maskedToken = ret.token.length > 12
            ? `${ret.token.substring(0, 6)}...${ret.token.substring(ret.token.length - 6)}`
            : '******';
          delete ret.token;
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes
deviceTokenSchema.index({ user: 1, isActive: 1 });
deviceTokenSchema.index({ user: 1, lastSeenAt: -1 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

module.exports = DeviceToken;
