const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema(
  {
    challengeTokenHash: {
      type: String,
      required: [true, 'Challenge token hash is required'],
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
        delete ret.challengeTokenHash;
        delete ret.challengeToken;
        return ret;
      },
    },
  }
);

// Compound index for active challenges query
otpChallengeSchema.index({ user: 1, isConsumed: 1, expiresAt: 1 });
otpChallengeSchema.index({ identifier: 1, isConsumed: 1 });

/**
 * Migration helper: Safely invalidates legacy challenges using old raw-token storage format
 * Drops legacy challengeToken_1 index and syncs unique index on challengeTokenHash
 * Verified user accounts in User collection are NEVER touched or invalidated
 */
otpChallengeSchema.statics.migrateSchema = async function () {
  try {
    // 1. Delete legacy challenges that do not have challengeTokenHash
    const result = await this.deleteMany({ challengeTokenHash: { $exists: false } });
    if (result && result.deletedCount > 0) {
      console.log(`[Security] Cleaned up ${result.deletedCount} legacy unhashed OTP challenges.`);
    }

    // 2. Drop old challengeToken_1 index if it exists in MongoDB
    const indexes = await this.collection.indexes().catch(() => []);
    const hasOldIndex = indexes.some((idx) => idx.name === 'challengeToken_1');
    if (hasOldIndex) {
      await this.collection.dropIndex('challengeToken_1').catch(() => {});
    }

    // 3. Ensure unique index on challengeTokenHash
    await this.syncIndexes().catch(() => {});
  } catch (err) {
    // Ignore if collection does not exist yet or mock setup
  }
};

const OtpChallenge = mongoose.model('OtpChallenge', otpChallengeSchema);

module.exports = OtpChallenge;
