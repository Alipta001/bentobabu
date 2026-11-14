import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

// Cache for CSRF double-submit token
let csrfTokenCache: string | null = null;
let csrfTokenPromise: Promise<string | null> | null = null;

/**
 * Fetches or returns cached CSRF token from backend.
 * Reads directly from document.cookie first to guarantee 100% synchronization with browser cookie jar.
 */
export const getCsrfToken = async (): Promise<string | null> => {
  if (typeof document !== "undefined") {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("bb_csrf_token="));
    if (match) {
      const val = match.split("=")[1];
      if (val) {
        const decoded = decodeURIComponent(val);
        csrfTokenCache = decoded;
        return decoded;
      }
    }
  }

  if (csrfTokenCache) return csrfTokenCache;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = axios
    .get<{ success: boolean; data: { csrfToken: string } }>(
      `${BASE_URL}/auth/csrf-token`,
      { withCredentials: true }
    )
    .then((res) => {
      const token = res.data?.data?.csrfToken || null;
      csrfTokenCache = token;
      csrfTokenPromise = null;
      return token;
    })
    .catch(() => {
      csrfTokenPromise = null;
      return null;
    });

  return csrfTokenPromise;
};

/**
 * Invalidate cached CSRF token (e.g. after session refresh or logout)
 */
export const clearCsrfToken = () => {
  csrfTokenCache = null;
  csrfTokenPromise = null;
};

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true, // Supports HttpOnly cookie authentication
});

// Request interceptor to attach CSRF token on mutating requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const method = config.method?.toLowerCase();
    const isMutating = ["post", "put", "patch", "delete"].includes(method || "");

    if (isMutating && !config.url?.includes("/auth/csrf-token")) {
      const csrfToken = await getCsrfToken();
      if (csrfToken && config.headers) {
        if (typeof (config.headers as any).set === "function") {
          (config.headers as any).set("X-CSRF-Token", csrfToken);
        } else {
          config.headers["X-CSRF-Token"] = csrfToken;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Global authentication failure listener for AuthContext synchronization
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

export const onAuthFailure = (listener: AuthFailureListener) => {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
};

const notifyAuthFailure = () => {
  authFailureListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
};

// Single-flight refresh promise to guarantee only one refresh runs at a time
let refreshPromise: Promise<void> | null = null;

const refreshTokens = async (): Promise<void> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // Obtain valid CSRF token before calling POST /auth/refresh
      const csrfToken = await getCsrfToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      // Execute refresh using raw axios (with credentials) so it never triggers response interceptor
      await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers,
        }
      );

      // Invalidate in-memory cache to ensure next mutating call inspects the refreshed cookie
      clearCsrfToken();
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Response interceptor for automatic single-flight session refresh & retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ success?: boolean; message?: string; errors?: Record<string, string[]> }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 Unauthorized and not already retried
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Do not attempt refresh on auth entrypoints themselves
      if (
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/register") ||
        originalRequest.url?.includes("/auth/refresh")
      ) {
        clearCsrfToken();
        const msg = error.response?.data?.message || "Invalid credentials or session expired.";
        return Promise.reject(new Error(msg));
      }

      // Mark request as retried to strictly prevent infinite loops
      originalRequest._retry = true;

      try {
        // Wait for the single-flight refresh operation
        await refreshTokens();

        // If mutating request, update CSRF token header
        const method = originalRequest.method?.toLowerCase();
        if (["post", "put", "patch", "delete"].includes(method || "")) {
          const freshCsrf = await getCsrfToken();
          if (freshCsrf && originalRequest.headers) {
            if (typeof (originalRequest.headers as any).set === "function") {
              (originalRequest.headers as any).set("X-CSRF-Token", freshCsrf);
            } else {
              originalRequest.headers["X-CSRF-Token"] = freshCsrf;
            }
          }
        }

        // Retry the original request with newly issued HttpOnly access cookie
        return apiClient(originalRequest);
      } catch (refreshErr: any) {
        clearCsrfToken();
        // Only trigger global auth failure if refresh endpoint returned 401 (definitive token invalidity)
        if (refreshErr?.response?.status === 401) {
          notifyAuthFailure();
        }
        const message =
          refreshErr?.response?.data?.message ||
          error.response?.data?.message ||
          "Session expired. Please log in again.";
        return Promise.reject(new Error(message));
      }
    }

    // Preserve backend-specific error message; do not overwrite with generic message unless empty
    const backendMessage = error.response?.data?.message;
    const errorMessage =
      backendMessage ||
      (error.response?.status === 404
        ? "Requested resource was not found."
        : error.response?.status === 403
        ? "Access forbidden: you do not have permission to access this resource."
        : error.response?.status === 401
        ? "Session expired. Please log in again."
        : error.code === "ERR_NETWORK"
        ? "Unable to reach the server. Please check your internet connection."
        : error.message || "An unexpected error occurred.");

    return Promise.reject(new Error(errorMessage));
  }
);

export default apiClient;
