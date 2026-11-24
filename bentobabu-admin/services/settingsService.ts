import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { BusinessSettings } from "@/types";

export interface BackendSystemSettings {
  BUSINESS_NAME?: string;
  SUPPORT_EMAIL?: string;
  SUPPORT_PHONE?: string;
  SUPPORT_WHATSAPP?: string;
  SUPPORT_HOURS?: string;
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
  DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES?: number;
  MAX_ADVANCE_BOOKING_DAYS?: number;
  KITCHEN_NAME?: string;
  KITCHEN_LANDMARK?: string;
  KITCHEN_ADDRESS?: string;
  KITCHEN_PINCODE?: string;
  KITCHEN_LATITUDE?: number;
  KITCHEN_LONGITUDE?: number;
  FSSAI_STATUS?: import("@/types").FssaiStatus;
  FSSAI_NUMBER?: string;
  FSSAI_CERTIFICATE_URL?: string;
  GSTIN?: string;
  GST_CERTIFICATE_URL?: string;
  WEBSITE_URL?: string;
  BUSINESS_ADDRESS?: string;
  INSTAGRAM_URL?: string;
  FACEBOOK_URL?: string;
  TWITTER_URL?: string;
  LINKEDIN_URL?: string;
}

const mapSettings = (s: BackendSystemSettings): BusinessSettings => ({
  businessName: s.BUSINESS_NAME || "Bento Babu",
  tagline: "Mindful Indian Bento & Clean Meal Boxes",
  supportEmail: s.SUPPORT_EMAIL || "bentobabuofficial@gmail.com",
  supportPhone: s.SUPPORT_PHONE || "+91 8584085669",
  supportWhatsapp: s.SUPPORT_WHATSAPP || s.SUPPORT_PHONE || "+91 8584085669",
  supportHours: s.SUPPORT_HOURS || `${s.OPENING_TIME || "10:00"} - ${s.CLOSING_TIME || "22:00"}`,
  kitchenName: s.KITCHEN_NAME || "BentoBabu Central Kitchen",
  kitchenLandmark: s.KITCHEN_LANDMARK || "Apollo Pharmacy / Apollo 24|7",
  kitchenAddress: s.KITCHEN_ADDRESS || "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal, India",
  kitchenPincode: s.KITCHEN_PINCODE || "700122",
  kitchenLatitude: typeof s.KITCHEN_LATITUDE === "number" ? s.KITCHEN_LATITUDE : 22.7666909,
  kitchenLongitude: typeof s.KITCHEN_LONGITUDE === "number" ? s.KITCHEN_LONGITUDE : 88.3788318,
  operatingHours: `${s.OPENING_TIME || "10:00"} - ${s.CLOSING_TIME || "22:00"}`,
  gstRatePercentage: 5,
  freeDeliveryThreshold: 500,
  deliveryChargeEnabled: s.DELIVERY_CHARGE_ENABLED ?? true,
  deliveryChargeAmount: s.DELIVERY_CHARGE_AMOUNT ?? s.DEFAULT_DELIVERY_FEE ?? 30,
  minimumOrderValue: s.MINIMUM_ORDER_VALUE ?? s.MINIMUM_ORDER_AMOUNT ?? 0,
  deliverySlotBookingCutoffMinutes: typeof s.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES === "number" ? s.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES : 0,
  maxAdvanceBookingDays: typeof s.MAX_ADVANCE_BOOKING_DAYS === "number" ? s.MAX_ADVANCE_BOOKING_DAYS : 3,
  isOrderingEnabled: s.ORDER_ACCEPTANCE_ENABLED ?? true,
  fssaiStatus: s.FSSAI_STATUS || "APPLICATION_SUBMITTED",
  fssaiNumber: s.FSSAI_NUMBER || "",
  fssaiCertificateUrl: s.FSSAI_CERTIFICATE_URL || "",
  gstin: s.GSTIN || "",
  gstCertificateUrl: s.GST_CERTIFICATE_URL || "",
  websiteUrl: s.WEBSITE_URL || "https://bentobabu.com",
  businessAddress: s.BUSINESS_ADDRESS || "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India",
  instagramUrl: s.INSTAGRAM_URL || "https://instagram.com/bentobabu",
  facebookUrl: s.FACEBOOK_URL || "https://facebook.com/bentobabu",
  twitterUrl: s.TWITTER_URL || "https://twitter.com/bentobabu",
  linkedinUrl: s.LINKEDIN_URL || "https://linkedin.com/company/bentobabu",
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
    if (data.supportWhatsapp !== undefined) backendPayload.SUPPORT_WHATSAPP = data.supportWhatsapp;
    if (data.supportHours !== undefined) backendPayload.SUPPORT_HOURS = data.supportHours;
    if (data.kitchenName !== undefined) backendPayload.KITCHEN_NAME = data.kitchenName;
    if (data.kitchenLandmark !== undefined) backendPayload.KITCHEN_LANDMARK = data.kitchenLandmark;
    if (data.kitchenAddress !== undefined) backendPayload.KITCHEN_ADDRESS = data.kitchenAddress;
    if (data.kitchenPincode !== undefined) backendPayload.KITCHEN_PINCODE = data.kitchenPincode;
    if (data.kitchenLatitude !== undefined) backendPayload.KITCHEN_LATITUDE = Number(data.kitchenLatitude);
    if (data.kitchenLongitude !== undefined) backendPayload.KITCHEN_LONGITUDE = Number(data.kitchenLongitude);
    if (data.fssaiStatus !== undefined) backendPayload.FSSAI_STATUS = data.fssaiStatus;
    if (data.fssaiNumber !== undefined) backendPayload.FSSAI_NUMBER = data.fssaiNumber;
    if (data.fssaiCertificateUrl !== undefined) backendPayload.FSSAI_CERTIFICATE_URL = data.fssaiCertificateUrl;
    if (data.gstin !== undefined) backendPayload.GSTIN = data.gstin;
    if (data.gstCertificateUrl !== undefined) backendPayload.GST_CERTIFICATE_URL = data.gstCertificateUrl;
    if (data.websiteUrl !== undefined) backendPayload.WEBSITE_URL = data.websiteUrl;
    if (data.businessAddress !== undefined) backendPayload.BUSINESS_ADDRESS = data.businessAddress;
    if (data.instagramUrl !== undefined) backendPayload.INSTAGRAM_URL = data.instagramUrl;
    if (data.facebookUrl !== undefined) backendPayload.FACEBOOK_URL = data.facebookUrl;
    if (data.twitterUrl !== undefined) backendPayload.TWITTER_URL = data.twitterUrl;
    if (data.linkedinUrl !== undefined) backendPayload.LINKEDIN_URL = data.linkedinUrl;
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
    if (data.deliverySlotBookingCutoffMinutes !== undefined) {
      backendPayload.DELIVERY_SLOT_BOOKING_CUTOFF_MINUTES = Number(data.deliverySlotBookingCutoffMinutes);
    }
    if (data.maxAdvanceBookingDays !== undefined) {
      backendPayload.MAX_ADVANCE_BOOKING_DAYS = Number(data.maxAdvanceBookingDays);
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

