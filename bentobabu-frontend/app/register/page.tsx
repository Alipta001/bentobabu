"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { User as UserIcon, Mail, Phone, Lock, ArrowRight, AlertCircle, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/authService";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/hooks/useQueries";
import {
  getSafeReturnUrl,
  buildLoginUrl,
  DEFAULT_POST_LOGIN_PATH,
} from "@/lib/authRedirect";

function RegisterUrlSync({ onTarget }: { onTarget: (t: string) => void }) {
  const searchParams = useSearchParams();
  const rawTarget = searchParams.get("returnTo") || searchParams.get("redirect");
  useEffect(() => {
    if (rawTarget) onTarget(rawTarget);
  }, [rawTarget, onTarget]);
  return null;
}

function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, status, register } = useAuth();
  const isRedirectingRef = useRef(false);

  const [returnToTarget, setReturnToTarget] = useState<string | null>(null);
  const returnTo = getSafeReturnUrl(returnToTarget, DEFAULT_POST_LOGIN_PATH);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTarget = React.useCallback((t: string) => {
    setReturnToTarget(t);
  }, []);

  // Redirect if user is already authenticated
  useEffect(() => {
    if (status === "authenticated" && user && !isRedirectingRef.current) {
      isRedirectingRef.current = true;
      router.replace(returnTo);
    }
  }, [user, status, returnTo, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || isRedirectingRef.current) return;
    setError("");

    const phoneClean = phone.replace(/[\s\-+]/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(phoneClean)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phoneClean,
        password,
      });

      const challengeId = result.challengeId;
      const requiresVerification = result.requiresVerification !== false && !!challengeId;

      if (requiresVerification && challengeId) {
        isRedirectingRef.current = true;
        const channel = (result.channel ? String(result.channel).toLowerCase() : "email") as "email" | "sms";
        const destination = result.maskedDestination || result.destination || "";
        const cooldownSeconds = result.cooldown ?? result.cooldownSeconds ?? 60;

        // Store challenge details safely in session storage (no customer PII in URL)
        authService.saveStoredChallenge({
          challengeId,
          channel,
          destination,
          cooldownSeconds,
          createdAt: Date.now(),
        });

        // Pass ONLY the opaque challengeId and returnTo in URL (no PII)
        const verifyUrl = `/verify-otp?challengeId=${encodeURIComponent(challengeId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
        router.push(verifyUrl);
        return;
      }

      // If challengeId is missing, do not redirect to home or auto-login!
      isRedirectingRef.current = false;
      setIsLoading(false);
      setError("Registration completed, but no verification challenge was returned by the server. Please try signing in or contact support.");
    } catch (err: unknown) {
      isRedirectingRef.current = false;
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to register.");
    }
  };

  return (
    <div className="max-w-md w-full mx-auto px-4 sm:px-6">
      <Suspense fallback={null}>
        <RegisterUrlSync onTarget={handleTarget} />
      </Suspense>
      <div className="bg-white rounded-3xl p-8 sm:p-10 border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#354B35]/10 text-[11px] font-semibold text-[#354B35]">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Join the Wellness Movement</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-[#222922]">
            Create Your Account
          </h1>
          <p className="text-xs text-[#6B776A]">
            Unlock customized nutrition recommendations and seamless daily ordering.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#222922]">
              Full Name *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Arjun Verma"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
              />
              <UserIcon className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#222922]">
              Email Address *
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
            <label className="text-xs font-semibold text-[#222922]">
              Phone Number *
            </label>
            <div className="relative">
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
              />
              <Phone className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#222922]">
              Password *
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
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
            <span>{isLoading ? "Creating Account..." : "Register Account"}</span>
            <ArrowRight className="w-4 h-4 text-[#B99A60]" />
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-[#6B776A]">
          Already have an account?{" "}
          <Link
            href={buildLoginUrl(returnTo)}
            className="font-bold text-[#354B35] underline hover:text-[#B99A60]"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />
      <main className="flex-1 py-16 flex items-center justify-center">
        <RegisterForm />
      </main>
      <Footer />
    </div>
  );
}

