/**
 * Environment Variable Validation & Configuration
 */

const path = require('path');
const fs = require('fs');

// Ensure .env is loaded regardless of process.cwd()
const backendEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else {
  require('dotenv').config();
}

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

  const otpEmailEnabled = process.env.OTP_EMAIL_ENABLED === 'true';
  const otpSmsEnabled = process.env.OTP_SMS_ENABLED === 'true';

  if ((otpEmailEnabled && otpSmsEnabled) || (!otpEmailEnabled && !otpSmsEnabled)) {
    throw new Error(
      'Invalid OTP configuration: Exactly one delivery channel must be enabled (either OTP_EMAIL_ENABLED=true or OTP_SMS_ENABLED=true, not both and not neither).'
    );
  }

  const otpHashSecret = process.env.OTP_HASH_SECRET;
  if (!otpHashSecret || typeof otpHashSecret !== 'string' || otpHashSecret.trim().length < 16) {
    throw new Error(
      'Invalid OTP configuration: OTP_HASH_SECRET must be defined and at least 16 characters long.'
    );
  }

  // Validate required Resend API key when email OTP is enabled
  if (otpEmailEnabled) {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_API_KEY.trim()) {
      throw new Error(
        'Invalid email configuration: Missing required RESEND_API_KEY environment variable when email OTP is enabled.'
      );
    }
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
    emailProvider: process.env.EMAIL_PROVIDER || 'resend',
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 465,
    smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : parseInt(process.env.SMTP_PORT, 10) === 465,
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    emailFrom: process.env.EMAIL_FROM || 'BentoBabu <verify@bentobabu.com>',
    whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    whatsappApiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    // OTP Signup Verification Configuration
    otpEmailEnabled,
    otpSmsEnabled,
    otpHashSecret: otpHashSecret.trim(),
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5,
    otpLength: parseInt(process.env.OTP_LENGTH, 10) || 6,
    otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5,
    otpResendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60,
    otpMaxResends: parseInt(process.env.OTP_MAX_RESENDS, 10) || 3,
    // Cloudinary Media Configuration
    cloudinaryCloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    cloudinaryApiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    cloudinaryApiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
    // Cloudflare R2 Media Configuration
    r2AccountId: (process.env.R2_ACCOUNT_ID || '').trim(),
    r2AccessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    r2SecretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
    r2BucketName: (process.env.R2_BUCKET_NAME || 'bentobabu-media').trim(),
    r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || 'https://media.bentobabu.com').trim(),
    r2Region: (process.env.R2_REGION || 'auto').trim(),
    r2UploadUrlExpirySeconds: parseInt(process.env.R2_UPLOAD_URL_EXPIRY_SECONDS, 10) || 600,
    smsProvider: process.env.SMS_PROVIDER || 'mock',
    smsApiKey: process.env.SMS_API_KEY || '',
    smsApiSecret: process.env.SMS_API_SECRET || '',
    smsSenderId: process.env.SMS_SENDER_ID || 'BENTOB',
  };
};

module.exports = { validateEnv };
