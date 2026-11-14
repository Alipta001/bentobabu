const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    adjustmentType: {
      type: String,
      enum: {
        values: ['ADD', 'REMOVE', 'SET'],
        message: '{VALUE} is not a valid adjustment type',
      },
      required: [true, 'Adjustment type is required'],
      uppercase: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    previousStock: {
      type: Number,
      required: [true, 'Previous stock is required'],
      min: [0, 'Previous stock cannot be negative'],
    },
    newStock: {
      type: Number,
      required: [true, 'New stock is required'],
      min: [0, 'New stock cannot be negative'],
    },
    reason: {
      type: String,
      required: [true, 'Adjustment reason is required'],
      trim: true,
      maxlength: [300, 'Reason cannot exceed 300 characters'],
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin reference is required'],
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

inventoryLogSchema.index({ product: 1, createdAt: -1 });

const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);

module.exports = InventoryLog;

