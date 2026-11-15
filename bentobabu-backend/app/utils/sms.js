const crypto = require('crypto');
const { validateEnv } = require('../config/env');

let customSmsSender = undefined;

/**
 * Allows automated tests to supply a mock SMS sender hook
 */
const setSmsSender = (sender) => {
  customSmsSender = sender;
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

/**
 * Safely masks email address (e.g., "customer@bentobabu.in" -> "c***r@bentobabu.in")
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  const [localPart, domain] = email.split('@');
  if (!domain) return email;

  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  const first = localPart[0];
  const last = localPart[localPart.length - 1];
  return `${first}***${last}@${domain}`;
};

/**
 * Safely masks 10-digit phone number (e.g., "9876543210" -> "+91 ****** 3210")
 */
const maskPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  const clean = normalizePhone(phone);
  if (clean.length < 4) return phone;
  const last4 = clean.slice(-4);
  return `+91 ****** ${last4}`;
};

/**
 * Generates cryptographically secure uniform random numeric OTP of specified length
 */
const generateNumericOtp = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
};

/**
 * Generates cryptographically secure opaque challenge identifier
 */
const generateChallengeToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Computes SHA-256 hash of opaque challenge token for secure at-rest storage
 * Raw challenge tokens are never stored in MongoDB
 */
const hashChallengeToken = (token) => {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
};

/**
 * Hashes OTP using HMAC-SHA256 with application secret
 */
const hashOtp = (otp, secret) => {
  if (!otp || !secret) {
    throw new Error('OTP and secret are required for hashing');
  }
  return crypto.createHmac('sha256', secret).update(String(otp).trim()).digest('hex');
};

/**
 * Performs timing-safe comparison between incoming OTP and stored hash
 */
const verifyOtpHash = (incomingOtp, storedHash, secret) => {
  if (!incomingOtp || !storedHash || !secret) return false;
  const computedHash = hashOtp(incomingOtp, secret);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Modular SMS dispatcher supporting mock, Twilio, and MSG91 providers
 */
const sendSms = async ({ to, message }) => {
  if (customSmsSender !== undefined) {
    return customSmsSender({ to, message });
  }

  const env = validateEnv();
  const cleanTo = normalizePhone(to);

  if (env.smsProvider === 'mock' || process.env.NODE_ENV === 'test') {
    return {
      success: true,
      provider: 'mock',
      messageId: `mock-sms-${Date.now()}`,
    };
  }

  if (env.smsProvider === 'twilio') {
    if (!env.smsApiKey || !env.smsApiSecret || !env.smsSenderId) {
      return {
        success: false,
        error: 'Twilio SMS credentials (SMS_API_KEY, SMS_API_SECRET, SMS_SENDER_ID) are missing',
      };
    }
    try {
      const auth = Buffer.from(`${env.smsApiKey}:${env.smsApiSecret}`).toString('base64');
      const params = new URLSearchParams({
        To: cleanTo.startsWith('+') ? cleanTo : `+91${cleanTo}`,
        From: env.smsSenderId,
        Body: message,
      });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.smsApiKey}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          error: data.message || `Twilio HTTP error ${response.status}`,
        };
      }
      return {
        success: true,
        messageId: data.sid,
        provider: 'twilio',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Twilio SMS dispatch failed',
      };
    }
  }

  if (env.smsProvider === 'msg91') {
    if (!env.smsApiKey || !env.smsSenderId) {
      return {
        success: false,
        error: 'MSG91 SMS credentials (SMS_API_KEY, SMS_SENDER_ID) are missing',
      };
    }
    try {
      const response = await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: {
          authkey: env.smsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: env.smsSenderId,
          recipients: [{ mobiles: `91${cleanTo}`, message }],
        }),
      });

      const data = await response.json();
      if (!response.ok || data.type === 'error') {
        return {
          success: false,
          error: data.message || `MSG91 HTTP error ${response.status}`,
        };
      }
      return {
        success: true,
        messageId: data.message,
        provider: 'msg91',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'MSG91 SMS dispatch failed',
      };
    }
  }

  return {
    success: false,
    error: `Unsupported SMS provider: ${env.smsProvider}`,
  };
};

module.exports = {
  setSmsSender,
  normalizePhone,
  maskEmail,
  maskPhoneNumber,
  generateNumericOtp,
  generateChallengeToken,
  hashChallengeToken,
  hashOtp,
  verifyOtpHash,
  sendSms,
};
