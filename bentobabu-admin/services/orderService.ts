import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Order, OrderStatus, PaymentStatus } from "@/types";

export interface BackendOrder {
  _id: string;
  id?: string;
  orderNumber: string;
  user?: {
    _id: string;
    id?: string;
    name: string;
    email: string;
    phone: string;
  };
  items: Array<{
    product: string | { _id: string; name?: string; images?: string[]; imagesData?: Array<{ secureUrl?: string }> };
    productName: string;
    image?: string;
    productImage?: string;
    unitPrice?: number;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  grandTotal: number;
  deliveryCharge: number;
  taxAmount: number;
  couponDiscount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    addressType?: string;
  };
  deliverySlot?: {
    _id: string;
    label?: string;
    slotKey?: string;
    startTime?: string;
    endTime?: string;
    date?: string;
    dateStr?: string;
  };
  deliveryDateStr?: string | null;
  deliverySlotKey?: string | null;
  deliverySlotLabel?: string;
  deliverySlotStartTime?: string | null;
  deliverySlotEndTime?: string | null;
  preparationReminder?: import("@/types").PreparationReminder;
  assignedDeliveryPartner?: {
    _id: string;
    id?: string;
    name: string;
    phone: string;
  };
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    changedBy?: { name: string; role: string };
    note?: string;
  }>;
  cancellationReason?: string;
  cancellationRequest?: any;
  createdAt: string;
  receipt?: {
    status: "PENDING" | "GENERATING" | "STORED" | "FAILED";
    storageProvider?: string;
    bucket?: string;
    objectKey?: string;
    fileName?: string;
    contentType?: string;
    fileSize?: number;
    generatedAt?: string;
    uploadedAt?: string;
    lastError?: string;
  };
}

export const mapBackendOrder = (o: BackendOrder): Order & { _backendId: string; rawStatus: string } => {
  const sUpper = (o.orderStatus || "PENDING").toUpperCase();
  let status: OrderStatus = "pending";
  if (sUpper === "CONFIRMED") status = "confirmed";
  else if (sUpper === "PREPARING") status = "preparing";
  else if (sUpper === "READY_FOR_PICKUP" || sUpper === "READY_FOR_DISPATCH") status = "ready_for_dispatch";
  else if (sUpper === "RIDER_ACCEPTED") status = "rider_accepted";
  else if (sUpper === "PICKED_UP") status = "picked_up";
  else if (sUpper === "OUT_FOR_DELIVERY") status = "out_for_delivery";
  else if (sUpper === "DELIVERED") status = "delivered";
  else if (sUpper === "CANCELLED") status = "cancelled";

  const pUpper = (o.paymentStatus || "PENDING").toUpperCase();
  let paymentStatus: PaymentStatus = "pending";
  if (pUpper === "PAID") paymentStatus = "paid";
  else if (pUpper === "FAILED") paymentStatus = "failed";
  else if (pUpper === "REFUNDED") paymentStatus = "refunded";

  const addr = (o as any).deliveryAddress || o.shippingAddress;

  return {
    id: o.orderNumber || o._id,
    _backendId: o._id,
    rawStatus: sUpper,
    createdAt: o.createdAt || new Date().toISOString(),
    customerName: o.user?.name || addr?.fullName || "Guest Customer",
    customerEmail: o.user?.email || "customer@bentobabu.in",
    customerPhone: o.user?.phone || addr?.phone || "",
    items: (o.items || []).map((it: any) => {
      const prod = typeof it.product === "object" && it.product !== null ? it.product : null;
      const rawImg =
        it.image ||
        it.productImage ||
        prod?.images?.[0] ||
        prod?.imagesData?.[0]?.secureUrl ||
        "";
      return {
        productId: prod?._id || it.product || "",
        productName: it.productName || prod?.name || "Bento Item",
        productImage: rawImg || "/images/placeholder.png",
        price: it.unitPrice || it.price || 0,
        quantity: it.quantity || 1,
      };
    }),
    subtotal: o.subtotal || 0,
    discount: o.couponDiscount || 0,
    deliveryFee: o.deliveryCharge || 0,
    tax: o.taxAmount || 0,
    total: o.grandTotal || 0,
    status,
    paymentStatus,
    paymentMethod: (o.paymentMethod || "").toUpperCase() === "COD" ? "cod" : "razorpay",
    deliveryAddress: {
      houseNo: addr?.addressLine || "",
      street: addr?.landmark || "",
      landmark: addr?.landmark || "",
      city: addr?.city || "Kolkata",
      state: addr?.state || "West Bengal",
      pincode: addr?.pincode || "700120",
      type: (addr?.addressType?.toLowerCase() || "home") as "home" | "work" | "other",
    },
    deliverySlot:
      o.deliverySlotLabel ||
      o.deliverySlot?.label ||
      (o.deliverySlot ? `${o.deliverySlot.startTime || ""} - ${o.deliverySlot.endTime || ""}` : undefined),
    deliveryDateStr: o.deliveryDateStr || o.deliverySlot?.dateStr || null,
    deliverySlotKey: o.deliverySlotKey || o.deliverySlot?.slotKey || null,
    deliverySlotLabel: o.deliverySlotLabel || o.deliverySlot?.label || "",
    deliverySlotStartTime: o.deliverySlotStartTime || o.deliverySlot?.startTime || null,
    deliverySlotEndTime: o.deliverySlotEndTime || o.deliverySlot?.endTime || null,
    preparationReminder: o.preparationReminder || { status: "NOT_APPLICABLE" },
    cancellationReason: o.cancellationReason,
    cancellationRequest: o.cancellationRequest || null,
    receipt: o.receipt
      ? {
          status: o.receipt.status || "PENDING",
          storageProvider: o.receipt.storageProvider,
          bucket: o.receipt.bucket,
          objectKey: o.receipt.objectKey,
          fileName: o.receipt.fileName,
          contentType: o.receipt.contentType,
          fileSize: o.receipt.fileSize,
          generatedAt: o.receipt.generatedAt,
          uploadedAt: o.receipt.uploadedAt,
          lastError: o.receipt.lastError,
        }
      : undefined,
  };
};

