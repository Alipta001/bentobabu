const mongoose = require('mongoose');
const { SupportTicket, SupportFaq, User, Order } = require('../models');
const { sanitizeText } = require('../utils/sanitizer');
const NotificationDispatcher = require('../utils/notificationDispatcher');

class AdminSupportController {
  /**
   * GET /api/v1/admin/support/stats
   * Admin: Summary statistics of all support tickets
   */
  static async getStats(req, res, next) {
    try {
      const [total, open, inProgress, waitingForCustomer, resolved, closed] = await Promise.all([
        SupportTicket.countDocuments(),
        SupportTicket.countDocuments({ status: 'OPEN' }),
        SupportTicket.countDocuments({ status: 'IN_PROGRESS' }),
        SupportTicket.countDocuments({ status: 'WAITING_FOR_CUSTOMER' }),
        SupportTicket.countDocuments({ status: 'RESOLVED' }),
        SupportTicket.countDocuments({ status: 'CLOSED' }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          total,
          open,
          inProgress,
          waitingForCustomer,
          resolved,
          closed,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/support/tickets
   * Admin: List all tickets with filtering, search and pagination
   */
  static async getAllTickets(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
      const skip = (page - 1) * limit;

      const { status, category, priority, search } = req.query;
      const query = {};

      if (status && status !== 'ALL') {
        query.status = status.trim().toUpperCase();
      }

      if (category && category !== 'ALL') {
        query.category = category.trim().toUpperCase();
      }

      if (priority && priority !== 'ALL') {
        query.priority = priority.trim().toUpperCase();
      }

      if (search && typeof search === 'string' && search.trim()) {
        const cleanSearch = search.trim();
        const searchRegex = new RegExp(cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // Look up matching users first
        const matchingUsers = await User.find({
          $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }],
        })
          .select('_id')
          .lean();

        const userIds = matchingUsers.map((u) => u._id);

        query.$or = [
          { ticketNumber: searchRegex },
          { subject: searchRegex },
          { user: { $in: userIds } },
        ];
      }

      const [tickets, total] = await Promise.all([
        SupportTicket.find(query)
          .populate('user', 'name email phone')
          .populate('assignedTo', 'name email')
          .populate('order', 'orderNumber orderStatus grandTotal createdAt')
          .sort({ lastMessageAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SupportTicket.countDocuments(query),
      ]);

      const formattedTickets = tickets.map((t) => {
        const totalMessages = t.messages?.length || 0;
        const internalNotesCount = (t.messages || []).filter((m) => m.isInternalNote).length;
        const lastMsg = t.messages?.[totalMessages - 1] || null;

        return {
          id: t._id.toString(),
          ticketNumber: t.ticketNumber,
          category: t.category,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          customer: t.user
            ? {
                id: t.user._id.toString(),
                name: t.user.name,
                email: t.user.email,
                phone: t.user.phone,
              }
            : null,
          assignedTo: t.assignedTo
            ? {
                id: t.assignedTo._id.toString(),
                name: t.assignedTo.name,
                email: t.assignedTo.email,
              }
            : null,
          order: t.order
            ? {
                id: t.order._id.toString(),
                orderNumber: t.order.orderNumber,
                orderStatus: t.order.orderStatus,
                grandTotal: t.order.grandTotal,
              }
            : null,
          messageCount: totalMessages,
          internalNotesCount,
          lastMessageSnippet: lastMsg ? lastMsg.message.slice(0, 100) : t.description.slice(0, 100),
          lastMessageAt: t.lastMessageAt || t.updatedAt,
          createdAt: t.createdAt,
        };
      });

      return res.status(200).json({
        success: true,
        count: formattedTickets.length,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        data: formattedTickets,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/support/tickets/:id
   * Admin: Get full ticket detail including all internal notes and conversation history
   */
  static async getTicketById(req, res, next) {
    try {
      const { id } = req.params;

      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : { ticketNumber: id.trim() };

      const ticket = await SupportTicket.findOne(query)
        .populate('user', 'name email phone isActive createdAt')
        .populate('assignedTo', 'name email')
        .populate('order')
        .populate('messages.sender', 'name role email')
        .lean();

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found.',
        });
      }

      const formattedMessages = (ticket.messages || []).map((m) => ({
        id: m._id ? m._id.toString() : undefined,
        senderId: m.sender?._id?.toString() || m.sender?.toString(),
        senderName: m.sender?.name || (m.senderRole === 'ADMIN' ? 'Support Staff' : 'Customer'),
        senderRole: m.senderRole,
        message: m.message,
        attachments: m.attachments || [],
        isInternalNote: Boolean(m.isInternalNote),
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
          customer: ticket.user
            ? {
                id: ticket.user._id.toString(),
                name: ticket.user.name,
                email: ticket.user.email,
                phone: ticket.user.phone,
                isActive: ticket.user.isActive,
                createdAt: ticket.user.createdAt,
              }
            : null,
          assignedTo: ticket.assignedTo
            ? {
                id: ticket.assignedTo._id.toString(),
                name: ticket.assignedTo.name,
                email: ticket.assignedTo.email,
              }
            : null,
          order: ticket.order
            ? {
                id: ticket.order._id.toString(),
                orderNumber: ticket.order.orderNumber,
                orderStatus: ticket.order.orderStatus,
                paymentStatus: ticket.order.paymentStatus,
                paymentMethod: ticket.order.paymentMethod,
                grandTotal: ticket.order.grandTotal,
                createdAt: ticket.order.createdAt,
                deliveryAddress: ticket.order.deliveryAddress,
                items: ticket.order.items || [],
              }
            : null,
          messages: formattedMessages,
          resolutionNote: ticket.resolutionNote || null,
          resolvedAt: ticket.resolvedAt || null,
          closedAt: ticket.closedAt || null,
          createdAt: ticket.createdAt,
          lastMessageAt: ticket.lastMessageAt || ticket.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/support/tickets/:id/messages
   * Admin: Add reply to customer OR add internal team note
   */
  static async addMessage(req, res, next) {
    try {
      const { id } = req.params;
      const { message, isInternalNote = false, attachments } = req.body || {};

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
      const internalNoteFlag = Boolean(isInternalNote);

      const newMsg = {
        sender: req.user.id,
        senderRole: 'ADMIN',
        message: sanitizedMsg,
        attachments: cleanAttachments,
        isInternalNote: internalNoteFlag,
        createdAt: new Date(),
      };

      ticket.messages.push(newMsg);
      ticket.lastMessageAt = new Date();

      // If it's a customer-facing reply (not an internal note)
      if (!internalNoteFlag) {
        // If ticket was open or in progress, change to WAITING_FOR_CUSTOMER
        if (['OPEN', 'IN_PROGRESS'].includes(ticket.status)) {
          ticket.status = 'WAITING_FOR_CUSTOMER';
        }

        // Notify customer
        NotificationDispatcher.dispatch({
          userId: ticket.user,
          orderId: ticket.order,
          eventType: 'SUPPORT_TICKET_REPLIED',
          metadata: {
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            replyAuthor: 'ADMIN',
            messagePreview: sanitizedMsg,
            idempotencySuffix: `_${Date.now()}`,
          },
        }).catch((e) => console.error('[Notification] SUPPORT_TICKET_REPLIED dispatch error:', e.message));
      }

      await ticket.save();

      return res.status(200).json({
        success: true,
        message: internalNoteFlag
          ? 'Internal note added successfully.'
          : 'Reply sent to customer successfully.',
        data: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          lastMessageAt: ticket.lastMessageAt,
          newMessage: {
            id: newMsg._id?.toString(),
            senderRole: newMsg.senderRole,
            message: newMsg.message,
            isInternalNote: newMsg.isInternalNote,
            createdAt: newMsg.createdAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/support/tickets/:id/status
   * Admin: Transition ticket status (OPEN, IN_PROGRESS, WAITING_FOR_CUSTOMER, RESOLVED, CLOSED)
   */
  static async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, resolutionNote } = req.body || {};

      if (!status || typeof status !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Status is required.',
        });
      }

      const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'];
      const targetStatus = status.trim().toUpperCase();

      if (!validStatuses.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
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

      const previousStatus = ticket.status;
      ticket.status = targetStatus;

      if (resolutionNote && typeof resolutionNote === 'string') {
        ticket.resolutionNote = sanitizeText(resolutionNote.trim().slice(0, 1000));
      }

      if (targetStatus === 'RESOLVED') {
        ticket.resolvedAt = new Date();
      } else if (targetStatus === 'CLOSED') {
        ticket.closedAt = new Date();
      } else {
        // Reopened
        ticket.resolvedAt = null;
        ticket.closedAt = null;
      }

      // Add system message to audit status change
      ticket.messages.push({
        sender: req.user.id,
        senderRole: 'SYSTEM',
        message: `Status updated from ${previousStatus} to ${targetStatus}${
          ticket.resolutionNote ? `. Note: ${ticket.resolutionNote}` : ''
        }`,
        isInternalNote: false,
        createdAt: new Date(),
      });

      ticket.lastMessageAt = new Date();
      await ticket.save();

      // Notify customer if status changed to RESOLVED, CLOSED, or updated
      NotificationDispatcher.dispatch({
        userId: ticket.user,
        orderId: ticket.order,
        eventType: 'SUPPORT_TICKET_STATUS_UPDATED',
        metadata: {
          ticketNumber: ticket.ticketNumber,
          status: targetStatus,
          resolutionNote: ticket.resolutionNote || '',
          idempotencySuffix: `_${Date.now()}`,
        },
      }).catch((e) => console.error('[Notification] SUPPORT_TICKET_STATUS_UPDATED dispatch error:', e.message));

      return res.status(200).json({
        success: true,
        message: `Ticket status successfully changed to ${targetStatus}.`,
        data: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          resolutionNote: ticket.resolutionNote,
          resolvedAt: ticket.resolvedAt,
          closedAt: ticket.closedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/support/tickets/:id/assign
   * Admin: Assign staff member to ticket
   */
  static async assignTicket(req, res, next) {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body || {};

      let staffId = null;
      if (assignedTo) {
        if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid staff user ID format.',
          });
        }
        const staffUser = await User.findById(assignedTo).lean();
        if (!staffUser || !['ADMIN', 'KITCHEN'].includes(staffUser.role)) {
          return res.status(400).json({
            success: false,
            message: 'Assigned user must be active staff or admin.',
          });
        }
        staffId = staffUser._id;
      }

      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id }
        : { ticketNumber: id.trim() };

      const ticket = await SupportTicket.findOneAndUpdate(
        query,
        { $set: { assignedTo: staffId } },
        { new: true }
      ).populate('assignedTo', 'name email role');

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Support ticket not found.',
        });
      }

      return res.status(200).json({
        success: true,
        message: staffId ? 'Ticket assigned successfully.' : 'Ticket unassigned.',
        data: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          assignedTo: ticket.assignedTo
            ? {
                id: ticket.assignedTo._id.toString(),
                name: ticket.assignedTo.name,
                email: ticket.assignedTo.email,
              }
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // FAQ MANAGEMENT
  // ==========================================

  /**
   * GET /api/v1/admin/support/faqs
   * Admin: List all FAQs (both published and drafts)
   */
  static async getAllFaqs(req, res, next) {
    try {
      const faqs = await SupportFaq.find().sort({ category: 1, orderIndex: 1, createdAt: 1 }).lean();

      return res.status(200).json({
        success: true,
        count: faqs.length,
        data: faqs.map((f) => ({
          id: f._id.toString(),
          question: f.question,
          answer: f.answer,
          category: f.category,
          isPublished: f.isPublished,
          orderIndex: f.orderIndex,
          helpfulCount: f.helpfulCount || 0,
          createdAt: f.createdAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/support/faqs
   * Admin: Create a new FAQ
   */
  static async createFaq(req, res, next) {
    try {
      const { question, answer, category = 'GENERAL', isPublished = true, orderIndex = 0 } = req.body || {};

      if (!question || typeof question !== 'string' || question.trim().length < 5) {
        return res.status(400).json({
          success: false,
          message: 'Question is required and must be at least 5 characters.',
        });
      }

      if (!answer || typeof answer !== 'string' || answer.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Answer is required and must be at least 10 characters.',
        });
      }

      const faq = await SupportFaq.create({
        question: question.trim(),
        answer: answer.trim(),
        category: category.trim().toUpperCase(),
        isPublished: Boolean(isPublished),
        orderIndex: Number(orderIndex) || 0,
      });

      return res.status(201).json({
        success: true,
        message: 'FAQ item created successfully.',
        data: {
          id: faq._id.toString(),
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          isPublished: faq.isPublished,
          orderIndex: faq.orderIndex,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/support/faqs/:id
   * Admin: Update an FAQ
   */
  static async updateFaq(req, res, next) {
    try {
      const { id } = req.params;
      const { question, answer, category, isPublished, orderIndex } = req.body || {};

      const updateData = {};
      if (question && typeof question === 'string') updateData.question = question.trim();
      if (answer && typeof answer === 'string') updateData.answer = answer.trim();
      if (category && typeof category === 'string') updateData.category = category.trim().toUpperCase();
      if (typeof isPublished === 'boolean') updateData.isPublished = isPublished;
      if (typeof orderIndex === 'number') updateData.orderIndex = orderIndex;

      const faq = await SupportFaq.findByIdAndUpdate(id, { $set: updateData }, { new: true });

      if (!faq) {
        return res.status(404).json({
          success: false,
          message: 'FAQ item not found.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'FAQ item updated successfully.',
        data: {
          id: faq._id.toString(),
          question: faq.question,
          answer: faq.answer,
          category: faq.category,
          isPublished: faq.isPublished,
          orderIndex: faq.orderIndex,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/support/faqs/:id
   * Admin: Delete an FAQ item
   */
  static async deleteFaq(req, res, next) {
    try {
      const { id } = req.params;
      const faq = await SupportFaq.findByIdAndDelete(id);

      if (!faq) {
        return res.status(404).json({
          success: false,
          message: 'FAQ item not found.',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'FAQ item deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminSupportController;
