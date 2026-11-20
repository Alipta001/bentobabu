const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, OtpChallenge, DeliveryApplication, RefreshSession } = require('../models');
const {
  AUTH_COOKIE_NAMES,
  getCookieNamesForRole,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  parseDurationToMs,
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
const { sendSignupOtpEmail } = require('../utils/email');
const {
  normalizePhone,
  maskEmail,
  maskPhoneNumber,
  generateNumericOtp,
  generateChallengeToken,
  hashChallengeToken,
  hashOtp,
  verifyOtpHash,
  sendSms,
} = require('../utils/sms');

const BCRYPT_ROUNDS = 12;

/**
 * Normalizes email address
 */
const normalizeEmail = (email) => {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

/**
 * Helper to resolve user by identifier, email, or phone
 */
const resolveUserFromIdentifier = async ({ identifier, email, phone }) => {
  const input = (identifier || email || phone || '').trim();
  if (!input) return null;

  const cleanEmail = normalizeEmail(input);
  const cleanPhone = normalizePhone(input);

  const conditions = [];
  if (cleanEmail && /^\S+@\S+\.\S+$/.test(cleanEmail)) {
    conditions.push({ email: cleanEmail });
  }
  if (cleanPhone && cleanPhone.length === 10) {
    conditions.push({ phone: cleanPhone });
  }

  if (conditions.length === 0) return null;
  return User.findOne({ $or: conditions });
};

/**
 * Helper to resolve challenge and associated user by challengeId (SHA-256 hashed lookup) or fallback credentials
 */
const resolveChallenge = async ({ challengeId, identifier, email, phone }) => {
  if (challengeId && typeof challengeId === 'string' && challengeId.trim()) {
    const challengeTokenHash = hashChallengeToken(challengeId.trim());
    const challenge = await OtpChallenge.findOne({ challengeTokenHash }).select('+otpHash');
    if (challenge) {
      const user = await User.findById(challenge.user);
      return { challenge, user };
    }
  }

  // Fallback to identifier lookup
  const user = await resolveUserFromIdentifier({ identifier, email, phone });
  if (!user) return { challenge: null, user: null };

  const challenge = await OtpChallenge.findOne({
    user: user._id,
    isConsumed: false,
  }).sort({ createdAt: -1 }).select('+otpHash');

  return { challenge, user };
};

class AuthController {
  /**
   * POST /api/v1/auth/register
   * Registers a customer account and initiates OTP verification (Email or SMS)
   */
  static async register(req, res, next) {
    try {
      const { name, email, phone, password } = req.body;
      const activeEnv = validateEnv();

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
      if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit Indian mobile number',
        });
      }

      const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || `reg_${Date.now().toString(36)}`;
      console.log(`[Registration][${correlationId}] Registration request received for destination: ${maskEmail(cleanEmail)}`);

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
        const isVerified = existingUser.isEmailVerified || existingUser.isPhoneVerified;
        if (isVerified) {
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
      }

      // 3. Hash password
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // 4. Create or update unverified user
      let user;
      if (existingUser && !(existingUser.isEmailVerified || existingUser.isPhoneVerified)) {
        existingUser.name = name.trim();
        existingUser.password = hashedPassword;
        await existingUser.save();
        await OtpChallenge.deleteMany({ user: existingUser._id, isConsumed: false });
        user = existingUser;
        console.log(`[Registration][${correlationId}] Existing unverified customer account reused for destination: ${maskEmail(cleanEmail)}`);
      } else {
        user = await User.create({
          name: name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          password: hashedPassword,
          role: 'CUSTOMER',
          isActive: true,
          isEmailVerified: false,
          isPhoneVerified: false,
        });
        console.log(`[Registration][${correlationId}] New unverified customer account created for destination: ${maskEmail(cleanEmail)}`);
      }

      // 5. Generate opaque challenge token and hash OTP with separate OTP_HASH_SECRET
      const channel = activeEnv.otpEmailEnabled ? 'email' : 'sms';
      const identifier = channel === 'email' ? cleanEmail : cleanPhone;
      const challengeToken = generateChallengeToken();
      const challengeTokenHash = hashChallengeToken(challengeToken);
      const otp = generateNumericOtp(activeEnv.otpLength);
      const otpHash = hashOtp(otp, activeEnv.otpHashSecret);
      const expiresAt = new Date(Date.now() + activeEnv.otpExpiryMinutes * 60 * 1000);

      await OtpChallenge.create({
        challengeTokenHash,
        user: user._id,
        identifier,
        channel,
        otpHash,
        expiresAt,
        attempts: 0,
        maxAttempts: activeEnv.otpMaxAttempts,
        resendCount: 0,
        lastSentAt: new Date(),
        isConsumed: false,
      });
      console.log(`[Registration][${correlationId}] OTP challenge created for channel: ${channel}`);

      // 6. Deliver OTP via configured channel
      let sendResult;
      if (channel === 'email') {
        const providerName = activeEnv.emailProvider === 'resend' ? 'resend-api' : (activeEnv.emailProvider || 'resend-api');
        console.log(`[Registration][${correlationId}] Email dispatch started via ${providerName} to: ${maskEmail(cleanEmail)}`);
        sendResult = await sendSignupOtpEmail({
          to: cleanEmail,
          name: user.name,
          otp,
          expiryMinutes: activeEnv.otpExpiryMinutes,
        });
      } else {
        console.log(`[Registration][${correlationId}] SMS dispatch started to: ${maskPhoneNumber(cleanPhone)}`);
        sendResult = await sendSms({
          to: cleanPhone,
          message: `Your BentoBabu verification code is ${otp}. Valid for ${activeEnv.otpExpiryMinutes} minutes. Do not share it with anyone.`,
        });
      }

      if (!sendResult || !sendResult.success) {
        console.warn(`[Registration][${correlationId}] OTP delivery failed via ${channel}: ${sendResult?.error || 'Unknown error'}`);
        // Rollback challenge creation and unverified new user to prevent orphaned conflict
        await OtpChallenge.deleteOne({ challengeTokenHash });
        if (!existingUser) {
          await User.deleteOne({ _id: user._id });
        }
        return res.status(502).json({
          success: false,
          message: `Failed to deliver verification code via ${channel}. Please try again later.`,
        });
      }

      console.log(`[Registration][${correlationId}] OTP delivery succeeded via ${channel}${sendResult?.messageId ? ` (ID: ${sendResult.messageId})` : ''}. Returning HTTP 201.`);

      // 7. Return 201 without session cookies and without PII in payload
      return res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your account.',
        data: {
          requiresVerification: true,
          challengeId: challengeToken,
          channel,
          destination: channel === 'email' ? maskEmail(cleanEmail) : maskPhoneNumber(cleanPhone),
          maskedDestination: channel === 'email' ? maskEmail(cleanEmail) : maskPhoneNumber(cleanPhone),
          cooldown: activeEnv.otpResendCooldownSeconds,
          cooldownSeconds: activeEnv.otpResendCooldownSeconds,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/otp-status
   * Safe status check for active OTP challenge using opaque challengeId (no PII exposed)
   */
  static async getOtpStatus(req, res, next) {
    try {
      const { challengeId } = req.query;
      if (!challengeId || typeof challengeId !== 'string' || !challengeId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Challenge ID is required',
        });
      }

      const challengeTokenHash = hashChallengeToken(challengeId.trim());
      const challenge = await OtpChallenge.findOne({ challengeTokenHash });
      if (!challenge) {
        return res.status(404).json({
          success: false,
          message: 'Verification challenge not found or expired',
        });
      }

      const activeEnv = validateEnv();
      const elapsedSeconds = Math.floor((Date.now() - new Date(challenge.lastSentAt).getTime()) / 1000);
      const cooldownRemaining = Math.max(0, activeEnv.otpResendCooldownSeconds - elapsedSeconds);

      return res.status(200).json({
        success: true,
        data: {
          challengeId: challengeId.trim(),
          channel: challenge.channel,
          destination: challenge.channel === 'email' ? maskEmail(challenge.identifier) : maskPhoneNumber(challenge.identifier),
          maskedDestination: challenge.channel === 'email' ? maskEmail(challenge.identifier) : maskPhoneNumber(challenge.identifier),
          isConsumed: challenge.isConsumed,
          isExpired: new Date() > challenge.expiresAt,
          cooldownRemaining,
          cooldown: cooldownRemaining,
          resendCount: challenge.resendCount,
          maxResends: activeEnv.otpMaxResends,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/verify-signup-otp
   * Atomically verifies signup OTP and marks user verified. Does NOT issue session cookies.
   */
  static async verifySignupOtp(req, res, next) {
    try {
      const { challengeId, identifier, email, phone, otp } = req.body;
      const activeEnv = validateEnv();

      if (!otp || typeof otp !== 'string' || !/^\d{4,8}$/.test(otp.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid numeric verification code',
        });
      }

      const { challenge, user } = await resolveChallenge({ challengeId, identifier, email, phone });
      if (!challenge || !user) {
        return res.status(404).json({
          success: false,
          message: 'Verification challenge or user account not found. Please register first.',
        });
      }

      const isAlreadyVerified = user.isEmailVerified || user.isPhoneVerified;
      if (isAlreadyVerified) {
        return res.status(400).json({
          success: false,
          message: 'Account is already verified. Please log in.',
        });
      }

      if (challenge.isConsumed) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has already been used.',
        });
      }

      if (new Date() > challenge.expiresAt) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired. Please request a new code.',
          data: { expired: true },
        });
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        return res.status(400).json({
          success: false,
          message: 'Maximum verification attempts exceeded. Please request a new code.',
          data: { attemptsRemaining: 0 },
        });
      }

      // Step 1: Atomically increment attempt counter with concurrency protection
      const updatedChallenge = await OtpChallenge.findOneAndUpdate(
        {
          _id: challenge._id,
          isConsumed: false,
          attempts: { $lt: challenge.maxAttempts },
          expiresAt: { $gt: new Date() },
        },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
      ).select('+otpHash');

      if (!updatedChallenge) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired, already been consumed, or exceeded maximum attempts.',
          data: { attemptsRemaining: 0 },
        });
      }

      // Step 2: Timing-safe comparison using dedicated OTP_HASH_SECRET
      const isMatch = verifyOtpHash(otp.trim(), updatedChallenge.otpHash, activeEnv.otpHashSecret);

      if (!isMatch) {
        const remaining = Math.max(0, updatedChallenge.maxAttempts - updatedChallenge.attempts);
        if (remaining === 0) {
          return res.status(400).json({
            success: false,
            message: 'Incorrect verification code. Maximum attempts exceeded. Please request a new code.',
            data: { attemptsRemaining: 0 },
          });
        }
        return res.status(400).json({
          success: false,
          message: `Incorrect verification code. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
          data: { attemptsRemaining: remaining },
        });
      }

      // Step 3: Atomic conditional consumption ensuring exactly one concurrent request succeeds
      const consumedChallenge = await OtpChallenge.findOneAndUpdate(
        {
          _id: updatedChallenge._id,
          isConsumed: false,
          user: user._id,
        },
        {
          $set: {
            isConsumed: true,
            consumedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!consumedChallenge) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has already been consumed or used by another request.',
        });
      }

      // Step 4: Authoritatively mark user as verified
      const updateFields = updatedChallenge.channel === 'email'
        ? { isEmailVerified: true }
        : { isPhoneVerified: true };
      await User.updateOne({ _id: user._id }, { $set: updateFields });

      // Invalidate any other pending unconsumed challenges for this user
      await OtpChallenge.updateMany(
        { user: user._id, _id: { $ne: updatedChallenge._id }, isConsumed: false },
        { $set: { isConsumed: true, consumedAt: new Date() } }
      );

      return res.status(200).json({
        success: true,
        message: 'Account verified successfully. You can now log in.',
        data: {
          verified: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/resend-signup-otp
   * Resends signup verification OTP respecting cooldown and persistent resend limits
   */
  static async resendSignupOtp(req, res, next) {
    try {
      const { challengeId, identifier, email, phone } = req.body;
      const activeEnv = validateEnv();

      const { challenge, user } = await resolveChallenge({ challengeId, identifier, email, phone });
      if (!challenge || !user) {
        return res.status(404).json({
          success: false,
          message: 'Verification challenge or user account not found. Please register first.',
        });
      }

      const isAlreadyVerified = user.isEmailVerified || user.isPhoneVerified;
      if (isAlreadyVerified) {
        return res.status(400).json({
          success: false,
          message: 'Account is already verified. Please log in.',
        });
      }

      if (challenge.isConsumed) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has already been used. Please log in.',
        });
      }

      // Persistent resend limit check
      if (challenge.resendCount >= activeEnv.otpMaxResends) {
        return res.status(429).json({
          success: false,
          message: 'Maximum verification code resend limit reached. Please register again later.',
          data: { maxResendsExceeded: true },
        });
      }

      // Cooldown check
      const cooldownSeconds = activeEnv.otpResendCooldownSeconds;
      if (challenge.lastSentAt) {
        const elapsedSeconds = Math.floor((Date.now() - new Date(challenge.lastSentAt).getTime()) / 1000);
        const cooldownRemaining = cooldownSeconds - elapsedSeconds;
        if (cooldownRemaining > 0) {
          return res.status(429).json({
            success: false,
            message: `Please wait ${cooldownRemaining} seconds before requesting a new code.`,
            data: { cooldownRemaining },
          });
        }
      }

      // Generate fresh OTP and new expiration
      const otp = generateNumericOtp(activeEnv.otpLength);
      const otpHash = hashOtp(otp, activeEnv.otpHashSecret);
      const expiresAt = new Date(Date.now() + activeEnv.otpExpiryMinutes * 60 * 1000);
      const cooldownDate = new Date(Date.now() - (cooldownSeconds * 1000));

      // Atomic conditional update on the challenge document to prevent concurrent resend bypass
      const updatedChallenge = await OtpChallenge.findOneAndUpdate(
        {
          _id: challenge._id,
          isConsumed: false,
          resendCount: { $lt: activeEnv.otpMaxResends },
          lastSentAt: { $lte: cooldownDate },
        },
        {
          $inc: { resendCount: 1 },
          $set: {
            otpHash,
            expiresAt,
            attempts: 0,
            lastSentAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!updatedChallenge) {
        const latestCheck = await OtpChallenge.findById(challenge._id);
        if (latestCheck && latestCheck.resendCount >= activeEnv.otpMaxResends) {
          return res.status(429).json({
            success: false,
            message: 'Maximum verification code resend limit reached. Please register again later.',
            data: { maxResendsExceeded: true },
          });
        }
        return res.status(429).json({
          success: false,
          message: `Please wait ${cooldownSeconds} seconds before requesting a new code.`,
          data: { cooldownRemaining: cooldownSeconds },
        });
      }

      // Dispatch new OTP via configured channel
      let sendResult;
      if (updatedChallenge.channel === 'email') {
        const providerName = activeEnv.emailProvider === 'resend' ? 'resend-api' : (activeEnv.emailProvider || 'resend-api');
        console.log(`[OTP-Resend] Email dispatch started via ${providerName} to: ${maskEmail(user.email)}`);
        sendResult = await sendSignupOtpEmail({
          to: user.email,
          name: user.name,
          otp,
          expiryMinutes: activeEnv.otpExpiryMinutes,
        });
      } else {
        console.log(`[OTP-Resend] SMS dispatch started to: ${maskPhoneNumber(user.phone)}`);
        sendResult = await sendSms({
          to: user.phone,
          message: `Your BentoBabu verification code is ${otp}. Valid for ${activeEnv.otpExpiryMinutes} minutes. Do not share it with anyone.`,
        });
      }

      if (!sendResult || !sendResult.success) {
        console.warn(`[OTP-Resend] OTP delivery failed via ${updatedChallenge.channel}: ${sendResult?.error || 'Unknown error'}`);
        return res.status(502).json({
          success: false,
          message: `Failed to deliver verification code via ${updatedChallenge.channel}. Please try again later.`,
        });
      }

      console.log(`[OTP-Resend] OTP delivery succeeded via ${updatedChallenge.channel}${sendResult?.messageId ? ` (ID: ${sendResult.messageId})` : ''}. Returning HTTP 200.`);

      return res.status(200).json({
        success: true,
        message: `A fresh verification code has been sent to your registered ${updatedChallenge.channel}.`,
        data: {
          challengeId: (challengeId && typeof challengeId === 'string') ? challengeId.trim() : undefined,
          channel: updatedChallenge.channel,
          destination: updatedChallenge.channel === 'email' ? maskEmail(user.email) : maskPhoneNumber(user.phone),
          maskedDestination: updatedChallenge.channel === 'email' ? maskEmail(user.email) : maskPhoneNumber(user.phone),
          cooldownSeconds: activeEnv.otpResendCooldownSeconds,
          cooldown: activeEnv.otpResendCooldownSeconds,
          resendCount: updatedChallenge.resendCount,
          maxResends: activeEnv.otpMaxResends,
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
        if (user.role === 'DELIVERY') {
          const application = await DeliveryApplication.findOne({ user: user._id }).sort({ createdAt: -1 });
          const status = application ? application.status : 'PENDING_APPROVAL';
          let message = 'Your delivery partner application is currently under review by our onboarding team.';
          if (status === 'REJECTED') {
            message = `Your delivery partner application was not approved.${application?.rejectionReason ? ` Reason: ${application.rejectionReason}` : ''}`;
          } else if (status === 'CORRECTIONS_REQUESTED') {
            message = `Corrections requested on your delivery application: ${application?.requestedCorrections || 'Please review your application.'}`;
          } else if (status === 'SUSPENDED') {
            message = 'Your delivery partner account has been suspended. Please contact support.';
          }

          return res.status(403).json({
            success: false,
            message,
            data: {
              requiresOnboardingReview: true,
              applicationStatus: status,
              applicationNumber: application?.applicationNumber || null,
              rejectionReason: application?.rejectionReason || null,
              requestedCorrections: application?.requestedCorrections || null,
            },
          });
        }

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

      // 6. Verify customer account verification status
      const activeEnv = validateEnv();
      if (user.role === 'CUSTOMER') {
        const isVerified = user.isEmailVerified || user.isPhoneVerified;
        if (!isVerified) {
          const channel = activeEnv.otpEmailEnabled ? 'email' : 'sms';
          const destination = channel === 'email' ? maskEmail(user.email) : maskPhoneNumber(user.phone);
          return res.status(403).json({
            success: false,
            message: 'Account not verified. Please verify your account before logging in.',
            data: {
              requiresVerification: true,
              channel,
              destination,
              maskedDestination: destination,
            },
          });
        }
      }

      console.log(`[AuthController.login] Successful login for: "${cleanInput}" (${user.role})`);

      // 7. Generate session-tracked JWTs and persist RefreshSession
      const sessionId = new mongoose.Types.ObjectId();
      const refreshToken = generateRefreshToken(user, { sessionId: sessionId.toString() });
      const accessToken = generateAccessToken(user);

      const tokenHash = hashToken(refreshToken);
      const refreshExpiryMs = parseDurationToMs(activeEnv.refreshTokenExpiresIn, 7 * 24 * 60 * 60 * 1000);
      const expiresAt = new Date(Date.now() + refreshExpiryMs);

      await RefreshSession.create({
        _id: sessionId,
        user: user._id,
        tokenHash,
        expiresAt,
      });

      // Clear any legacy cookie lingering at /api/v1/auth/refresh only if present in request
      const rawCookies = req.headers?.cookie || '';
      if (rawCookies.includes(activeEnv.refreshTokenCookieName) || rawCookies.includes('refreshToken')) {
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));
      }

      // 8. Set HttpOnly cookies with isolated names based on role (Customer vs Admin vs Delivery)
      const cookieNames = getCookieNamesForRole(user.role);
      res.cookie(cookieNames.access, accessToken, getAccessTokenCookieOptions());
      res.cookie(cookieNames.refresh, refreshToken, getRefreshCookieOptions('/api/v1/auth'));

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
   * Helper: Extracts all candidate refresh tokens from cookies, headers, and body
   * Supports isolated cookie namespaces per role (customer, admin, delivery)
   */
  static extractCandidateRefreshTokens(req, cookieName) {
    const tokens = [];

    // 1. From request body
    if (req.body?.refreshToken && typeof req.body.refreshToken === 'string') {
      tokens.push(req.body.refreshToken.trim());
    }

    const requestedContext = (req.headers?.['x-auth-context'] || '').toLowerCase();
    const prioritizedNames = [];
    if (requestedContext === 'admin') {
      prioritizedNames.push('bb_admin_refresh_token');
    } else if (requestedContext === 'delivery') {
      prioritizedNames.push('bb_delivery_refresh_token');
    } else if (requestedContext === 'customer') {
      prioritizedNames.push('bb_customer_refresh_token');
    }

    const allNamesToCheck = Array.from(new Set([
      ...prioritizedNames,
      'bb_customer_refresh_token',
      'bb_admin_refresh_token',
      'bb_delivery_refresh_token',
      cookieName,
      'bb_refresh_token',
      'refreshToken',
    ])).filter(Boolean);

    // 2. From parsed cookies (cookie-parser)
    if (req.cookies) {
      for (const name of allNamesToCheck) {
        if (req.cookies[name] && typeof req.cookies[name] === 'string') {
          tokens.push(req.cookies[name].trim());
        }
      }
    }

    // 3. Raw header parsing to catch multi-path cookies with duplicate names
    const rawCookieHeader = req.headers?.cookie;
    if (rawCookieHeader && typeof rawCookieHeader === 'string') {
      const parts = rawCookieHeader.split(';');
      for (const part of parts) {
        const equalIndex = part.indexOf('=');
        if (equalIndex > 0) {
          const key = part.slice(0, equalIndex).trim();
          const val = part.slice(equalIndex + 1).trim();
          if (allNamesToCheck.includes(key)) {
            if (val && !tokens.includes(val)) {
              tokens.push(val);
            }
          }
        }
      }
    }

    return Array.from(new Set(tokens.filter(Boolean)));
  }

  /**
   * POST /api/v1/auth/refresh
   * Validates refresh JWT, detects reuse, rotates token & session, issues fresh access cookie
   */
  static async refresh(req, res, next) {
    try {
      const activeEnv = validateEnv();
      const env = activeEnv;
      const dbName = mongoose.connection?.name || 'unknown';
      const collectionName = RefreshSession.collection?.name || 'refreshsessions';

      const candidateTokens = AuthController.extractCandidateRefreshTokens(req, activeEnv.refreshTokenCookieName);

      // Diagnostic Logging: Entry
      console.log('[RefreshDiagnostics][entry]', {
        refreshCookieExists: candidateTokens.length > 0,
        candidateCount: candidateTokens.length,
        dbName,
        collectionName,
      });

      if (candidateTokens.length === 0) {
        console.warn('[RefreshDiagnostics][failure]', {
          failureReason: 'Refresh token is missing from cookies and body',
          dbName,
          collectionName,
        });
        return res.status(401).json({
          success: false,
          message: 'Refresh token is missing. Please log in again.',
        });
      }

      // Evaluate candidate tokens: prioritize tokens with active tracked sessions
      let selectedCandidate = null;
      let selectedDecoded = null;
      let selectedUser = null;
      let selectedSession = null;
      let selectedHash = null;
      let legacyCandidate = null;
      let legacyDecoded = null;
      let legacyUser = null;
      let lastJwtError = null;
      let inactiveUserFound = false;

      for (const tokenStr of candidateTokens) {
        let decoded;
        try {
          decoded = verifyRefreshToken(tokenStr);
        } catch (err) {
          lastJwtError = err;
          continue;
        }

        const userId = decoded.userId || decoded.id;
        if (!userId) continue;

        // Role & context isolation: check token claims upfront
        const requestedContext = (req.headers?.['x-auth-context'] || '').toLowerCase();
        if (decoded.role) {
          if (requestedContext === 'admin' && decoded.role !== 'ADMIN' && decoded.role !== 'KITCHEN') {
            continue;
          }
          if (requestedContext === 'delivery' && decoded.role !== 'DELIVERY' && decoded.role !== 'ADMIN') {
            continue;
          }
          if (requestedContext === 'customer' && decoded.role !== 'CUSTOMER') {
            continue;
          }
        }

        const user = await User.findById(userId);
        if (!user) continue;
        if (!user.isActive) {
          inactiveUserFound = true;
          continue;
        }

        // Role & context isolation: database verification fallback
        if (requestedContext === 'admin' && user.role !== 'ADMIN' && user.role !== 'KITCHEN') {
          continue;
        }
        if (requestedContext === 'delivery' && user.role !== 'DELIVERY' && user.role !== 'ADMIN') {
          continue;
        }
        if (requestedContext === 'customer' && user.role !== 'CUSTOMER') {
          continue;
        }

        const tokenHashVal = hashToken(tokenStr);

        // Search for existing session by sessionId claim or tokenHash/previousTokenHash
        let session = null;
        if (decoded.sessionId && mongoose.Types.ObjectId.isValid(decoded.sessionId)) {
          session = await RefreshSession.findOne({ _id: decoded.sessionId, user: user._id });
        }
        if (!session) {
          session = await RefreshSession.findOne({
            user: user._id,
            $or: [
              { tokenHash: tokenHashVal },
              { previousTokenHash: tokenHashVal },
            ],
          });
        }

        if (session) {
          // Found matching session in DB!
          selectedCandidate = tokenStr;
          selectedDecoded = decoded;
          selectedUser = user;
          selectedSession = session;
          selectedHash = tokenHashVal;
          break; // Prioritize active session
        } else if (!decoded.sessionId && !legacyCandidate) {
          // Valid legacy token from before session migration
          legacyCandidate = tokenStr;
          legacyDecoded = decoded;
          legacyUser = user;
        }
      }

      // If no session-backed token matched, but a valid legacy token exists, use legacy candidate
      if (!selectedCandidate && legacyCandidate) {
        selectedCandidate = legacyCandidate;
        selectedDecoded = legacyDecoded;
        selectedUser = legacyUser;
        selectedHash = hashToken(legacyCandidate);
      }

      // Diagnostic Logging: Evaluation stage
      const hasVerifiedJwt = Boolean(selectedCandidate);
      console.log('[RefreshDiagnostics][evaluation]', {
        jwtVerificationSuccess: hasVerifiedJwt,
        decodedHasSessionId: Boolean(selectedDecoded?.sessionId),
        matchingSessionExists: Boolean(selectedSession),
        isSessionRevoked: Boolean(selectedSession?.revokedAt),
        isSessionExpired: Boolean(selectedSession?.expiresAt && new Date() > selectedSession.expiresAt),
        hashMatch: selectedSession
          ? (selectedSession.tokenHash === selectedHash ? 'current' : (selectedSession.previousTokenHash === selectedHash ? 'previous' : 'none'))
          : 'no_session',
        dbName,
        collectionName,
      });

      if (!selectedCandidate) {
        if (inactiveUserFound) {
          console.warn('[RefreshDiagnostics][failure]', {
            failureReason: 'Account is inactive or no longer exists',
            dbName,
            collectionName,
          });
          return res.status(401).json({
            success: false,
            message: 'Account is inactive or no longer exists.',
          });
        }

        console.warn('[RefreshDiagnostics][failure]', {
          failureReason: lastJwtError ? `JWT verification failed: ${lastJwtError.message}` : 'No valid candidate token found',
          dbName,
          collectionName,
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token. Please log in again.',
        });
      }

      // Case 1: Session found in database
      if (selectedSession) {
        if (selectedSession.revokedAt) {
          console.warn('[RefreshDiagnostics][failure]', {
            failureReason: 'Session has been revoked',
            dbName,
            collectionName,
          });
          return res.status(401).json({
            success: false,
            message: 'Session has been revoked. Please log in again.',
          });
        }

        if (selectedSession.expiresAt && new Date() > selectedSession.expiresAt) {
          console.warn('[RefreshDiagnostics][failure]', {
            failureReason: 'Refresh session expired in DB',
            dbName,
            collectionName,
          });
          return res.status(401).json({
            success: false,
            message: 'Refresh token has expired. Please log in again.',
          });
        }

        // Token reuse check with concurrency grace window (10 seconds)
        if (selectedSession.tokenHash !== selectedHash) {
          if (selectedSession.previousTokenHash === selectedHash) {
            const CONCURRENCY_GRACE_WINDOW_MS = 10000;
            const isWithinGraceWindow =
              selectedSession.rotatedAt &&
              (Date.now() - new Date(selectedSession.rotatedAt).getTime() <= CONCURRENCY_GRACE_WINDOW_MS);

            if (isWithinGraceWindow) {
              console.warn('[RefreshDiagnostics][concurrency_in_flight]', {
                message: 'In-flight concurrent refresh presented previous token within grace window. Returning 409 concurrent status without revoking active session.',
                dbName,
                collectionName,
              });
              // Return 409 Conflict with code CONCURRENT_REFRESH_IN_PROGRESS so secondary tabs/requests do NOT terminate the session
              return res.status(409).json({
                success: false,
                code: 'CONCURRENT_REFRESH_IN_PROGRESS',
                message: 'Refresh token has already been rotated by a concurrent request. Please retry with active session.',
              });
            }

            console.warn('[RefreshDiagnostics][failure]', {
              failureReason: 'Token reuse detected outside grace window. Revoking session.',
              dbName,
              collectionName,
            });
            selectedSession.revokedAt = new Date();
            await selectedSession.save();
            return res.status(401).json({
              success: false,
              code: 'SESSION_REVOKED_REUSE_DETECTED',
              message: 'Refresh token has already been used and rotated. Session revoked for security.',
            });
          }

          console.warn('[RefreshDiagnostics][failure]', {
            failureReason: 'Invalid refresh token hash mismatch',
            dbName,
            collectionName,
          });
          return res.status(401).json({
            success: false,
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid refresh token.',
          });
        }

        // Standard rotation: generate new tokens and update session document
        const newRefreshToken = generateRefreshToken(selectedUser, { sessionId: selectedSession._id.toString() });
        const newAccessToken = generateAccessToken(selectedUser);
        const newHash = hashToken(newRefreshToken);
        const refreshExpiryMs = parseDurationToMs(activeEnv.refreshTokenExpiresIn, 7 * 24 * 60 * 60 * 1000);

        selectedSession.previousTokenHash = selectedHash;
        selectedSession.tokenHash = newHash;
        selectedSession.rotatedAt = new Date();
        selectedSession.expiresAt = new Date(Date.now() + refreshExpiryMs);
        await selectedSession.save();

        // Clear any old duplicate cookie at /api/v1/auth/refresh to resolve path collision
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));

        // Set rotated cookies with isolated role namespace
        const cookieNames = getCookieNamesForRole(selectedUser.role);
        res.cookie(cookieNames.access, newAccessToken, getAccessTokenCookieOptions());
        res.cookie(cookieNames.refresh, newRefreshToken, getRefreshCookieOptions('/api/v1/auth'));

        return res.status(200).json({
          success: true,
          message: 'Token refreshed successfully',
          data: {
            user: selectedUser.toJSON(),
          },
        });
      }

      // Case 2: No session found, but candidate is a valid legacy stateless token (without sessionId)
      if (!selectedDecoded.sessionId) {
        console.log('[RefreshDiagnostics][legacy_transition]', {
          message: 'Bootstrapping new RefreshSession for valid legacy stateless token',
          dbName,
          collectionName,
        });

        const newSessionId = new mongoose.Types.ObjectId();
        const newRefreshToken = generateRefreshToken(selectedUser, { sessionId: newSessionId.toString() });
        const newAccessToken = generateAccessToken(selectedUser);
        const newHash = hashToken(newRefreshToken);
        const refreshExpiryMs = parseDurationToMs(activeEnv.refreshTokenExpiresIn, 7 * 24 * 60 * 60 * 1000);

        await RefreshSession.create({
          _id: newSessionId,
          user: selectedUser._id,
          tokenHash: newHash,
          previousTokenHash: selectedHash,
          rotatedAt: new Date(),
          expiresAt: new Date(Date.now() + refreshExpiryMs),
        });

        // Clear legacy path cookie and set new session-tracked cookie
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));

        // Set rotated cookies with isolated role namespace
        const cookieNames = getCookieNamesForRole(selectedUser.role);
        res.cookie(cookieNames.access, newAccessToken, getAccessTokenCookieOptions());
        res.cookie(cookieNames.refresh, newRefreshToken, getRefreshCookieOptions('/api/v1/auth'));

        return res.status(200).json({
          success: true,
          message: 'Token refreshed successfully',
          data: {
            user: selectedUser.toJSON(),
          },
        });
      }

      // Case 3: Token claimed a sessionId, but no session document exists in DB
      console.warn('[RefreshDiagnostics][failure]', {
        failureReason: 'Token contained sessionId but session document not found in DB',
        dbName,
        collectionName,
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh session. Please log in again.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Revokes current refresh session and clears authentication cookies
   */
  static async logout(req, res, next) {
    try {
      const activeEnv = validateEnv();
      const requestedContext = (req.headers?.['x-auth-context'] || '').toLowerCase();

      // Prioritize extracting the refresh token belonging to the logging-out context
      let rawRefreshToken = null;
      if (requestedContext === 'admin') {
        rawRefreshToken = req.cookies?.bb_admin_refresh_token;
      } else if (requestedContext === 'delivery') {
        rawRefreshToken = req.cookies?.bb_delivery_refresh_token;
      } else if (requestedContext === 'customer') {
        rawRefreshToken = req.cookies?.bb_customer_refresh_token;
      }

      if (!rawRefreshToken) {
        rawRefreshToken =
          req.cookies?.bb_customer_refresh_token ||
          req.cookies?.bb_admin_refresh_token ||
          req.cookies?.bb_delivery_refresh_token ||
          req.cookies?.[activeEnv.refreshTokenCookieName] ||
          req.cookies?.refreshToken ||
          req.cookies?.['bb_refresh_token'] ||
          req.body?.refreshToken;
      }

      if (rawRefreshToken && typeof rawRefreshToken === 'string') {
        try {
          const tokenHash = hashToken(rawRefreshToken);
          let sessionId = null;
          try {
            const decoded = verifyRefreshToken(rawRefreshToken);
            sessionId = decoded?.sessionId;
          } catch {
            const decoded = jwt.decode(rawRefreshToken);
            sessionId = decoded?.sessionId;
          }

          const query = {
            $or: [{ tokenHash }, { previousTokenHash: tokenHash }],
          };
          if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
            query.$or.push({ _id: sessionId });
          }

          await RefreshSession.updateMany(query, {
            $set: { revokedAt: new Date() },
          });
        } catch (sessionErr) {
          console.warn(`[AuthController.logout] Failed to revoke refresh session: ${sessionErr.message}`);
        }
      }

      // Clear isolated cookies based on requested context
      const cookiesToClear = [];
      if (requestedContext === 'admin') {
        cookiesToClear.push(AUTH_COOKIE_NAMES.ADMIN);
      } else if (requestedContext === 'delivery') {
        cookiesToClear.push(AUTH_COOKIE_NAMES.DELIVERY);
      } else if (requestedContext === 'customer') {
        cookiesToClear.push(AUTH_COOKIE_NAMES.CUSTOMER);
      } else {
        // Fallback: clear whatever specific cookies are present
        if (req.cookies?.bb_admin_refresh_token || req.cookies?.bb_admin_access_token) {
          cookiesToClear.push(AUTH_COOKIE_NAMES.ADMIN);
        }
        if (req.cookies?.bb_delivery_refresh_token || req.cookies?.bb_delivery_access_token) {
          cookiesToClear.push(AUTH_COOKIE_NAMES.DELIVERY);
        }
        if (req.cookies?.bb_customer_refresh_token || req.cookies?.bb_customer_access_token) {
          cookiesToClear.push(AUTH_COOKIE_NAMES.CUSTOMER);
        }
        if (cookiesToClear.length === 0) {
          cookiesToClear.push(AUTH_COOKIE_NAMES.CUSTOMER);
        }
      }

      for (const pair of cookiesToClear) {
        res.clearCookie(pair.access, getClearCookieOptions('/'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/api/v1/auth'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/'));
      }

      // Clear legacy cookie names if present in request
      const rawCookieHeader = req.headers?.cookie || '';
      if (rawCookieHeader.includes(activeEnv.refreshTokenCookieName) || rawCookieHeader.includes('refreshToken')) {
        res.clearCookie(activeEnv.accessTokenCookieName, getClearCookieOptions('/'));
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/'));
        res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth'));
        res.clearCookie('accessToken', getClearCookieOptions('/'));
        res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie('refreshToken', getClearCookieOptions('/'));
        res.clearCookie('refreshToken', getClearCookieOptions('/api/v1/auth'));
      }
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
   * Revokes all active refresh sessions for the authenticated user and clears cookies
   */
  static async logoutAll(req, res, next) {
    try {
      const activeEnv = validateEnv();
      const userId = req.user?.id || req.user?._id;

      if (userId) {
        await RefreshSession.updateMany(
          { user: userId, revokedAt: null },
          { $set: { revokedAt: new Date() } }
        );
      }

      // Clear all role-specific auth cookies
      for (const pair of Object.values(AUTH_COOKIE_NAMES)) {
        res.clearCookie(pair.access, getClearCookieOptions('/'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/api/v1/auth/refresh'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/api/v1/auth'));
        res.clearCookie(pair.refresh, getClearCookieOptions('/'));
      }

      res.clearCookie(activeEnv.accessTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth/refresh'));
      res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/'));
      res.clearCookie(activeEnv.refreshTokenCookieName, getClearCookieOptions('/api/v1/auth'));
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
  static async getMe(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User session not found',
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          user: typeof req.user.toJSON === 'function' ? req.user.toJSON() : req.user,
        },
      });
    } catch (err) {
      next(err);
    }
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
