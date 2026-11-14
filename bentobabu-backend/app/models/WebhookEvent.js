const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: [true, 'Event ID is required'],
      unique: true,
      index: true,
    },
    event: {
      type: String,
      required: [true, 'Event name is required'],
    },
    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
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

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

module.exports = WebhookEvent;

