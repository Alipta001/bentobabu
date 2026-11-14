import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Order } from "@/types";
import { normalizeOrder } from "./orderService";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface RazorpayOrderResponse {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderId: string;
  keyId?: string;
}

export interface RazorpayVerificationPayload {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export const paymentService = {
  /**
   * Request backend to create Razorpay payment order with server-calculated amount
   */
  async createRazorpayOrder(orderId: string): Promise<RazorpayOrderResponse> {
    const response = await apiClient.post<
      ApiResponse<RazorpayOrderResponse> | RazorpayOrderResponse
    >(API_ENDPOINTS.PAYMENTS.CREATE_RAZORPAY_ORDER, { orderId });

    const raw = response.data;
    const data = (raw && "data" in raw && raw.data) ? raw.data : (raw as RazorpayOrderResponse);

    return {
      razorpayOrderId: data.razorpayOrderId,
      amount: data.amount,
      currency: data.currency || "INR",
      orderId: data.orderId || orderId,
      keyId: data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
    };
  },

  /**
   * Request backend to cryptographically verify Razorpay payment signature
   */
  async verifyPayment(payload: RazorpayVerificationPayload): Promise<{ success: boolean; order: Order; message?: string }> {
    const response = await apiClient.post<
      ApiResponse<{ order: any }> | { order: any }
    >(API_ENDPOINTS.PAYMENTS.VERIFY_RAZORPAY, {
      orderId: payload.orderId,
      razorpayOrderId: payload.razorpayOrderId,
      razorpayPaymentId: payload.razorpayPaymentId,
      razorpaySignature: payload.razorpaySignature,
    });

    const raw = response.data;
    const orderData = (raw && "data" in raw && raw.data?.order)
      ? raw.data.order
      : (raw as any)?.order || raw;

    return {
      success: true,
      order: normalizeOrder(orderData),
      message: (raw as any)?.message || "Payment verified successfully",
    };
  },

  /**
   * Confirm Cash on Delivery order (/payments/cod/confirm)
   */
  async confirmCodOrder(orderId: string): Promise<{ success: boolean; order: Order; message?: string }> {
    const response = await apiClient.post<
      ApiResponse<{ order: any }> | { order: any }
    >(API_ENDPOINTS.PAYMENTS.CONFIRM_COD, { orderId });

    const raw = response.data;
    const orderData = (raw && "data" in raw && raw.data?.order)
      ? raw.data.order
      : (raw as any)?.order || raw;

    return {
      success: true,
      order: normalizeOrder(orderData),
      message: (raw as any)?.message || "COD order confirmed successfully",
    };
  },
};
