import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface OrderingStatusResponse {
  acceptingOrders: boolean;
  message: string | null;
}

export const settingsService = {
  async getOrderingStatus(): Promise<OrderingStatusResponse> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: OrderingStatusResponse;
      }>(API_ENDPOINTS.SETTINGS.ORDERING_STATUS);

      if (response.data && response.data.data) {
        return {
          acceptingOrders: Boolean(response.data.data.acceptingOrders),
          message: response.data.data.message || null,
        };
      }
      return { acceptingOrders: true, message: null };
    } catch (err) {
      console.error("[settingsService] Error fetching ordering status:", err);
      return { acceptingOrders: true, message: null };
    }
  },
};
