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
};
