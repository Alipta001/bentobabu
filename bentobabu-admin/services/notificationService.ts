import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface SystemNotificationItem {
  _id: string;
  id?: string;
  channel: "EMAIL" | "WHATSAPP" | "IN_APP";
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";
  eventType: string;
  recipient: string;
  subject?: string;
  content?: string;
  errorMessage?: string;
  retryCount: number;
  user?: {
    _id: string;
    name: string;
    email: string;
    phone: string;
  };
  order?: {
    _id: string;
    orderNumber: string;
  };
  createdAt: string;
}

export interface NotificationStats {
  totalCount: number;
  statusBreakdown: {
    SENT: number;
    FAILED: number;
    PENDING: number;
    PROCESSING: number;
    SKIPPED: number;
  };
  channelBreakdown: {
    EMAIL: number;
    WHATSAPP: number;
    IN_APP: number;
  };
}

export const notificationService = {
  async getNotifications(params?: {
    channel?: string;
    status?: string;
    eventType?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    notifications: SystemNotificationItem[];
    total: number;
    totalPages: number;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        notifications: SystemNotificationItem[];
        pagination: {
          total: number;
          totalPages: number;
          currentPage: number;
        };
      };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.LIST, { params });

    return {
      notifications: res.data?.data?.notifications || [],
      total: res.data?.data?.pagination?.total || 0,
      totalPages: res.data?.data?.pagination?.totalPages || 1,
    };
  },

  async getStats(): Promise<NotificationStats> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: NotificationStats;
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.STATS);

    return res.data?.data;
  },

  async retry(id: string): Promise<SystemNotificationItem> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: {
        notification: SystemNotificationItem;
      };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.RETRY(id));

    return res.data?.data?.notification;
  },
};

