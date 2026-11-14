const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Setting key is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Setting value is required'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
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

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

module.exports = SystemSetting;

