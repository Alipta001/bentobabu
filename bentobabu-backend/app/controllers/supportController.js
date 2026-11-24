const mongoose = require('mongoose');
const { SupportTicket, SupportFaq, Order, User, SystemSetting } = require('../models');
const { sanitizeText, generateTicketNumber } = require('../utils/sanitizer');
const { uploadDocumentToCloudinary } = require('../utils/documentUploader');
const NotificationDispatcher = require('../utils/notificationDispatcher');

class SupportController {
  /**
   * GET /api/v1/support/config
   * Public: returns verified contact details and ticket categories
   */
  static async getSupportConfig(req, res, next) {
    try {
      res.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      });

      const AdminSettingsController = require('./adminSettingsController');
      const settings = await AdminSettingsController.getAllMergedSettings();

      const email = settings.SUPPORT_EMAIL || 'bentobabuofficial@gmail.com';
      const phone = settings.SUPPORT_PHONE || '+91 8584085669';
      const whatsapp = settings.SUPPORT_WHATSAPP || settings.SUPPORT_PHONE || '+91 8584085669';
      const operatingHours = settings.SUPPORT_HOURS || `${settings.OPENING_TIME || '10:00'} - ${settings.CLOSING_TIME || '22:00'} (Daily)`;
      const address = settings.BUSINESS_ADDRESS || settings.KITCHEN_ADDRESS || 'Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India';

      const isWhatsAppConfigured = Boolean(
        whatsapp || (process.env.WHATSAPP_ENABLED === 'true' && process.env.WHATSAPP_PHONE_NUMBER_ID)
      );

