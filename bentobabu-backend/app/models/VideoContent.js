const mongoose = require('mongoose');

const videoContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Video title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: [true, 'URL slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    youtubeUrl: {
      type: String,
      required: [true, 'YouTube URL is required'],
      trim: true,
    },
    youtubeVideoId: {
      type: String,
      required: [true, 'YouTube video ID is required'],
      trim: true,
      index: true,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      index: true,
    },
    contentType: {
      type: String,
      required: [true, 'Content type is required'],
      trim: true,
      enum: {
        values: ['Recipes', 'Food Preparation', 'Nutrition Tips', 'Meal Ideas'],
        message: '{VALUE} is not a supported content type',
      },
      index: true,
    },
    preparationMethods: {
      type: [String],
      default: [],
    },
    dietaryTags: {
      type: [String],
      default: [],
    },
    mealType: {
      type: [String],
      default: [],
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for high-performance discovery and sorting
videoContentSchema.index({ status: 1, publishedAt: -1 });
videoContentSchema.index({ category: 1, status: 1, publishedAt: -1 });
videoContentSchema.index({ contentType: 1, status: 1, publishedAt: -1 });
videoContentSchema.index({ isFeatured: 1, status: 1, publishedAt: -1 });

// Full-text search index for keyword queries on title and description
videoContentSchema.index({ title: 'text', description: 'text' });

// Virtual for privacy-friendly embed URL
videoContentSchema.virtual('embedUrl').get(function () {
  if (!this.youtubeVideoId) return '';
  return `https://www.youtube-nocookie.com/embed/${this.youtubeVideoId}`;
});

module.exports = mongoose.model('VideoContent', videoContentSchema);
