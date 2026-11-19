import apiClient from "./axios";
import { Order, DeliveryOrderListResponse, DeliveryConfig, CentralKitchenDetails } from "@/types";

export interface GetOrdersParams {
  status?: string;
  page?: number;
  limit?: number;
}

export const VERIFIED_CENTRAL_KITCHEN: CentralKitchenDetails = {
  name: "BentoBabu Central Kitchen",
  landmark: "Apollo Pharmacy / Apollo 24|7",
  address: "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India",
  pincode: "700120",
  latitude: 22.7666909,
  longitude: 88.3788318,
  phone: "+91 98765 43210",
  googleMapsUrl: "https://www.google.com/maps?q=22.7666909,88.3788318",
  googleMapsDirectionsUrl: "https://www.google.com/maps/dir/?api=1&destination=22.7666909%2C88.3788318",
};

export const CENTRAL_KITCHEN_DETAILS = VERIFIED_CENTRAL_KITCHEN;

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
   * Transitions order from READY_FOR_PICKUP -> RIDER_ACCEPTED.
   * Atomically assigns authenticated delivery agent, notifies customer rider is on way to kitchen.
   */
  async acceptOrder(id: string, note?: string): Promise<Order> {
    const response = await apiClient.patch<{ success: boolean; message: string; data: Order }>(
      `/operations/delivery/orders/${id}/status`,
      {
        status: "RIDER_ACCEPTED",
        note: note || "Delivery partner accepted delivery request",
      }
    );
    return response.data.data;
  },

  /**
   * Backwards-compatible alias for acceptOrder
   */
  async acceptAndPickupOrder(id: string, note?: string): Promise<Order> {
    return this.acceptOrder(id, note);
  },

  /**
   * PATCH /api/v1/operations/delivery/orders/:id/status
   * Transitions order from RIDER_ACCEPTED -> PICKED_UP.
   * Confirms physical package pickup from kitchen and notifies customer out for delivery.
   */
  async confirmPickup(id: string, note?: string): Promise<Order> {
    const response = await apiClient.patch<{ success: boolean; message: string; data: Order }>(
      `/operations/delivery/orders/${id}/status`,
      {
        status: "PICKED_UP",
        note: note || "Order collected from kitchen and is out for delivery",
      }
    );
    return response.data.data;
  },

  /**
   * GET /api/v1/delivery/config
   * Fetches public delivery configuration including otpRequired flag
   */
  async getDeliveryConfig(): Promise<DeliveryConfig> {
    const response = await apiClient.get<{ success: boolean; data: DeliveryConfig }>(
      "/delivery/config"
    );
    return response.data.data;
  },

  /**
   * PATCH /api/v1/operations/delivery/orders/:id/status
   * Transitions order from OUT_FOR_DELIVERY -> DELIVERED.
   * When OTP is enabled, requires customer OTP. When disabled, completes delivery without OTP.
   */
  async verifyDeliveryOtp(id: string, otp?: string, note?: string): Promise<Order> {
    const cleanOtp = otp ? otp.toString().trim() : undefined;
    const payload: { status: string; note?: string; otp?: string } = {
      status: "DELIVERED",
      note: note || (cleanOtp ? "Order delivered and verified with customer OTP" : "Order delivered (OTP verification skipped)"),
    };
    if (cleanOtp) {
      payload.otp = cleanOtp;
    }

    const response = await apiClient.patch<{ success: boolean; message: string; data: Order }>(
      `/operations/delivery/orders/${id}/status`,
      payload
    );

    return response.data.data;
  },

  /**
   * Alias for verifyDeliveryOtp to cleanly support both OTP and OTP-less completion
   */
  async completeDelivery(id: string, otp?: string, note?: string): Promise<Order> {
    return this.verifyDeliveryOtp(id, otp, note);
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
