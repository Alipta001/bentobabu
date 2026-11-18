import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

const CONTEXT = "admin";
const LOCK_NAME = `bb_refresh_lock_${CONTEXT}`;
const CHANNEL_NAME = `bb_auth_channel_${CONTEXT}`;
const MARKER_KEY = `bb_refresh_marker_${CONTEXT}`;

// Cache for CSRF double-submit token
let csrfTokenCache: string | null = null;
let csrfTokenPromise: Promise<string | null> | null = null;

/**
 * Fetches or returns cached CSRF token from backend
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
 * Invalidate cached CSRF token
 */
export const clearCsrfToken = () => {
  csrfTokenCache = null;
  csrfTokenPromise = null;
};

export const adminApiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true, // Supports HttpOnly cookie authentication
});

// Authentication generation counter to strictly prevent cross-session request replay
let authGeneration = 1;

export const bumpAuthGeneration = (): number => {
  authGeneration++;
  return authGeneration;
};

export const getAuthGeneration = (): number => authGeneration;

// Cross-tab coordination via Web Locks, BroadcastChannel, and localStorage markers
const getSharedMarker = (): number => {
  if (typeof window === "undefined") return 0;
  try {
    const val = localStorage.getItem(MARKER_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
};

const advanceSharedMarker = (): number => {
  const next = Date.now();
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(MARKER_KEY, String(next));
    } catch {}
  }
  return next;
};

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === "SESSION_EXPIRED") {
        bumpAuthGeneration();
        if (typeof window !== "undefined") {
          localStorage.removeItem("bb_admin_user");
          const currentPath = window.location.pathname;
          if (!currentPath.startsWith("/login")) {
            window.location.replace("/login");
          }
        }
      }
    };
  } catch {}
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === `bb_session_expired_${CONTEXT}`) {
      bumpAuthGeneration();
      localStorage.removeItem("bb_admin_user");
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
  });
}

const broadcastSessionExpired = () => {
  bumpAuthGeneration();
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: "SESSION_EXPIRED" });
    } catch {}
  }
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`bb_session_expired_${CONTEXT}`, String(Date.now()));
    } catch {}
  }
};

const broadcastRefreshSuccess = (marker: number) => {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: "REFRESH_SUCCESS", marker });
    } catch {}
  }
};

// Request interceptor to attach CSRF token on mutating requests and track auth generation
adminApiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (typeof (config as any)._authGeneration === "undefined") {
      (config as any)._authGeneration = authGeneration;
    }
    if (typeof (config as any)._requestSentAt === "undefined") {
      (config as any)._requestSentAt = Date.now();
    }

    if (config.headers) {
      if (typeof (config.headers as any).set === "function") {
        (config.headers as any).set("X-Auth-Context", CONTEXT);
      } else {
        config.headers["X-Auth-Context"] = CONTEXT;
      }
    }

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

// Coordinated single-flight refresh across local promises and browser tabs
let localRefreshPromise: Promise<void> | null = null;

const executeCoordinatedRefresh = async (): Promise<void> => {
  if (localRefreshPromise) {
    return localRefreshPromise;
  }

  localRefreshPromise = (async () => {
    const initialMarker = getSharedMarker();

    const performActualRefresh = async (): Promise<void> => {
      const currentMarker = getSharedMarker();
      if (currentMarker > initialMarker) {
        clearCsrfToken();
        return;
      }

      const csrfToken = await getCsrfToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Auth-Context": CONTEXT,
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      try {
        await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers,
          }
        );
        const newMarker = advanceSharedMarker();
        clearCsrfToken();
        broadcastRefreshSuccess(newMarker);
      } catch (err: any) {
        if (
          err?.response?.status === 409 &&
          err?.response?.data?.code === "CONCURRENT_REFRESH_IN_PROGRESS"
        ) {
          const startTime = Date.now();
          while (Date.now() - startTime < 1500) {
            await new Promise((r) => setTimeout(r, 100));
            if (getSharedMarker() > initialMarker) {
              break;
            }
          }
          clearCsrfToken();
          return;
        }

        if (err?.response?.status === 401) {
          broadcastSessionExpired();
        }
        throw err;
      }
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.locks &&
        typeof navigator.locks.request === "function"
      ) {
        const lockOptions =
          typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
            ? { signal: AbortSignal.timeout(8000) }
            : undefined;

        if (lockOptions) {
          await navigator.locks.request(LOCK_NAME, lockOptions, performActualRefresh);
        } else {
          await navigator.locks.request(LOCK_NAME, performActualRefresh);
        }
      } else {
        await performActualRefresh();
      }
    } finally {
      localRefreshPromise = null;
    }
  })();

  return localRefreshPromise;
};

// Response interceptor for unified error formatting, generation fencing, and coordinated refresh
adminApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _authGeneration?: number;
      _requestSentAt?: number;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const isAuthUrl =
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/register") ||
        originalRequest.url?.includes("/auth/logout") ||
        originalRequest.url?.includes("/auth/refresh");

      if (isAuthUrl) {
        clearCsrfToken();
        if (typeof window !== "undefined") {
          localStorage.removeItem("bb_admin_user");
        }
        const msg = error.response?.data?.message || "Admin credentials invalid or session expired.";
        return Promise.reject(new Error(msg));
      }

      // BLOCKER SAFETY CHECK:
      // If authGeneration changed since request dispatch, REJECT immediately.
      // NEVER retry an old admin's request under a new session!
      if (originalRequest._authGeneration !== authGeneration) {
        return Promise.reject(new Error("Request aborted: Authentication session changed."));
      }

      originalRequest._retry = true;

      try {
        await executeCoordinatedRefresh();

        // Re-verify generation after refresh completion
        if (originalRequest._authGeneration !== authGeneration) {
          return Promise.reject(new Error("Request aborted: Authentication session changed during refresh."));
        }

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

        return adminApiClient(originalRequest);
      } catch (refreshErr: any) {
        clearCsrfToken();
        if (refreshErr?.response?.status === 401) {
          broadcastSessionExpired();
          if (typeof window !== "undefined") {
            localStorage.removeItem("bb_admin_user");
            const currentPath = window.location.pathname;
            if (!currentPath.startsWith("/login")) {
              window.location.replace("/login");
            }
          }
        }
        return Promise.reject(new Error("Admin session expired. Please sign in again."));
      }
    }

    const errorMessage =
      error.response?.data?.message ||
      (error.response?.status === 404
        ? "Resource not found on server."
        : error.response?.status === 403
        ? "Admin permission denied."
        : error.response?.status === 401
        ? "Admin session expired. Please sign in again."
        : error.message || "An unexpected network error occurred.");

    return Promise.reject(new Error(errorMessage));
  }
);

export default adminApiClient;
