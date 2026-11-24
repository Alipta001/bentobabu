import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { DeliveryZone, DeliverySlot, DeliverySlotsResult } from "@/types";

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

      const raw = response.data as any;
      const data = raw && "data" in raw && raw.data ? raw.data : raw;

      const isServiceable = Boolean(raw.serviceable ?? data?.serviceable ?? false);

      if (!isServiceable || raw.code === "UNSERVICEABLE_LOCATION") {
        return {
          serviceable: false,
          message:
            raw.message ||
            `Delivery is currently not available for PIN code ${pincode.trim()}`,
          deliveryFee: 0,
          minimumOrderAmount: 0,
        };
      }

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
        minimumOrderAmount:
          typeof data.minimumOrderAmount === "number"
            ? data.minimumOrderAmount
            : 0,
        freeDeliveryThreshold: data.freeDeliveryThreshold,
        estimatedDeliveryTime:
          data.estimatedDeliveryTime ||
          data.zone?.estimatedDeliveryTime ||
          "35 - 45 mins",
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
  async getSlots(pincode: string, date: string): Promise<DeliverySlotsResult> {
    try {
      const response = await apiClient.get<any>(
        API_ENDPOINTS.DELIVERY.SLOTS(pincode, date)
      );

      const raw = response.data;
      const dataPayload = raw && typeof raw === "object" && "data" in raw ? raw.data : raw;

      let list: any[] = [];
      if (Array.isArray(dataPayload)) {
        list = dataPayload;
      } else if (dataPayload && Array.isArray(dataPayload.slots)) {
        list = dataPayload.slots;
      } else if (raw && Array.isArray(raw.slots)) {
        list = raw.slots;
      }

      const state = raw?.state || (list.length > 0 ? "AVAILABLE" : "NO_SCHEDULE");
      const message = raw?.message || (list.length > 0 ? "Slots available" : "No delivery slots scheduled");
      const serviceable = raw?.serviceable !== false;

      const slots: DeliverySlot[] = list.map((s) => ({
        id: s.id || s._id || "",
        _id: s._id || s.id || "",
        date: s.date,
        dateStr: s.dateStr,
        slotKey: s.slotKey,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: typeof s.capacity === "number" ? s.capacity : 25,
        bookedCount: typeof s.bookedCount === "number" ? s.bookedCount : 0,
        remainingCapacity:
          typeof s.remainingCapacity === "number"
            ? s.remainingCapacity
            : Math.max(0, (s.capacity || 25) - (s.bookedCount || 0)),
        scheduleSource: s.scheduleSource || "WEEKLY",
        isActive: s.isActive !== false,
        isAvailable: s.isAvailable !== false,
        isPastWindow: Boolean(s.isPastWindow),
        isCutoffPassed: Boolean(s.isCutoffPassed),
        cutoffTimeStr: s.cutoffTimeStr || null,
        bookingCutoffMinutes: typeof s.bookingCutoffMinutes === "number" ? s.bookingCutoffMinutes : undefined,
      }));

      return {
        slots,
        state,
        message,
        serviceable,
        bookingCutoffMinutes: typeof raw?.bookingCutoffMinutes === "number" ? raw.bookingCutoffMinutes : undefined,
        maxAdvanceBookingDays: typeof raw?.maxAdvanceBookingDays === "number" ? raw.maxAdvanceBookingDays : undefined,
      };
    } catch (err) {
      console.error("[deliveryService] Error fetching slots:", err);
      return {
        slots: [],
        state: "NO_SCHEDULE",
        message: err instanceof Error ? err.message : "Error fetching delivery slots",
        serviceable: true,
      };
    }
  },

  /**
   * Retrieve platform delivery configuration (admin-configured minimum order value, delivery fees, and booking controls)
   */
  async getConfig(): Promise<{
    minimumOrderValue: number;
    deliveryChargeEnabled: boolean;
    deliveryChargeAmount: number;
    bookingCutoffMinutes: number;
    maxAdvanceBookingDays: number;
    todayKolkata: string;
    latestBookableDate: string;
  }> {
    try {
      const response = await apiClient.get<
        ApiResponse<{
          minimumOrderValue: number;
          minimumOrderAmount: number;
          deliveryChargeEnabled: boolean;
          deliveryChargeAmount: number;
          bookingCutoffMinutes?: number;
          maxAdvanceBookingDays?: number;
          todayKolkata?: string;
          latestBookableDate?: string;
        }>
      >(API_ENDPOINTS.DELIVERY.CONFIG);

      const raw = response.data;
      const data = raw && "data" in raw ? raw.data : (raw as any);

      return {
        minimumOrderValue: typeof data?.minimumOrderValue === "number" ? data.minimumOrderValue : 0,
        deliveryChargeEnabled: data?.deliveryChargeEnabled ?? true,
        deliveryChargeAmount: typeof data?.deliveryChargeAmount === "number" ? data.deliveryChargeAmount : 30,
        bookingCutoffMinutes: typeof data?.bookingCutoffMinutes === "number" ? data.bookingCutoffMinutes : 0,
        maxAdvanceBookingDays: typeof data?.maxAdvanceBookingDays === "number" ? data.maxAdvanceBookingDays : 3,
        todayKolkata: data?.todayKolkata || "",
        latestBookableDate: data?.latestBookableDate || "",
      };
    } catch {
      return {
        minimumOrderValue: 0,
        deliveryChargeEnabled: true,
        deliveryChargeAmount: 30,
        bookingCutoffMinutes: 0,
        maxAdvanceBookingDays: 3,
        todayKolkata: "",
        latestBookableDate: "",
      };
    }
  },
};

