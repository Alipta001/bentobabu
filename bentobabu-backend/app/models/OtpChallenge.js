const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    challengeToken: {
      type: String,
      required: [true, 'Challenge token is required'],
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    identifier: {
      type: String,
      required: [true, 'Identifier (email or phone) is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    channel: {
      type: String,
      enum: {
        values: ['email', 'sms'],
        message: '{VALUE} is not a supported OTP channel',
      },
      required: [true, 'Channel is required'],
    },
    otpHash: {
      type: String,
      required: [true, 'OTP hash is required'],
      select: false, // Never return in default queries
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: { expires: 0 }, // TTL index for automatic cleanup by MongoDB
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    resendCount: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    isConsumed: {
      type: Boolean,
      default: false,
      index: true,
    },
    consumedAt: {
      type: Date,
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
        delete ret.otpHash;
        return ret;
      },
    },
  }
);

// Compound index for active challenges query
otpChallengeSchema.index({ user: 1, isConsumed: 1, expiresAt: 1 });
otpChallengeSchema.index({ identifier: 1, isConsumed: 1 });

const OtpChallenge = mongoose.model('OtpChallenge', otpChallengeSchema);

module.exports = OtpChallenge;
