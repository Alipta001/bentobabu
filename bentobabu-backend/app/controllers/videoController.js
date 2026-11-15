/**
 * BentoBabu Video Content Controller
 * Handles YouTube video content discovery for customers and comprehensive content lifecycle for admins.
 */

const mongoose = require('mongoose');
const { VideoContent, Product } = require('../models');
const { slugify } = require('../utils/slugify');
const { parseAndValidateYouTubeUrl, isValidCustomThumbnailUrl } = require('../utils/youtube');
const { redisGet, redisSet, redisDelPattern } = require('../config/redis');

class VideoController {
  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  /**
   * GET /api/v1/videos
   * Public: List published videos with search, multi-filters, sorting, and pagination.
   */
  static async getVideos(req, res, next) {
    try {
      const cacheKey = 'cache:videos:list:' + Buffer.from(JSON.stringify(req.query)).toString('base64');
      const cached = await redisGet(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
      const skip = (page - 1) * limit;

      // Base query: Only PUBLISHED videos are publicly visible
      const filter = { status: 'PUBLISHED' };

      // Keyword Search
      if (req.query.search && typeof req.query.search === 'string') {
        const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sanitized) {
          filter.$or = [
            { title: { $regex: sanitized, $options: 'i' } },
            { description: { $regex: sanitized, $options: 'i' } },
          ];
        }
      }

      // Category filter (case-insensitive)
      if (req.query.category && typeof req.query.category === 'string') {
        const cat = req.query.category.trim();
        if (cat.toLowerCase() !== 'all') {
          filter.category = { $regex: `^${cat}$`, $options: 'i' };
        }
      }

      // Content Type filter
      if (req.query.contentType && typeof req.query.contentType === 'string') {
        const ct = req.query.contentType.trim();
        if (ct.toLowerCase() !== 'all') {
          filter.contentType = { $regex: `^${ct}$`, $options: 'i' };
        }
      }

      // Preparation Methods filter (array or comma-separated)
      if (req.query.preparationMethod) {
        const methods = Array.isArray(req.query.preparationMethod)
          ? req.query.preparationMethod
          : req.query.preparationMethod.split(',').map((m) => m.trim()).filter(Boolean);
        if (methods.length > 0) {
          filter.preparationMethods = { $in: methods };
        }
      }

      // Dietary Tags filter
      if (req.query.dietaryTag) {
        const tags = Array.isArray(req.query.dietaryTag)
          ? req.query.dietaryTag
          : req.query.dietaryTag.split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          filter.dietaryTags = { $in: tags };
        }
      }

      // Meal Type filter
      if (req.query.mealType) {
        const meals = Array.isArray(req.query.mealType)
          ? req.query.mealType
          : req.query.mealType.split(',').map((m) => m.trim()).filter(Boolean);
        if (meals.length > 0) {
          filter.mealType = { $in: meals };
        }
      }

      // Featured only filter
      if (req.query.featured === 'true' || req.query.isFeatured === 'true') {
        filter.isFeatured = true;
      }

      // Sorting
      let sort = { publishedAt: -1, createdAt: -1 };
      const sortBy = req.query.sortBy;
      if (sortBy === 'oldest') {
        sort = { publishedAt: 1, createdAt: 1 };
      } else if (sortBy === 'featured') {
        sort = { isFeatured: -1, publishedAt: -1 };
      } else if (sortBy === 'title') {
        sort = { title: 1 };
      }

      const [videos, total] = await Promise.all([
        VideoContent.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('relatedProduct', 'name slug price images isAvailable')
          .select('-__v'),
        VideoContent.countDocuments(filter),
      ]);

      const responsePayload = {
        success: true,
        data: videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      };

      await redisSet(cacheKey, responsePayload, 300); // 5 minutes TTL
      res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/videos/featured
   * Public: Retrieve published featured videos
   */
  static async getFeaturedVideos(req, res, next) {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
      const cacheKey = `cache:videos:featured:${limit}`;
      const cached = await redisGet(cacheKey);
      if (cached) {
        return res.status(200).json(cached);
      }

      const videos = await VideoContent.find({
        status: 'PUBLISHED',
        isFeatured: true,
      })
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(limit)
        .populate('relatedProduct', 'name slug price images isAvailable')
        .select('-__v');

      const responsePayload = {
        success: true,
        data: videos,
      };

      await redisSet(cacheKey, responsePayload, 300);
      res.status(200).json(responsePayload);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/videos/:slug
   * Public: Retrieve single published video by slug and relevant related videos.
   */
  static async getVideoBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({ success: false, message: 'Video slug is required' });
      }

      const video = await VideoContent.findOne({
        slug: slug.toLowerCase().trim(),
        status: 'PUBLISHED',
      })
        .populate('relatedProduct', 'name slug price compareAtPrice images isAvailable dietary portionSize nutritionalInfo')
        .populate('createdBy', 'name email');

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video content not found or is currently unpublished',
        });
      }

      // Find up to 4 related published videos (same category, contentType, or dietary tags)
      const relatedQuery = {
        _id: { $ne: video._id },
        status: 'PUBLISHED',
        $or: [
          { category: video.category },
          { contentType: video.contentType },
          ...(video.dietaryTags?.length ? [{ dietaryTags: { $in: video.dietaryTags } }] : []),
        ],
      };

      const relatedVideos = await VideoContent.find(relatedQuery)
        .sort({ publishedAt: -1 })
        .limit(4)
        .select('title slug thumbnailUrl category contentType isFeatured publishedAt');

      res.status(200).json({
        success: true,
        data: {
          video,
          relatedVideos,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  /**
   * POST /api/v1/admin/videos
   * ADMIN only: Create new video content
   */
  static async createVideo(req, res, next) {
    try {
      const {
        title,
        slug: rawSlug,
        description,
        youtubeUrl,
        thumbnailUrl: customThumb,
        category,
        contentType,
        preparationMethods,
        dietaryTags,
        mealType,
        relatedProduct,
        isFeatured,
        status,
      } = req.body;

      // 1. Validate Title
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Video title is required and must be a non-empty string.',
        });
      }

      // 2. Validate YouTube URL
      const ytResult = parseAndValidateYouTubeUrl(youtubeUrl);
      if (!ytResult.isValid) {
        return res.status(400).json({
          success: false,
          message: ytResult.error || 'Invalid YouTube URL provided.',
        });
      }

      // 3. Validate Category & Content Type
      if (!category || typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Category is required.',
        });
      }

      const validContentTypes = ['Recipes', 'Food Preparation', 'Nutrition Tips', 'Meal Ideas'];
      if (!contentType || !validContentTypes.includes(contentType.trim())) {
        return res.status(400).json({
          success: false,
          message: `Content type must be one of: ${validContentTypes.join(', ')}.`,
        });
      }

      // 4. Generate URL-friendly slug and check uniqueness
      let finalSlug = slugify(rawSlug || title);
      if (!finalSlug) {
        return res.status(400).json({ success: false, message: 'Valid slug could not be generated from title.' });
      }

      const existingSlug = await VideoContent.findOne({ slug: finalSlug });
      if (existingSlug) {
        finalSlug = `${finalSlug}-${Date.now().toString(36).slice(-4)}`;
      }

      // 5. Determine Thumbnail URL
      let finalThumbnail = ytResult.defaultThumbnailUrl;
      if (customThumb && typeof customThumb === 'string' && customThumb.trim()) {
        if (isValidCustomThumbnailUrl(customThumb.trim())) {
          finalThumbnail = customThumb.trim();
        }
      }

      // 6. Handle Related Product if supplied
      let prodId = null;
      if (relatedProduct) {
        if (!mongoose.Types.ObjectId.isValid(relatedProduct)) {
          return res.status(400).json({ success: false, message: 'Invalid relatedProduct identifier.' });
        }
        const prodExists = await Product.findById(relatedProduct);
        if (prodExists) {
          prodId = prodExists._id;
        }
      }

      // 7. Status & Publication Timestamp
      const videoStatus = status === 'PUBLISHED' ? 'PUBLISHED' : (status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT');
      const publishedAt = videoStatus === 'PUBLISHED' ? (req.body.publishedAt || new Date()) : null;

      const video = await VideoContent.create({
        title: title.trim(),
        slug: finalSlug,
        description: typeof description === 'string' ? description.trim() : '',
        youtubeUrl: ytResult.cleanUrl,
        youtubeVideoId: ytResult.videoId,
        thumbnailUrl: finalThumbnail,
        category: category.trim(),
        contentType: contentType.trim(),
        preparationMethods: Array.isArray(preparationMethods) ? preparationMethods : [],
        dietaryTags: Array.isArray(dietaryTags) ? dietaryTags : [],
        mealType: Array.isArray(mealType) ? mealType : [],
        relatedProduct: prodId,
        isFeatured: Boolean(isFeatured),
        status: videoStatus,
        publishedAt,
        createdBy: req.user?._id || null,
      });

      await redisDelPattern('cache:videos:*');

      res.status(201).json({
        success: true,
        message: 'Video content created successfully',
        data: video,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'A video with this URL slug already exists. Please choose a different title or slug.',
        });
      }
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/videos/:id
   * ADMIN only: Update existing video content
   */
  static async updateVideo(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid video ID format' });
      }

      const video = await VideoContent.findById(id);
      if (!video) {
        return res.status(404).json({ success: false, message: 'Video content not found' });
      }

      const {
        title,
        slug: rawSlug,
        description,
        youtubeUrl,
        thumbnailUrl: customThumb,
        category,
        contentType,
        preparationMethods,
        dietaryTags,
        mealType,
        relatedProduct,
        isFeatured,
        status,
      } = req.body;

      if (title !== undefined) {
        if (typeof title !== 'string' || !title.trim()) {
          return res.status(400).json({ success: false, message: 'Title must be a non-empty string' });
        }
        video.title = title.trim();
      }

      if (rawSlug !== undefined) {
        const newSlug = slugify(rawSlug);
        if (!newSlug) {
          return res.status(400).json({ success: false, message: 'Slug cannot be empty' });
        }
        const duplicate = await VideoContent.findOne({ slug: newSlug, _id: { $ne: id } });
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'A video with this slug already exists' });
        }
        video.slug = newSlug;
      }

      if (youtubeUrl !== undefined) {
        const ytResult = parseAndValidateYouTubeUrl(youtubeUrl);
        if (!ytResult.isValid) {
          return res.status(400).json({ success: false, message: ytResult.error });
        }
        video.youtubeUrl = ytResult.cleanUrl;
        video.youtubeVideoId = ytResult.videoId;
        // If thumbnail was previously default, update to new default
        if (!video.thumbnailUrl || video.thumbnailUrl.includes('i.ytimg.com')) {
          video.thumbnailUrl = ytResult.defaultThumbnailUrl;
        }
      }

      if (customThumb !== undefined) {
        if (customThumb && isValidCustomThumbnailUrl(customThumb.trim())) {
          video.thumbnailUrl = customThumb.trim();
        } else if (!customThumb && video.youtubeVideoId) {
          video.thumbnailUrl = `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;
        }
      }

      if (description !== undefined) {
        video.description = typeof description === 'string' ? description.trim() : '';
      }

      if (category !== undefined) {
        if (typeof category !== 'string' || !category.trim()) {
          return res.status(400).json({ success: false, message: 'Category must be a non-empty string' });
        }
        video.category = category.trim();
      }

      if (contentType !== undefined) {
        const validContentTypes = ['Recipes', 'Food Preparation', 'Nutrition Tips', 'Meal Ideas'];
        if (!validContentTypes.includes(contentType.trim())) {
          return res.status(400).json({
            success: false,
            message: `Content type must be one of: ${validContentTypes.join(', ')}.`,
          });
        }
        video.contentType = contentType.trim();
      }

      if (preparationMethods !== undefined && Array.isArray(preparationMethods)) {
        video.preparationMethods = preparationMethods;
      }

      if (dietaryTags !== undefined && Array.isArray(dietaryTags)) {
        video.dietaryTags = dietaryTags;
      }

      if (mealType !== undefined && Array.isArray(mealType)) {
        video.mealType = mealType;
      }

      if (relatedProduct !== undefined) {
        if (!relatedProduct) {
          video.relatedProduct = null;
        } else if (mongoose.Types.ObjectId.isValid(relatedProduct)) {
          video.relatedProduct = relatedProduct;
        }
      }

      if (isFeatured !== undefined) {
        video.isFeatured = Boolean(isFeatured);
      }

      if (status !== undefined) {
        const validStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
        if (validStatuses.includes(status)) {
          if (status === 'PUBLISHED' && video.status !== 'PUBLISHED' && !video.publishedAt) {
            video.publishedAt = new Date();
          }
          video.status = status;
        }
      }

      await video.save();
      await redisDelPattern('cache:videos:*');

      res.status(200).json({
        success: true,
        message: 'Video content updated successfully',
        data: video,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'A video with this URL slug already exists.',
        });
      }
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/videos/:id
   * ADMIN only: Permanently delete a video record
   */
  static async deleteVideo(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid video ID format' });
      }

      const video = await VideoContent.findByIdAndDelete(id);
      if (!video) {
        return res.status(404).json({ success: false, message: 'Video content not found' });
      }

      await redisDelPattern('cache:videos:*');

      res.status(200).json({
        success: true,
        message: 'Video content deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/videos
   * ADMIN only: Paginated list with all statuses and admin search
   */
  static async getAdminVideos(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;

      const filter = {};

      if (req.query.status && req.query.status !== 'all') {
        filter.status = req.query.status.toUpperCase();
      }

      if (req.query.category && req.query.category !== 'all') {
        filter.category = req.query.category;
      }

      if (req.query.contentType && req.query.contentType !== 'all') {
        filter.contentType = req.query.contentType;
      }

      if (req.query.search && typeof req.query.search === 'string') {
        const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sanitized) {
          filter.$or = [
            { title: { $regex: sanitized, $options: 'i' } },
            { description: { $regex: sanitized, $options: 'i' } },
          ];
        }
      }

      const [videos, total] = await Promise.all([
        VideoContent.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('relatedProduct', 'name slug price images')
          .populate('createdBy', 'name email'),
        VideoContent.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/videos/:id
   * ADMIN only: Single video details for editing
   */
  static async getAdminVideoById(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid video ID format' });
      }

      const video = await VideoContent.findById(id).populate('relatedProduct', 'name slug price images');
      if (!video) {
        return res.status(404).json({ success: false, message: 'Video content not found' });
      }

      res.status(200).json({
        success: true,
        data: video,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/videos/:id/status
   * ADMIN only: Fast status toggle (DRAFT / PUBLISHED / ARCHIVED)
   */
  static async updateVideoStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid video ID format' });
      }

      const validStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const video = await VideoContent.findById(id);
      if (!video) {
        return res.status(404).json({ success: false, message: 'Video content not found' });
      }

      video.status = status;
      if (status === 'PUBLISHED' && !video.publishedAt) {
        video.publishedAt = new Date();
      }

      await video.save();
      await redisDelPattern('cache:videos:*');

      res.status(200).json({
        success: true,
        message: `Video status updated to ${status}`,
        data: video,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = VideoController;
