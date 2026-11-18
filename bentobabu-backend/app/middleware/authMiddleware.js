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
 * Supports isolated cookie namespaces for customer, admin, and delivery partner contexts
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Context-aware cookie selection:
    // Determine target context from X-Auth-Context header or URL path
    const requestedContext = (req.headers['x-auth-context'] || '').toLowerCase();
    const urlPath = req.originalUrl || req.url || '';
    const isAdminRoute = urlPath.startsWith('/api/v1/admin');
    const isDeliveryRoute = urlPath.startsWith('/api/v1/delivery');

    let candidateCookies = [];
    if (requestedContext === 'admin' || isAdminRoute) {
      candidateCookies = [
        req.cookies?.['bb_admin_access_token'],
        req.cookies?.[env.accessTokenCookieName],
        req.cookies?.accessToken,
        req.cookies?.['bb_access_token'],
      ];
    } else if (requestedContext === 'delivery' || isDeliveryRoute) {
      candidateCookies = [
        req.cookies?.['bb_delivery_access_token'],
        req.cookies?.[env.accessTokenCookieName],
        req.cookies?.accessToken,
        req.cookies?.['bb_access_token'],
      ];
    } else if (requestedContext === 'customer') {
      candidateCookies = [
        req.cookies?.['bb_customer_access_token'],
        req.cookies?.[env.accessTokenCookieName],
        req.cookies?.accessToken,
        req.cookies?.['bb_access_token'],
      ];
    } else {
      // Unspecified context: check specific cookies before legacy fallbacks
      candidateCookies = [
        req.cookies?.['bb_customer_access_token'],
        req.cookies?.['bb_admin_access_token'],
        req.cookies?.['bb_delivery_access_token'],
        req.cookies?.[env.accessTokenCookieName],
        req.cookies?.accessToken,
        req.cookies?.['bb_access_token'],
      ];
    }

    const cookieToken = candidateCookies.find((t) => typeof t === 'string' && t.trim().length > 0) || null;

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

    // Role and context validation
    if (isAdminRoute && decoded.role !== 'ADMIN' && decoded.role !== 'KITCHEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient role permissions for admin route.',
      });
    }
    if (isDeliveryRoute && decoded.role !== 'DELIVERY' && decoded.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient role permissions for delivery route.',
      });
    }
    if (requestedContext === 'admin' && decoded.role !== 'ADMIN' && decoded.role !== 'KITCHEN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin authentication context requires administrator privileges.',
      });
    }
    if (requestedContext === 'delivery' && decoded.role !== 'DELIVERY' && decoded.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Delivery authentication context requires delivery partner privileges.',
      });
    }
    if (requestedContext === 'customer' && decoded.role !== 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Customer authentication context requires customer privileges.',
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
