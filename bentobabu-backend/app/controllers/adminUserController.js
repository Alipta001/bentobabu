const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('../models');

const BCRYPT_ROUNDS = 12;

const normalizeEmail = (email) => {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

const normalizePhone = (phone) => {
  if (typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
};

/**
 * Class-based Controller for Admin User Management
 */
class AdminUserController {
  /**
   * GET /api/v1/admin/users
   * List users with search, role/status filtering, and pagination
   */
  static async getUsers(req, res, next) {
    try {
      const {
        search,
        role,
        isActive,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};

      if (search && typeof search === 'string' && search.trim()) {
        const trimmed = search.trim();
        filter.$or = [
          { name: { $regex: trimmed, $options: 'i' } },
          { email: { $regex: trimmed, $options: 'i' } },
          { phone: { $regex: trimmed, $options: 'i' } },
        ];
      }

      if (role && typeof role === 'string') {
        const upperRole = role.toUpperCase();
        if (['CUSTOMER', 'ADMIN', 'KITCHEN', 'DELIVERY'].includes(upperRole)) {
          filter.role = upperRole;
        }
      }

      if (isActive !== undefined && isActive !== '') {
        filter.isActive = isActive === 'true' || isActive === true;
      }

      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      const [users, totalUsers] = await Promise.all([
        User.find(filter)
          .select('-password')
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        User.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          users,
          pagination: {
            totalUsers,
            totalPages: Math.ceil(totalUsers / limitNum) || 1,
            currentPage: pageNum,
            limit: limitNum,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/users/:id
   * Get single user details by ID
   */
  static async getUserById(req, res, next) {
    try {
      const { id } = req.params;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format.',
        });
      }

      const user = await User.findById(id).select('-password').lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/users/:id/status
   * Activate or deactivate a user account
   */
  static async updateUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format.',
        });
      }

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive field must be a boolean (true or false).',
        });
      }

      // Check self-blocking
      if (req.user._id.toString() === id.toString() && isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'You cannot deactivate your own administrator account.',
        });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }

      // Prevent deactivating the last active administrator
      if (targetUser.role === 'ADMIN' && isActive === false) {
        const remainingAdmins = await User.countDocuments({
          role: 'ADMIN',
          isActive: true,
          _id: { $ne: targetUser._id },
        });

        if (remainingAdmins === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot deactivate the last active administrator.',
          });
        }
      }

      targetUser.isActive = isActive;
      await targetUser.save();

      const userObj = targetUser.toObject();
      delete userObj.password;

      return res.status(200).json({
        success: true,
        message: `User account has been successfully ${isActive ? 'activated' : 'deactivated'}.`,
        data: { user: userObj },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/users/:id/role
   * Update role for a user
   */
  static async updateUserRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format.',
        });
      }

      const validRoles = ['CUSTOMER', 'ADMIN', 'KITCHEN', 'DELIVERY'];
      const upperRole = typeof role === 'string' ? role.toUpperCase() : null;

      if (!upperRole || !validRoles.includes(upperRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed roles: ${validRoles.join(', ')}`,
        });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }

      // Prevent demoting the last active administrator
      if (targetUser.role === 'ADMIN' && upperRole !== 'ADMIN') {
        const remainingAdmins = await User.countDocuments({
          role: 'ADMIN',
          isActive: true,
          _id: { $ne: targetUser._id },
        });

        if (remainingAdmins === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cannot demote the last active administrator.',
          });
        }
      }

      targetUser.role = upperRole;
      await targetUser.save();

      const userObj = targetUser.toObject();
      delete userObj.password;

      return res.status(200).json({
        success: true,
        message: `User role has been updated to ${upperRole}.`,
        data: { user: userObj },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/users
   * Create an operational account (KITCHEN or DELIVERY)
   */
  static async createUser(req, res, next) {
    try {
      const { name, email, phone, password, role } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Name is required.',
        });
      }

      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.',
        });
      }

      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit Indian mobile number.',
        });
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long.',
        });
      }

      const upperRole = typeof role === 'string' ? role.toUpperCase() : null;
      if (upperRole === 'ADMIN') {
        return res.status(400).json({
          success: false,
          message: 'Direct creation of ADMIN accounts is not permitted via this endpoint.',
        });
      }

      if (!upperRole || !['KITCHEN', 'DELIVERY'].includes(upperRole)) {
        return res.status(400).json({
          success: false,
          message: 'Role must be either KITCHEN or DELIVERY.',
        });
      }

      // Check duplicates
      const [existingEmail, existingPhone] = await Promise.all([
        User.findOne({ email: cleanEmail }),
        User.findOne({ phone: cleanPhone }),
      ]);

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'A user with this email address already exists.',
        });
      }

      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'A user with this mobile number already exists.',
        });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const newUser = await User.create({
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        password: passwordHash,
        role: upperRole,
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      });

      const userObj = newUser.toObject();
      delete userObj.password;

      return res.status(201).json({
        success: true,
        message: `${upperRole} user created successfully.`,
        data: { user: userObj },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminUserController;

