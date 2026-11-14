import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Notification } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface NotificationPreferences {
  email: boolean;
  whatsapp: boolean;
  inApp: boolean;
}

export const notificationService = {
  /**
   * Fetch customer notifications with optional filter
   */
  async getNotifications(options?: { isRead?: boolean; page?: number; limit?: number }): Promise<{
    notifications: Notification[];
    unreadCount: number;
  }> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ notifications: any[]; unreadCount?: number }>
      >(API_ENDPOINTS.NOTIFICATIONS.LIST, { params: options });

      const raw = response.data;
      const data = (raw && "data" in raw && raw.data) ? raw.data : (raw as any);
      const list = Array.isArray(data?.notifications) ? data.notifications : [];

      const notifications: Notification[] = list.map((n: any) => ({
        id: n.id || n._id || "",
        _id: n._id || n.id || "",
        channel: n.channel || "IN_APP",
        eventType: n.eventType || "GENERAL",
        subject: n.subject || "Notification",
        message: n.message || "",
        isRead: n.isRead ?? false,
        createdAt: n.createdAt || new Date().toISOString(),
        metadata: n.metadata,
      }));

      return {
        notifications,
        unreadCount: data?.unreadCount || notifications.filter((n) => !n.isRead).length,
      };
    } catch (err) {
      console.error("[notificationService] Error fetching notifications:", err);
      return { notifications: [], unreadCount: 0 };
    }
  },

  /**
   * Get total unread count for badge display
   */
  async getUnreadCount(): Promise<number> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ unreadCount: number }>
      >(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);

      const raw = response.data;
      const data = (raw && "data" in raw && raw.data) ? raw.data : (raw as any);
      return typeof data?.unreadCount === "number" ? data.unreadCount : 0;
    } catch {
      return 0;
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(id: string): Promise<void> {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
  },

  /**
   * Mark all unread notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
  },

  /**
   * Get notification preferences (Email, WhatsApp opt-in)
   */
  async getPreferences(): Promise<NotificationPreferences> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ preferences: NotificationPreferences }>
      >(API_ENDPOINTS.NOTIFICATIONS.PREFERENCES);

      const raw = response.data;
      const data = (raw && "data" in raw && raw.data) ? raw.data : (raw as any);
      return (
        data?.preferences || {
          email: true,
          whatsapp: false,
          inApp: true,
        }
      );
    } catch {
      return { email: true, whatsapp: false, inApp: true };
    }
  },

  /**
   * Update notification preferences (toggle email or explicitly opt-in/opt-out of WhatsApp)
   */
  async updatePreferences(updates: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const response = await apiClient.put<
      ApiResponse<{ preferences: NotificationPreferences }>
    >(API_ENDPOINTS.NOTIFICATIONS.PREFERENCES, updates);

    const raw = response.data;
    const data = (raw && "data" in raw && raw.data) ? raw.data : (raw as any);
    return (
      data?.preferences || {
        email: updates.email ?? true,
        whatsapp: updates.whatsapp ?? false,
        inApp: updates.inApp ?? true,
      }
    );
  },
};

