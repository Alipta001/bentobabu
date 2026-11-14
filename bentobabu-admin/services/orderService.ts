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
    product: string | { _id: string; name: string };
    productName: string;
    productImage?: string;
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
    startTime?: string;
    endTime?: string;
    date?: string;
  };
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
  createdAt: string;
}

export const mapBackendOrder = (o: BackendOrder): Order & { _backendId: string; rawStatus: string } => {
  const sUpper = (o.orderStatus || "PENDING").toUpperCase();
  let status: OrderStatus = "pending";
  if (sUpper === "CONFIRMED") status = "confirmed";
  else if (sUpper === "PREPARING") status = "preparing";
  else if (sUpper === "READY_FOR_PICKUP") status = "ready_for_dispatch";
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
    items: (o.items || []).map((it) => ({
      productId: typeof it.product === "object" ? it.product._id : it.product || "",
      productName: it.productName || "Bento Item",
      productImage: it.productImage || "/images/placeholder.png",
      price: it.price || 0,
      quantity: it.quantity || 1,
    })),
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
    deliverySlot: o.deliverySlot?.label || (o.deliverySlot ? `${o.deliverySlot.startTime || ""} - ${o.deliverySlot.endTime || ""}` : undefined),
    cancellationReason: o.cancellationReason,
  };
};

export const orderService = {
  async getAll(params?: { status?: string; search?: string }): Promise<Order[]> {
    const queryParams: Record<string, string | number> = { limit: 50 };
    if (params?.status && params.status !== "all") {
      let st = params.status.toUpperCase();
      if (st === "READY_FOR_DISPATCH") st = "READY_FOR_PICKUP";
      queryParams.orderStatus = st;
    }
    if (params?.search && params.search.trim()) {
      queryParams.orderNumber = params.search.trim();
    }

    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        orders: BackendOrder[];
        pagination: { totalOrders: number };
      };
    }>(ADMIN_API_ENDPOINTS.ORDERS.LIST, { params: queryParams });

    const rawList = res.data?.data?.orders || [];
    return rawList.map(mapBackendOrder);
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
};
