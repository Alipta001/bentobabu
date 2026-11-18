import apiClient from "./axios";
import { NotificationItem } from "@/types";

export interface NotificationsResponse {
  success: boolean;
  data: {
    notifications: NotificationItem[];
    pagination: {
      total: number;
      totalPages: number;
      currentPage: number;
      limit: number;
    };
  };
}
export const notificationApi = {
  async getNotifications(params?: {
    isRead?: boolean;
    page?: number;
    limit?: number;
  }): Promise<NotificationsResponse["data"]> {
    const response = await apiClient.get<NotificationsResponse>("/notifications", {
      params: {
        isRead: params?.isRead,
        page: params?.page || 1,
        limit: params?.limit || 20,
      },
    });
    return response.data.data;
  },

  async getUnreadCount(): Promise<number> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: { unreadCount: number };
      }>("/notifications/unread-count");
      return response.data?.data?.unreadCount || 0;
    } catch {
      return 0;
    }
  },

  async markAsRead(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await apiClient.patch("/notifications/read-all");
  },
};
