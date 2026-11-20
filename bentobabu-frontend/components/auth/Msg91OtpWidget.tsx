"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, ShieldCheck, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { authService } from "@/services/authService";

declare global {
  interface Window {
    initSendOTP?: (configuration: any) => void;
  }
}

export interface Msg91OtpWidgetProps {
  phone: string;
  onVerified: (phone: string, accessToken: string) => void;
  onError?: (errorMessage: string) => void;
  isVerified?: boolean;
  disabled?: boolean;
  className?: string;
}

const PRIMARY_SCRIPT_URL = "https://verify.msg91.com/otp-provider.js";
const FALLBACK_SCRIPT_URL = "https://verify.phone91.com/otp-provider.js";
const SCRIPT_ID = "msg91-otp-provider-script";

/**
 * Loads the MSG91 OTP Widget script with fallback and duplicate prevention
 */
function loadMsg91Script(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return resolve();
    }

    if (typeof window.initSendOTP === "function") {
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
      console.warn("[Msg91OtpWidget] Primary script failed, attempting fallback:", FALLBACK_SCRIPT_URL);
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
        reject(new Error("Failed to load MSG91 OTP widget provider script from both primary and fallback sources."));
      };

      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);
  });
}

/**
 * Normalizes a 10-digit Indian phone number
 */
function cleanPhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function Msg91OtpWidget({
  phone,
  onVerified,
  onError,
  isVerified = false,
  disabled = false,
  className = "",
}: Msg91OtpWidgetProps) {
  const [status, setStatus] = useState<
    "idle" | "loading_script" | "sending" | "waiting" | "verifying" | "verified" | "error"
  >(isVerified ? "verified" : "idle");
  const [errorMsg, setErrorMsg] = useState("");
  const isMountedRef = useRef(true);

  // Sync external verified state
  useEffect(() => {
    if (isVerified) {
      setStatus("verified");
      setErrorMsg("");
    } else if (status === "verified" && !isVerified) {
      setStatus("idle");
    }
  }, [isVerified, status]);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const cleanPhone = cleanPhoneNumber(phone);
  const isValidPhone = cleanPhone.length === 10 && /^\d{10}$/.test(cleanPhone);

  const startVerification = useCallback(async () => {
    if (disabled || !isValidPhone) {
      setErrorMsg("Please enter a valid 10-digit mobile number before verifying.");
      return;
    }

    setErrorMsg("");
    setStatus("loading_script");

    try {
      // 1. Fetch server-side configuration reading NEXT_MSG91_TOKEN_AUTH
      const config = await authService.getMsg91WidgetConfig();
      if (!isMountedRef.current) return;

      if (!config.tokenAuth) {
        throw new Error("Mobile verification service is not properly configured on the server.");
      }

      // 2. Load provider script
      await loadMsg91Script();
      if (!isMountedRef.current) return;

      if (typeof window.initSendOTP !== "function") {
        throw new Error("MSG91 OTP provider could not be initialized.");
      }

      const widgetId = config.widgetId || process.env.NEXT_PUBLIC_MSG91_WIDGET_ID || "366b746e3258343539303835";

      setStatus("sending");

      const configuration = {
        widgetId,
        tokenAuth: config.tokenAuth,
        identifier: `91${cleanPhone}`,
        exposeMethods: true,
        success: async (data: any) => {
          if (!isMountedRef.current) return;

          console.log("[Msg91OtpWidget] Received verification callback from widget");
          const accessToken =
            data?.["access-token"] ||
            data?.accessToken ||
            data?.jwt ||
            data?.message ||
            (typeof data === "string" ? data : "");

          if (!accessToken || typeof accessToken !== "string") {
            const err = "No access token received from mobile verification.";
            setStatus("error");
            setErrorMsg(err);
            onError?.(err);
            return;
          }

          setStatus("verifying");

          try {
            await authService.verifyMobileWidget({
              mobile: cleanPhone,
              accessToken,
            });

            if (!isMountedRef.current) return;
            setStatus("verified");
            setErrorMsg("");
            onVerified(cleanPhone, accessToken);
          } catch (serverErr: any) {
            if (!isMountedRef.current) return;
            const msg = serverErr?.message || "Server verification of mobile token failed.";
            setStatus("error");
            setErrorMsg(msg);
            onError?.(msg);
          }
        },
        failure: (err: any) => {
          if (!isMountedRef.current) return;
          console.warn("[Msg91OtpWidget] Widget failure callback:", err);
          const msg =
            err?.message ||
            (typeof err === "string" ? err : "Mobile verification could not be completed.");
          setStatus("error");
          setErrorMsg(msg);
          onError?.(msg);
        },
      };

      // Launch the MSG91 OTP widget
      window.initSendOTP(configuration);
      setStatus("waiting");
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("[Msg91OtpWidget] Error launching widget:", err);
      const msg = err?.message || "Failed to load mobile verification provider.";
      setStatus("error");
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [cleanPhone, disabled, isValidPhone, onError, onVerified]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {status === "verified" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in duration-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Mobile Verified</span>
          </div>
        ) : status === "loading_script" || status === "sending" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-medium text-[#6B776A]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#354B35] shrink-0" />
            <span>Connecting OTP service...</span>
          </div>
        ) : status === "waiting" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
            <span>Verifying via OTP Widget...</span>
          </div>
        ) : status === "verifying" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
            <span>Validating token with server...</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startVerification}
            disabled={disabled || !isValidPhone}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35]/10 hover:bg-[#354B35]/20 text-[#354B35] text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#B99A60] shrink-0" />
            <span>Verify Mobile via SMS</span>
          </button>
        )}

        {status === "error" && (
          <button
            type="button"
            onClick={startVerification}
            disabled={disabled || !isValidPhone}
            className="inline-flex items-center gap-1 text-xs text-[#354B35] underline font-semibold hover:text-[#B99A60] cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            <span>Retry</span>
          </button>
        )}
      </div>

      {errorMsg && status === "error" && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
