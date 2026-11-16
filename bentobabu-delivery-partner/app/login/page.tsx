"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Bike,
  Clock,
} from "lucide-react";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/slices/authSlice";
import { authApi } from "@/lib/api/auth.api";
import { toast } from "sonner";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";
  const dispatch = useAppDispatch();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [onboardingReviewInfo, setOnboardingReviewInfo] = useState<{
    applicationNumber?: string;
    applicationStatus?: string;
    rejectionReason?: string;
    requestedCorrections?: string;
  } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setOnboardingReviewInfo(null);

    const cleanId = identifier.trim();
    if (!cleanId || cleanId.length < 3) {
      setErrorMessage("Please enter your registered email address or 10-digit mobile number.");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      const user = await authApi.login({
        identifier: cleanId,
        password,
      });

      dispatch(setCredentials({ user }));
      toast.success(`Welcome back, ${user.name}!`);
      router.replace(redirectPath);
    } catch (err: any) {
      const respData = err?.response?.data;
      const msg =
        respData?.message ||
        err?.message ||
        "Login failed. Please check your credentials.";

      if (respData?.data?.requiresOnboardingReview) {
        setOnboardingReviewInfo(respData.data);
      }

      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FBF9F6] via-[#F5EFE6] to-[#FBF9F6]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-3 text-center">
        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-md">
          B
        </div>
        <h1 className="font-bold text-2xl sm:text-3xl text-[#241C1A] tracking-tight">
          BentoBabu Delivery Partner
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 max-w-xs mx-auto">
          Sign in to access your delivery assignments, live routes, and daily earnings.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-[#EFECE6] shadow-xl space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex flex-col gap-2 text-xs text-amber-900 animate-in fade-in duration-150">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="font-semibold leading-relaxed">{errorMessage}</div>
              </div>

              {onboardingReviewInfo && (
                <div className="mt-2 pt-2 border-t border-amber-200/80 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-amber-800">
                    Status: <strong className="uppercase">{onboardingReviewInfo.applicationStatus?.replace('_', ' ')}</strong>
                  </span>
                  <Link
                    href={`/application-status?identifier=${encodeURIComponent(
                      onboardingReviewInfo.applicationNumber || identifier.trim()
                    )}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C86D51] hover:underline"
                  >
                    View Status Tracker
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Identifier Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="identifier"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider"
              >
                Mobile Number or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. 9876543210 or agent@bentobabu.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-300 bg-[#FBF9F6] focus:bg-white focus:border-[#C86D51] text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 rounded-2xl border border-gray-300 bg-[#FBF9F6] focus:bg-white focus:border-[#C86D51] text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-[#C86D51] text-white font-bold text-xs sm:text-sm hover:bg-[#B35D42] transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In as Delivery Partner</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Become a Delivery Partner CTA */}
          <div className="pt-6 border-t border-gray-100 space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FFF5F1] to-[#FBF9F6] border border-[#F3DFD8] flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#241C1A] flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-[#C86D51]" />
                  Want to Deliver with Us?
                </div>
                <p className="text-[11px] text-gray-600">
                  Earn up to ₹35,000/mo with flexible shifts & weekly payouts.
                </p>
              </div>
              <Link
                href="/register"
                className="shrink-0 px-3.5 py-2 rounded-xl bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] transition shadow-sm"
              >
                Register Now
              </Link>
            </div>

            {/* Check Application Status Link */}
            <div className="text-center">
              <Link
                href="/application-status"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-[#C86D51] transition"
              >
                <Clock className="w-3.5 h-3.5" />
                Already applied? Track Application Status
              </Link>
            </div>

            {/* Role Guard Notice */}
            <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Authorized BentoBabu delivery personnel access only</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FBF9F6]">
          <div className="w-8 h-8 rounded-full border-2 border-[#C86D51] border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
