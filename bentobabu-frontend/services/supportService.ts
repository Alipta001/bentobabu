import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  SupportTicket,
  SupportFaq,
  SupportConfig,
  TicketCategory,
} from "@/types";

export interface CreateTicketPayload {
  subject: string;
  category: TicketCategory;
  description: string;
  orderId?: string;
  attachments?: Array<{
    url: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
}

export const supportService = {
  /**
   * Fetch public support config & verified contact channels
   */
  async getConfig(): Promise<SupportConfig> {
    const response = await apiClient.get<{ success: boolean; data: SupportConfig }>(
      API_ENDPOINTS.SUPPORT.CONFIG
    );
    return response.data.data;
  },

  /**
   * Fetch published FAQs
   */
  async getFaqs(category?: string): Promise<SupportFaq[]> {
    const response = await apiClient.get<{ success: boolean; data: SupportFaq[] }>(
      API_ENDPOINTS.SUPPORT.FAQS(category)
    );
    return response.data.data || [];
  },

  /**
   * Upload image/document attachment
   */
  async uploadAttachment(file: File): Promise<{
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<{
      success: boolean;
      data: { url: string; fileName: string; mimeType: string; sizeBytes: number };
    }>(API_ENDPOINTS.SUPPORT.UPLOAD, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response.data.data;
  },

  /**
   * Create a new support ticket
   */
  async createTicket(payload: CreateTicketPayload): Promise<SupportTicket> {
    const response = await apiClient.post<{ success: boolean; message: string; data: SupportTicket }>(
      API_ENDPOINTS.SUPPORT.TICKETS,
      payload
    );
    return response.data.data;
  },

  /**
   * List customer's tickets
   */
  async getMyTickets(params?: { page?: number; limit?: number; status?: string }): Promise<{
    tickets: SupportTicket[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const response = await apiClient.get<{
      success: boolean;
      data: SupportTicket[];
      total: number;
      page: number;
      totalPages: number;
    }>(API_ENDPOINTS.SUPPORT.TICKETS, { params });

    return {
      tickets: response.data.data || [],
      total: response.data.total || 0,
      page: response.data.page || 1,
      totalPages: response.data.totalPages || 1,
    };
  },

  /**
   * Get single ticket with full message history
   */
  async getTicketById(id: string): Promise<SupportTicket> {
    const response = await apiClient.get<{ success: boolean; data: SupportTicket }>(
      API_ENDPOINTS.SUPPORT.TICKET_DETAIL(id)
    );
    return response.data.data;
  },

  /**
   * Reply to an open ticket
   */
  async replyToTicket(
    id: string,
    message: string,
    attachments?: Array<{ url: string; fileName?: string; mimeType?: string; sizeBytes?: number }>
  ): Promise<any> {
    const response = await apiClient.post<{ success: boolean; data: any }>(
      API_ENDPOINTS.SUPPORT.TICKET_REPLY(id),
      { message, attachments }
    );
    return response.data.data;
  },
};
