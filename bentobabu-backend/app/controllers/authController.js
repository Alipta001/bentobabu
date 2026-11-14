const bcrypt = require('bcryptjs');
const { User } = require('../models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getAccessTokenCookieOptions,
  getRefreshCookieOptions,
  getClearCookieOptions,
} = require('../utils/token');
const {
  recordFailedLogin,
  checkFailedLoginStatus,
  clearFailedLogin,
} = require('../config/redis');
const { validateEnv } = require('../config/env');

const env = validateEnv();
const BCRYPT_ROUNDS = 12;

/**
 * Normalizes email address
 */
const normalizeEmail = (email) => {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

/**
 * Normalizes 10-digit Indian mobile number
 */
const normalizePhone = (phone) => {
  if (typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
};

class AuthController {
  /**
   * POST /api/v1/auth/register
   * Register a new CUSTOMER account with HttpOnly cookies
   */
  static async register(req, res, next) {
    try {
      const { name, email, phone, password } = req.body;

      // 1. Validation
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Name is required and must be a valid string',
        });
      }

      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address',
        });
      }

      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit Indian mobile number',
        });
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long',
        });
      }

      if (password.length > 128) {
        return res.status(400).json({
          success: false,
          message: 'Password cannot exceed 128 characters',
        });
      }

      // 2. Duplicate check
      const existingUser = await User.findOne({
        $or: [{ email: cleanEmail }, { phone: cleanPhone }],
      });

      if (existingUser) {
        if (existingUser.email === cleanEmail) {
          return res.status(409).json({
            success: false,
            message: 'An account with this email address already exists',
          });
        }
        if (existingUser.phone === cleanPhone) {
          return res.status(409).json({
            success: false,
            message: 'An account with this mobile number already exists',
          });
        }
      }

      // 3. Hash password
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // 4. Force CUSTOMER role
      const newUser = await User.create({
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        password: hashedPassword,
        role: 'CUSTOMER',
        isActive: true,
        isEmailVerified: false,
        isPhoneVerified: false,
      });

      // 5. Generate stateless JWTs
      const accessToken = generateAccessToken(newUser);
      const refreshToken = generateRefreshToken(newUser);

      // 6. Set HttpOnly cookies (No raw JWTs in JSON response)
      res.cookie(env.accessTokenCookieName, accessToken, getAccessTokenCookieOptions());
      res.cookie(env.refreshTokenCookieName, refreshToken, getRefreshCookieOptions());

      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          user: newUser.toJSON(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/login
   * Unified login with Redis failed-attempt counter & HttpOnly cookies
   */
  static async login(req, res, next) {
    try {
      const { identifier, email, phone, password } = req.body;
      const loginInput = identifier || email || phone;

      if (!loginInput || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide email/phone and password',
        });
      }

      const cleanInput = loginInput.trim();
      const cleanEmail = cleanInput.toLowerCase();
      const cleanPhone = normalizePhone(cleanInput);

      // 1. Check Redis security lockout status
      const lockout = await checkFailedLoginStatus(cleanInput);
      if (lockout.isLocked) {
        return res.status(429).json({
          success: false,
          message: `Account is temporarily locked due to repeated failed login attempts. Please try again in ${Math.ceil(lockout.ttlSecondsRemaining / 60)} minutes.`,
        });
      }

      // 2. Find user (clean conditions, avoiding querying empty phone)
      const conditions = [{ email: cleanEmail }];
      if (cleanPhone && cleanPhone.length === 10) {
        conditions.push({ phone: cleanPhone });
      }
      const user = await User.findOne({
        $or: conditions,
      }).select('+password');

      if (!user) {
        console.warn(`[AuthController.login] User not found for identifier: "${cleanInput}"`);
        const attempt = await recordFailedLogin(cleanInput);
        if (attempt.isLocked) {
          return res.status(429).json({
            success: false,
            message: 'Too many failed login attempts. Account is temporarily locked for 15 minutes.',
          });
        }
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. Please check your email/phone and password.',
        });
      }

      // 3. Check account active status
      if (!user.isActive) {
        console.warn(`[AuthController.login] Inactive user login attempt: "${cleanInput}"`);
        return res.status(403).json({
          success: false,
          message: 'Your account is inactive or has been suspended. Please contact support.',
        });
      }

      // 4. Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.warn(`[AuthController.login] Password mismatch for identifier: "${cleanInput}"`);
        const attempt = await recordFailedLogin(cleanInput);
        if (attempt.isLocked) {
          return res.status(429).json({
            success: false,
            message: 'Too many failed login attempts. Account is temporarily locked for 15 minutes.',
          });
        }
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials. Please check your email/phone and password.',
        });
      }

      // 5. Successful login: clear failed attempts
      await clearFailedLogin(cleanInput);
      console.log(`[AuthController.login] Successful login for: "${cleanInput}" (${user.role})`);

      // 6. Generate stateless JWTs
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // 7. Set HttpOnly cookies (No raw JWTs in response body)
      res.cookie(env.accessTokenCookieName, accessToken, getAccessTokenCookieOptions());
      res.cookie(env.refreshTokenCookieName, refreshToken, getRefreshCookieOptions());

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.toJSON(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * Validates stateless refresh JWT and issues fresh access token HttpOnly cookie
   */
  static async refresh(req, res, next) {
    try {
      const rawRefreshToken =
        req.cookies?.[env.refreshTokenCookieName] ||
        req.cookies?.refreshToken ||
        req.body?.refreshToken;

      if (!rawRefreshToken) {
        console.warn(`[AuthController.refresh] Refresh token is missing from cookies and body`);
        return res.status(401).json({
          success: false,
          message: 'Refresh token is missing. Please log in again.',
        });
      }

      let decoded;
      try {
        decoded = verifyRefreshToken(rawRefreshToken);
      } catch (tokenErr) {
        console.warn(`[AuthController.refresh] Refresh token verification failed: ${tokenErr?.message}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token. Please log in again.',
        });
      }

      const userId = decoded.userId || decoded.id;
      if (!userId) {
        console.warn(`[AuthController.refresh] Malformed refresh token missing userId claim`);
        return res.status(401).json({
          success: false,
          message: 'Malformed refresh token.',
        });
      }

      const user = await User.findById(userId);

      if (!user || !user.isActive) {
        console.warn(`[AuthController.refresh] User not found or inactive for ID: ${userId}`);
        return res.status(401).json({
          success: false,
          message: 'Account is inactive or no longer exists.',
        });
      }

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      // Set rotated cookies
      res.cookie(env.accessTokenCookieName, newAccessToken, getAccessTokenCookieOptions());
      res.cookie(env.refreshTokenCookieName, newRefreshToken, getRefreshCookieOptions());

      return res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          user: user.toJSON(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Stateless logout clears HttpOnly cookies from the browser
   */
  static async logout(req, res, next) {
    try {
      res.clearCookie(env.accessTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth'));
      res.clearCookie('accessToken', getClearCookieOptions('/'));
      res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));
      res.clearCookie('refreshToken', getClearCookieOptions('/'));
      res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth'));
      res.clearCookie('bb_csrf_token', getClearCookieOptions('/'));

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/logout-all
   * Clears cookies across all devices
   */
  static async logoutAll(req, res, next) {
    try {
      res.clearCookie(env.accessTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(env.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth'));
      res.clearCookie('accessToken', getClearCookieOptions('/'));
      res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));
      res.clearCookie('refreshToken', getClearCookieOptions('/'));
      res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth'));
      res.clearCookie('bb_csrf_token', getClearCookieOptions('/'));

      return res.status(200).json({
        success: true,
        message: 'Logged out from all devices successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/me
   * Retrieves profile of authenticated user
   */
  static async getMe(req, res) {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user.toJSON(),
      },
    });
  }

  /**
   * PATCH /api/v1/auth/profile
   * Updates allowed profile fields
   */
  static async updateProfile(req, res, next) {
    try {
      const { name, profileImage } = req.body;

      if (
        req.body.role ||
        req.body.isActive !== undefined ||
        req.body.isEmailVerified !== undefined ||
        req.body.isPhoneVerified !== undefined
      ) {
        return res.status(403).json({
          success: false,
          message: 'Modifying role, account status, or verification flags is forbidden.',
        });
      }

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Name must be a valid non-empty string',
          });
        }
        req.user.name = name.trim();
      }

      if (profileImage !== undefined) {
        req.user.profileImage = profileImage;
      }

      await req.user.save();

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: req.user.toJSON(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

// Ensure both class methods and legacy property destructurings work seamlessly
AuthController.register = AuthController.register;
AuthController.login = AuthController.login;
AuthController.refresh = AuthController.refresh;
AuthController.logout = AuthController.logout;
AuthController.logoutAll = AuthController.logoutAll;
AuthController.getMe = AuthController.getMe;
AuthController.updateProfile = AuthController.updateProfile;

module.exports = AuthController;
