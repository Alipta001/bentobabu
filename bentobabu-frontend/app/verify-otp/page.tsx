"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Phone, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { authService } from "@/services/authService";
import { getSafeReturnUrl, DEFAULT_POST_LOGIN_PATH } from "@/lib/authRedirect";

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlChallengeId = searchParams.get("challengeId") || "";
  const channelParam = (searchParams.get("channel") as "email" | "sms") || null;
  const destinationParam = searchParams.get("dest") || searchParams.get("destination") || null;
  const rawReturnTo = searchParams.get("returnTo") || searchParams.get("redirect");
  const returnTo = getSafeReturnUrl(rawReturnTo, DEFAULT_POST_LOGIN_PATH);

  const [challengeId, setChallengeId] = useState<string>(urlChallengeId);
  const [activeChannel, setActiveChannel] = useState<"email" | "sms">("email");
  const [activeDestination, setActiveDestination] = useState<string>("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [cooldown, setCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const [isChallengeLoaded, setIsChallengeLoaded] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Synchronize challengeId, destination, and channel from URL or sessionStorage
  useEffect(() => {
    const stored = authService.getStoredChallenge();
    const effectiveChallengeId = urlChallengeId || stored?.challengeId || "";

    setChallengeId(effectiveChallengeId);
    if (channelParam) {
      setActiveChannel(channelParam);
    } else if (stored?.channel) {
      setActiveChannel(stored.channel);
    }

    if (destinationParam) {
      setActiveDestination(destinationParam);
    } else if (stored?.destination) {
      setActiveDestination(stored.destination);
    }

    if (stored?.cooldownSeconds && stored.cooldownSeconds > 0) {
      const elapsedSeconds = Math.floor((Date.now() - (stored.createdAt || Date.now())) / 1000);
      const remaining = Math.max(0, stored.cooldownSeconds - elapsedSeconds);
      setCooldown(remaining);
    }

    setIsChallengeLoaded(true);
  }, [urlChallengeId, channelParam, destinationParam]);

  // Query server status for challenge to ensure validity and update cooldown
  useEffect(() => {
    if (!challengeId) return;

    authService
      .getOtpStatus(challengeId)
      .then((res) => {
        const dest = res.destination || (res as any).maskedDestination;
        if (dest) setActiveDestination(dest);
        if (res.channel) setActiveChannel(res.channel);
        if (res.cooldownRemaining !== undefined) setCooldown(res.cooldownRemaining);

        // Update stored challenge session state
        authService.saveStoredChallenge({
          challengeId,
          channel: res.channel || activeChannel,
          destination: dest || activeDestination,
          cooldownSeconds: res.cooldownRemaining,
          createdAt: Date.now(),
        });

        if (res.isConsumed) {
          setError("This verification code has already been used. Please log in.");
        } else if (res.isExpired) {
          setError("This verification code has expired. Please request a new code below.");
        }
      })
      .catch((err: any) => {
        if (err?.message?.includes("not found") || err?.response?.status === 404) {
          setError("Verification challenge not found or has expired. Please register again.");
        }
      });
  }, [challengeId]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Focus first input box on load
  useEffect(() => {
    if (challengeId) {
      inputRefs.current[0]?.focus();
    }
  }, [challengeId]);

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const newDigits = [...otpDigits];
      newDigits[index] = "";
      setOtpDigits(newDigits);
      return;
    }

    if (cleaned.length > 1) {
      const newDigits = [...otpDigits];
      const chars = cleaned.slice(0, 6).split("");
      chars.forEach((c, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = c;
        }
      });
      setOtpDigits(newDigits);
      const nextIdx = Math.min(5, index + chars.length);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = cleaned[0];
    setOtpDigits(newDigits);

    if (index < 5 && cleaned[0]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;

    const newDigits = [...otpDigits];
    pasteData.split("").forEach((char, idx) => {
      newDigits[idx] = char;
    });
    setOtpDigits(newDigits);
    const focusIdx = Math.min(5, pasteData.length);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const fullOtp = otpDigits.join("");
    if (fullOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    if (!challengeId) {
      setError("Verification challenge identifier is missing. Please register again.");
      return;
    }

    setIsLoading(true);

    try {
      await authService.verifySignupOtp({
        challengeId,
        otp: fullOtp,
      });

      // Clear challenge session state on successful verification
      authService.clearStoredChallenge();

      setSuccessMsg("Account verified successfully! Redirecting to sign in...");
      setTimeout(() => {
        const loginUrl = `/login?verified=true&returnTo=${encodeURIComponent(returnTo)}`;
        router.replace(loginUrl);
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed. Please check the code and try again.");
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    if (!challengeId) {
      setError("Verification challenge not found. Please register again.");
      return;
    }

    setError("");
    setSuccessMsg("");
    setIsResending(true);

    try {
      const res = await authService.resendSignupOtp({
        challengeId,
      });

      const dest = res.destination || (res as any).maskedDestination;
      if (dest) {
        setActiveDestination(dest);
      }
      if (res.channel) {
        setActiveChannel(res.channel as "email" | "sms");
      }
      const newCooldown = res.cooldownSeconds ?? (res as any).cooldown ?? 60;
      setCooldown(newCooldown);

      authService.saveStoredChallenge({
        challengeId,
        channel: (res.channel as "email" | "sms") || activeChannel,
        destination: dest || activeDestination,
        cooldownSeconds: newCooldown,
        createdAt: Date.now(),
      });

      setSuccessMsg(`A fresh verification code has been dispatched to your ${res.channel || activeChannel}.`);
      setOtpDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  // Direct navigation without active challenge
  if (isChallengeLoaded && !challengeId) {
    return (
      <div className="max-w-md w-full mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl p-8 sm:p-10 border border-[#E5DFC5] shadow-xs space-y-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-[#222922]">
            No Verification Challenge
          </h1>
          <p className="text-xs text-[#6B776A] leading-relaxed">
            No active registration verification challenge was found. Please register a new account or sign in to continue.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/register"
              className="w-full py-3 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] transition-all text-center"
            >
              Go to Registration
            </Link>
            <Link
              href="/login"
              className="w-full py-2.5 rounded-full border border-[#E5DFC5] text-xs font-medium text-[#222922] hover:bg-[#F7F3EA] transition-all text-center"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto px-4 sm:px-6">
      <div className="bg-white rounded-3xl p-8 sm:p-10 border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35]/10 text-[11px] font-semibold text-[#354B35]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Identity Verification</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-[#222922]">
            Verify Your Account
          </h1>
          <p className="text-xs text-[#6B776A]">
            We sent a 6-digit verification code to:
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-medium text-[#222922]">
            {activeChannel === "email" ? (
              <Mail className="w-3.5 h-3.5 text-[#354B35]" />
            ) : (
              <Phone className="w-3.5 h-3.5 text-[#354B35]" />
            )}
            <span>{activeDestination || "your registered destination"}</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-center text-xs font-semibold text-[#222922]">
              Enter 6-Digit Code
            </label>
            <div className="flex justify-center items-center gap-2 sm:gap-3">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-11 h-13 sm:w-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922] focus:outline-none focus:border-[#354B35] focus:ring-1 focus:ring-[#354B35] transition-all"
                  autoComplete="one-time-code"
                />
              ))}
            </div>
            <p className="text-center text-[11px] text-[#8A9A86]">
              Code expires in 5 minutes. Do not share it with anyone.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || otpDigits.join("").length !== 6}
            className="w-full py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] disabled:opacity-50 cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>{isLoading ? "Verifying..." : "Verify & Continue"}</span>
            <ArrowRight className="w-4 h-4 text-[#B99A60]" />
          </button>
        </form>

        <div className="pt-2 border-t border-[#E5DFC5]/60 flex flex-col items-center gap-2 text-xs text-[#6B776A]">
          <div className="flex items-center gap-1.5">
            <span>Didn&apos;t receive the code?</span>
            {cooldown > 0 ? (
              <span className="font-semibold text-[#8A9A86]">
                Resend in {cooldown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="font-bold text-[#354B35] underline hover:text-[#B99A60] cursor-pointer inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isResending ? "animate-spin" : ""}`} />
                <span>Resend Code</span>
              </button>
            )}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Incorrect email or mobile?{" "}
            <Link
              href="/register"
              className="text-[#354B35] underline hover:text-[#B99A60] font-medium"
            >
              Register again
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />
      <main className="flex-1 py-16 flex items-center justify-center">
        <Suspense fallback={null}>
          <VerifyOtpContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
