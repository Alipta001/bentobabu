import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { DeliveryZone } from "@/types";

export interface BackendDeliveryZone {
  _id: string;
  id?: string;
  name: string;
  pincodes: string[];
  deliveryCharge: number;
  minimumOrderAmount: number;
  estimatedDeliveryMinutes: number;
  isActive: boolean;
  createdAt?: string;
}

export interface DeliverySlotItem {
  _id: string;
  id?: string;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  currentOrders?: number;
  isActive: boolean;
  createdAt?: string;
}

const mapZone = (z: BackendDeliveryZone): DeliveryZone => ({
  id: z._id || z.id || "",
  areaName: z.name,
  pincode: Array.isArray(z.pincodes) ? z.pincodes.join(", ") : "",
  deliveryFee: z.deliveryCharge ?? 30,
  minOrderValue: z.minimumOrderAmount ?? 0,
  estimatedMinutes: `${z.estimatedDeliveryMinutes ?? 35} mins`,
  isServiceable: z.isActive ?? true,
});

export const deliveryService = {
  // Zones
  async getZones(): Promise<DeliveryZone[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        count: number;
        zones: BackendDeliveryZone[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.ZONES);

    const zones = res.data?.data?.zones || [];
    return zones.map(mapZone);
  },

  async createZone(data: {
    name: string;
    pincodes: string[];
    deliveryCharge?: number;
    minimumOrderAmount?: number;
    estimatedDeliveryMinutes?: number;
    isActive?: boolean;
  }): Promise<DeliveryZone> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: {
        zone: BackendDeliveryZone;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.ZONES, data);

    const z = res.data?.data?.zone;
    return mapZone(z);
  },

  async updateZone(
    id: string,
    data: Partial<{
      name: string;
      pincodes: string[];
      deliveryCharge: number;
      minimumOrderAmount: number;
      estimatedDeliveryMinutes: number;
      isActive: boolean;
    }>
  ): Promise<DeliveryZone> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        zone: BackendDeliveryZone;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.ZONE_DETAIL(id), data);

    const z = res.data?.data?.zone;
    return mapZone(z);
  },

  async toggleZone(id: string, currentActive: boolean = true): Promise<DeliveryZone> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        zone: BackendDeliveryZone;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.ZONE_STATUS(id), {
      isActive: !currentActive,
    });

    const z = res.data?.data?.zone;
    return mapZone(z);
  },

  // Slots
  async getSlots(params?: { date?: string; isActive?: boolean }): Promise<DeliverySlotItem[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        count: number;
        slots: DeliverySlotItem[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.SLOTS, { params });

    return res.data?.data?.slots || [];
  },

  async createSlot(data: {
    date: string;
    label: string;
    startTime: string;
    endTime: string;
    capacity?: number;
    isActive?: boolean;
  }): Promise<DeliverySlotItem> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: {
        slot: DeliverySlotItem;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.SLOTS, data);

    return res.data?.data?.slot;
  },

  async updateSlot(
    id: string,
    data: Partial<{
      label: string;
      startTime: string;
      endTime: string;
      capacity: number;
      isActive: boolean;
    }>
  ): Promise<DeliverySlotItem> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        slot: DeliverySlotItem;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.SLOT_DETAIL(id), data);

    return res.data?.data?.slot;
  },

  async toggleSlot(id: string, currentActive: boolean = true): Promise<DeliverySlotItem> {
    const res = await adminApiClient.put<{
      success: boolean;
      data: {
        slot: DeliverySlotItem;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.SLOT_STATUS(id), {
      isActive: !currentActive,
    });

    return res.data?.data?.slot;
  },
};
