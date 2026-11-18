import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  AdminTicketListItem,
  AdminTicketDetail,
  SupportStats,
  AdminFaqItem,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  TicketAttachment,
} from "@/types";

export interface TicketFilterParams {
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const adminSupportService = {
  async getStats(): Promise<SupportStats> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: SupportStats;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.STATS);
    return res.data?.data;
  },

  async getTickets(params?: TicketFilterParams): Promise<{
    tickets: AdminTicketListItem[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: AdminTicketListItem[];
      total: number;
      totalPages: number;
      page: number;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.TICKETS, { params });

    return {
      tickets: res.data?.data || [],
      total: res.data?.total || 0,
      totalPages: res.data?.totalPages || 1,
      currentPage: res.data?.page || 1,
    };
  },

  async getTicketById(id: string): Promise<AdminTicketDetail> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: AdminTicketDetail;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.TICKET_DETAIL(id));

    return res.data?.data;
  },

  async addMessage(
    id: string,
    payload: {
      message: string;
      isInternalNote?: boolean;
      attachments?: TicketAttachment[];
    }
  ): Promise<{
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    lastMessageAt: string;
    newMessage: any;
  }> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.ADD_MESSAGE(id), payload);

    return res.data?.data;
  },

  async updateStatus(
    id: string,
    payload: {
      status: TicketStatus;
      resolutionNote?: string;
    }
  ): Promise<{
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    resolutionNote?: string;
  }> {
    const res = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.UPDATE_STATUS(id), payload);

    return res.data?.data;
  },

  async assignTicket(
    id: string,
    assignedTo: string | null
  ): Promise<{
    id: string;
    ticketNumber: string;
    assignedTo: any;
  }> {
    const res = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.ASSIGN(id), { assignedTo });

    return res.data?.data;
  },

  // FAQ Management
  async getFaqs(): Promise<AdminFaqItem[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: AdminFaqItem[];
    }>(ADMIN_API_ENDPOINTS.SUPPORT.FAQS);

    return res.data?.data || [];
  },

  async createFaq(faq: {
    question: string;
    answer: string;
    category?: string;
    isPublished?: boolean;
    orderIndex?: number;
  }): Promise<AdminFaqItem> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: AdminFaqItem;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.FAQS, faq);

    return res.data?.data;
  },

  async updateFaq(
    id: string,
    faq: {
      question?: string;
      answer?: string;
      category?: string;
      isPublished?: boolean;
      orderIndex?: number;
    }
  ): Promise<AdminFaqItem> {
    const res = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: AdminFaqItem;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.FAQ_DETAIL(id), faq);

    return res.data?.data;
  },

  async deleteFaq(id: string): Promise<boolean> {
    const res = await adminApiClient.delete<{
      success: boolean;
      message: string;
    }>(ADMIN_API_ENDPOINTS.SUPPORT.FAQ_DETAIL(id));

    return Boolean(res.data?.success);
  },
};
