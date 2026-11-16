import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

let csrfTokenCache: string | null = null;
let csrfTokenPromise: Promise<string | null> | null = null;

/**
 * Double-submit cookie CSRF protection
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
  withCredentials: true,
});

// Mutating requests automatically attach X-CSRF-Token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const method = config.method?.toLowerCase();
    const isMutating = ["post", "put", "patch", "delete"].includes(method || "");

    if (isMutating && !config.url?.includes("/auth/csrf-token")) {
      const csrfToken = await getCsrfToken();
      if (csrfToken && config.headers) {
        config.headers["X-CSRF-Token"] = csrfToken;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Single-flight refresh token lock
let refreshPromise: Promise<void> | null = null;

const refreshTokens = async (): Promise<void> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const csrfToken = await getCsrfToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers,
        }
      );

      clearCsrfToken();
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// Response interceptor with automatic 401 refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/refresh")
      ) {
        clearCsrfToken();
        if (typeof window !== "undefined") {
          localStorage.removeItem("bb_delivery_user");
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        await refreshTokens();
        return apiClient(originalRequest);
      } catch (refreshErr) {
        clearCsrfToken();
        if (typeof window !== "undefined") {
          localStorage.removeItem("bb_delivery_user");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
