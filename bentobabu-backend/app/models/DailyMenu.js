const mongoose = require('mongoose');

const dailyMenuItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const dailyMenuSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD' formatted in Asia/Kolkata
      required: [true, 'Menu date string (YYYY-MM-DD) is required'],
      unique: true,
      trim: true,
    },
    items: {
      type: [dailyMenuItemSchema],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
        return ret;
      },
    },
  }
);

dailyMenuSchema.index({ isPublished: 1, date: 1 });

const DailyMenu = mongoose.model('DailyMenu', dailyMenuSchema);

module.exports = DailyMenu;
