import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { BusinessSettings } from "@/types";

export interface BackendSystemSettings {
  BUSINESS_NAME?: string;
  SUPPORT_EMAIL?: string;
  SUPPORT_PHONE?: string;
  MINIMUM_ORDER_AMOUNT?: number;
  MINIMUM_ORDER_VALUE?: number;
  DEFAULT_DELIVERY_FEE?: number;
  DELIVERY_CHARGE_ENABLED?: boolean;
  DELIVERY_CHARGE_AMOUNT?: number;
  DEFAULT_PREPARATION_TIME?: number;
  OPERATING_DAYS?: string[];
  OPENING_TIME?: string;
  CLOSING_TIME?: string;
  ORDER_ACCEPTANCE_ENABLED?: boolean;
  MAINTENANCE_MODE?: boolean;
}

const mapSettings = (s: BackendSystemSettings): BusinessSettings => ({
  businessName: s.BUSINESS_NAME || "Bento Babu",
  tagline: "Mindful Indian Bento & Clean Meal Boxes",
  supportEmail: s.SUPPORT_EMAIL || "support@bentobabu.in",
  supportPhone: s.SUPPORT_PHONE || "9876543210",
  kitchenAddress: "Central Kitchen, Barrackpore, Kolkata 700120",
  operatingHours: `${s.OPENING_TIME || "10:00"} - ${s.CLOSING_TIME || "22:00"}`,
  gstRatePercentage: 5,
  freeDeliveryThreshold: 500,
  deliveryChargeEnabled: s.DELIVERY_CHARGE_ENABLED ?? true,
  deliveryChargeAmount: s.DELIVERY_CHARGE_AMOUNT ?? s.DEFAULT_DELIVERY_FEE ?? 30,
  minimumOrderValue: s.MINIMUM_ORDER_VALUE ?? s.MINIMUM_ORDER_AMOUNT ?? 0,
  isOrderingEnabled: s.ORDER_ACCEPTANCE_ENABLED ?? true,
});

export const settingsService = {
  async getSettings(): Promise<BusinessSettings> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        settings: BackendSystemSettings;
      };
    }>(ADMIN_API_ENDPOINTS.SETTINGS.GET);

    const s = res.data?.data?.settings || (res.data as unknown as BackendSystemSettings);
    return mapSettings(s);
  },

  async updateSettings(data: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const backendPayload: Record<string, unknown> = {};

    if (data.businessName !== undefined) backendPayload.BUSINESS_NAME = data.businessName;
    if (data.supportEmail !== undefined) backendPayload.SUPPORT_EMAIL = data.supportEmail;
    if (data.supportPhone !== undefined) backendPayload.SUPPORT_PHONE = data.supportPhone;
    if (data.isOrderingEnabled !== undefined) backendPayload.ORDER_ACCEPTANCE_ENABLED = data.isOrderingEnabled;
    if (data.deliveryChargeEnabled !== undefined) backendPayload.DELIVERY_CHARGE_ENABLED = data.deliveryChargeEnabled;
    if (data.deliveryChargeAmount !== undefined) {
      backendPayload.DELIVERY_CHARGE_AMOUNT = data.deliveryChargeAmount;
      backendPayload.DEFAULT_DELIVERY_FEE = data.deliveryChargeAmount;
    }
    if (data.minimumOrderValue !== undefined) {
      backendPayload.MINIMUM_ORDER_VALUE = Number(data.minimumOrderValue);
      backendPayload.MINIMUM_ORDER_AMOUNT = Number(data.minimumOrderValue);
    }
    if (data.operatingHours && data.operatingHours.includes("-")) {
      const parts = data.operatingHours.split("-").map((p) => p.trim());
      if (parts[0]) backendPayload.OPENING_TIME = parts[0];
      if (parts[1]) backendPayload.CLOSING_TIME = parts[1];
    }

    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        settings: BackendSystemSettings;
      };
    }>(ADMIN_API_ENDPOINTS.SETTINGS.UPDATE, {
      settings: backendPayload,
    });

    const s = res.data?.data?.settings || (res.data as unknown as BackendSystemSettings);
    return mapSettings(s);
  },
};

