/**
 * BentoBabu Media Controller
 * Manages Cloudinary image optimization/uploads, Cloudflare R2 video presigned URLs,
 * lifecycle cleanups, and storage quota monitoring.
 */

const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const { Media, Product, Category } = require('../models');
const { uploadBuffer, deleteAsset, getDeliveryUrl, getUsage: getCloudinaryUsage } = require('../config/cloudinary');
const { generatePresignedUploadUrl, verifyObject, deleteObject, getPublicUrl, getUsage: getR2Usage } = require('../config/r2');
const { optimizeImage } = require('../utils/imageOptimizer');
const { redisDelPattern } = require('../config/redis');

class MediaController {
  /**
   * POST /api/v1/admin/media/images/upload
   * ADMIN only: Upload a single image, optimize with Sharp (WebP, max 1800x1800), and store in Cloudinary.
   */
  static async uploadImage(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: 'Image file is required. Please provide a valid JPEG, PNG, or WebP image.',
        });
      }

      const { folder: rawFolder, productId, categoryId } = req.body;

      // Restrict upload folder to allowed directories
      const allowedFolders = ['bentobabu/products', 'bentobabu/categories', 'bentobabu/general'];
      const folder = allowedFolders.includes(rawFolder) ? rawFolder : 'bentobabu/products';

      if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid productId format.' });
      }
      if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ success: false, message: 'Invalid categoryId format.' });
      }

      // Optimize image buffer using Sharp
      const { buffer: optimizedBuffer, info } = await optimizeImage(req.file.buffer);

      // Upload optimized buffer to Cloudinary
      const uploadResult = await uploadBuffer(optimizedBuffer, { folder });

      // Calculate byte savings
      const originalSize = req.file.size || req.file.buffer.length;
      const optimizedSize = info.sizeBytes;
      const savingsPercent = originalSize > 0
        ? Number((((originalSize - optimizedSize) / originalSize) * 100).toFixed(1))
        : 0;

      // Save Media metadata document in MongoDB
      const media = await Media.create({
        provider: 'CLOUDINARY',
        mediaType: 'IMAGE',
        product: productId || null,
        category: categoryId || null,
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        format: uploadResult.format || 'webp',
        mimeType: 'image/webp',
        sizeBytes: uploadResult.bytes || optimizedSize,
        width: uploadResult.width || info.width,
        height: uploadResult.height || info.height,
        status: 'ACTIVE',
        createdBy: req.user?._id || null,
      });

      // Fixed delivery presets for consistent transformation caching
      const deliveryUrls = {
        thumbnail: getDeliveryUrl(uploadResult.public_id, 'thumbnail'),
        card: getDeliveryUrl(uploadResult.public_id, 'card'),
        detail: getDeliveryUrl(uploadResult.public_id, 'detail'),
        original: uploadResult.secure_url,
      };

      res.status(201).json({
        success: true,
        message: 'Image uploaded and optimized successfully',
        data: {
          media,
          originalSize,
          optimizedSize,
          savingsPercent,
          deliveryUrls,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/media/images/bulk
   * ADMIN only: Upload up to 4 images in parallel with Sharp optimization and Cloudinary upload.
   */
  static async uploadImagesBulk(req, res, next) {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one image file is required.',
        });
      }

      if (req.files.length > 4) {
        return res.status(400).json({
          success: false,
          message: 'A maximum of 4 images can be uploaded at a time.',
        });
      }

      const { folder: rawFolder, productId, categoryId } = req.body;
      const allowedFolders = ['bentobabu/products', 'bentobabu/categories', 'bentobabu/general'];
      const folder = allowedFolders.includes(rawFolder) ? rawFolder : 'bentobabu/products';

      const results = await Promise.all(
        req.files.map(async (file) => {
          const { buffer: optimizedBuffer, info } = await optimizeImage(file.buffer);
          const uploadResult = await uploadBuffer(optimizedBuffer, { folder });

          const originalSize = file.size || file.buffer.length;
          const optimizedSize = info.sizeBytes;
          const savingsPercent = originalSize > 0
            ? Number((((originalSize - optimizedSize) / originalSize) * 100).toFixed(1))
            : 0;

          const media = await Media.create({
            provider: 'CLOUDINARY',
            mediaType: 'IMAGE',
            product: productId || null,
            category: categoryId || null,
            publicId: uploadResult.public_id,
            secureUrl: uploadResult.secure_url,
            format: uploadResult.format || 'webp',
            mimeType: 'image/webp',
            sizeBytes: uploadResult.bytes || optimizedSize,
            width: uploadResult.width || info.width,
            height: uploadResult.height || info.height,
            status: 'ACTIVE',
            createdBy: req.user?._id || null,
          });

          return {
            media,
            originalSize,
            optimizedSize,
            savingsPercent,
            deliveryUrls: {
              thumbnail: getDeliveryUrl(uploadResult.public_id, 'thumbnail'),
              card: getDeliveryUrl(uploadResult.public_id, 'card'),
              detail: getDeliveryUrl(uploadResult.public_id, 'detail'),
              original: uploadResult.secure_url,
            },
          };
        })
      );

      res.status(201).json({
        success: true,
        message: `${results.length} image(s) uploaded and optimized successfully`,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/media/images/:id
   * ADMIN only: Safely delete an image asset from Cloudinary and mark/unlink in MongoDB.
   */
  static async deleteImage(req, res, next) {
    try {
      const { id } = req.params;

      let media = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        media = await Media.findById(id);
      }
      if (!media) {
        media = await Media.findOne({ publicId: id, provider: 'CLOUDINARY' });
      }

      if (!media) {
        return res.status(404).json({
          success: false,
          message: 'Image media asset not found.',
        });
      }

      if (media.provider !== 'CLOUDINARY') {
        return res.status(400).json({
          success: false,
          message: 'Specified media asset is not managed by Cloudinary.',
        });
      }

      // Delete from Cloudinary
      await deleteAsset(media.publicId);

      // Mark media as DELETED in MongoDB
      media.status = 'DELETED';
      await media.save();

      // If linked to a product, unlink
      if (media.product) {
        const product = await Product.findById(media.product);
        if (product) {
          product.imagesData = (product.imagesData || []).filter(
            (img) => img.publicId !== media.publicId
          );
          product.images = (product.images || []).filter(
            (url) => !url.includes(media.publicId) && url !== media.secureUrl
          );
          await product.save();
          await redisDelPattern('cache:products:*');
          await redisDelPattern('cache:admin:dashboard:*');
        }
      }

      // If linked to a category, unlink
      if (media.category) {
        const category = await Category.findById(media.category);
        if (category) {
          if (category.imageData?.publicId === media.publicId) {
            category.imageData = undefined;
            category.image = '';
            await category.save();
            await redisDelPattern('cache:categories:*');
          }
        }
      }

      res.status(200).json({
        success: true,
        message: 'Image deleted successfully from Cloudinary and media catalog.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/media/videos/initialize
   * ADMIN only: Request a short-lived presigned PUT URL for direct browser-to-R2 upload.
   */
  static async initializeVideoUpload(req, res, next) {
    try {
      const { productId, filename, contentType, sizeBytes, durationSeconds } = req.body;

      // Validate Content-Type
      const allowedContentTypes = ['video/mp4', 'video/webm'];
      if (!contentType || !allowedContentTypes.includes(contentType.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Only MP4 and WebM video formats are supported.',
        });
      }

      // Validate Size: Max 50 MB
      const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
      if (!sizeBytes || typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES) {
        return res.status(400).json({
          success: false,
          message: `Video size must be a positive number not exceeding 50 MB (${MAX_VIDEO_BYTES} bytes).`,
        });
      }

      // Validate Duration: Max 60 seconds
      if (
        durationSeconds !== undefined &&
        (typeof durationSeconds !== 'number' || durationSeconds <= 0 || durationSeconds > 60)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Video duration must not exceed 60 seconds.',
        });
      }

      // If productId is provided, verify it exists
      if (productId) {
        if (!mongoose.Types.ObjectId.isValid(productId)) {
          return res.status(400).json({ success: false, message: 'Invalid productId format.' });
        }
        const prod = await Product.findById(productId);
        if (!prod) {
          return res.status(404).json({ success: false, message: 'Product not found.' });
        }
      }

      // Generate unique object key: bentobabu/products/<productId|general>/<timestamp>-<uuid>.mp4
      const safeUUID = crypto.randomUUID().slice(0, 8);
      const ext = contentType === 'video/webm' ? '.webm' : '.mp4';
      const prodDir = productId ? String(productId) : 'general';
      const objectKey = `bentobabu/products/${prodDir}/${Date.now()}-${safeUUID}${ext}`;

      // Generate Presigned PUT URL valid for 10 minutes (600 seconds)
      const uploadUrl = await generatePresignedUploadUrl({
        objectKey,
        contentType,
        contentLength: sizeBytes,
        expiresIn: 600,
      });

      // Record pending upload in MongoDB
      const media = await Media.create({
        provider: 'R2',
        mediaType: 'VIDEO',
        product: productId || null,
        objectKey,
        secureUrl: getPublicUrl(objectKey),
        mimeType: contentType,
        sizeBytes,
        durationSeconds: durationSeconds || 0,
        status: 'PENDING',
        createdBy: req.user?._id || null,
      });

      res.status(200).json({
        success: true,
        message: 'Presigned video upload URL generated successfully.',
        data: {
          mediaId: media._id,
          uploadUrl,
          objectKey,
          publicUrl: media.secureUrl,
          expiresIn: 600,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/media/videos/confirm
   * ADMIN only: Server-side HeadObject verification of the uploaded R2 video.
   * If valid, updates media status to ACTIVE, links to Product, and cleans up replaced old video.
   */
  static async confirmVideoUpload(req, res, next) {
    try {
      const { mediaId, productId, posterUrl } = req.body;

      if (!mediaId || !mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: 'A valid mediaId is required to confirm video upload.',
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: 'Video media record not found.',
        });
      }

      if (media.provider !== 'R2' || media.mediaType !== 'VIDEO') {
        return res.status(400).json({
          success: false,
          message: 'Specified media is not an R2 video asset.',
        });
      }

      // Verify object existence and metadata in R2
      const verification = await verifyObject(media.objectKey);
      if (!verification.exists) {
        media.status = 'FAILED';
        await media.save();
        return res.status(400).json({
          success: false,
          message: 'Uploaded video file was not found in storage. Upload may have failed or timed out.',
        });
      }

      const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
      if (verification.sizeBytes > MAX_VIDEO_BYTES) {
        await deleteObject(media.objectKey);
        media.status = 'FAILED';
        await media.save();
        return res.status(400).json({
          success: false,
          message: `Uploaded video exceeds maximum allowed size of 50 MB (${verification.sizeBytes} bytes).`,
        });
      }

      // Activate media record
      media.status = 'ACTIVE';
      media.sizeBytes = verification.sizeBytes || media.sizeBytes;
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        media.product = productId;
      }
      await media.save();

      // If linked to a product, update product.video and clean up old video
      const targetProductId = productId || media.product;
      if (targetProductId) {
        const product = await Product.findById(targetProductId);
        if (product) {
          // If product already had a different video, delete old object from R2
          if (product.video && product.video.objectKey && product.video.objectKey !== media.objectKey) {
            try {
              await deleteObject(product.video.objectKey);
              await Media.updateOne(
                { objectKey: product.video.objectKey },
                { status: 'DELETED' }
              );
            } catch (cleanupErr) {
              console.error('[MediaController] Error cleaning up old product video:', cleanupErr);
            }
          }

          product.video = {
            secureUrl: media.secureUrl,
            objectKey: media.objectKey,
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
            durationSeconds: media.durationSeconds,
            posterUrl: typeof posterUrl === 'string' ? posterUrl.trim() : (product.video?.posterUrl || null),
            mediaId: media._id,
          };

          await product.save();
          await redisDelPattern('cache:products:*');
          await redisDelPattern('cache:admin:dashboard:*');
        }
      }

      res.status(200).json({
        success: true,
        message: 'Video upload verified and activated successfully.',
        data: media,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/media/videos/:id
   * ADMIN only: Delete a video from R2 and unlink from any associated product.
   */
  static async deleteVideo(req, res, next) {
    try {
      const { id } = req.params;

      let media = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        media = await Media.findById(id);
      }
      if (!media) {
        media = await Media.findOne({ objectKey: id, provider: 'R2' });
      }

      if (!media) {
        return res.status(404).json({
          success: false,
          message: 'Video media asset not found.',
        });
      }

      if (media.provider !== 'R2') {
        return res.status(400).json({
          success: false,
          message: 'Specified media asset is not managed by Cloudflare R2.',
        });
      }

      // Delete object from Cloudflare R2
      await deleteObject(media.objectKey);

      // Mark media as DELETED
      media.status = 'DELETED';
      await media.save();

      // Clear product video link
      const product = await Product.findOne({
        $or: [{ 'video.mediaId': media._id }, { 'video.objectKey': media.objectKey }, { _id: media.product }],
      });

      if (product && product.video) {
        product.video = undefined;
        await product.save();
        await redisDelPattern('cache:products:*');
        await redisDelPattern('cache:admin:dashboard:*');
      }

      res.status(200).json({
        success: true,
        message: 'Video deleted successfully from Cloudflare R2 and catalog.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/media
   * ADMIN only: Paginated list of media assets with filters.
   */
  static async listMedia(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.provider) filter.provider = req.query.provider.toUpperCase();
      if (req.query.mediaType) filter.mediaType = req.query.mediaType.toUpperCase();
      if (req.query.status) {
        filter.status = req.query.status.toUpperCase();
      } else {
        filter.status = { $ne: 'DELETED' };
      }
      if (req.query.productId && mongoose.Types.ObjectId.isValid(req.query.productId)) {
        filter.product = req.query.productId;
      }
      if (req.query.categoryId && mongoose.Types.ObjectId.isValid(req.query.categoryId)) {
        filter.category = req.query.categoryId;
      }

      const [items, total] = await Promise.all([
        Media.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('product', 'name slug')
          .populate('category', 'name slug')
          .populate('createdBy', 'name email'),
        Media.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: items,
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
   * GET /api/v1/admin/media/usage
   * ADMIN only: Get combined Cloudinary and Cloudflare R2 storage usage and tier warning status.
   */
  static async getMediaUsage(req, res, next) {
    try {
      const [cloudinaryUsage, r2Usage] = await Promise.all([
        getCloudinaryUsage().catch((err) => {
          console.warn('[MediaController] Could not fetch Cloudinary usage:', err.message);
          return { storage: { usage: 0 }, bandwidth: { usage: 0 }, transformations: { usage: 0 } };
        }),
        getR2Usage().catch((err) => {
          console.warn('[MediaController] Could not fetch R2 usage:', err.message);
          return { objectCount: 0, totalSizeBytes: 0, estimatedGB: 0, freeTierLimitGB: 10, usagePercent: 0 };
        }),
      ]);

      // Calculate warning thresholds
      const r2Percent = r2Usage.usagePercent || 0;
      let r2AlertLevel = 'NORMAL';
      if (r2Percent >= 95) r2AlertLevel = 'CRITICAL';
      else if (r2Percent >= 85) r2AlertLevel = 'HIGH';
      else if (r2Percent >= 70) r2AlertLevel = 'INFO';

      res.status(200).json({
        success: true,
        data: {
          cloudinary: cloudinaryUsage,
          r2: {
            ...r2Usage,
            alertLevel: r2AlertLevel,
          },
          thresholds: {
            info: 70,
            high: 85,
            critical: 95,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/media/cleanup-abandoned
   * ADMIN only: Clean up stale PENDING video uploads older than 2 hours.
   */
  static async cleanupAbandonedUploads(req, res, next) {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const abandoned = await Media.find({
        status: 'PENDING',
        createdAt: { $lt: cutoff },
      });

      let cleanedCount = 0;
      for (const item of abandoned) {
        if (item.provider === 'R2' && item.objectKey) {
          try {
            await deleteObject(item.objectKey);
          } catch (e) {
            // Ignore if object never uploaded
          }
        }
        item.status = 'FAILED';
        await item.save();
        cleanedCount++;
      }

      res.status(200).json({
        success: true,
        message: `Cleaned up ${cleanedCount} abandoned upload(s).`,
        data: { cleanedCount },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = MediaController;
