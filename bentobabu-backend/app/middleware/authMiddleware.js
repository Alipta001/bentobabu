/**
 * BentoBabu Authentication & Authorization Middleware
 *
 * Authenticates requests using HttpOnly access cookie (primary)
 * or Authorization Bearer header (for non-browser clients / test suites).
 */

const { verifyAccessToken } = require('../utils/token');
const { User } = require('../models');
const { validateEnv } = require('../config/env');

const env = validateEnv();

/**
 * Authentication Middleware: Validates JWT access token in HttpOnly cookie or Authorization header
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Check HttpOnly cookie first (primary for web frontends)
    const cookieToken =
      req.cookies?.[env.accessTokenCookieName] ||
      req.cookies?.accessToken ||
      req.cookies?.['bb_access_token'];

    // 2. Check Authorization header (for non-browser / test suites)
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

    const token = cookieToken || headerToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No session cookie or authorization token provided.',
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token has expired. Please refresh your session.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid access token.',
      });
    }

    // Always fetch authoritative user state from MongoDB (never trust client-supplied roles)
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive or has been suspended.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-based Authorization Middleware: Enforces role permissions
 * Example: authorize('ADMIN') or authorize('ADMIN', 'KITCHEN')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient role permissions.',
      });
    }

    next();
  };
};

module.exports = { authenticate, authorize };
