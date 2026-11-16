export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
    PROFILE: "/auth/profile",
    REFRESH: "/auth/refresh",
    CSRF_TOKEN: "/auth/csrf-token",
  },
  OPERATIONS: {
    DELIVERY_ORDERS: "/operations/delivery/orders",
    UPDATE_DELIVERY_STATUS: (id: string) => `/operations/delivery/orders/${id}/status`,
  },
  ORDERS: {
    DETAIL: (id: string) => `/orders/${id}`,
  },
  NOTIFICATIONS: {
    LIST: "/notifications",
    UNREAD_COUNT: "/notifications/unread-count",
    MARK_READ: (id: string) => `/notifications/${id}/read`,
    MARK_ALL_READ: "/notifications/read-all",
  },
} as const;
