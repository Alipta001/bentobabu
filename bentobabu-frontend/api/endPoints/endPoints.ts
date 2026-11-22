/**
 * BentoBabu Central API Endpoints Definition
 * Authoritative REST contract mapping to the BentoBabu backend (Phases 1–8).
 */

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    GOOGLE: "/auth/google",
    REGISTER: "/auth/register",
    OTP_CONFIG: "/auth/otp-config",
    OTP_STATUS: "/auth/otp-status",
    VERIFY_SIGNUP_OTP: "/auth/verify-signup-otp",
    RESEND_SIGNUP_OTP: "/auth/resend-signup-otp",
    VERIFY_MOBILE_WIDGET: "/auth/verify-mobile-widget",
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
    CONFIG: "/delivery/config",
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
    RECEIPT: (id: string) => `/orders/${id}/receipt`,
    CANCEL: (id: string) => `/orders/${id}/cancel`,
    CANCEL_REQUEST: (id: string) => `/orders/${id}/cancel-request`,
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
  SUPPORT: {
    CONFIG: "/support/config",
    FAQS: (category?: string) => (category ? `/support/faqs?category=${encodeURIComponent(category)}` : "/support/faqs"),
    TICKETS: "/support/tickets",
    TICKET_DETAIL: (id: string) => `/support/tickets/${id}`,
    TICKET_REPLY: (id: string) => `/support/tickets/${id}/messages`,
    UPLOAD: "/support/upload",
  },
  REVIEWS: {
    PRODUCT: (productId: string) => `/reviews/product/${productId}`,
    ELIGIBILITY: (productId: string) => `/reviews/eligibility/${productId}`,
    SUBMIT: "/reviews",
    UPDATE: (id: string) => `/reviews/${id}`,
    MY_REVIEWS: "/reviews/my",
    UPLOAD_IMAGE: "/reviews/upload-image",
  },
  SETTINGS: {
    ORDERING_STATUS: "/settings/ordering-status",
  },
  SERVICE_EXPANSION: {
    VOTE: "/service-expansion/vote",
  },
} as const;
