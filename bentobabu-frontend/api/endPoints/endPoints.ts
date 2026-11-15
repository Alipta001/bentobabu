/**
 * BentoBabu Central API Endpoints Definition
 * Authoritative REST contract mapping to the BentoBabu backend (Phases 1–8).
 */

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    REGISTER: "/auth/register",
    OTP_STATUS: "/auth/otp-status",
    VERIFY_SIGNUP_OTP: "/auth/verify-signup-otp",
    RESEND_SIGNUP_OTP: "/auth/resend-signup-otp",
    LOGOUT: "/auth/logout",
    LOGOUT_ALL: "/auth/logout-all",
    ME: "/auth/me",
    PROFILE: "/auth/profile",
    REFRESH: "/auth/refresh",
    CSRF_TOKEN: "/auth/csrf-token",
  },
  CATEGORIES: {
    LIST: "/categories",
    DETAIL: (slug: string) => `/categories/${slug}`,
  },
  PRODUCTS: {
    LIST: "/products",
    DETAIL: (slug: string) => `/products/${slug}`,
  },
  CART: {
    GET: "/cart",
    MERGE: "/cart/merge",
    ADD_ITEM: "/cart/items",
    UPDATE_ITEM: (productId: string) => `/cart/items/${productId}`,
    REMOVE_ITEM: (productId: string) => `/cart/items/${productId}`,
    CLEAR: "/cart",
  },
  ADDRESSES: {
    LIST: "/addresses",
    CREATE: "/addresses",
    UPDATE: (id: string) => `/addresses/${id}`,
    DELETE: (id: string) => `/addresses/${id}`,
  },
  DELIVERY: {
    SERVICEABILITY: (pincode: string) => `/delivery/serviceability?pincode=${encodeURIComponent(pincode)}`,
    SLOTS: (pincode: string, date: string) =>
      `/delivery/slots?pincode=${encodeURIComponent(pincode)}&date=${encodeURIComponent(date)}`,
  },
  COUPONS: {
    VALIDATE: "/coupons/validate",
  },
  ORDERS: {
    CHECKOUT_SUMMARY: "/orders/checkout-summary",
    CREATE: "/orders",
    LIST: "/orders",
    DETAIL: (id: string) => `/orders/${id}`,
    CANCEL: (id: string) => `/orders/${id}/cancel`,
  },
  PAYMENTS: {
    CREATE_RAZORPAY_ORDER: "/payments/razorpay/create-order",
    VERIFY_RAZORPAY: "/payments/razorpay/verify",
    CONFIRM_COD: "/payments/cod/confirm",
  },
  NOTIFICATIONS: {
    LIST: "/notifications",
    UNREAD_COUNT: "/notifications/unread-count",
    MARK_READ: (id: string) => `/notifications/${id}/read`,
    MARK_ALL_READ: "/notifications/read-all",
    PREFERENCES: "/notifications/preferences",
  },
  VIDEOS: {
    LIST: "/videos",
    FEATURED: "/videos/featured",
    DETAIL: (slug: string) => `/videos/${slug}`,
  },
} as const;
