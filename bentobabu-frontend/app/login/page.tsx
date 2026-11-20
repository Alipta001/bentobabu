"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/hooks/useQueries";
import {
  getSafeReturnUrl,
  buildRegisterUrl,
  DEFAULT_POST_LOGIN_PATH,
} from "@/lib/authRedirect";

function LoginUrlSync({
  onTarget,
  onVerified,
}: {
  onTarget: (t: string) => void;
  onVerified: (v: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const rawTarget = searchParams.get("returnTo") || searchParams.get("redirect");
  const verifiedParam = searchParams.get("verified");

  useEffect(() => {
    if (rawTarget) onTarget(rawTarget);
    if (verifiedParam === "true") onVerified(true);
  }, [rawTarget, verifiedParam, onTarget, onVerified]);

  return null;
}

function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, status, login } = useAuth();
  const isRedirectingRef = useRef(false);

  const [returnToTarget, setReturnToTarget] = useState<string | null>(null);
  const returnTo = getSafeReturnUrl(returnToTarget, DEFAULT_POST_LOGIN_PATH);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isVerifiedNotice, setIsVerifiedNotice] = useState(false);
  const [unverifiedNotice, setUnverifiedNotice] = useState(false);

  const handleTarget = React.useCallback((t: string) => {
    setReturnToTarget(t);
  }, []);

  const handleVerifiedParam = React.useCallback((v: boolean) => {
    setIsVerifiedNotice(v);
  }, []);

  // Redirect if user is already authenticated
  useEffect(() => {
    if (status === "authenticated" && user && !isRedirectingRef.current) {
      isRedirectingRef.current = true;
      router.replace(returnTo);
    }
  }, [user, status, returnTo, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isRedirectingRef.current) return;
    setError("");
    setUnverifiedNotice(false);
    setIsLoading(true);

    try {
      await login({ email: email.trim(), password });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORDERS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADDRESSES });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CART });

      isRedirectingRef.current = true;
      router.replace(returnTo);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to log in.";
      if (
        errMsg.toLowerCase().includes("not verified") ||
        errMsg.toLowerCase().includes("requiresverification") ||
        (err as any)?.response?.data?.data?.requiresVerification
      ) {
        setUnverifiedNotice(true);
      } else {
        setError(errMsg);
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto px-4 sm:px-6">
      <Suspense fallback={null}>
        <LoginUrlSync
          onTarget={handleTarget}
          onVerified={handleVerifiedParam}
        />
      </Suspense>
      <div className="bg-white rounded-3xl p-8 sm:p-10 border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35]/10 text-[11px] font-semibold text-[#354B35]">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Customer Access</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-[#222922]">
            Welcome Back
          </h1>
          <p className="text-xs text-[#6B776A]">
            Sign in to track orders, manage addresses, and access member perks.
          </p>
        </div>

        {isVerifiedNotice && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Account verified successfully! Please sign in with your password.</span>
          </div>
        )}

        {unverifiedNotice && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Account not verified</p>
              <p className="mt-0.5">
                Please verify your account to continue.{" "}
                <Link
                  href="/register"
                  className="font-bold underline text-[#354B35] hover:text-[#B99A60]"
                >
                  Verify or Register &rarr;
                </Link>
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <GoogleSignInButton returnTo={returnTo} mode="signin" />

        <div className="relative flex items-center justify-center">
          <div className="border-t border-[#E5DFC5] w-full" />
          <span className="bg-white px-3 text-[11px] font-medium text-[#8A9A86] uppercase tracking-wider relative">
            or sign in with email
          </span>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#222922]">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. arjun.verma@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
              />
              <Mail className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-[#222922]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-[#354B35] hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
              />
              <Lock className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] disabled:opacity-50 cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>{isLoading ? "Signing in..." : "Sign In to Bento Babu"}</span>
            <ArrowRight className="w-4 h-4 text-[#B99A60]" />
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-[#6B776A]">
          Don&apos;t have an account yet?{" "}
          <Link
            href={buildRegisterUrl(returnTo)}
            className="font-bold text-[#354B35] underline hover:text-[#B99A60]"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />
      <main className="flex-1 py-16 flex items-center justify-center">
        <LoginForm />
      </main>
      <Footer />
    </div>
  );
}