export const orderService = {
  async getAllWithSummary(params?: {
    status?: string;
    search?: string;
    deliveryDateFilter?: string;
    deliveryDate?: string;
    deliverySlotKey?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    orders: (Order & { _backendId: string; rawStatus: string })[];
    dateSummary: import("@/types").DateOrderSummary;
    pagination: { totalOrders: number; totalPages: number; currentPage: number; limit: number };
  }> {
    const queryParams: Record<string, string | number> = {
      limit: params?.limit || 50,
      page: params?.page || 1,
    };
    if (params?.status && params.status !== "all") {
      let st = params.status.toUpperCase();
      if (st === "READY_FOR_DISPATCH") st = "READY_FOR_PICKUP";
      queryParams.orderStatus = st;
    }
    if (params?.search && params.search.trim()) {
      queryParams.orderNumber = params.search.trim();
    }
    if (params?.deliveryDateFilter && params.deliveryDateFilter !== "all") {
      queryParams.deliveryDateFilter = params.deliveryDateFilter;
    }
    if (params?.deliveryDate) {
      queryParams.deliveryDate = params.deliveryDate;
    }
    if (params?.deliverySlotKey && params.deliverySlotKey !== "all") {
      queryParams.deliverySlotKey = params.deliverySlotKey;
    }

    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        orders: BackendOrder[];
        dateSummary?: import("@/types").DateOrderSummary;
        pagination: { totalOrders: number; totalPages: number; currentPage: number; limit: number };
      };
    }>(ADMIN_API_ENDPOINTS.ORDERS.LIST, { params: queryParams });

    const rawList = res.data?.data?.orders || [];
    return {
      orders: rawList.map(mapBackendOrder),
      dateSummary: res.data?.data?.dateSummary || { totalOrders: rawList.length, totalItems: 0, slots: [] },
      pagination: res.data?.data?.pagination || { totalOrders: rawList.length, totalPages: 1, currentPage: 1, limit: 50 },
    };
  },

  async getAll(params?: { status?: string; search?: string }): Promise<Order[]> {
    const res = await this.getAllWithSummary(params);
    return res.orders;
  },

  async acknowledgePreparation(id: string): Promise<Order> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: { order: BackendOrder };
    }>(ADMIN_API_ENDPOINTS.ORDERS.ACKNOWLEDGE_PREPARATION(id));
    return mapBackendOrder(res.data?.data?.order || (res.data as unknown as BackendOrder));
  },

  async getById(id: string): Promise<Order | null> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        order: BackendOrder;
      };
    }>(ADMIN_API_ENDPOINTS.ORDERS.DETAIL(id));

    const order = res.data?.data?.order;
    return order ? mapBackendOrder(order) : null;
  },

  async updateStatus(id: string, newStatus: OrderStatus | string, note?: string): Promise<Order> {
    let resolvedId = id;
    if (!resolvedId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const found = await adminApiClient.get<{
          success: boolean;
          data: { orders: BackendOrder[] };
        }>(ADMIN_API_ENDPOINTS.ORDERS.LIST, { params: { orderNumber: resolvedId } });
        if (found.data?.data?.orders?.[0]?._id) {
          resolvedId = found.data.data.orders[0]._id;
        }
      } catch {
        // fallback to original id
      }
    }

    const mapped = (newStatus || "").toLowerCase();
    let endpoint = "";
    let payload: Record<string, unknown> = {};

    if (mapped === "preparing" || mapped === "ready_for_dispatch" || mapped === "ready_for_pickup") {
      const target = mapped === "preparing" ? "PREPARING" : "READY_FOR_PICKUP";
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.KITCHEN_STATUS(resolvedId);
      payload = { status: target, note: note || `Kitchen status updated to ${target}` };
    } else if (mapped === "rider_accepted") {
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.DELIVERY_STATUS(resolvedId);
      payload = { status: "RIDER_ACCEPTED", note: note || `Status updated to RIDER_ACCEPTED` };
    } else if (mapped === "picked_up") {
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.DELIVERY_STATUS(resolvedId);
      payload = { status: "PICKED_UP", note: note || `Delivery status updated to PICKED_UP` };
    } else if (mapped === "out_for_delivery" || mapped === "delivered") {
      const target = mapped === "out_for_delivery" ? "OUT_FOR_DELIVERY" : "DELIVERED";
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.DELIVERY_STATUS(resolvedId);
      payload = { status: target, note: note || `Delivery status updated to ${target}` };
    } else if (mapped === "cancelled") {
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.CANCEL(resolvedId);
      payload = { reason: note || "Cancelled via admin operations" };
    } else {
      // Default try kitchen update
      endpoint = ADMIN_API_ENDPOINTS.ORDERS.KITCHEN_STATUS(resolvedId);
      payload = { status: newStatus.toUpperCase(), note };
    }

    const res = await adminApiClient.patch<{
      success: boolean;
      data: BackendOrder;
    }>(endpoint, payload);

    return mapBackendOrder(res.data?.data || (res.data as unknown as BackendOrder));
  },

  async assignDeliveryPartner(orderId: string, deliveryPartnerId: string): Promise<void> {
    await adminApiClient.put(ADMIN_API_ENDPOINTS.ORDERS.ASSIGN_DELIVERY(orderId), {
      deliveryPartnerId,
    });
  },

  async getOrderHistory(orderId: string) {
    const res = await adminApiClient.get(ADMIN_API_ENDPOINTS.ORDERS.HISTORY(orderId));
    return res.data?.data || res.data;
  },

  async cancelOrder(id: string, reason: string): Promise<Order> {
    return this.updateStatus(id, "cancelled", reason);
  },

  /**
   * Download persistent order receipt PDF via backend streaming proxy
   */
  async downloadReceipt(orderId: string): Promise<Blob> {
    const res = await adminApiClient.get(`/orders/${orderId}/receipt`, {
      responseType: "blob",
    });
    return res.data;
  },

  /**
   * Controlled regeneration and re-upload of receipt in Backblaze B2
   */
  async regenerateReceipt(orderId: string): Promise<void> {
    await adminApiClient.post(`/admin/orders/${orderId}/receipt/regenerate`);
  },
};
