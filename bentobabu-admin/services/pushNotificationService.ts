import { adminApiClient } from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  getFirebaseMessagingClient,
  isPushMessagingSupported,
  firebaseConfig,
} from "@/config/firebase";
import { getToken } from "firebase/messaging";

export interface PushDevice {
  id: string;
  platform: string;
  deviceName: string;
  browser: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  maskedToken: string;
}

export interface NotificationPreferences {
  email?: boolean;
  whatsapp?: boolean;
  inApp?: boolean;
  push?: boolean;
  newOrderPushEnabled?: boolean;
  orderUpdatePushEnabled?: boolean;
}

export interface DiagnosticStatus {
  permission: NotificationPermission | "unsupported";
  isPushSupported: boolean;
  isServiceWorkerSupported: boolean;
  isServiceWorkerRegistered: boolean;
  isFirebaseConfigured: boolean;
  hasVapidKey: boolean;
  isCurrentDeviceRegistered: boolean;
  currentDeviceTokenMasked: string | null;
}

export const pushNotificationService = {
  /**
   * Register or update FCM device token on backend
   */
  async registerDeviceToken(payload: {
    token: string;
    platform?: string;
    deviceName?: string;
    browser?: string;
  }): Promise<{ success: boolean; data: { device: PushDevice } }> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: { device: PushDevice };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.PUSH_REGISTER, payload);
    return res.data;
  },

  /**
   * Unregister / deactivate FCM device token on backend
   */
  async unregisterDeviceToken(token: string): Promise<{ success: boolean; message?: string }> {
    const res = await adminApiClient.delete<{ success: boolean; message?: string }>(
      ADMIN_API_ENDPOINTS.NOTIFICATIONS.PUSH_UNREGISTER,
      { data: { token } }
    );
    return res.data;
  },

  /**
   * Get all registered push devices for current staff member
   */
  async getRegisteredDevices(): Promise<{
    devices: PushDevice[];
    total: number;
    activeCount: number;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: { devices: PushDevice[]; total: number; activeCount: number };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.PUSH_DEVICES);
    return res.data.data;
  },

  /**
   * Send a test push notification to user's registered devices
   */
  async sendTestNotification(): Promise<{
    success: boolean;
    message: string;
    data: {
      totalDevices: number;
      tokensTargeted?: number;
      successCount: number;
      failureCount: number;
      results?: Array<{ deviceId: string; status: string; messageId?: string; error?: string }>;
    };
  }> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: {
        totalDevices: number;
        tokensTargeted?: number;
        successCount: number;
        failureCount: number;
        results?: Array<{ deviceId: string; status: string; messageId?: string; error?: string }>;
      };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.PUSH_TEST);
    return res.data;
  },

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: { preferences: NotificationPreferences };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.PREFERENCES);
    return res.data.data.preferences;
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: { preferences: NotificationPreferences };
    }>(ADMIN_API_ENDPOINTS.NOTIFICATIONS.PREFERENCES, preferences);
    return res.data.data.preferences;
  },

  /**
   * Full client flow: Detect browser support, register SW, request permission,
   * obtain FCM token, and send to backend.
   */
  async enableNotificationsOnCurrentDevice(): Promise<{
    success: boolean;
    token?: string;
    error?: string;
    permissionDenied?: boolean;
    unsupported?: boolean;
  }> {
    if (typeof window === "undefined") {
      return { success: false, error: "Window is undefined" };
    }

    const supported = await isPushMessagingSupported();
    if (!supported) {
      return {
        success: false,
        unsupported: true,
        error: "Web Push Notifications are not supported in this browser. Please use Chrome, Edge, or Safari on iOS 16.4+.",
      };
    }

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      return {
        success: false,
        error: "Firebase client configuration is missing. Please ensure NEXT_PUBLIC_FIREBASE_* environment variables are set.",
      };
    }

    // 1. Explicit user permission request
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        success: false,
        permissionDenied: true,
        error: "Notification permission was not granted. Please allow notifications in your browser site settings.",
      };
    }

    // 2. Register service worker with Firebase query parameters
    const swUrl = new URL("/firebase-messaging-sw.js", window.location.origin);
    swUrl.searchParams.set("apiKey", firebaseConfig.apiKey || "");
    swUrl.searchParams.set("authDomain", firebaseConfig.authDomain || "");
    swUrl.searchParams.set("projectId", firebaseConfig.projectId || "");
    swUrl.searchParams.set("messagingSenderId", firebaseConfig.messagingSenderId || "");
    swUrl.searchParams.set("appId", firebaseConfig.appId || "");

    const swReg = await navigator.serviceWorker.register(swUrl.pathname + swUrl.search, {
      scope: "/",
    });
    await navigator.serviceWorker.ready;

    // Send config to active service worker instance
    if (swReg.active) {
      swReg.active.postMessage({
        type: "SET_FIREBASE_CONFIG",
        config: firebaseConfig,
      });
    }

    // 3. Get FCM Messaging client & token
    const messaging = await getFirebaseMessagingClient();
    if (!messaging) {
      return {
        success: false,
        error: "Failed to initialize Firebase Messaging instance. Check browser console for details.",
      };
    }

    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return {
        success: false,
        error: "Failed to retrieve FCM push registration token from browser.",
      };
    }

    // 4. Save device token to localStorage for tracking on this specific browser
    localStorage.setItem("bb_current_fcm_token", token);

    // 5. Detect platform and browser
    const userAgent = navigator.userAgent;
    let browserName = "Browser";
    if (userAgent.includes("Firefox")) browserName = "Firefox";
    else if (userAgent.includes("Edg")) browserName = "Edge";
    else if (userAgent.includes("Chrome")) browserName = "Chrome";
    else if (userAgent.includes("Safari")) browserName = "Safari";

    const isIos = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const platform = isIos ? "IOS" : isAndroid ? "ANDROID" : "WEB";

    // 6. Register token with backend
    await this.registerDeviceToken({
      token,
      platform,
      deviceName: `${browserName} on ${platform}`,
      browser: browserName,
    });

    return {
      success: true,
      token,
    };
  },

  /**
   * Disables notifications on the current browser device
   */
  async disableNotificationsOnCurrentDevice(): Promise<{ success: boolean; error?: string }> {
    if (typeof window === "undefined") return { success: false };

    const storedToken = localStorage.getItem("bb_current_fcm_token");
    if (!storedToken) {
      return { success: true };
    }

    try {
      await this.unregisterDeviceToken(storedToken);
      localStorage.removeItem("bb_current_fcm_token");
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unregister device";
      return { success: false, error: msg };
    }
  },

  /**
   * Diagnostic inspector for current browser environment
   */
  async getDiagnosticStatus(): Promise<DiagnosticStatus> {
    if (typeof window === "undefined") {
      return {
        permission: "unsupported",
        isPushSupported: false,
        isServiceWorkerSupported: false,
        isServiceWorkerRegistered: false,
        isFirebaseConfigured: false,
        hasVapidKey: false,
        isCurrentDeviceRegistered: false,
        currentDeviceTokenMasked: null,
      };
    }

    const isPushSupported = await isPushMessagingSupported();
    const isServiceWorkerSupported = "serviceWorker" in navigator;
    let isServiceWorkerRegistered = false;

    if (isServiceWorkerSupported) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        isServiceWorkerRegistered = regs.some((r) =>
          r.active?.scriptURL.includes("firebase-messaging-sw.js")
        );
      } catch {
        // ignore
      }
    }

    const permission: NotificationPermission | "unsupported" =
      "Notification" in window ? Notification.permission : "unsupported";

    const isFirebaseConfigured = Boolean(
      firebaseConfig.apiKey && firebaseConfig.projectId
    );
    const hasVapidKey = Boolean(firebaseConfig.vapidKey);

    const storedToken = localStorage.getItem("bb_current_fcm_token");
    const isCurrentDeviceRegistered = Boolean(storedToken);
    const currentDeviceTokenMasked =
      storedToken && storedToken.length > 12
        ? `${storedToken.substring(0, 6)}...${storedToken.substring(storedToken.length - 6)}`
        : null;

    return {
      permission,
      isPushSupported,
      isServiceWorkerSupported,
      isServiceWorkerRegistered,
      isFirebaseConfigured,
      hasVapidKey,
      isCurrentDeviceRegistered,
      currentDeviceTokenMasked,
    };
  },
};
