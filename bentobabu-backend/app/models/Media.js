/**
 * Media Model
 * Tracks Cloudinary images, Cloudflare R2 videos, and their product/category associations.
 */

const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['CLOUDINARY', 'R2'],
      required: [true, 'Media provider is required'],
      index: true,
    },
    mediaType: {
      type: String,
      enum: ['IMAGE', 'VIDEO'],
      required: [true, 'Media type is required'],
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    publicId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    objectKey: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    secureUrl: {
      type: String,
      required: [true, 'Secure URL is required'],
      trim: true,
    },
    format: {
      type: String,
      default: '',
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    sizeBytes: {
      type: Number,
      default: 0,
      min: [0, 'Size cannot be negative'],
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'UPLOADED', 'ACTIVE', 'FAILED', 'DELETED'],
      default: 'PENDING',
      index: true,
    },
    createdBy: {
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

mediaSchema.index({ provider: 1, status: 1 });
mediaSchema.index({ product: 1, mediaType: 1, status: 1 });
mediaSchema.index({ category: 1, status: 1 });
mediaSchema.index({ createdAt: 1, status: 1 });

const Media = mongoose.model('Media', mediaSchema);

module.exports = Media;
