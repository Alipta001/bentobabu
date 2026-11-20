import { authService } from "@/services/authService";

const PRIMARY_SCRIPT_URL = "https://verify.msg91.com/otp-provider.js";
const FALLBACK_SCRIPT_URL = "https://verify.phone91.com/otp-provider.js";
const SCRIPT_ID = "msg91-otp-provider-script";

declare global {
  interface Window {
    initSendOTP?: (configuration: any) => void;
    sendOtp?: (
      identifier: string,
      success?: (data: any) => void,
      failure?: (err: any) => void
    ) => void;
    verifyOtp?: (
      otp: string | number,
      success?: (data: any) => void,
      failure?: (err: any) => void,
      requestId?: string
    ) => void;
    retryOtp?: (
      retryChannel?: string | null,
      success?: (data: any) => void,
      failure?: (err: any) => void,
      requestId?: string
    ) => void;
  }
}

/**
 * Loads the MSG91 OTP Provider script with fallback and duplicate prevention
 */
export function loadMsg91Script(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return resolve();
    }

    if (typeof window.initSendOTP === "function" || typeof window.sendOtp === "function") {
      return resolve();
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.getAttribute("data-loaded") === "true") {
        return resolve();
      }
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = PRIMARY_SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      script.setAttribute("data-loaded", "true");
      resolve();
    };

    script.onerror = () => {
      console.warn("[MSG91] Primary script failed, attempting fallback:", FALLBACK_SCRIPT_URL);
      script.remove();

      const fallbackScript = document.createElement("script");
      fallbackScript.id = SCRIPT_ID;
      fallbackScript.src = FALLBACK_SCRIPT_URL;
      fallbackScript.async = true;

      fallbackScript.onload = () => {
        fallbackScript.setAttribute("data-loaded", "true");
        resolve();
      };

      fallbackScript.onerror = () => {
        reject(new Error("Failed to load mobile verification provider from both primary and fallback sources."));
      };

      document.head.appendChild(fallbackScript);
    };

    document.head.appendChild(script);
  });
}

let initPromise: Promise<void> | null = null;

/**
 * Ensures the MSG91 OTP widget is initialized with exposeMethods: true
 */
export async function ensureMsg91Initialized(): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof window.sendOtp === "function" && typeof window.verifyOtp === "function") {
    return;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    await loadMsg91Script();
    const config = await authService.getMsg91WidgetConfig();

    if (typeof window.initSendOTP !== "function") {
      throw new Error("MSG91 OTP provider could not be initialized.");
    }

    const widgetId = config.widgetId || process.env.NEXT_PUBLIC_MSG91_WIDGET_ID || "366b746e3258343539303835";
    const configuration = {
      widgetId,
      tokenAuth: config.tokenAuth,
      identifier: "", // Leave blank so initSendOTP exposes window methods without blind auto-send
      exposeMethods: true,
      success: (data: any) => {
        console.log("[MSG91 OTP] Global widget success:", data);
      },
      failure: (err: any) => {
        console.warn("[MSG91 OTP] Global widget failure:", err);
      },
    };

    window.initSendOTP(configuration);

    // Wait until window.sendOtp is attached by the SDK
    let attempts = 0;
    while (attempts < 25 && (typeof window.sendOtp !== "function" || typeof window.verifyOtp !== "function")) {
      await new Promise((r) => setTimeout(r, 40));
      attempts++;
    }
  })();

  return initPromise;
}

/**
 * Sends OTP to a clean 10-digit Indian phone number via MSG91
 */
export async function sendMsg91Otp(phone: string): Promise<{ requestId: string; phone: string }> {
  const digits = phone.replace(/\D/g, "");
  const cleanPhone = digits.slice(-10);
  if (cleanPhone.length !== 10) {
    throw new Error("Please enter a valid 10-digit Indian mobile number.");
  }

  await ensureMsg91Initialized();

  return new Promise((resolve, reject) => {
    if (typeof window.sendOtp !== "function") {
      return reject(new Error("Mobile verification service is not ready. Please try again."));
    }

    const identifier = `91${cleanPhone}`;
    window.sendOtp(
      identifier,
      (data: any) => {
        console.log("[MSG91 OTP] Send OTP response:", data);
        if (data && typeof data === "object" && data.type === "error") {
          return reject(new Error(data.message || "Failed to send mobile verification code."));
        }

        const reqId =
          data?.requestId ||
          data?.reqId ||
          (data?.data && (data.data.requestId || data.data.reqId)) ||
          (data?.type === "success" && typeof data?.message === "string" && data.message.length > 5
            ? data.message
            : "") ||
          "";

        resolve({ requestId: reqId, phone: cleanPhone });
      },
      (err: any) => {
        console.error("[MSG91 OTP] Send OTP error:", err);
        const msg =
          err?.message ||
          (typeof err === "string" ? err : "Failed to send mobile verification code.");
        reject(new Error(msg));
      }
    );
  });
}

