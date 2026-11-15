const mongoose = require('mongoose');
const { Category, Media } = require('../models');
const { slugify } = require('../utils/slugify');
const { redisGet, redisSet, redisDel, redisDelPattern } = require('../config/redis');
const { deleteAsset } = require('../config/cloudinary');

class CategoryController {
  /**
   * GET /api/v1/categories
   * Public: List all active categories sorted by displayOrder (cached)
   */
  static async getCategories(req, res, next) {
    try {
      const CACHE_KEY = 'cache:categories:all';
      const cached = await redisGet(CACHE_KEY);
      if (cached) {
        return res.status(200).json({
          success: true,
          data: cached,
        });
      }

      const categories = await Category.find({ isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .select('name slug description image displayOrder isActive');

      await redisSet(CACHE_KEY, categories, 3600); // 1 hour TTL

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/categories/:slug
   * Public: Retrieve single active category by slug
   */
  static async getCategoryBySlug(req, res, next) {
    try {
      const { slug } = req.params;

      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Category slug is required',
        });
      }

      const category = await Category.findOne({
        slug: slug.toLowerCase().trim(),
        isActive: true,
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found or unavailable',
        });
      }

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/categories
   * ADMIN only: Create new category
   */
  static async createCategory(req, res, next) {
    try {
      const { name, slug, description, image, imageData, displayOrder, isActive } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Category name is required and must be a non-empty string',
        });
      }

      const generatedSlug = slugify(slug || name);
      if (!generatedSlug) {
        return res.status(400).json({
          success: false,
          message: 'A valid URL-friendly slug is required',
        });
      }

      const existingCategory = await Category.findOne({ slug: generatedSlug });
      if (existingCategory) {
        return res.status(409).json({
          success: false,
          message: 'A category with this slug already exists',
        });
      }

      const category = await Category.create({
        name: name.trim(),
        slug: generatedSlug,
        description: typeof description === 'string' ? description.trim() : '',
        image: (imageData && imageData.secureUrl) ? imageData.secureUrl : (typeof image === 'string' ? image.trim() : ''),
        imageData: imageData && typeof imageData === 'object' ? imageData : undefined,
        displayOrder: Number.isInteger(Number(displayOrder)) ? Number(displayOrder) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });

      if (imageData && imageData.publicId) {
        await Media.updateOne({ publicId: imageData.publicId }, { category: category._id });
      }

      await redisDel('cache:categories:all');
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/categories/:id
   * ADMIN only: Update category fields
   */
  static async updateCategory(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier format',
        });
      }

      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found',
        });
      }

      const { name, slug, description, image, imageData, displayOrder } = req.body;

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Category name must be a non-empty string',
          });
        }
        category.name = name.trim();
      }

      if (slug !== undefined) {
        const newSlug = slugify(slug);
        if (!newSlug) {
          return res.status(400).json({
            success: false,
            message: 'Slug cannot be empty',
          });
        }
        const duplicate = await Category.findOne({ slug: newSlug, _id: { $ne: id } });
        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: 'A category with this slug already exists',
          });
        }
        category.slug = newSlug;
      }

      if (description !== undefined) {
        category.description = typeof description === 'string' ? description.trim() : '';
      }

      // Handle imageData replacement and Cloudinary cleanup
      if (imageData !== undefined) {
        if (category.imageData?.publicId && category.imageData.publicId !== imageData?.publicId) {
          try {
            await deleteAsset(category.imageData.publicId);
            await Media.updateOne({ publicId: category.imageData.publicId }, { status: 'DELETED' });
          } catch (delErr) {
            console.error('[CategoryController] Error deleting old category image:', delErr);
          }
        }

        category.imageData = imageData && typeof imageData === 'object' ? imageData : undefined;
        if (imageData?.secureUrl) {
          category.image = imageData.secureUrl;
          if (imageData.publicId) {
            await Media.updateOne({ publicId: imageData.publicId }, { category: category._id });
          }
        } else if (imageData === null) {
          category.image = '';
        }
      } else if (image !== undefined) {
        category.image = typeof image === 'string' ? image.trim() : '';
      }

      if (displayOrder !== undefined) {
        category.displayOrder = Number.isInteger(Number(displayOrder)) ? Number(displayOrder) : category.displayOrder;
      }

      await category.save();

      await redisDel('cache:categories:all');
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: 'Category updated successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/categories/:id/status
   * ADMIN only: Activate or deactivate category
   */
  static async updateCategoryStatus(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category identifier format',
        });
      }

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive status must be a boolean (true or false)',
        });
      }

      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found',
        });
      }

      category.isActive = isActive;
      await category.save();

      await redisDel('cache:categories:all');
      await redisDelPattern('cache:products:*');
      await redisDelPattern('cache:admin:dashboard:*');

      res.status(200).json({
        success: true,
        message: `Category ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CategoryController;

