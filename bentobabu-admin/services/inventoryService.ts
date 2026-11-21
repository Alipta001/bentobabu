import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Product } from "@/types";
import { BackendProduct, mapBackendProduct } from "./productService";

export interface StockAdjustmentPayload {
  productId: string;
  adjustmentType: "ADD" | "REMOVE" | "SET" | "add" | "subtract" | "set";
  quantity: number;
  reason: string;
}

export interface RestockHistoryEntry {
  _id?: string;
  id?: string;
  quantityAdded: number;
  previousTotalStock: number;
  newTotalStock: number;
  admin?: string | { name: string; email: string };
  adminName?: string;
  note?: string;
  timestamp: string;
}

export interface DailyInventoryItem {
  productId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    category?: { id: string; name: string };
    price: number;
    images?: string[];
    servingSize?: string;
    lowStockThreshold: number;
    masterIsAvailable: boolean;
  };
  serviceDate: string;
  initialStock: number;
  restockedQuantity: number;
  totalStock: number;
  reservedQuantity: number;
  soldQuantity: number;
  remainingStock: number;
  isSoldOut: boolean;
  isManuallyDisabled: boolean;
  status: "AVAILABLE" | "LOW_STOCK" | "SOLD_OUT" | "MANUALLY_UNAVAILABLE";
}

export interface DailyInventorySummary {
  totalDishes: number;
  totalCapacity: number;
  totalReserved: number;
  totalRemaining: number;
  availableCount: number;
  lowStockCount: number;
  soldOutCount: number;
  manuallyDisabledCount: number;
}

export interface InventoryLogItem {
  _id: string;
  id?: string;
  product: string;
  previousStock: number;
  newStock: number;
  quantityChange: number;
  adjustmentType: string;
  reason: string;
  admin?: {
    name: string;
    email: string;
    role: string;
  };
  createdAt: string;
}

export const inventoryService = {
  async getAll(params?: { search?: string; categoryId?: string; lowStock?: boolean }): Promise<Product[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        products: BackendProduct[];
        pagination: { totalProducts: number };
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.LIST, {
      params: {
        limit: 100,
        ...params,
      },
    });

    const products = res.data?.data?.products || [];
    return products.map(mapBackendProduct);
  },

  async getLowStock(): Promise<Product[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        products: BackendProduct[];
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.LOW_STOCK);

    const products = res.data?.data?.products || [];
    return products.map(mapBackendProduct);
  },

  async getOutOfStock(): Promise<Product[]> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        products: BackendProduct[];
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.OUT_OF_STOCK);

    const products = res.data?.data?.products || [];
    return products.map(mapBackendProduct);
  },

  async adjustStock(payload: StockAdjustmentPayload): Promise<Product> {
    let typeUpper: "ADD" | "REMOVE" | "SET" = "ADD";
    const t = payload.adjustmentType.toUpperCase();
    if (t === "SUBTRACT" || t === "REMOVE") {
      typeUpper = "REMOVE";
    } else if (t === "SET") {
      typeUpper = "SET";
    } else {
      typeUpper = "ADD";
    }

    const res = await adminApiClient.post<{
      success: boolean;
      data: {
        product: BackendProduct;
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.ADJUST(payload.productId), {
      adjustmentType: typeUpper,
      quantity: Number(payload.quantity),
      reason: payload.reason || "Manual stock update via admin dashboard",
    });

    const prod = res.data?.data?.product || (res.data as unknown as BackendProduct);
    return mapBackendProduct(prod);
  },

  async getHistory(productId: string, page: number = 1, limit: number = 20): Promise<{
    history: InventoryLogItem[];
    totalLogs: number;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        history: InventoryLogItem[];
        pagination: { totalLogs: number };
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.HISTORY(productId), {
      params: { page, limit },
    });

    return {
      history: res.data?.data?.history || [],
      totalLogs: res.data?.data?.pagination?.totalLogs || 0,
    };
  },

  async getDaily(params?: { serviceDate?: string; status?: string }): Promise<{
    serviceDate: string;
    summary: DailyInventorySummary;
    items: DailyInventoryItem[];
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        serviceDate: string;
        summary: DailyInventorySummary;
        items: DailyInventoryItem[];
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.DAILY, {
      params,
    });

    return (
      res.data?.data || {
        serviceDate: params?.serviceDate || "",
        summary: {
          totalDishes: 0,
          totalCapacity: 0,
          totalReserved: 0,
          totalRemaining: 0,
          availableCount: 0,
          lowStockCount: 0,
          soldOutCount: 0,
          manuallyDisabledCount: 0,
        },
        items: [],
      }
    );
  },

  async setDailyCapacity(payload: {
    productId: string;
    capacity: number;
    serviceDate?: string;
    reason?: string;
  }) {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.INVENTORY.SET_CAPACITY, payload);
    return res.data;
  },

  async restockDaily(payload: {
    productId: string;
    additionalQuantity: number;
    serviceDate?: string;
    note?: string;
  }) {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.INVENTORY.RESTOCK, payload);
    return res.data;
  },

  async toggleDailyAvailability(payload: {
    productId: string;
    isManuallyDisabled: boolean;
    serviceDate?: string;
    reason?: string;
  }) {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(ADMIN_API_ENDPOINTS.INVENTORY.TOGGLE_AVAILABILITY, payload);
    return res.data;
  },

  async getDailyRestockHistory(
    productId: string,
    serviceDate?: string
  ): Promise<{
    serviceDate: string;
    initialStock: number;
    restockedQuantity: number;
    totalStock: number;
    remainingStock: number;
    history: RestockHistoryEntry[];
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        serviceDate: string;
        initialStock: number;
        restockedQuantity: number;
        totalStock: number;
        remainingStock: number;
        history: RestockHistoryEntry[];
      };
    }>(ADMIN_API_ENDPOINTS.INVENTORY.DAILY_HISTORY(productId), {
      params: { serviceDate },
    });

    return (
      res.data?.data || {
        serviceDate: serviceDate || "",
        initialStock: 0,
        restockedQuantity: 0,
        totalStock: 0,
        remainingStock: 0,
        history: [],
      }
    );
  },
};
