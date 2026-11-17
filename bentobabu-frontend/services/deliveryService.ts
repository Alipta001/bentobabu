import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { DeliveryZone, DeliverySlot } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  message: string;
  zone?: DeliveryZone;
  deliveryFee: number;
  minimumOrderAmount: number;
  freeDeliveryThreshold?: number;
  estimatedDeliveryTime?: string;
}

export const deliveryService = {
  /**
   * Check PIN code serviceability against active delivery zones
   */
  async checkServiceability(pincode: string): Promise<ServiceabilityResult> {
    if (!pincode || pincode.trim().length !== 6) {
      return {
        serviceable: false,
        message: "Please enter a valid 6-digit PIN code.",
        deliveryFee: 0,
        minimumOrderAmount: 0,
      };
    }

    try {
      const response = await apiClient.get<
        ApiResponse<{
          zone?: any;
          deliveryCharge?: number;
          deliveryFee?: number;
          minimumOrderAmount?: number;
          freeDeliveryThreshold?: number;
          estimatedDeliveryTime?: string;
        }>
      >(API_ENDPOINTS.DELIVERY.SERVICEABILITY(pincode.trim()));

      const raw = response.data;
      const data = raw && "data" in raw ? raw.data : (raw as any);

      const fee =
        typeof data.deliveryCharge === "number"
          ? data.deliveryCharge
          : typeof data.deliveryFee === "number"
          ? data.deliveryFee
          : typeof data.zone?.deliveryCharge === "number"
          ? data.zone.deliveryCharge
          : 0;

      return {
        serviceable: true,
        message: raw.message || "Delivery is available to your location!",
        zone: data.zone,
        deliveryFee: fee,
        minimumOrderAmount: typeof data.minimumOrderAmount === "number" ? data.minimumOrderAmount : 0,
        freeDeliveryThreshold: data.freeDeliveryThreshold,
        estimatedDeliveryTime: data.estimatedDeliveryTime || data.zone?.estimatedDeliveryTime || "35 - 45 mins",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delivery not serviceable to this PIN code.";
      return {
        serviceable: false,
        message: msg,
        deliveryFee: 0,
        minimumOrderAmount: 0,
      };
    }
  },

  /**
   * Retrieve available delivery slots for given PIN code and date (YYYY-MM-DD)
   */
  async getSlots(pincode: string, date: string): Promise<DeliverySlot[]> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ slots: any[] }> | { slots: any[] }
      >(API_ENDPOINTS.DELIVERY.SLOTS(pincode, date));

      const raw = response.data;
      let list: any[] = [];

      if (raw && "data" in raw && Array.isArray(raw.data?.slots)) {
        list = raw.data.slots;
      } else if (raw && "slots" in raw && Array.isArray(raw.slots)) {
        list = raw.slots;
      } else if (Array.isArray(raw)) {
        list = raw;
      }

      return list.map((s) => ({
        id: s.id || s._id || "",
        _id: s._id || s.id || "",
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        bookedCount: s.bookedCount || 0,
        isActive: s.isActive !== false,
      }));
    } catch (err) {
      console.error("[deliveryService] Error fetching slots:", err);
      return [];
    }
  },

  /**
   * Retrieve platform delivery configuration (admin-configured minimum order value and delivery fees)
   */
  async getConfig(): Promise<{
    minimumOrderValue: number;
    deliveryChargeEnabled: boolean;
    deliveryChargeAmount: number;
  }> {
    try {
      const response = await apiClient.get<
        ApiResponse<{
          minimumOrderValue: number;
          minimumOrderAmount: number;
          deliveryChargeEnabled: boolean;
          deliveryChargeAmount: number;
        }>
      >(API_ENDPOINTS.DELIVERY.CONFIG);

      const raw = response.data;
      const data = raw && "data" in raw ? raw.data : (raw as any);

      return {
        minimumOrderValue: typeof data?.minimumOrderValue === "number" ? data.minimumOrderValue : 0,
        deliveryChargeEnabled: data?.deliveryChargeEnabled ?? true,
        deliveryChargeAmount: typeof data?.deliveryChargeAmount === "number" ? data.deliveryChargeAmount : 30,
      };
    } catch {
      return {
        minimumOrderValue: 0,
        deliveryChargeEnabled: true,
        deliveryChargeAmount: 30,
      };
    }
  },
};

