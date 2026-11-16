import apiClient from "./axios";
import { Order, DeliveryOrderListResponse } from "@/types";

export interface GetOrdersParams {
  status?: string;
  page?: number;
  limit?: number;
}

export const CENTRAL_KITCHEN_DETAILS = {
  name: "BentoBabu Central Cloud Kitchen",
  branch: "Indiranagar Hub #01",
  address: "Plot 42, Mindful Nutrition Kitchen Complex, 12th Main Road, Indiranagar",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560038",
  phone: "+91 80 4567 8900",
  lat: 12.9716,
  lng: 77.6412,
};

export const deliveryApi = {
  /**
   * GET /api/v1/operations/delivery/orders
   * Lists orders for delivery agent (status: READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED)
   */
  async getDeliveryOrders(params?: GetOrdersParams): Promise<DeliveryOrderListResponse> {
    const response = await apiClient.get<DeliveryOrderListResponse>(
      "/operations/delivery/orders",
      {
        params: {
          status: params?.status === "ALL" ? undefined : params?.status,
          page: params?.page || 1,
          limit: params?.limit || 20,
        },
      }
    );
    return response.data;
  },

  /**
   * GET /api/v1/orders/:id
   * Fetches specific order details
   */
  async getOrderById(id: string): Promise<Order> {
    const response = await apiClient.get<{ success: boolean; data: Order }>(
      `/orders/${id}`
    );
    return response.data.data;
  },

  /**
   * PATCH /api/v1/operations/delivery/orders/:id/status
   * Transitions order from READY_FOR_PICKUP -> OUT_FOR_DELIVERY.
   * Atomically assigns authenticated delivery agent, generates OTP for customer.
   */
  async acceptAndPickupOrder(id: string, note?: string): Promise<Order> {
    const response = await apiClient.patch<{ success: boolean; message: string; data: Order }>(
      `/operations/delivery/orders/${id}/status`,
      {
        status: "OUT_FOR_DELIVERY",
        note: note || "Order picked up and is out for delivery",
      }
    );
    return response.data.data;
  },

  /**
   * PATCH /api/v1/operations/delivery/orders/:id/status
   * Transitions order from OUT_FOR_DELIVERY -> DELIVERED.
   * Requires customer OTP. On successful verification, marks DELIVERED and clears OTP.
   */
  async verifyDeliveryOtp(id: string, otp: string, note?: string): Promise<Order> {
    const cleanOtp = otp.toString().trim();
    if (!cleanOtp) {
      throw new Error("Delivery OTP is required.");
    }

    const response = await apiClient.patch<{ success: boolean; message: string; data: Order }>(
      `/operations/delivery/orders/${id}/status`,
      {
        status: "DELIVERED",
        otp: cleanOtp,
        note: note || "Order delivered and verified with customer OTP",
      }
    );

    return response.data.data;
  },
};
