const bcrypt = require('bcryptjs');
const { User, OtpChallenge, DeliveryApplication } = require('../models');
const { validateEnv } = require('../config/env');
const {
  normalizePhone,
  maskPhoneNumber,
  maskEmail,
  generateNumericOtp,
  generateChallengeToken,
  hashChallengeToken,
  hashOtp,
  verifyOtpHash,
} = require('../utils/sms');
const { sendSignupOtpEmail } = require('../utils/email');
const { uploadDocumentToCloudinary } = require('../utils/documentUploader');
const NotificationDispatcher = require('../utils/notificationDispatcher');

const BCRYPT_ROUNDS = 12;

class DeliveryOnboardingController {
  /**
   * POST /api/v1/delivery/onboarding/otp/send
   * Sends OTP for delivery partner applicant email address verification
   */
  static async sendOtp(req, res, next) {
    try {
      const email = req.body?.email || req.body?.identifier;

      if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.',
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Check if user is already an approved active delivery partner
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser && existingUser.role === 'DELIVERY' && existingUser.isActive) {
        return res.status(400).json({
          success: false,
          message: 'This email address is already registered and active as a BentoBabu delivery partner. Please log in directly.',
          data: { alreadyRegistered: true },
        });
      }

      const activeEnv = validateEnv();
      const rawOtp = generateNumericOtp(6);
      const rawChallengeToken = generateChallengeToken();
      const challengeTokenHash = hashChallengeToken(rawChallengeToken);
      const otpHash = hashOtp(rawOtp, activeEnv.otpHashSecret);

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Invalidate any older challenges for this email
      await OtpChallenge.updateMany(
        { identifier: cleanEmail, isConsumed: false },
        { $set: { isConsumed: true } }
      );

      // We associate with existing user or a placeholder ID if new
      const userId = existingUser ? existingUser._id : new (require('mongoose').Types.ObjectId)();

      await OtpChallenge.create({
        challengeTokenHash,
        user: userId,
        identifier: cleanEmail,
        channel: 'email',
        otpHash,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        resendCount: 0,
        isConsumed: false,
      });

      // Send Email verification code via Resend
      await sendSignupOtpEmail({
        to: cleanEmail,
        name: 'Delivery Partner Applicant',
        otp: rawOtp,
        expiryMinutes: 10,
      });

      return res.status(200).json({
        success: true,
        message: 'Verification code sent successfully to your email address.',
        data: {
          challengeToken: rawChallengeToken,
          destination: maskEmail(cleanEmail),
          channel: 'email',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/delivery/onboarding/otp/verify
   * Verifies email OTP for applicant registration
   */
  static async verifyOtp(req, res, next) {
    try {
      const { challengeToken, otp } = req.body;

      if (!challengeToken || typeof challengeToken !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Challenge token is required for verification.',
        });
      }

      if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid 6-digit verification code.',
        });
      }

      const activeEnv = validateEnv();
      const challengeTokenHash = hashChallengeToken(challengeToken.trim());

      const challenge = await OtpChallenge.findOne({ challengeTokenHash }).select('+otpHash');

      if (!challenge) {
        return res.status(404).json({
          success: false,
          message: 'Verification challenge expired or invalid. Please request a new code.',
        });
      }

      if (challenge.isConsumed) {
        return res.status(400).json({
          success: false,
          message: 'This verification code has already been used. Please request a fresh code.',
        });
      }

      if (new Date() > new Date(challenge.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired. Please request a new code.',
        });
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        return res.status(429).json({
          success: false,
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        });
      }

      const isValid = verifyOtpHash(otp.trim(), challenge.otpHash, activeEnv.otpHashSecret);
      if (!isValid) {
        challenge.attempts += 1;
        await challenge.save();
        const remaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
        return res.status(400).json({
          success: false,
          message: `Incorrect verification code. ${remaining} attempts remaining.`,
          data: { attemptsRemaining: remaining },
        });
      }

      // Mark challenge consumed
      challenge.isConsumed = true;
      await challenge.save();

