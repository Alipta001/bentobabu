import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { BrandConfig, brandConfig } from "@/config/brand";

export interface PublicSettingsResponse {
  name?: string;
  businessName?: string;
  tagline?: string;
  description?: string;
  shortDescription?: string;
  contact?: {
    email?: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    operatingHours?: string;
  };
  social?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
  };
  fssai?: {
    status?: string;
    number?: string;
  };
  websiteUrl?: string;
}

/**
 * Merges backend public settings with the local brandConfig fallback.
 * Guarantees that every field is valid and never null, undefined, or broken.
 */
export function mergeBrandConfig(backendData?: PublicSettingsResponse | null): BrandConfig {
  if (!backendData) return brandConfig;

  return {
    ...brandConfig,
    name: backendData.name?.trim() || backendData.businessName?.trim() || brandConfig.name,
    tagline: backendData.tagline?.trim() || brandConfig.tagline,
    description: backendData.description?.trim() || brandConfig.description,
    shortDescription: backendData.shortDescription?.trim() || brandConfig.shortDescription,
    logo: {
      ...brandConfig.logo,
      text: backendData.name?.trim() || backendData.businessName?.trim() || brandConfig.logo.text,
    },
    contact: {
      email: backendData.contact?.email?.trim() || brandConfig.contact.email,
      phone: backendData.contact?.phone?.trim() || brandConfig.contact.phone,
      whatsapp:
        backendData.contact?.whatsapp?.trim() ||
        backendData.contact?.phone?.trim() ||
        brandConfig.contact.whatsapp,
      address: backendData.contact?.address?.trim() || brandConfig.contact.address,
      operatingHours:
        backendData.contact?.operatingHours?.trim() || brandConfig.contact.operatingHours,
    },
    social: {
      instagram: backendData.social?.instagram?.trim() || brandConfig.social.instagram,
      facebook: backendData.social?.facebook?.trim() || brandConfig.social.facebook,
      twitter: backendData.social?.twitter?.trim() || brandConfig.social.twitter,
      linkedin: backendData.social?.linkedin?.trim() || brandConfig.social.linkedin,
    },
    fssai: {
      status: backendData.fssai?.status?.trim() || brandConfig.fssai?.status || "APPLICATION_SUBMITTED",
      number: backendData.fssai?.number?.trim() || brandConfig.fssai?.number || "",
    },
    websiteUrl: backendData.websiteUrl?.trim() || brandConfig.websiteUrl || "https://bentobabu.com",
  };
}

export const brandService = {
  async getBrandConfig(): Promise<BrandConfig> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: PublicSettingsResponse;
      }>(API_ENDPOINTS.SETTINGS.PUBLIC);

      if (response.data && response.data.data) {
        return mergeBrandConfig(response.data.data);
      }
      return brandConfig;
    } catch (err) {
      console.warn("[brandService] Failed to fetch dynamic brand settings, using fallback:", err);
      return brandConfig;
    }
  },
};
