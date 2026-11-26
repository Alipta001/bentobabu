const mongoose = require('mongoose');

const dateSlotOverrideSchema = new mongoose.Schema(
  {
    slotKey: {
      type: String,
      required: [true, 'Slot key to override is required'],
      trim: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: [100, 'Label cannot exceed 100 characters'],
    },
    startTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:mm 24-hour format'],
    },
    endTime: {
      type: String,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:mm 24-hour format'],
    },
    capacity: {
      type: Number,
      min: [1, 'Capacity must be at least 1 order'],
    },
    isActive: {
      type: Boolean,
    },
  },
  { _id: true }
);

const customDateSlotSchema = new mongoose.Schema(
  {
    slotKey: {
      type: String,
      required: [true, 'Custom slot key is required'],
      trim: true,
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
    isActive: {
      type: Boolean,
      default: true,
    },
    orderCutoffMinutes: {
      type: Number,
      default: 0,
      min: [0, 'Cutoff minutes cannot be negative'],
      max: [1440, 'Cutoff minutes cannot exceed 1440'],
    },
  },
  { _id: true }
);

const dateDeliveryScheduleSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD' formatted in Asia/Kolkata
      required: [true, 'Date (YYYY-MM-DD) is required'],
      trim: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
      unique: true,
      index: true,
    },
    isClosed: {
      type: Boolean,
      default: false,
      index: true,
    },
    closureReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'Closure reason cannot exceed 200 characters'],
    },
    overrideMode: {
      type: String,
      enum: ['INHERIT', 'REPLACE', 'ADDITIVE'],
      default: 'INHERIT',
    },
    disabledSlotKeys: {
      type: [String],
      default: [],
    },
    slotOverrides: {
      type: [dateSlotOverrideSchema],
      default: [],
    },
    customSlots: {
      type: [customDateSlotSchema],
      default: [],
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

const DateDeliverySchedule = mongoose.model(
  'DateDeliverySchedule',
  dateDeliveryScheduleSchema
);

module.exports = DateDeliverySchedule;
