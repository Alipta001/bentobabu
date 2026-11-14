import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { CartItem, Coupon, CheckoutSummary, Product } from "@/types";
import { normalizeProduct } from "./productService";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface BackendCartResponse {
  _id?: string;
  user?: string;
  items: Array<{
    _id?: string;
    product: any;
    quantity: number;
  }>;
  itemTotal: number;
}

function parseCartData(raw: any): { items: CartItem[]; itemTotal: number } {
  const data = (raw && "data" in raw && (raw.data?.cart || raw.data))
    ? (raw.data.cart || raw.data)
    : (raw as any)?.cart || raw;

  if (!data || !Array.isArray(data.items)) {
    return { items: [], itemTotal: 0 };
  }

  const items: CartItem[] = data.items
    .filter((it: any) => it && (it.product || it.id || it._id))
    .map((it: any) => ({
      product: normalizeProduct(it.product || it),
      quantity: it.quantity,
    }));

  return { items, itemTotal: typeof data.itemTotal === "number" ? data.itemTotal : 0 };
}

export const cartService = {
  /**
   * Fetches the authenticated customer's cart from backend (/cart)
   */
  async getCart(): Promise<{ items: CartItem[]; itemTotal: number }> {
    try {
      const response = await apiClient.get<
        ApiResponse<{ cart: BackendCartResponse }> | { cart: BackendCartResponse }
      >(API_ENDPOINTS.CART.GET);

      return parseCartData(response.data);
    } catch (err) {
      // If unauthenticated or cart empty, return empty
      return { items: [], itemTotal: 0 };
    }
  },

  /**
   * Atomically merge guest or local cart items into the customer's MongoDB cart (/cart/merge)
   */
  async mergeCart(localItems: CartItem[]): Promise<{ items: CartItem[]; itemTotal: number }> {
    try {
      if (!Array.isArray(localItems) || localItems.length === 0) {
        return await this.getCart();
      }

      const payload = {
        items: localItems
          .filter((it) => it && it.product && (it.product.id || (it.product as any)._id))
          .map((it) => ({
            productId: it.product.id || (it.product as any)._id,
            quantity: it.quantity || 1,
          })),
      };

      if (payload.items.length === 0) {
        return await this.getCart();
      }

      const response = await apiClient.post(API_ENDPOINTS.CART.MERGE, payload);
      const parsed = parseCartData(response.data);
      if (parsed.items.length > 0) {
        return parsed;
      }
      return await this.getCart();
    } catch (err) {
      console.error("[cartService] Error merging cart:", err);
      return await this.getCart();
    }
  },

  /**
   * Add item to customer cart in backend (/cart/items)
   */
  async addItem(productId: string, quantity = 1): Promise<{ items: CartItem[]; itemTotal: number }> {
    try {
      const response = await apiClient.post<
        ApiResponse<{ cart: BackendCartResponse }> | { cart: BackendCartResponse }
      >(API_ENDPOINTS.CART.ADD_ITEM, { productId, quantity });

      const parsed = parseCartData(response.data);
      if (parsed.items.length > 0) {
        return parsed;
      }
      return await this.getCart();
    } catch (err) {
      console.error("[cartService] Error adding item:", err);
      return await this.getCart();
    }
  },

  /**
   * Update quantity of item in customer cart (/cart/items/:productId)
   */
  async updateQuantity(productId: string, quantity: number): Promise<{ items: CartItem[]; itemTotal: number }> {
    try {
      const response = await apiClient.patch<
        ApiResponse<{ cart: BackendCartResponse }> | { cart: BackendCartResponse }
      >(API_ENDPOINTS.CART.UPDATE_ITEM(productId), { quantity });

      const parsed = parseCartData(response.data);
      if (parsed.items.length > 0) {
        return parsed;
      }
      return await this.getCart();
    } catch (err) {
      console.error("[cartService] Error updating quantity:", err);
      return await this.getCart();
    }
  },

  /**
   * Remove item from cart (/cart/items/:productId)
   */
  async removeItem(productId: string): Promise<{ items: CartItem[]; itemTotal: number }> {
    try {
      const response = await apiClient.delete<
        ApiResponse<{ cart: BackendCartResponse }> | { cart: BackendCartResponse }
      >(API_ENDPOINTS.CART.REMOVE_ITEM(productId));

      const parsed = parseCartData(response.data);
      return parsed;
    } catch (err) {
      console.error("[cartService] Error removing item:", err);
      return await this.getCart();
    }
  },

  /**
   * Clear customer cart (/cart)
   */
  async clearCart(): Promise<void> {
    try {
      await apiClient.delete(API_ENDPOINTS.CART.CLEAR);
    } catch {
      // ignore
    }
  },

  /**
   * Validate coupon code (/coupons/validate)
   */
  async validateCoupon(code: string, orderAmount: number): Promise<{
    coupon: Coupon;
    discountAmount: number;
    payableAmount: number;
  }> {
    const response = await apiClient.post<
      ApiResponse<{
        coupon: any;
      }>
    >(API_ENDPOINTS.COUPONS.VALIDATE, { code: code.trim().toUpperCase(), orderAmount });

    const raw = response.data;
    const data = raw && "data" in raw && raw.data?.coupon ? raw.data.coupon : (raw as any)?.coupon || raw;

    const coupon: Coupon = {
      id: data.id || data._id,
      code: data.code,
      description: data.description || `Coupon ${data.code}`,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maximumDiscount: data.maximumDiscount,
      minimumOrderAmount: data.minimumOrderAmount,
      minOrderValue: data.minimumOrderAmount,
    };

    return {
      coupon,
      discountAmount: data.discountAmount || 0,
      payableAmount: data.payableAmount || (orderAmount - (data.discountAmount || 0)),
    };
  },

  /**
   * Helper alias to validate and return coupon object
   */
  async applyCoupon(code: string, orderAmount: number): Promise<Coupon> {
    const res = await this.validateCoupon(code, orderAmount);
    return res.coupon;
  },

  /**
   * Fetch authoritative checkout summary (/orders/checkout-summary)
   */
  async getCheckoutSummary(payload: {
    addressId: string;
    deliverySlotId?: string;
    couponCode?: string;
  }): Promise<CheckoutSummary> {
    const response = await apiClient.post<
      ApiResponse<{ summary: CheckoutSummary }> | { summary: CheckoutSummary }
    >(API_ENDPOINTS.ORDERS.CHECKOUT_SUMMARY, payload);

    const raw = response.data;
    const summary = (raw && "data" in raw && raw.data?.summary)
      ? raw.data.summary
      : (raw as any)?.summary || raw;

    return {
      itemTotal: summary.itemTotal || 0,
      deliveryCharge: summary.deliveryCharge || 0,
      couponDiscount: summary.couponDiscount || 0,
      taxAmount: summary.taxAmount || 0,
      grandTotal: summary.grandTotal || 0,
      deliveryZone: summary.deliveryZone,
      deliverySlot: summary.deliverySlot,
      coupon: summary.coupon,
    };
  },
};
