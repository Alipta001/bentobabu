const mongoose = require('mongoose');
const { Review, Product, Order } = require('../models');
const { sanitizeText } = require('../utils/sanitizer');
const { redisDelPattern } = require('../config/redis');
const { uploadDocumentToCloudinary } = require('../utils/documentUploader');

/**
 * Formats full name into a friendly, privacy-safe display name (e.g. "Rohan S.")
 */
function formatDisplayName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Bento Customer';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Bento Customer';
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

class ReviewController {
  /**
   * GET /api/v1/reviews/product/:productId
   * Public: List approved reviews for a product with rating summary & distribution
   */
  static async getProductReviews(req, res, next) {
    try {
      const { productId } = req.params;

      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Product identifier is required.',
        });
      }

      // Resolve product by ID or Slug
      let targetProductId = productId.trim();
      if (!mongoose.Types.ObjectId.isValid(targetProductId)) {
        const productDoc = await Product.findOne({ slug: targetProductId.toLowerCase() }).select('_id');
        if (!productDoc) {
          return res.status(404).json({
            success: false,
            message: 'Product not found.',
          });
        }
        targetProductId = productDoc._id.toString();
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const query = {
        product: new mongoose.Types.ObjectId(targetProductId),
        status: 'APPROVED',
      };

      // Optional rating filter (1 to 5)
      const ratingFilter = parseInt(req.query.rating, 10);
      if (ratingFilter >= 1 && ratingFilter <= 5) {
        query.rating = ratingFilter;
      }

      // Sorting
      let sort = { createdAt: -1 };
      const sortParam = (req.query.sort || 'newest').toLowerCase();
      if (sortParam === 'highest') {
        sort = { rating: -1, createdAt: -1 };
      } else if (sortParam === 'lowest') {
        sort = { rating: 1, createdAt: -1 };
      }

      const [reviews, totalCount, summary] = await Promise.all([
        Review.find(query)
          .populate('user', 'name')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Review.countDocuments(query),
        Review.calculateProductRatingSummary(targetProductId),
      ]);

      const formattedReviews = reviews.map((r) => ({
        id: r._id.toString(),
        authorName: formatDisplayName(r.user?.name),
        rating: r.rating,
        title: r.title || '',
        comment: r.comment,
        images: r.images || [],
        isVerifiedPurchase: Boolean(r.isVerifiedPurchase),
        createdAt: r.createdAt,
      }));

      return res.status(200).json({
        success: true,
        data: {
          reviews: formattedReviews,
          summary: summary || {
            productId: targetProductId,
            totalReviews: 0,
            averageRating: 0,
            distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          },
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit) || 1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reviews/eligibility/:productId
   * Authenticated Customer: Check if customer is eligible to review product
   */
  static async checkEligibility(req, res, next) {
    try {
      const { productId } = req.params;

      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Product identifier is required.',
        });
      }

      let targetProductId = productId.trim();
      let productDoc = null;
      if (mongoose.Types.ObjectId.isValid(targetProductId)) {
        productDoc = await Product.findById(targetProductId).select('_id name slug images');
      } else {
        productDoc = await Product.findOne({ slug: targetProductId.toLowerCase() }).select('_id name slug images');
      }

      if (!productDoc) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }
      targetProductId = productDoc._id.toString();

      // Find all delivered orders belonging to this user that contain this product
      const deliveredOrders = await Order.find({
        user: req.user.id,
        orderStatus: 'DELIVERED',
        'items.product': productDoc._id,
      })
        .select('orderNumber createdAt items grandTotal')
        .sort({ createdAt: -1 })
        .lean();

      // Find all existing reviews by this user for this product
      const existingReviews = await Review.find({
        user: req.user.id,
        product: productDoc._id,
      })
        .sort({ createdAt: -1 })
        .lean();

      const reviewedOrderIds = new Set(
        existingReviews.map((r) => r.order.toString())
      );

      // Orders for which this product has not been reviewed yet
      const unreviewedOrders = deliveredOrders.filter(
        (o) => !reviewedOrderIds.has(o._id.toString())
      );

      const canReview = unreviewedOrders.length > 0;
      const hasPurchased = deliveredOrders.length > 0;

      return res.status(200).json({
        success: true,
        data: {
          productId: targetProductId,
          productName: productDoc.name,
          productSlug: productDoc.slug,
          isEligible: hasPurchased,
          canReview,
          eligibleOrders: unreviewedOrders.map((o) => ({
            id: o._id.toString(),
            orderNumber: o.orderNumber,
            deliveredAt: o.createdAt,
          })),
          existingReviews: existingReviews.map((r) => ({
            id: r._id.toString(),
            orderId: r.order.toString(),
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            images: r.images || [],
            createdAt: r.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/reviews
   * Authenticated Customer: Submit a review for a delivered product & order
   */
  static async createReview(req, res, next) {
    try {
      const { productId, orderId, rating, title, comment, images } = req.body || {};

      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required.',
        });
      }

      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required to verify your purchase.',
        });
      }

      const numRating = parseInt(rating, 10);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be an integer between 1 and 5 stars.',
        });
      }

      if (!comment || typeof comment !== 'string' || comment.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Review comment is required and must be at least 5 characters.',
        });
      }

      if (comment.trim().length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Review comment cannot exceed 1000 characters.',
        });
      }

      // 1. Resolve product
      let targetProductId = productId.trim();
      let productDoc = null;
      if (mongoose.Types.ObjectId.isValid(targetProductId)) {
        productDoc = await Product.findById(targetProductId);
      } else {
        productDoc = await Product.findOne({ slug: targetProductId.toLowerCase() });
      }

      if (!productDoc) {
        return res.status(404).json({
          success: false,
          message: 'Product not found.',
        });
      }
      targetProductId = productDoc._id.toString();

      // 2. Validate Order and Verified Purchase Eligibility
      if (!mongoose.Types.ObjectId.isValid(orderId.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order reference.',
        });
      }

      const order = await Order.findById(orderId.trim());
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found.',
        });
      }

      // Security: Customer must own the order
      if (order.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only review products from your own orders.',
        });
      }

      // Order must be DELIVERED
      if (order.orderStatus !== 'DELIVERED') {
        return res.status(400).json({
          success: false,
          message: `Only delivered meals can be reviewed. Your order is currently ${order.orderStatus.toLowerCase().replace(/_/g, ' ')}.`,
        });
      }

      // Product must be part of that order
      const productInOrder = (order.items || []).some((item) => {
        const itemProdId = item.product?._id ? item.product._id.toString() : item.product?.toString();
        return itemProdId === targetProductId;
      });

      if (!productInOrder) {
        return res.status(400).json({
          success: false,
          message: `This product was not part of order #${order.orderNumber}.`,
        });
      }

      // 3. Prevent duplicate reviews for the same product and order
      const existingReview = await Review.findOne({
        user: req.user.id,
        product: productDoc._id,
        order: order._id,
      });

      if (existingReview) {
        return res.status(409).json({
          success: false,
          message: `You have already reviewed this product for order #${order.orderNumber}. You can edit your existing review instead.`,
          data: {
            existingReviewId: existingReview._id.toString(),
          },
        });
      }

      // 4. Sanitize and prepare images
      let cleanImages = [];
      if (Array.isArray(images)) {
        cleanImages = images
          .slice(0, 3)
          .filter((img) => img && typeof img.url === 'string' && img.url.trim())
          .map((img) => ({
            url: img.url.trim(),
            publicId: typeof img.publicId === 'string' ? img.publicId.trim() : null,
          }));
      }

      const sanitizedTitle = title && typeof title === 'string' ? sanitizeText(title.trim().slice(0, 100)) : '';
      const sanitizedComment = sanitizeText(comment.trim());

      // 5. Create Review
      const review = await Review.create({
        user: req.user.id,
        product: productDoc._id,
        order: order._id,
        rating: numRating,
        title: sanitizedTitle,
        comment: sanitizedComment,
        images: cleanImages,
        isVerifiedPurchase: true,
        status: 'APPROVED',
      });

      // 6. Recalculate product ratings summary & invalidate redis caches
      const ratingSummary = await Review.calculateProductRatingSummary(productDoc._id);
      await redisDelPattern('cache:products:*').catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'Thank you! Your verified review has been published.',
        data: {
          id: review._id.toString(),
          rating: review.rating,
          title: review.title,
          comment: review.comment,
          images: review.images,
          isVerifiedPurchase: review.isVerifiedPurchase,
          createdAt: review.createdAt,
          summary: ratingSummary,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'You have already submitted a review for this purchase.',
        });
      }
      next(error);
    }
  }

  /**
   * PUT /api/v1/reviews/:id
   * Authenticated Customer: Update an existing review
   */
  static async updateReview(req, res, next) {
    try {
      const { id } = req.params;
      const { rating, title, comment, images } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID.',
        });
      }

      const review = await Review.findById(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found.',
        });
      }

      if (review.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only edit your own reviews.',
        });
      }

      if (rating !== undefined) {
        const numRating = parseInt(rating, 10);
        if (isNaN(numRating) || numRating < 1 || numRating > 5) {
          return res.status(400).json({
            success: false,
            message: 'Rating must be an integer between 1 and 5.',
          });
        }
        review.rating = numRating;
      }

      if (title !== undefined) {
        review.title = typeof title === 'string' ? sanitizeText(title.trim().slice(0, 100)) : '';
      }

      if (comment !== undefined) {
        if (typeof comment !== 'string' || comment.trim().length < 5) {
          return res.status(400).json({
            success: false,
            message: 'Review comment must be at least 5 characters.',
          });
        }
        review.comment = sanitizeText(comment.trim().slice(0, 1000));
      }

      if (Array.isArray(images)) {
        review.images = images
          .slice(0, 3)
          .filter((img) => img && typeof img.url === 'string' && img.url.trim())
          .map((img) => ({
            url: img.url.trim(),
            publicId: typeof img.publicId === 'string' ? img.publicId.trim() : null,
          }));
      }

      await review.save();

      // Recalculate rating summary & invalidate redis caches
      const ratingSummary = await Review.calculateProductRatingSummary(review.product);
      await redisDelPattern('cache:products:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Your review has been updated.',
        data: {
          id: review._id.toString(),
          rating: review.rating,
          title: review.title,
          comment: review.comment,
          images: review.images,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          summary: ratingSummary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reviews/my
   * Authenticated Customer: List all reviews written by current user
   */
  static async getMyReviews(req, res, next) {
    try {
      const reviews = await Review.find({ user: req.user.id })
        .populate('product', 'name slug images price')
        .populate('order', 'orderNumber createdAt')
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        count: reviews.length,
        data: reviews.map((r) => ({
          id: r._id.toString(),
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          images: r.images || [],
          status: r.status,
          product: r.product
            ? {
                id: r.product._id.toString(),
                name: r.product.name,
                slug: r.product.slug,
                image: r.product.images?.[0] || '',
                price: r.product.price,
              }
            : null,
          order: r.order
            ? {
                id: r.order._id.toString(),
                orderNumber: r.order.orderNumber,
                orderDate: r.order.createdAt,
              }
            : null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/reviews/upload-image
   * Authenticated Customer: Upload photo for review attachment
   */
  static async uploadReviewImage(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an image file to upload.',
        });
      }

      const uploadResult = await uploadDocumentToCloudinary(req.file, 'review-photo');

      return res.status(200).json({
        success: true,
        message: 'Review photo uploaded successfully.',
        data: {
          url: uploadResult.secureUrl,
          publicId: uploadResult.publicId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReviewController;