/**
 * Verifies entered OTP code with MSG91 using exposeMethods verifyOtp.
 * NOTE: Calling this verifies the code with MSG91 client SDK, but the returned accessToken
 * MUST be sent to backend /api/v1/auth/verify-mobile-widget for authoritative verification.
 */
export async function verifyMsg91Otp(
  otp: string,
  requestId?: string
): Promise<{ accessToken: string; raw: any }> {
  await ensureMsg91Initialized();

  const trimmedOtp = String(otp || "").trim();
  if (!trimmedOtp || trimmedOtp.length !== 6 || !/^\d{6}$/.test(trimmedOtp)) {
    throw new Error("Please enter the complete 6-digit verification code.");
  }

  return new Promise((resolve, reject) => {
    if (typeof window.verifyOtp !== "function") {
      return reject(new Error("Mobile verification service is not ready. Please try again."));
    }

    window.verifyOtp(
      trimmedOtp,
      (data: any) => {
        console.log("[MSG91 OTP] OTP verified callback data:", data);
        if (data && typeof data === "object" && data.type === "error") {
          return reject(new Error(data.message || "Invalid or expired verification code."));
        }

        const accessToken =
          data?.["access-token"] ||
          data?.accessToken ||
          data?.jwt ||
          data?.token ||
          (data?.data && (data.data["access-token"] || data.data.accessToken || data.data.jwt)) ||
          (data?.type === "success" && typeof data?.message === "string" && data.message.length > 20
            ? data.message
            : "") ||
          "";

        if (!accessToken) {
          return reject(new Error("No valid verification token received from mobile verification provider."));
        }
        resolve({ accessToken, raw: data });
      },
      (err: any) => {
        console.warn("[MSG91 OTP] Verify OTP failed callback:", err);
        const msg =
          err?.message ||
          (typeof err === "string" ? err : "Invalid or expired verification code.");
        reject(new Error(msg));
      },
      requestId
    );
  });
}

/**
 * Maps channel name to MSG91 SendOTP retry channel code:
 * 11: SMS (default)
 * 12: Voice
 * 13: WhatsApp
 * 14: Email
 */
export function mapMsg91RetryChannel(channel: string = "sms"): string {
  const normalized = String(channel || "").trim().toLowerCase();
  switch (normalized) {
    case "sms":
    case "11":
      return "11";
    case "voice":
    case "call":
    case "12":
      return "12";
    case "whatsapp":
    case "13":
      return "13";
    case "email":
    case "14":
      return "14";
    default:
      return "11"; // MSG91 documented custom UI SMS retry channel is "11"
  }
}

/**
 * Retries/resends OTP via MSG91 using documented custom UI channel code ("11" for SMS)
 */
export async function retryMsg91Otp(
  channel: string = "sms",
  requestId?: string
): Promise<any> {
  await ensureMsg91Initialized();

  return new Promise((resolve, reject) => {
    if (typeof window.retryOtp !== "function") {
      return reject(new Error("Mobile verification service is not ready. Please try again."));
    }

    const retryChannel = mapMsg91RetryChannel(channel);

    window.retryOtp(
      retryChannel,
      (data: any) => {
        console.log("[MSG91 OTP] Retry OTP response:", data);
        if (data && typeof data === "object" && data.type === "error") {
          return reject(new Error(data.message || "Failed to resend verification code."));
        }
        resolve(data);
      },
      (err: any) => {
        console.error("[MSG91 OTP] Retry OTP error:", err);
        const msg =
          err?.message ||
          (typeof err === "string" ? err : "Failed to resend verification code.");
        reject(new Error(msg));
      },
      requestId
    );
  });
}