      return res.status(200).json({
        success: true,
        data: {
          email,
          phone,
          whatsapp: isWhatsAppConfigured ? (whatsapp || phone) : null,
          isWhatsAppConfigured,
          address,
          operatingHours,
          categories: [
            { key: 'ORDER_ISSUE', label: 'Order Issue', description: 'Delays, wrong items, packaging issues' },
            { key: 'PAYMENT_ISSUE', label: 'Payment Issue', description: 'Failed charges, double billing, refund status' },
            { key: 'DELIVERY_ISSUE', label: 'Delivery Issue', description: 'Rider coordination, location, instructions' },
            { key: 'MISSING_INCORRECT_ITEM', label: 'Missing or Incorrect Item', description: 'Dish missing or substituted wrongly' },
            { key: 'FOOD_QUALITY', label: 'Food Quality Concern', description: 'Taste, temperature, portion size, freshness' },
            { key: 'REFUND_REQUEST', label: 'Refund Request', description: 'Cancelation refunds and payment returns' },
            { key: 'ACCOUNT_ISSUE', label: 'Account Issue', description: 'Login, address management, credentials' },
            { key: 'OTHER', label: 'Other', description: 'General feedback, compliments, partnerships' },
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/support/faqs
   * Public: returns published FAQs optionally filtered by category
   */
  static async getFaqs(req, res, next) {
    try {
      const { category } = req.query;
      const filter = { isPublished: true };

      if (category && typeof category === 'string' && category.trim()) {
        filter.category = category.trim().toUpperCase();
      }

      const faqs = await SupportFaq.find(filter)
        .sort({ category: 1, orderIndex: 1, createdAt: 1 })
        .lean();

      return res.status(200).json({
        success: true,
        count: faqs.length,
        data: faqs.map((f) => ({
          id: f._id.toString(),
          question: f.question,
          answer: f.answer,
          category: f.category,
          helpfulCount: f.helpfulCount || 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/support/upload
   * Authenticated: upload screenshot/PDF attachment for a ticket
   */
  static async uploadAttachment(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a file to upload.',
        });
      }

      const uploadResult = await uploadDocumentToCloudinary(req.file, 'support-attachment');

      return res.status(200).json({
        success: true,
        message: 'Attachment uploaded successfully',
        data: {
          url: uploadResult.secureUrl,
          fileName: uploadResult.fileName,
          mimeType: uploadResult.mimeType,
          sizeBytes: uploadResult.sizeBytes,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/support/tickets
   * Authenticated Customer: create new support ticket
   */
  static async createTicket(req, res, next) {
    try {
      const { subject, category, description, orderId, attachments } = req.body || {};

      if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Subject is required and must be at least 3 characters.',
        });
      }

      if (!category || typeof category !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Category is required.',
        });
      }

      const validCategories = [
        'ORDER_ISSUE',
        'PAYMENT_ISSUE',
        'DELIVERY_ISSUE',
        'MISSING_INCORRECT_ITEM',
        'FOOD_QUALITY',
        'REFUND_REQUEST',
        'ACCOUNT_ISSUE',
        'OTHER',
      ];

      const cleanCategory = category.trim().toUpperCase();
      if (!validCategories.includes(cleanCategory)) {
        return res.status(400).json({
          success: false,
          message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        });
      }

      if (!description || typeof description !== 'string' || description.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Description is required and must be at least 10 characters.',
        });
      }

      // Order ownership validation
      let validatedOrderId = null;
      if (orderId) {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid order ID format.',
          });
        }

        const order = await Order.findById(orderId).lean();
        if (!order) {
          return res.status(404).json({
            success: false,
            message: 'Specified order was not found.',
          });
        }

        // Must be the owner of the order
        if (order.user.toString() !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'You can only link support tickets to your own orders.',
          });
        }

        validatedOrderId = order._id;
      }

      // Validate attachments if present
      let cleanAttachments = [];
      if (Array.isArray(attachments)) {
        if (attachments.length > 5) {
          return res.status(400).json({
            success: false,
            message: 'Maximum 5 attachments allowed per ticket.',
          });
        }
        cleanAttachments = attachments
          .filter((att) => att && typeof att.url === 'string' && att.url.trim())
          .map((att) => ({
            url: att.url.trim(),
            fileName: (att.fileName || 'attachment').toString().slice(0, 100),
            mimeType: (att.mimeType || 'image/jpeg').toString().slice(0, 50),
            sizeBytes: Number(att.sizeBytes) || 0,
          }));
      }

      const sanitizedSubject = sanitizeText(subject.trim().slice(0, 150));
      const sanitizedDescription = sanitizeText(description.trim().slice(0, 3000));

      let ticket = null;
      let attempts = 0;

      while (!ticket && attempts < 5) {
        attempts++;
        const ticketNumber = generateTicketNumber();
        try {
          ticket = await SupportTicket.create({
            ticketNumber,
            user: req.user.id,
            order: validatedOrderId,
            category: cleanCategory,
            subject: sanitizedSubject,
            description: sanitizedDescription,
            attachments: cleanAttachments,
            status: 'OPEN',
            priority: cleanCategory === 'FOOD_QUALITY' || cleanCategory === 'REFUND_REQUEST' ? 'HIGH' : 'MEDIUM',
            messages: [
              {
                sender: req.user.id,
                senderRole: 'CUSTOMER',
                message: sanitizedDescription,
                attachments: cleanAttachments,
                isInternalNote: false,
                createdAt: new Date(),
              },
            ],
            lastMessageAt: new Date(),
          });
        } catch (createErr) {
          if (createErr.code === 11000) {
            continue; // retry with new ticket number
          }
          throw createErr;
        }
      }

      if (!ticket) {
        throw new Error('Could not generate unique ticket number after multiple attempts.');
      }

      // Dispatch customer confirmation notification
      NotificationDispatcher.dispatch({
        userId: req.user.id,
        orderId: validatedOrderId,
        eventType: 'SUPPORT_TICKET_CREATED',
        metadata: {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
        },
      }).catch((e) => console.error('[Notification] SUPPORT_TICKET_CREATED dispatch error:', e.message));

      const responseTicket = ticket.toJSON();
      delete responseTicket.resolutionNote;
      responseTicket.messages = (responseTicket.messages || []).filter((m) => !m.isInternalNote);

      return res.status(201).json({
        success: true,
        message: 'Support ticket submitted successfully. We will reply shortly.',
        data: responseTicket,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/support/tickets
   * Authenticated Customer: list my submitted tickets
   */
  static async getMyTickets(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const query = { user: req.user.id };

      if (req.query.status && typeof req.query.status === 'string' && req.query.status !== 'ALL') {
        query.status = req.query.status.trim().toUpperCase();
      }

      const [tickets, total] = await Promise.all([
        SupportTicket.find(query)
          .populate('order', 'orderNumber orderStatus grandTotal createdAt')
          .sort({ lastMessageAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SupportTicket.countDocuments(query),
      ]);

      const sanitizedTickets = tickets.map((t) => {
        // Strip internal notes and messages summary
        const publicMessages = (t.messages || []).filter((m) => !m.isInternalNote);
        const lastMessage = publicMessages[publicMessages.length - 1] || null;

        return {
          id: t._id.toString(),
          ticketNumber: t.ticketNumber,
          category: t.category,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          order: t.order
            ? {
                id: t.order._id.toString(),
                orderNumber: t.order.orderNumber,
                orderStatus: t.order.orderStatus,
                grandTotal: t.order.grandTotal,
              }
            : null,
          messageCount: publicMessages.length,
          lastMessageSnippet: lastMessage ? lastMessage.message.slice(0, 100) : t.description.slice(0, 100),
          lastMessageAt: t.lastMessageAt || t.updatedAt,
          createdAt: t.createdAt,
        };
      });

      return res.status(200).json({
        success: true,
        count: sanitizedTickets.length,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        data: sanitizedTickets,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/support/tickets/:id
   * Authenticated Customer: get full ticket details & thread (with internal notes stripped)
   */
  static async getTicketById(req, res, next) {
    try {
      const { id } = req.params;

      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : { ticketNumber: id.trim() };

      const ticket = await SupportTicket.findOne(query)
        .populate('order', 'orderNumber orderStatus grandTotal createdAt items')
        .populate('assignedTo', 'name email')
        .populate('messages.sender', 'name role')
        .lean();

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found.',
        });
      }

      // Security check: Must be owner
      if (ticket.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own support tickets.',
        });
      }

      // CRITICAL SECURITY REQUIREMENT:
      // Strip internal notes so customer cannot see them under any circumstances
      const publicMessages = (ticket.messages || [])
        .filter((m) => !m.isInternalNote)
        .map((m) => ({
          id: m._id ? m._id.toString() : undefined,
          senderName: m.sender?.name || (m.senderRole === 'ADMIN' ? 'BentoBabu Support' : 'You'),
          senderRole: m.senderRole,
          message: m.message,
          attachments: m.attachments || [],
          createdAt: m.createdAt,
        }));

      return res.status(200).json({
        success: true,
        data: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          category: ticket.category,
          subject: ticket.subject,
          description: ticket.description,
          attachments: ticket.attachments || [],
          status: ticket.status,
          priority: ticket.priority,
          order: ticket.order
            ? {
                id: ticket.order._id.toString(),
                orderNumber: ticket.order.orderNumber,
                orderStatus: ticket.order.orderStatus,
                grandTotal: ticket.order.grandTotal,
                createdAt: ticket.order.createdAt,
                itemCount: ticket.order.items?.length || 0,
              }
            : null,
          messages: publicMessages,
          createdAt: ticket.createdAt,
          lastMessageAt: ticket.lastMessageAt || ticket.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/support/tickets/:id/messages
   * Authenticated Customer: reply to an open ticket
   */
  static async replyToTicket(req, res, next) {
    try {
      const { id } = req.params;
      const { message, attachments } = req.body || {};

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Message content is required.',
        });
      }

      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : { ticketNumber: id.trim() };

      const ticket = await SupportTicket.findOne(query);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found.',
        });
      }

      // Security check: Must be owner
      if (ticket.user.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only reply to your own tickets.',
        });
      }

      if (ticket.status === 'CLOSED') {
        return res.status(400).json({
          success: false,
          message: 'This ticket is closed and cannot receive further replies. Please open a new ticket if you still need help.',
        });
      }

      let cleanAttachments = [];
      if (Array.isArray(attachments)) {
        cleanAttachments = attachments
          .filter((att) => att && typeof att.url === 'string' && att.url.trim())
          .map((att) => ({
            url: att.url.trim(),
            fileName: (att.fileName || 'attachment').toString().slice(0, 100),
            mimeType: (att.mimeType || 'image/jpeg').toString().slice(0, 50),
            sizeBytes: Number(att.sizeBytes) || 0,
          }));
      }

      const sanitizedMsg = sanitizeText(message.trim().slice(0, 3000));

      const newMsg = {
        sender: req.user.id,
        senderRole: 'CUSTOMER',
        message: sanitizedMsg,
        attachments: cleanAttachments,
        isInternalNote: false,
        createdAt: new Date(),
      };

      ticket.messages.push(newMsg);
      ticket.lastMessageAt = new Date();

      // If waiting for customer or resolved, reopen back to IN_PROGRESS
      if (ticket.status === 'WAITING_FOR_CUSTOMER' || ticket.status === 'RESOLVED') {
        ticket.status = 'IN_PROGRESS';
      }

      await ticket.save();

      // Return public messages only
      const publicMessages = ticket.messages
        .filter((m) => !m.isInternalNote)
        .map((m) => ({
          id: m._id.toString(),
          senderRole: m.senderRole,
          message: m.message,
          attachments: m.attachments || [],
          createdAt: m.createdAt,
        }));

      return res.status(200).json({
        success: true,
        message: 'Reply sent successfully.',
        data: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          lastMessageAt: ticket.lastMessageAt,
          newMessage: {
            id: newMsg._id ? newMsg._id.toString() : undefined,
            senderRole: newMsg.senderRole,
            message: newMsg.message,
            createdAt: newMsg.createdAt,
          },
          messages: publicMessages,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SupportController;