      return res.status(200).json({
        success: true,
        message: 'Email address verified successfully.',
        data: {
          verified: true,
          email: challenge.identifier,
          emailVerificationToken: challengeToken.trim(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/delivery/onboarding/upload-document
   * Uploads verification document (JPG, PNG, PDF up to 10MB) to Cloudinary
   */
  static async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No document file uploaded. Please select a valid document (JPG, PNG, PDF).',
        });
      }

      const category = req.body?.category || req.query?.category || 'document';
      const uploadedDoc = await uploadDocumentToCloudinary(req.file, category);

      return res.status(200).json({
        success: true,
        message: 'Document uploaded successfully.',
        data: uploadedDoc,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/delivery/onboarding/submit
   * Submits full multi-step delivery partner application
   */
  static async submitApplication(req, res, next) {
    try {
      const {
        personalInfo,
        address,
        vehicleInfo,
        documents,
        termsAccepted,
        emailVerificationToken,
        phoneVerificationToken,
      } = req.body;

      // 1. Validate Terms
      if (!termsAccepted) {
        return res.status(400).json({
          success: false,
          message: 'You must accept the BentoBabu Delivery Partner Terms & Conditions to apply.',
        });
      }

      // 2. Validate Personal Info
      if (!personalInfo || typeof personalInfo !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Personal details are required.',
        });
      }

      const fullName = (personalInfo.fullName || '').trim();
      const phone = normalizePhone(personalInfo.phone);
      const email = (personalInfo.email || '').trim().toLowerCase();
      const password = personalInfo.password || '';
      const dateOfBirth = personalInfo.dateOfBirth;
      const gender = (personalInfo.gender || 'MALE').toUpperCase();

      if (!fullName) {
        return res.status(400).json({ success: false, message: 'Full name is required.' });
      }
      if (!phone || !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required.' });
      }
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Valid email address is required.' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
      }
      if (!dateOfBirth) {
        return res.status(400).json({ success: false, message: 'Date of birth is required.' });
      }

      // 3. Validate Address
      if (!address || typeof address !== 'object') {
        return res.status(400).json({ success: false, message: 'Address details are required.' });
      }
      const { houseNo, street, city, state, pincode, landmark = '' } = address;
      if (!houseNo || !street || !city || !state || !pincode) {
        return res.status(400).json({ success: false, message: 'All address fields (House/Flat, Street, City, State, PIN) are required.' });
      }
      if (!/^\d{6}$/.test(String(pincode).trim())) {
        return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit PIN code.' });
      }

      // 4. Validate Vehicle Info
      if (!vehicleInfo || !vehicleInfo.vehicleType) {
        return res.status(400).json({ success: false, message: 'Vehicle information is required.' });
      }
      const vehicleType = vehicleInfo.vehicleType.toUpperCase();
      const isBicycle = vehicleType === 'BICYCLE';

      if (!isBicycle) {
        if (!vehicleInfo.registrationNumber || !vehicleInfo.drivingLicenseNumber) {
          return res.status(400).json({
            success: false,
            message: 'Vehicle registration number and driving license number are required for motorized vehicles.',
          });
        }
      }

      // 5. Validate Documents
      if (!documents || typeof documents !== 'object') {
        return res.status(400).json({ success: false, message: 'Verification documents are required.' });
      }
      if (!documents.profilePhoto?.secureUrl) {
        return res.status(400).json({ success: false, message: 'Profile photo is required.' });
      }
      if (!documents.idProof?.document?.secureUrl) {
        return res.status(400).json({ success: false, message: 'Government ID proof is required.' });
      }
      if (!isBicycle && !documents.drivingLicense?.secureUrl) {
        return res.status(400).json({ success: false, message: 'Driving license document is required for motorized vehicles.' });
      }

      // 6. Validate Email Verification Token
      const verificationToken = emailVerificationToken || phoneVerificationToken;
      if (verificationToken) {
        const challengeTokenHash = hashChallengeToken(verificationToken.trim());
        const challenge = await OtpChallenge.findOne({ challengeTokenHash });
        if (challenge && challenge.identifier !== email && challenge.identifier !== phone) {
          return res.status(400).json({
            success: false,
            message: 'Verification token does not match the submitted email address.',
          });
        }
      }

      // 7. Find or Create User Account
      let user = await User.findOne({ $or: [{ phone }, { email }] });
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      if (user) {
        // If user already active delivery partner
        if (user.role === 'DELIVERY' && user.isActive) {
          return res.status(400).json({
            success: false,
            message: 'An active delivery partner account already exists with these credentials. Please log in.',
          });
        }

        // Update user record
        user.name = fullName;
        user.email = email;
        user.phone = phone;
        user.password = hashedPassword;
        user.role = 'DELIVERY';
        user.isActive = false; // Strictly inactive until admin approves
        user.isEmailVerified = true;
        user.isPhoneVerified = true;
        if (documents.profilePhoto?.secureUrl) {
          user.profileImage = documents.profilePhoto.secureUrl;
        }
        await user.save();
      } else {
        user = await User.create({
          name: fullName,
          email,
          phone,
          password: hashedPassword,
          role: 'DELIVERY',
          isActive: false, // Strictly inactive until admin approves
          isEmailVerified: true,
          isPhoneVerified: true,
          profileImage: documents.profilePhoto?.secureUrl || null,
        });
      }

      // 8. Generate Unique Application Number
      const timestampPart = Date.now().toString().slice(-6);
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const applicationNumber = `BBD-${timestampPart}-${randomPart}`;

      // 9. Create DeliveryApplication Record
      const application = await DeliveryApplication.create({
        applicationNumber,
        user: user._id,
        personalInfo: {
          fullName,
          phone,
          email,
          dateOfBirth: new Date(dateOfBirth),
          gender,
        },
        address: {
          houseNo: houseNo.trim(),
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: String(pincode).trim(),
          landmark: landmark ? landmark.trim() : '',
        },
        vehicleInfo: {
          vehicleType,
          brand: vehicleInfo.brand ? vehicleInfo.brand.trim() : '',
          model: vehicleInfo.model ? vehicleInfo.model.trim() : '',
          registrationNumber: vehicleInfo.registrationNumber ? vehicleInfo.registrationNumber.trim().toUpperCase() : '',
          drivingLicenseNumber: vehicleInfo.drivingLicenseNumber ? vehicleInfo.drivingLicenseNumber.trim().toUpperCase() : '',
        },
        documents: {
          profilePhoto: documents.profilePhoto,
          idProof: {
            idType: documents.idProof?.idType || 'AADHAAR',
            document: documents.idProof?.document,
          },
          drivingLicense: documents.drivingLicense || null,
          registrationCertificate: documents.registrationCertificate || null,
          insurance: documents.insurance || null,
        },
        status: 'PENDING_APPROVAL',
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        history: [
          {
            status: 'PENDING_APPROVAL',
            action: 'APPLICATION_SUBMITTED',
            performedBy: user._id,
            note: 'Application submitted by candidate.',
            timestamp: new Date(),
          },
        ],
      });

      // 10. Dispatch Notification
      try {
        await NotificationDispatcher.dispatch({
          userId: user._id,
          eventType: 'DELIVERY_APPLICATION_SUBMITTED',
          metadata: {
            applicationNumber,
            fullName,
          },
        });
      } catch (notifyErr) {
        console.warn('[DeliveryOnboarding] Notification dispatch non-fatal error:', notifyErr.message);
      }

      return res.status(201).json({
        success: true,
        message: 'Your BentoBabu delivery partner application has been submitted successfully! Our team will review your application within 24 to 48 hours.',
        data: {
          applicationNumber: application.applicationNumber,
          status: application.status,
          applicantName: fullName,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/delivery/onboarding/status
   * Checks applicant status using applicationNumber, mobile phone, or email
   */
  static async getApplicationStatus(req, res, next) {
    try {
      const { identifier } = req.query;

      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an Application Reference ID, registered phone number, or email address.',
        });
      }

      const cleanInput = identifier.trim();
      const cleanPhone = normalizePhone(cleanInput);
      const cleanEmail = cleanInput.toLowerCase();

      const queryConditions = [
        { applicationNumber: cleanInput.toUpperCase() },
      ];

      if (cleanPhone && cleanPhone.length === 10) {
        queryConditions.push({ 'personalInfo.phone': cleanPhone });
      }

      if (cleanEmail && /^\S+@\S+\.\S+$/.test(cleanEmail)) {
        queryConditions.push({ 'personalInfo.email': cleanEmail });
      }

      const application = await DeliveryApplication.findOne({ $or: queryConditions })
        .sort({ createdAt: -1 })
        .populate('user', 'isActive isEmailVerified isPhoneVerified role');

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'No delivery partner application found matching your details. Please check your reference ID or register for an account.',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          applicationNumber: application.applicationNumber,
          status: application.status,
          applicantName: application.personalInfo.fullName,
          maskedPhone: maskPhoneNumber(application.personalInfo.phone),
          maskedEmail: maskEmail(application.personalInfo.email),
          vehicleType: application.vehicleInfo.vehicleType,
          appliedAt: application.createdAt,
          reviewedAt: application.reviewedAt,
          rejectionReason: application.rejectionReason,
          requestedCorrections: application.requestedCorrections,
          userActive: Boolean(application.user?.isActive),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = DeliveryOnboardingController;
