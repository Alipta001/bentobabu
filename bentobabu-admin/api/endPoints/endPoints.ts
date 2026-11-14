/**
 * Central Admin API Endpoints Definition
 * Production-ready REST contract designed for the BentoBabu Express.js / MongoDB backend.
 */

export const ADMIN_API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
    REFRESH: "/auth/refresh",
    LOGOUT_ALL: "/auth/logout-all",
  },
  DASHBOARD: {
    OVERVIEW: "/admin/dashboard/overview",
    REVENUE: "/admin/dashboard/revenue",
    ORDERS: "/admin/dashboard/orders",
    PRODUCTS: "/admin/dashboard/products",
    CUSTOMERS: "/admin/dashboard/customers",
  },
  ORDERS: {
    LIST: "/admin/orders",
    DETAIL: (id: string) => `/admin/orders/${id}`,
    HISTORY: (id: string) => `/admin/orders/${id}/history`,
    ASSIGN_DELIVERY: (id: string) => `/admin/orders/${id}/assign-delivery`,
    CANCEL: (id: string) => `/orders/${id}/cancel`,
    KITCHEN_STATUS: (id: string) => `/operations/kitchen/orders/${id}/status`,
    DELIVERY_STATUS: (id: string) => `/operations/delivery/orders/${id}/status`,
  },
  PRODUCTS: {
    LIST: "/products",
    CREATE: "/products",
    DETAIL: (id: string) => `/products/${id}`,
    UPDATE: (id: string) => `/products/${id}`,
    TOGGLE_STATUS: (id: string) => `/products/${id}/status`,
    TOGGLE_AVAILABILITY: (id: string) => `/products/${id}/availability`,
    UPDATE_STOCK: (id: string) => `/products/${id}/stock`,
    DELETE: (id: string) => `/products/${id}`,
  },
  CATEGORIES: {
    LIST: "/categories",
    CREATE: "/categories",
    DETAIL: (id: string) => `/categories/${id}`,
    UPDATE: (id: string) => `/categories/${id}`,
    TOGGLE_STATUS: (id: string) => `/categories/${id}/status`,
  },
  INVENTORY: {
    LIST: "/admin/inventory",
    LOW_STOCK: "/admin/inventory/low-stock",
    OUT_OF_STOCK: "/admin/inventory/out-of-stock",
    DETAIL: (productId: string) => `/admin/inventory/${productId}`,
    ADJUST: (productId: string) => `/admin/inventory/${productId}/adjust`,
    HISTORY: (productId: string) => `/admin/inventory/${productId}/history`,
  },
  USERS: {
    LIST: "/admin/users",
    CREATE_STAFF: "/admin/users",
    DETAIL: (id: string) => `/admin/users/${id}`,
    UPDATE_STATUS: (id: string) => `/admin/users/${id}/status`,
    UPDATE_ROLE: (id: string) => `/admin/users/${id}/role`,
  },
  DELIVERY: {
    ZONES: "/admin/delivery/zones",
    ZONE_DETAIL: (id: string) => `/admin/delivery/zones/${id}`,
    ZONE_STATUS: (id: string) => `/admin/delivery/zones/${id}/status`,
    SLOTS: "/admin/delivery/slots",
    SLOT_DETAIL: (id: string) => `/admin/delivery/slots/${id}`,
    SLOT_STATUS: (id: string) => `/admin/delivery/slots/${id}/status`,
  },
  COUPONS: {
    LIST: "/coupons",
    CREATE: "/coupons",
    DETAIL: (id: string) => `/coupons/${id}`,
    UPDATE: (id: string) => `/coupons/${id}`,
    UPDATE_STATUS: (id: string) => `/coupons/${id}/status`,
    DELETE: (id: string) => `/coupons/${id}`,
  },
  SETTINGS: {
    GET: "/admin/settings",
    UPDATE: "/admin/settings",
  },
  NOTIFICATIONS: {
    LIST: "/admin/notifications",
    STATS: "/admin/notifications/stats",
    DETAIL: (id: string) => `/admin/notifications/${id}`,
    RETRY: (id: string) => `/admin/notifications/${id}/retry`,
  },
} as const;
