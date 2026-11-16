const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validateEnv } = require('../config/env');

const env = validateEnv();

/**
 * Computes SHA-256 hash of a string (e.g. refresh token)
 * Raw refresh tokens are never stored in MongoDB
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates short-lived Access Token (15m default)
 * Claims: userId, id, role, type: 'access', jti, iat, exp
 */
const generateAccessToken = (user) => {
  const userId = user.id || user._id.toString();
  return jwt.sign(
    {
      userId,
      id: userId,
      role: user.role,
      type: 'access',
      jti: crypto.randomBytes(16).toString('hex'),
    },
    env.jwtAccessSecret,
    {
      expiresIn: env.accessTokenExpiresIn,
    }
  );
};

/**
 * Generates long-lived Refresh Token (7d default) - Completely Stateless
 * Claims: userId, id, type: 'refresh', jti, iat, exp, plus optional extraClaims (e.g. sessionId)
 */
const generateRefreshToken = (user, extraClaims = {}) => {
  const userId = user.id || user._id.toString();
  return jwt.sign(
    {
      userId,
      id: userId,
      type: 'refresh',
      jti: crypto.randomBytes(16).toString('hex'),
      ...extraClaims,
    },
    env.jwtRefreshSecret,
    {
      expiresIn: env.refreshTokenExpiresIn,
    }
  );
};

/**
 * Verifies Access Token with access secret and type check
 */
const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, env.jwtAccessSecret);
  if (decoded.type && decoded.type !== 'access') {
    const error = new Error('Invalid token type: expected access token');
    error.name = 'JsonWebTokenError';
    throw error;
  }
  return decoded;
};

/**
 * Verifies Refresh Token with refresh secret and strict type check
 */
const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, env.jwtRefreshSecret);
  if (decoded.type !== 'refresh') {
    const error = new Error('Invalid token type: expected refresh token');
    error.name = 'JsonWebTokenError';
    throw error;
  }
  return decoded;
};

/**
 * Parses duration strings like '30s', '15m', '7d' into milliseconds
 */
const parseDurationToMs = (duration, defaultMs = 30 * 1000) => {
  if (typeof duration === 'number') return duration;
  if (!duration || typeof duration !== 'string') return defaultMs;
  const match = duration.trim().match(/^(\d+)([smhd])?$/);
  if (!match) return defaultMs;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return val * 1000;
  }
};

/**
 * Standard cookie configuration for access tokens (HttpOnly)
 */
const getAccessTokenCookieOptions = () => {
  const opts = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: parseDurationToMs(env.accessTokenExpiresIn, 30 * 1000),
  };
  if (env.cookieDomain) {
    opts.domain = env.cookieDomain;
  }
  return opts;
};

/**
 * Standard cookie configuration for refresh tokens (7d HttpOnly)
 * Scoped to /api/v1/auth for security while enabling automatic token rotation and logout
 */
const getRefreshCookieOptions = (path = '/api/v1/auth') => {
  const opts = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path,
    maxAge: parseDurationToMs(env.refreshTokenExpiresIn, 7 * 24 * 60 * 60 * 1000),
  };
  if (env.cookieDomain) {
    opts.domain = env.cookieDomain;
  }
  return opts;
};

/**
 * Standard cookie configuration for CSRF tokens
 */
const getCsrfCookieOptions = () => {
  const opts = {
    httpOnly: false, // Accessible to JavaScript for double-submit header attachment
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  };
  if (env.cookieDomain) {
    opts.domain = env.cookieDomain;
  }
  return opts;
};

/**
 * Options for clearing cookies with exact matching security attributes
 */
const getClearCookieOptions = (path = '/') => {
  const opts = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path,
    expires: new Date(0),
    maxAge: 0,
  };
  if (env.cookieDomain) {
    opts.domain = env.cookieDomain;
  }
  return opts;
};

module.exports = {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  parseDurationToMs,
  getAccessTokenCookieOptions,
  getRefreshCookieOptions,
  getCsrfCookieOptions,
  getClearCookieOptions,
};

