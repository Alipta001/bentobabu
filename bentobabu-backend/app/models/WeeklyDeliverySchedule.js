const mongoose = require('mongoose');

const weeklySlotTemplateSchema = new mongoose.Schema(
  {
    slotKey: {
      type: String,
      required: [true, 'Slot key is required'],
      trim: true,
      maxlength: [100, 'Slot key cannot exceed 100 characters'],
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

const weeklyDeliveryScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      required: [true, 'Day of week (0=Sunday to 6=Saturday) is required'],
      min: 0,
      max: 6,
      unique: true,
      index: true,
    },
    dayName: {
      type: String,
      required: [true, 'Day name is required'],
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    isDeliveryEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    slots: {
      type: [weeklySlotTemplateSchema],
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

const WeeklyDeliverySchedule = mongoose.model(
  'WeeklyDeliverySchedule',
  weeklyDeliveryScheduleSchema
);

module.exports = WeeklyDeliverySchedule;
