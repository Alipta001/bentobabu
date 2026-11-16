import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type AvailabilityStatus = "ONLINE" | "OFFLINE" | "BUSY";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED";
export type LocationFreshness = "LIVE" | "LAST_KNOWN" | "NONE";

export interface DeliveryOperationsOverview {
  totalApproved: number;
  online: number;
  available: number;
  busy: number;
  offline: number;
  disconnected: number;
  suspendedOrDeactivated: number;
  activeDeliveriesCount: number;
  updatedAt: string;
  config?: {
    heartbeatTimeoutMs: number;
    locationFreshMs: number;
  };
}

export interface MonitoredPartner {
  id: string;
  name: string;
  phone: string;
  email: string;
  profilePhoto?: string | null;
  applicationNumber?: string | null;
  vehicleInfo?: {
    vehicleType: string;
    brand?: string;
    model?: string;
    registrationNumber?: string;
  } | null;
  accountStatus: AccountStatus;
  availabilityStatus: AvailabilityStatus;
  connectionStatus: ConnectionStatus;
  locationFreshness: LocationFreshness;
  currentOrderId?: string | null;
  currentOrder?: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    address?: {
      houseNo: string;
      street: string;
      city: string;
      landmark?: string;
    };
  } | null;
  lastLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    batteryLevel?: number | null;
    updatedAt?: string | null;
  } | null;
  lastHeartbeat?: string | null;
  createdAt?: string;
}

export interface PartnerDetailData extends MonitoredPartner {
  personalInfo?: {
    fullName?: string;
    gender?: string;
    dateOfBirth?: string;
  } | null;
  totalDeliveries: number;
  recentDeliveries: Array<{
    id: string;
    orderNumber: string;
    total: number;
    itemCount: number;
    deliveredAt: string;
    address?: any;
  }>;
}

export interface GetPartnersParams {
  search?: string;
  filter?: string;
  sortBy?: "lastSeen" | "name" | "status";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export const deliveryOperationsService = {
  async getOverview(): Promise<DeliveryOperationsOverview> {
    const response = await adminApiClient.get<{
      success: boolean;
      data: DeliveryOperationsOverview;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_OPERATIONS.OVERVIEW);
    return response.data.data;
  },

  async getPartners(params?: GetPartnersParams): Promise<{
    partners: MonitoredPartner[];
    total: number;
    page: number;
    totalPages: number;
    timestamp: string;
  }> {
    const response = await adminApiClient.get<{
      success: boolean;
      data: MonitoredPartner[];
      total: number;
      page: number;
      totalPages: number;
      timestamp: string;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_OPERATIONS.PARTNERS, { params });
    return {
      partners: response.data.data,
      total: response.data.total,
      page: response.data.page,
      totalPages: response.data.totalPages,
      timestamp: response.data.timestamp,
    };
  },

  async getPartnerDetail(id: string): Promise<PartnerDetailData> {
    const response = await adminApiClient.get<{
      success: boolean;
      data: PartnerDetailData;
    }>(ADMIN_API_ENDPOINTS.DELIVERY_OPERATIONS.PARTNER_DETAIL(id));
    return response.data.data;
  },

  async updatePartnerStatus(
    id: string,
    accountStatus: "ACTIVE" | "SUSPENDED",
    reason?: string
  ): Promise<{ id: string; accountStatus: AccountStatus }> {
    const response = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: { id: string; accountStatus: AccountStatus };
    }>(ADMIN_API_ENDPOINTS.DELIVERY_OPERATIONS.UPDATE_STATUS(id), {
      accountStatus,
      reason,
    });
    return response.data.data;
  },
};
