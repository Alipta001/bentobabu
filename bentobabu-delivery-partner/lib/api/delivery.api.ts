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

  /**
   * POST /api/v1/operations/delivery/orders/:id/collect-cash
   * Records cash collection for Cash on Delivery (COD) order.
   */
  async collectCash(id: string, note?: string): Promise<{ success: boolean; message: string; data: any }> {
    const response = await apiClient.post<{ success: boolean; message: string; data: any }>(
      `/operations/delivery/orders/${id}/collect-cash`,
      { note: note || "Cash collected from customer at doorstep" }
    );
    return response.data;
  },

  /**
   * GET /api/v1/delivery/presence/me
   * Fetches current rider presence, active order and timeout configurations
   */
  async getMyPresence() {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        presence: import("@/types").DeliveryPartnerPresence;
        activeOrder: Order | null;
        config: {
          heartbeatIntervalMs: number;
          connectionTimeoutMs: number;
          locationFreshMs: number;
        };
      };
    }>("/delivery/presence/me");
    return response.data.data;
  },

  /**
   * PATCH /api/v1/delivery/presence/availability
   * Explicitly sets availability to ONLINE or OFFLINE
   */
  async updateAvailability(availability: "ONLINE" | "OFFLINE") {
    const response = await apiClient.patch<{
      success: boolean;
      message: string;
      data: {
        presence: import("@/types").DeliveryPartnerPresence;
        hasActiveOrder: boolean;
      };
    }>("/delivery/presence/availability", { availability });
    return response.data.data;
  },

  /**
   * POST /api/v1/delivery/presence/heartbeat
   * Periodic connection ping sent while delivery partner app is in foreground
   */
  async sendHeartbeat() {
    const response = await apiClient.post<{
      success: boolean;
      timestamp: number;
      availabilityStatus: import("@/types").AvailabilityStatus;
      accountStatus: import("@/types").AccountStatus;
      connectionStatus: string;
    }>("/delivery/presence/heartbeat", {});
    return response.data;
  },

  /**
   * POST /api/v1/delivery/presence/location
   * Sends device GPS coordinates, accuracy, battery, and speed
   */
  async sendLocation(payload: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    batteryLevel?: number | null;
  }) {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: {
        lastLocation: import("@/types").DeliveryPartnerPresence["lastLocation"];
        lastHeartbeat: string;
        locationFreshness: string;
      };
    }>("/delivery/presence/location", payload);
    return response.data.data;
  },
};
