"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { authService } from "@/services/authService";
import { sendMsg91Otp } from "@/lib/msg91";

export interface Msg91OtpWidgetProps {
  phone: string;
  onVerified?: (phone: string, accessToken: string) => void;
  onError?: (errorMessage: string) => void;
  onBeforeSend?: () => void;
  isVerified?: boolean;
  disabled?: boolean;
  className?: string;
  returnTo?: string;
}

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
  onBeforeSend,
  isVerified = false,
  disabled = false,
  className = "",
  returnTo = "/",
}: Msg91OtpWidgetProps) {
  const router = useRouter();
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
    setStatus("sending");

    try {
      // 1. Notify parent to persist any draft form state
      onBeforeSend?.();

      // 2. Dispatch OTP via MSG91 widget
      const res = await sendMsg91Otp(cleanPhone);
      if (!isMountedRef.current) return;

      const reqId = res.requestId;

      // 3. Persist OTP challenge state in sessionStorage
      authService.saveStoredChallenge({
        challengeId: reqId,
        channel: "sms",
        destination: cleanPhone,
        cooldownSeconds: 60,
        createdAt: Date.now(),
      });

      setStatus("waiting");

      // 4. Navigate immediately to /verify-otp
      const verifyUrl =
        returnTo && returnTo !== "/"
          ? `/verify-otp?channel=sms&dest=${cleanPhone}&reqId=${encodeURIComponent(reqId)}&returnTo=${encodeURIComponent(returnTo)}`
          : `/verify-otp?channel=sms&dest=${cleanPhone}&reqId=${encodeURIComponent(reqId)}`;

      router.push(verifyUrl);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("[Msg91OtpWidget] Error sending OTP:", err);
      const msg = err?.message || "Failed to send mobile verification code.";
      setStatus("error");
      setErrorMsg(msg);
      onError?.(msg);
    }
  }, [cleanPhone, disabled, isValidPhone, onBeforeSend, onError, returnTo, router]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {status === "verified" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in duration-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Mobile Verified</span>
          </div>
        ) : status === "sending" || status === "loading_script" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-medium text-[#6B776A]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#354B35] shrink-0" />
            <span>Sending OTP...</span>
          </div>
        ) : status === "waiting" ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
            <span>Opening verification...</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startVerification}
            disabled={disabled || !isValidPhone}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35]/10 hover:bg-[#354B35]/20 text-[#354B35] text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#B99A60] shrink-0" />
            <span>Verify Phone Number</span>
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
