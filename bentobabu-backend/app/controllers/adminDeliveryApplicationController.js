const { DeliveryApplication, User } = require('../models');
const NotificationDispatcher = require('../utils/notificationDispatcher');
const { generateSignedDocumentUrl } = require('../config/cloudinary');

class AdminDeliveryApplicationController {
  /**
   * GET /api/v1/admin/delivery-applications
   * Lists applications with filtering, search, pagination, and KPI counts
   */
  static async listApplications(req, res, next) {
    try {
      const {
        status,
        search,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        order = 'desc',
      } = req.query;

      const filter = {};

      if (status && status !== 'ALL') {
        filter.status = status;
      }

      if (search && search.trim()) {
        const queryRegex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { applicationNumber: queryRegex },
          { 'personalInfo.fullName': queryRegex },
          { 'personalInfo.phone': queryRegex },
          { 'personalInfo.email': queryRegex },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const skip = (pageNum - 1) * limitNum;
      const sortOrder = order === 'asc' ? 1 : -1;

      const [applications, total, counts] = await Promise.all([
        DeliveryApplication.find(filter)
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limitNum)
          .populate('user', 'name email phone isActive')
          .populate('reviewedBy', 'name email')
          .lean(),
        DeliveryApplication.countDocuments(filter),
        DeliveryApplication.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const stats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        correctionsRequested: 0,
        suspended: 0,
      };

      counts.forEach((c) => {
        stats.total += c.count;
        if (c._id === 'PENDING_APPROVAL' || c._id === 'PENDING_VERIFICATION') {
          stats.pending += c.count;
        } else if (c._id === 'APPROVED') {
          stats.approved += c.count;
        } else if (c._id === 'REJECTED') {
          stats.rejected += c.count;
        } else if (c._id === 'CORRECTIONS_REQUESTED') {
          stats.correctionsRequested += c.count;
        } else if (c._id === 'SUSPENDED') {
          stats.suspended += c.count;
        }
      });

      return res.status(200).json({
        success: true,
        data: applications,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
        stats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/delivery-applications/:id
   * Retrieves full single application details with short-lived signed URLs for documents
   */
  static async getApplicationById(req, res, next) {
    try {
      const { id } = req.params;

      const application = await DeliveryApplication.findById(id)
        .populate('user', 'name email phone isActive isPhoneVerified profileImage createdAt')
        .populate('reviewedBy', 'name email')
        .populate('history.performedBy', 'name email');

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      const appObj = application.toObject();

      const signDoc = (doc) => {
        if (!doc) return doc;
        if (doc.publicId) {
          const isPdf = doc.mimeType === 'application/pdf';
          const signedUrl = generateSignedDocumentUrl(doc.publicId, {
            resourceType: isPdf ? 'auto' : 'image',
            type: doc.storageType || 'authenticated',
            expiresInSeconds: 900, // 15 minutes
          });
          return {
            ...doc,
            secureUrl: signedUrl || doc.secureUrl,
            signedUrl: signedUrl || doc.secureUrl,
          };
        }
        return doc;
      };

      if (appObj.documents) {
        if (appObj.documents.profilePhoto) {
          appObj.documents.profilePhoto = signDoc(appObj.documents.profilePhoto);
        }
        if (appObj.documents.idProof?.document) {
          appObj.documents.idProof.document = signDoc(appObj.documents.idProof.document);
        }
        if (appObj.documents.drivingLicense) {
          appObj.documents.drivingLicense = signDoc(appObj.documents.drivingLicense);
        }
        if (appObj.documents.registrationCertificate) {
          appObj.documents.registrationCertificate = signDoc(appObj.documents.registrationCertificate);
        }
        if (appObj.documents.insurance) {
          appObj.documents.insurance = signDoc(appObj.documents.insurance);
        }
      }

      return res.status(200).json({
        success: true,
        data: appObj,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/delivery-applications/:id/documents/:documentKey
   * Admin-only endpoint to access a short-lived signed URL for a specific document
   */
  static async getDocumentSignedUrl(req, res, next) {
    try {
      const { id, documentKey } = req.params;
      const allowedKeys = [
        'profilePhoto',
        'idProof',
        'drivingLicense',
        'registrationCertificate',
        'insurance',
      ];
      if (!allowedKeys.includes(documentKey)) {
        return res.status(400).json({
          success: false,
          message: `Invalid document key. Allowed keys: ${allowedKeys.join(', ')}`,
        });
      }

      const application = await DeliveryApplication.findById(id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      let targetDoc = null;
      if (documentKey === 'idProof') {
        targetDoc = application.documents?.idProof?.document;
      } else {
        targetDoc = application.documents?.[documentKey];
      }

      if (!targetDoc || (!targetDoc.publicId && !targetDoc.secureUrl)) {
        return res.status(404).json({
          success: false,
          message: 'Requested document has not been uploaded for this application.',
        });
      }

      const isPdf = targetDoc.mimeType === 'application/pdf';
      const signedUrl = targetDoc.publicId
        ? generateSignedDocumentUrl(targetDoc.publicId, {
            resourceType: isPdf ? 'auto' : 'image',
            type: targetDoc.storageType || 'authenticated',
            expiresInSeconds: 900,
          })
        : targetDoc.secureUrl;

      if (req.query.redirect === 'true') {
        return res.redirect(302, signedUrl);
      }

      return res.status(200).json({
        success: true,
        data: {
          documentKey,
          fileName: targetDoc.fileName,
          mimeType: targetDoc.mimeType,
          expiresInSeconds: 900,
          signedUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/admin/delivery-applications/:id/approve
   * Approves delivery partner application and activates user account
   */
  static async approveApplication(req, res, next) {
    try {
      const { id } = req.params;
      const { note } = req.body;

      const application = await DeliveryApplication.findById(id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      if (application.status === 'APPROVED') {
        return res.status(400).json({
          success: false,
          message: 'Application is already approved.',
        });
      }

      // Update application
      application.status = 'APPROVED';
      application.reviewedBy = req.user._id;
      application.reviewedAt = new Date();
      application.rejectionReason = null;
      application.requestedCorrections = null;

      application.history.push({
        status: 'APPROVED',
        action: 'APPLICATION_APPROVED',
        performedBy: req.user._id,
        note: note ? note.trim() : 'Application approved by administrator.',
        timestamp: new Date(),
      });

      await application.save();

      // Activate User Account with DELIVERY role
      await User.findByIdAndUpdate(application.user, {
        $set: {
          role: 'DELIVERY',
          isActive: true,
          isPhoneVerified: true,
        },
      });

      // Dispatch Notification
      try {
        await NotificationDispatcher.dispatch({
          userId: application.user,
          eventType: 'DELIVERY_APPLICATION_APPROVED',
          metadata: {
            applicationNumber: application.applicationNumber,
            fullName: application.personalInfo.fullName,
          },
        });
      } catch (notifyErr) {
        console.warn('[AdminDelivery] Notification error:', notifyErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Delivery partner application #${application.applicationNumber} approved successfully. Partner account is now active.`,
        data: application,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/admin/delivery-applications/:id/reject
   * Rejects delivery partner application with mandatory reason
   */
  static async rejectApplication(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a clear rejection reason (minimum 5 characters).',
        });
      }

      const application = await DeliveryApplication.findById(id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      application.status = 'REJECTED';
      application.rejectionReason = reason.trim();
      application.reviewedBy = req.user._id;
      application.reviewedAt = new Date();

      application.history.push({
        status: 'REJECTED',
        action: 'APPLICATION_REJECTED',
        performedBy: req.user._id,
        note: reason.trim(),
        timestamp: new Date(),
      });

      await application.save();

      // Deactivate User
      await User.findByIdAndUpdate(application.user, {
        $set: { isActive: false },
      });

      // Dispatch Notification
      try {
        await NotificationDispatcher.dispatch({
          userId: application.user,
          eventType: 'DELIVERY_APPLICATION_REJECTED',
          metadata: {
            applicationNumber: application.applicationNumber,
            fullName: application.personalInfo.fullName,
            reason: reason.trim(),
          },
        });
      } catch (notifyErr) {
        console.warn('[AdminDelivery] Notification error:', notifyErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Application #${application.applicationNumber} has been rejected.`,
        data: application,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/admin/delivery-applications/:id/request-corrections
   * Requests specific document or detail corrections from applicant
   */
  static async requestCorrections(req, res, next) {
    try {
      const { id } = req.params;
      const { corrections } = req.body;

      if (!corrections || typeof corrections !== 'string' || corrections.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Please specify the exact corrections or documents required (minimum 5 characters).',
        });
      }

      const application = await DeliveryApplication.findById(id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      application.status = 'CORRECTIONS_REQUESTED';
      application.requestedCorrections = corrections.trim();
      application.reviewedBy = req.user._id;
      application.reviewedAt = new Date();

      application.history.push({
        status: 'CORRECTIONS_REQUESTED',
        action: 'CORRECTIONS_REQUESTED',
        performedBy: req.user._id,
        note: corrections.trim(),
        timestamp: new Date(),
      });

      await application.save();

      // Dispatch Notification
      try {
        await NotificationDispatcher.dispatch({
          userId: application.user,
          eventType: 'DELIVERY_APPLICATION_CORRECTIONS_REQUESTED',
          metadata: {
            applicationNumber: application.applicationNumber,
            fullName: application.personalInfo.fullName,
            reason: corrections.trim(),
          },
        });
      } catch (notifyErr) {
        console.warn('[AdminDelivery] Notification error:', notifyErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Corrections requested for application #${application.applicationNumber}.`,
        data: application,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/admin/delivery-applications/:id/suspend
   * Suspends an approved delivery partner
   */
  static async suspendPartner(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const application = await DeliveryApplication.findById(id);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Delivery partner application not found.',
        });
      }

      application.status = 'SUSPENDED';
      application.rejectionReason = reason ? reason.trim() : 'Account suspended by administrator.';
      application.reviewedBy = req.user._id;
      application.reviewedAt = new Date();

      application.history.push({
        status: 'SUSPENDED',
        action: 'PARTNER_SUSPENDED',
        performedBy: req.user._id,
        note: reason ? reason.trim() : 'Account suspended by administrator.',
        timestamp: new Date(),
      });

      await application.save();

      // Deactivate User
      await User.findByIdAndUpdate(application.user, {
        $set: { isActive: false },
      });

      return res.status(200).json({
        success: true,
        message: `Delivery partner #${application.applicationNumber} suspended.`,
        data: application,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AdminDeliveryApplicationController;
