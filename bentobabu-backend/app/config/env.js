/**
 * Environment Variable Validation & Configuration
 */

const requiredInProduction = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'ADMIN_FRONTEND_URL',
];

const validateEnv = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];

  for (const key of requiredInProduction) {
    if (!process.env[key] && !process.env[key.replace('MONGODB_', 'MONGO_')]) {
      missing.push(key);
    }
  }

  if (isProd && missing.length > 0) {
    throw new Error(`Production startup aborted: Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    isProduction: isProd,
    port: parseInt(process.env.PORT, 10) || 4000,
    host: process.env.HOST || '0.0.0.0',
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    adminFrontendUrl: process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '30s',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
    accessTokenCookieName: process.env.ACCESS_TOKEN_COOKIE_NAME || 'bb_access_token',
    refreshTokenCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME || 'bb_refresh_token',
    csrfSecret: process.env.CSRF_SECRET || process.env.JWT_ACCESS_SECRET || 'dev_csrf_secret_salt_32bytes',
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    redisEnabled: process.env.REDIS_ENABLED !== 'false',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    emailFrom: process.env.EMAIL_FROM || 'BentoBabu <no-reply@bentobabu.in>',
    whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  };
};

module.exports = { validateEnv };
