import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Order, OrderStatus, PaymentStatus } from "@/types";
import { normalizeAddress } from "./addressService";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

/**
 * Safely unpack an order object from any backend wrapper format
 */
export function extractOrderPayload(raw: any): any {
  if (!raw || typeof raw !== "object") return null;

  // 1. Nested in data.order
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    if (raw.data.order && typeof raw.data.order === "object") {
      return raw.data.order;
    }
    // 2. Direct order in data
    if (raw.data._id || raw.data.id || raw.data.orderNumber || raw.data.orderStatus) {
      return raw.data;
    }
  }

  // 3. Direct order in raw.order
  if (raw.order && typeof raw.order === "object") {
    return raw.order;
  }

  // 4. Raw itself is the order
  if (raw._id || raw.id || raw.orderNumber || raw.orderStatus) {
    return raw;
  }

  // 5. Fallback to raw.data if present
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    return raw.data;
  }

  return raw;
}

export const normalizeOrder = (ord: any): Order => {
  if (!ord || typeof ord !== "object") {
    return {} as Order;
  }

  const items = Array.isArray(ord.items)
    ? ord.items.map((it: any) => ({
        productId: it.product?._id || it.product?.id || it.productId || it.product || "",
        product: it.product,
        productName: it.productName || it.product?.name || "Bento Meal",
        productImage: it.image || it.productImage || it.product?.images?.[0] || "",
        image: it.image || it.productImage || it.product?.images?.[0] || "",
        price: it.unitPrice || it.price || 0,
        unitPrice: it.unitPrice || it.price || 0,
        quantity: it.quantity || 1,
        subtotal: it.subtotal || (it.unitPrice || it.price || 0) * (it.quantity || 1),
        dietary: it.dietary || "vegetarian",
      }))
    : [];

  const rawStatus = ord.orderStatus || ord.status || "PENDING";
  const status = String(rawStatus).toUpperCase() as OrderStatus;
  const rawPaymentStatus = ord.paymentStatus || "PENDING";
  const paymentStatus = String(rawPaymentStatus).toUpperCase() as PaymentStatus;
  const rawPaymentMethod = ord.paymentMethod || "COD";
  const paymentMethod = String(rawPaymentMethod).toUpperCase() as "RAZORPAY" | "COD";

  const subtotal = ord.itemTotal ?? ord.subtotal ?? 0;
  const discount = ord.couponDiscount ?? ord.discount ?? 0;
  const deliveryFee = ord.deliveryCharge ?? ord.deliveryFee ?? 0;
  const tax = ord.taxAmount ?? ord.tax ?? 0;
  const total = ord.grandTotal ?? ord.total ?? 0;

  const id = ord.id || ord._id || "";

  return {
    id: String(id),
    _id: String(id),
    orderNumber: ord.orderNumber || (id ? `BB-${String(id).slice(-6).toUpperCase()}` : "BB-ORDER"),
    createdAt: ord.createdAt || new Date().toISOString(),
    items,
    subtotal,
    itemTotal: subtotal,
    discount,
    couponDiscount: discount,
    deliveryFee,
    deliveryCharge: deliveryFee,
    tax,
    taxAmount: tax,
    total,
    grandTotal: total,
    status,
    orderStatus: status,
    paymentStatus,
    paymentMethod,
    deliveryAddress: ord.deliveryAddress ? normalizeAddress(ord.deliveryAddress) : ({} as any),
    deliveryZone: ord.deliveryZone,
    deliverySlot: ord.deliverySlot,
    coupon: ord.coupon,
    deliveryOtp: ord.deliveryOtp || null,
    cancellationReason: ord.cancellationReason || null,
    cancellationRequest: ord.cancellationRequest || null,
    statusHistory: Array.isArray(ord.statusHistory) ? ord.statusHistory : [],
    estimatedDelivery: ord.estimatedDelivery || "35 - 45 mins",
  };
};

export const orderService = {
  /**
   * Fetch all orders placed by the current customer (/orders)
   */
  async getAll(): Promise<Order[]> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ orders: any[] }> | ApiResponse<any[]> | { orders: any[] } | any[]
      >(API_ENDPOINTS.ORDERS.LIST);

      const raw = response.data;
      let list: any[] = [];

      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && "data" in raw) {
        if (Array.isArray(raw.data)) {
          list = raw.data;
        } else if (raw.data && Array.isArray(raw.data.orders)) {
          list = raw.data.orders;
        }
      } else if (raw && "orders" in raw && Array.isArray(raw.orders)) {
        list = raw.orders;
      }

      return list.map(normalizeOrder);
    } catch (err) {
      console.error("[orderService] Error fetching orders:", err);
      return [];
    }
  },

  /**
   * Fetch a single order by ID (/orders/:id)
   */
  async getById(id: string): Promise<Order | null> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ order: any }> | ApiResponse<any> | { order: any } | any
      >(API_ENDPOINTS.ORDERS.DETAIL(id));

      const raw = response.data;
      const order = extractOrderPayload(raw);

      return order ? normalizeOrder(order) : null;
    } catch (err) {
      console.error(`[orderService] Error fetching order ${id}:`, err);
      return null;
    }
  },

  /**
   * Place an authoritative order using the customer's active Cart (/orders)
   */
  async create(payload: {
    addressId: string;
    deliverySlotId?: string;
    couponCode?: string;
    paymentMethod: "RAZORPAY" | "COD" | "razorpay" | "cod";
    idempotencyKey?: string;
  }): Promise<Order> {
    const formattedPayload = {
      addressId: payload.addressId,
      deliverySlotId: payload.deliverySlotId || undefined,
      couponCode: payload.couponCode ? payload.couponCode.trim().toUpperCase() : undefined,
      paymentMethod: payload.paymentMethod.toUpperCase(),
      ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
    };

    const headers: Record<string, string> = {};
    if (payload.idempotencyKey) {
      headers["Idempotency-Key"] = payload.idempotencyKey;
    }

    const response = await apiClient.post<
      ApiResponse<any> | any
    >(API_ENDPOINTS.ORDERS.CREATE, formattedPayload, { headers });

    const raw = response.data;
    const orderData = extractOrderPayload(raw);
    return normalizeOrder(orderData);
  },

  /**
   * Cancel an order (/orders/:id/cancel)
   */
  async cancel(id: string, reason?: string): Promise<Order> {
    const response = await apiClient.patch<
      ApiResponse<{ order: any }> | ApiResponse<any> | { order: any } | any
    >(API_ENDPOINTS.ORDERS.CANCEL(id), { reason: reason || "Customer requested cancellation" });

    const raw = response.data;
    const orderData = extractOrderPayload(raw);

    return normalizeOrder(orderData);
  },

  /**
   * Submit customer cancellation request for an eligible order
   */
  async requestCancellation(id: string, reason: string): Promise<any> {
    const response = await apiClient.post<
      ApiResponse<{ cancellationRequest: any }> | any
    >(API_ENDPOINTS.ORDERS.CANCEL_REQUEST(id), { reason });

    const raw = response.data;
    return raw?.data?.cancellationRequest || raw?.cancellationRequest || raw?.data || raw;
  },

  /**
   * Download branded PDF order receipt (/orders/:id/receipt)
   */
  async downloadReceipt(id: string): Promise<Blob> {
    const response = await apiClient.get(API_ENDPOINTS.ORDERS.RECEIPT(id), {
      responseType: "blob",
    });
    return response.data;
  },
};
