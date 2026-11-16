const mongoose = require('mongoose');

const deliveryPartnerPresenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryApplication',
      default: null,
      index: true,
    },
    accountStatus: {
      type: String,
      enum: {
        values: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
        message: '{VALUE} is not a valid account status',
      },
      default: 'ACTIVE',
      index: true,
    },
    availabilityStatus: {
      type: String,
      enum: {
        values: ['ONLINE', 'OFFLINE', 'BUSY'],
        message: '{VALUE} is not a valid availability status',
      },
      default: 'OFFLINE',
      index: true,
    },
    intendedAvailability: {
      type: String,
      enum: ['ONLINE', 'OFFLINE'],
      default: 'OFFLINE',
    },
    currentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    lastHeartbeat: {
      type: Date,
      default: null,
      index: true,
    },
    lastLocation: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      accuracy: {
        type: Number,
        default: null,
      },
      heading: {
        type: Number,
        default: null,
      },
      speed: {
        type: Number,
        default: null,
      },
      batteryLevel: {
        type: Number,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Virtual: connectionStatus
// A partner is CONNECTED if a heartbeat or location ping was received within the connection timeout
deliveryPartnerPresenceSchema.virtual('connectionStatus').get(function () {
  const timeoutMs = parseInt(process.env.DELIVERY_CONNECTION_TIMEOUT_MS, 10) || 60000;
  if (!this.lastHeartbeat) return 'DISCONNECTED';
  const elapsed = Date.now() - new Date(this.lastHeartbeat).getTime();
  return elapsed <= timeoutMs ? 'CONNECTED' : 'DISCONNECTED';
});

// Virtual: locationFreshness
// Fresh/live if within configured threshold (e.g. 120s), else LAST_KNOWN
deliveryPartnerPresenceSchema.virtual('locationFreshness').get(function () {
  const freshMs = parseInt(process.env.DELIVERY_LOCATION_FRESH_MS, 10) || 120000;
  if (
    !this.lastLocation ||
    typeof this.lastLocation.latitude !== 'number' ||
    typeof this.lastLocation.longitude !== 'number'
  ) {
    return 'NONE';
  }
  if (!this.lastLocation.updatedAt) return 'LAST_KNOWN';
  const elapsed = Date.now() - new Date(this.lastLocation.updatedAt).getTime();
  return elapsed <= freshMs ? 'LIVE' : 'LAST_KNOWN';
});

// Compound index for querying presence
deliveryPartnerPresenceSchema.index({ accountStatus: 1, availabilityStatus: 1 });
deliveryPartnerPresenceSchema.index({ lastHeartbeat: -1 });

const DeliveryPartnerPresence = mongoose.model(
  'DeliveryPartnerPresence',
  deliveryPartnerPresenceSchema
);

module.exports = DeliveryPartnerPresence;
