import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface DailyMenuItem {
  product: {
    id: string;
    _id: string;
    name: string;
    slug: string;
    category?: {
      _id: string;
      id?: string;
      name: string;
      slug: string;
    };
    price: number;
    images?: string[];
    dietaryTags?: string[];
    stockQuantity: number;
    masterIsAvailable: boolean;
    isActive: boolean;
  };
  isAvailable: boolean;
}

export interface DailyMenuData {
  date: string;
  isConfigured: boolean;
  isPublished: boolean;
  notes: string;
  items: DailyMenuItem[];
}

export interface WeeklyMenuDay {
  date: string;
  dayName: string;
  isConfigured: boolean;
  isPublished: boolean;
  availability: Record<string, boolean>; // productId -> isAvailable
}

export interface WeeklyMenuProduct {
  id: string;
  name: string;
  slug: string;
  category?: {
    _id: string;
    id?: string;
    name: string;
    slug: string;
  };
  price: number;
  images?: string[];
  dietaryTags?: string[];
  masterIsAvailable: boolean;
}

export interface WeeklyMenuData {
  startDate: string;
  endDate: string;
  days: WeeklyMenuDay[];
  products: WeeklyMenuProduct[];
}

export const menuService = {
  /**
   * Fetch daily menu availability for a specific date (defaults to today)
   */
  async getDailyMenu(date?: string): Promise<DailyMenuData> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: DailyMenuData;
    }>(ADMIN_API_ENDPOINTS.MENU.DAILY, {
      params: date ? { date } : undefined,
    });
    return res.data.data;
  },

  /**
   * Save or publish daily menu availability for a specific date
   */
  async saveDailyMenu(payload: {
    date: string;
    items: Array<{ product: string; isAvailable: boolean }>;
    isPublished?: boolean;
    notes?: string;
  }): Promise<DailyMenuData> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DailyMenuData;
      message: string;
    }>(ADMIN_API_ENDPOINTS.MENU.SAVE_DAILY, payload);
    return res.data.data;
  },

  /**
   * Toggle a single product's daily availability and persist immediately
   */
  async toggleDailyItem(payload: {
    date: string;
    productId: string;
    isAvailable: boolean;
  }): Promise<DailyMenuData> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: DailyMenuData;
      message: string;
    }>(ADMIN_API_ENDPOINTS.MENU.TOGGLE_DAILY_ITEM, payload);
    return res.data.data;
  },

  /**
   * Copy yesterday's menu configuration to target date
   */
  async continueYesterday(targetDate: string): Promise<DailyMenuData> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: DailyMenuData;
      message: string;
    }>(ADMIN_API_ENDPOINTS.MENU.CONTINUE_YESTERDAY, { targetDate });
    return res.data.data;
  },

  /**
   * Fetch 7-day weekly menu matrix starting from a start date (Monday)
   */
  async getWeeklyMenu(startDate?: string): Promise<WeeklyMenuData> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: WeeklyMenuData;
    }>(ADMIN_API_ENDPOINTS.MENU.WEEKLY, {
      params: startDate ? { startDate } : undefined,
    });
    return res.data.data;
  },

  /**
   * Save the complete weekly schedule matrix
   */
  async saveWeeklyMenu(payload: {
    days: Array<{
      date: string;
      items: Array<{ product: string; isAvailable: boolean }>;
      isPublished?: boolean;
    }>;
  }): Promise<void> {
    await adminApiClient.post(ADMIN_API_ENDPOINTS.MENU.SAVE_WEEKLY, payload);
  },

  /**
   * Apply one day's menu to selected days of the week
   */
  async applyWeekAll(payload: {
    sourceDate: string;
    targetDates: string[];
  }): Promise<void> {
    await adminApiClient.post(ADMIN_API_ENDPOINTS.MENU.APPLY_WEEK_ALL, payload);
  },
};
