const mongoose = require('mongoose');
const { Review, Product, User, Order } = require('../models');
const { sanitizeText } = require('../utils/sanitizer');
const { redisDelPattern } = require('../config/redis');

class AdminReviewController {
  /**
   * GET /api/v1/admin/reviews/stats
   * Admin: Summary metrics for reviews, average rating, status breakdown, and rating distribution
   */
  static async getStats(req, res, next) {
    try {
      const [totalCount, approvedCount, hiddenCount, rejectedCount, pendingCount, ratingAggregation] =
        await Promise.all([
          Review.countDocuments(),
          Review.countDocuments({ status: 'APPROVED' }),
          Review.countDocuments({ status: 'HIDDEN' }),
          Review.countDocuments({ status: 'REJECTED' }),
          Review.countDocuments({ status: 'PENDING' }),
          Review.aggregate([
            { $match: { status: 'APPROVED' } },
            {
              $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
              },
            },
          ]),
        ]);

      const agg = ratingAggregation[0] || {
        averageRating: 0,
        star5: 0,
        star4: 0,
        star3: 0,
        star2: 0,
        star1: 0,
      };

      return res.status(200).json({
        success: true,
        data: {
          totalCount,
          approvedCount,
          hiddenCount,
          rejectedCount,
          pendingCount,
          averageRating: Number((agg.averageRating || 0).toFixed(1)),
          ratingBreakdown: {
            5: agg.star5,
            4: agg.star4,
            3: agg.star3,
            2: agg.star2,
            1: agg.star1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/reviews
   * Admin: List all customer reviews with search, filters and pagination
   */
  static async getAllReviews(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
      const skip = (page - 1) * limit;

      const { status, rating, search, productId } = req.query;
      const query = {};

      if (status && status !== 'ALL') {
        query.status = status.trim().toUpperCase();
      }

      if (rating && rating !== 'ALL') {
        const numRating = parseInt(rating, 10);
        if (numRating >= 1 && numRating <= 5) {
          query.rating = numRating;
        }
      }

      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        query.product = new mongoose.Types.ObjectId(productId);
      }

      // Keyword Search
      if (search && typeof search === 'string' && search.trim()) {
        const cleanSearch = search.trim();
        const searchRegex = new RegExp(cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // Look up matching users or products first
        const [matchingUsers, matchingProducts] = await Promise.all([
          User.find({
            $or: [{ name: searchRegex }, { email: searchRegex }],
          })
            .select('_id')
            .lean(),
          Product.find({
            name: searchRegex,
          })
            .select('_id')
            .lean(),
        ]);

        const userIds = matchingUsers.map((u) => u._id);
        const productIds = matchingProducts.map((p) => p._id);

        query.$or = [
          { comment: searchRegex },
          { title: searchRegex },
          { user: { $in: userIds } },
          { product: { $in: productIds } },
        ];
      }

      const [reviews, total] = await Promise.all([
        Review.find(query)
          .populate('user', 'name email phone')
          .populate('product', 'name slug price images')
          .populate('order', 'orderNumber grandTotal createdAt')
          .populate('moderatedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Review.countDocuments(query),
      ]);

      const formattedReviews = reviews.map((r) => ({
        id: r._id.toString(),
        rating: r.rating,
        title: r.title || '',
        comment: r.comment,
        images: r.images || [],
        isVerifiedPurchase: Boolean(r.isVerifiedPurchase),
        status: r.status,
        isApproved: Boolean(r.isApproved),
        customer: r.user
          ? {
              id: r.user._id.toString(),
              name: r.user.name,
              email: r.user.email,
              phone: r.user.phone,
            }
          : null,
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
              grandTotal: r.order.grandTotal,
              orderDate: r.order.createdAt,
            }
          : null,
        moderation: {
          moderatedBy: r.moderatedBy
            ? {
                id: r.moderatedBy._id.toString(),
                name: r.moderatedBy.name,
                email: r.moderatedBy.email,
              }
            : null,
          moderatedAt: r.moderatedAt,
          moderationNote: r.moderationNote || '',
        },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return res.status(200).json({
        success: true,
        count: formattedReviews.length,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        data: formattedReviews,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/reviews/:id/status
   * Admin: Approve, hide, or reject a review with moderation audit tracking
   */
  static async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, moderationNote } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID.',
        });
      }

      const validStatuses = ['APPROVED', 'REJECTED', 'HIDDEN', 'PENDING'];
      const targetStatus = (status || '').trim().toUpperCase();

      if (!validStatuses.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid review status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const review = await Review.findById(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found.',
        });
      }

      review.status = targetStatus;
      review.isApproved = targetStatus === 'APPROVED';
      review.moderatedBy = req.user.id;
      review.moderatedAt = new Date();
      if (moderationNote && typeof moderationNote === 'string') {
        review.moderationNote = sanitizeText(moderationNote.trim().slice(0, 500));
      }

      await review.save();

      // Recalculate product rating summary so changes immediately affect product rating
      const summary = await Review.calculateProductRatingSummary(review.product);
      await redisDelPattern('cache:products:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: `Review has been marked as ${targetStatus}.`,
        data: {
          id: review._id.toString(),
          status: review.status,
          isApproved: review.isApproved,
          moderatedAt: review.moderatedAt,
          moderationNote: review.moderationNote,
          productSummary: summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/reviews/:id
   * Admin: Permanently delete a review and update product aggregates
   */
  static async deleteReview(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID.',
        });
      }

      const review = await Review.findByIdAndDelete(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found.',
        });
      }

      // Recalculate product summary
      const summary = await Review.calculateProductRatingSummary(review.product);
      await redisDelPattern('cache:products:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Review deleted successfully.',
        data: {
          deletedId: id,
          productSummary: summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminReviewController;
