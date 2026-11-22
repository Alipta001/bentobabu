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
  dateStr?: string;
  slotKey?: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount?: number;
  currentOrders?: number;
  remainingCapacity?: number;
  scheduleSource?: "WEEKLY" | "DATE_ADDITION" | "DATE_OVERRIDE" | "CUSTOM";
  isActive: boolean;
  createdAt?: string;
}

export interface WeeklySlotTemplate {
  _id?: string;
  id?: string;
  slotKey?: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
  orderCutoffMinutes?: number;
}

export interface WeeklyScheduleDay {
  _id?: string;
  id?: string;
  dayOfWeek: number;
  dayName: string;
  isDeliveryEnabled: boolean;
  slots: WeeklySlotTemplate[];
}

export interface EffectiveDeliverySlot {
  id: string;
  _id?: string;
  date: string;
  dateStr?: string;
  slotKey: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  remainingCapacity: number;
  isActive: boolean;
  isAvailable: boolean;
  isPastWindow?: boolean;
  scheduleSource: "WEEKLY" | "DATE_ADDITION" | "DATE_OVERRIDE" | "CUSTOM";
}

export interface DateScheduleDetails {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isClosed: boolean;
  closureReason: string;
  overrideMode: "INHERIT" | "REPLACE" | "ADDITIVE";
  effectiveSlots: EffectiveDeliverySlot[];
  isOverridden?: boolean;
  schedule?: {
    date: string;
    isClosed: boolean;
    closureReason: string;
    overrideMode: "INHERIT" | "REPLACE" | "ADDITIVE";
    disabledSlotKeys: string[];
    slotOverrides: any[];
    customSlots: any[];
  } | null;
  effectiveSchedule?: {
    state: string;
    message: string;
    slots: EffectiveDeliverySlot[];
  };
  dateConfig?: {
    date: string;
    isClosed: boolean;
    closureReason: string;
    overrideMode: "INHERIT" | "REPLACE" | "ADDITIVE";
    disabledSlotKeys: string[];
    slotOverrides: any[];
    customSlots: any[];
  } | null;
  weeklyConfig?: WeeklyScheduleDay | null;
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

  async deleteZone(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.DELIVERY.ZONE_DETAIL(id));
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

  async deleteSlot(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.DELIVERY.SLOT_DETAIL(id));
  },

  // Weekly Schedules
  async getWeeklySchedules(): Promise<WeeklyScheduleDay[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        schedules: WeeklyScheduleDay[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.WEEKLY_SCHEDULE);

    return res.data?.data?.schedules || [];
  },

  async updateWeeklySchedule(
    dayOfWeek: number,
    data: {
      isDeliveryEnabled?: boolean;
      slots: WeeklySlotTemplate[];
    }
  ): Promise<WeeklyScheduleDay> {
    const res = await adminApiClient.put<{
      success: boolean;
      message: string;
      data: {
        schedule: WeeklyScheduleDay;
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.WEEKLY_SCHEDULE_DAY(dayOfWeek), data);

    return res.data?.data?.schedule;
  },

  async copyWeeklySchedule(
    fromDay: number,
    toDays: number[]
  ): Promise<WeeklyScheduleDay[]> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: {
        schedules: WeeklyScheduleDay[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.WEEKLY_SCHEDULE_COPY, {
      fromDay,
      toDays,
    });

    return res.data?.data?.schedules || [];
  },

  // Date-Specific Schedules
  async getDateSchedule(date: string): Promise<DateScheduleDetails> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: any;
    }>(ADMIN_API_ENDPOINTS.DELIVERY.DATE_SCHEDULE(date));

    const raw = res.data?.data;
    const dateCfg = raw?.dateConfig;
    const isOverridden = Boolean(
      dateCfg &&
        (dateCfg.isClosed ||
          (dateCfg.overrideMode && dateCfg.overrideMode !== "INHERIT") ||
          (dateCfg.disabledSlotKeys && dateCfg.disabledSlotKeys.length > 0) ||
          (dateCfg.customSlots && dateCfg.customSlots.length > 0) ||
          (dateCfg.slotOverrides && dateCfg.slotOverrides.length > 0))
    );

    const slots = raw?.effectiveSlots || [];
    return {
      date: raw?.date || date,
      dayOfWeek: raw?.dayOfWeek ?? 0,
      dayName: raw?.dayName || "",
      isClosed: Boolean(raw?.isClosed),
      closureReason: raw?.closureReason || "",
      overrideMode: raw?.overrideMode || "INHERIT",
      effectiveSlots: slots,
      isOverridden,
      schedule: dateCfg || null,
      effectiveSchedule: {
        state: raw?.isClosed ? "DELIVERY_CLOSED" : slots.length > 0 ? "AVAILABLE" : "NO_SCHEDULE",
        message: raw?.closureReason || "",
        slots,
      },
      dateConfig: dateCfg,
      weeklyConfig: raw?.weeklyConfig,
    };
  },

  async updateDateSchedule(
    date: string,
    data: {
      isClosed?: boolean;
      closureReason?: string;
      overrideMode?: "INHERIT" | "REPLACE" | "ADDITIVE";
      disabledSlotKeys?: string[];
      slotOverrides?: any[];
      customSlots?: any[];
    }
  ): Promise<DateScheduleDetails> {
    const res = await adminApiClient.put<{
      success: boolean;
      message: string;
      data: {
        dateSchedule: any;
        effectiveSlots: EffectiveDeliverySlot[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.UPDATE_DATE_SCHEDULE(date), data);

    return this.getDateSchedule(date);
  },

  async restoreWeeklySchedule(date: string): Promise<{ effectiveSlots: EffectiveDeliverySlot[] }> {
    const res = await adminApiClient.delete<{
      success: boolean;
      message: string;
      data: {
        effectiveSlots: EffectiveDeliverySlot[];
      };
    }>(ADMIN_API_ENDPOINTS.DELIVERY.RESTORE_DATE_SCHEDULE(date));

    return res.data?.data;
  },
};
