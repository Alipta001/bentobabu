const mongoose = require('mongoose');

const deliverySlotSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Slot date is required'],
      index: true,
    },
    dateStr: {
      type: String, // 'YYYY-MM-DD' formatted in Asia/Kolkata
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'dateStr must be in YYYY-MM-DD format'],
      index: true,
    },
    slotKey: {
      type: String,
      trim: true,
      maxlength: [100, 'Slot key cannot exceed 100 characters'],
      index: true,
    },
    label: {
      type: String,
      required: [true, 'Slot label is required'],
      trim: true,
      maxlength: [100, 'Label cannot exceed 100 characters'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:mm 24-hour format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:mm 24-hour format'],
      validate: {
        validator: function (val) {
          if (!this.startTime) return true;
          return val > this.startTime;
        },
        message: 'End time must be after start time',
      },
    },
    capacity: {
      type: Number,
      required: [true, 'Slot capacity is required'],
      min: [1, 'Capacity must be at least 1 order'],
      default: 20,
    },
    bookedCount: {
      type: Number,
      required: true,
      min: [0, 'Booked count cannot be negative'],
      default: 0,
      validate: {
        validator: function (val) {
          if (typeof this.capacity === 'number') {
            return val <= this.capacity;
          }
          return true;
        },
        message: 'Booked count cannot exceed slot capacity',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    scheduleSource: {
      type: String,
      enum: ['WEEKLY', 'DATE_ADDITION', 'DATE_OVERRIDE', 'CUSTOM'],
      default: 'WEEKLY',
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

// Compound indexes
deliverySlotSchema.index({ date: 1, startTime: 1, endTime: 1 });
deliverySlotSchema.index({ dateStr: 1, startTime: 1, endTime: 1 });
deliverySlotSchema.index({ dateStr: 1, slotKey: 1 }, { unique: true, sparse: true });

const DeliverySlot = mongoose.model('DeliverySlot', deliverySlotSchema);

module.exports = DeliverySlot;
