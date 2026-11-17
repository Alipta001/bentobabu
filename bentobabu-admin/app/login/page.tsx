"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Lock, Mail, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login({ email, password });
      router.push("/");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
          ? err.message
          : "Invalid admin credentials. Please try again.";
      setError(msg || "Invalid admin credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F3EA] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Card */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="relative h-20 sm:h-24 w-auto flex items-center justify-center mb-3">
            <Image
              src="/bentobabu_logo.png"
              alt="Bento Babu"
              width={260}
              height={130}
              className="h-20 sm:h-24 w-auto max-w-[280px] object-contain drop-shadow-xs"
              priority
            />
          </div>
          <p className="text-xs uppercase tracking-widest font-semibold text-[#8C713B]">
            Kitchen & Executive Admin Portal
          </p>
        </div>

        {/* Login Form Box */}
        <div className="bg-white rounded-3xl p-8 border border-[#E5DFD3] shadow-lg shadow-[#354B35]/5 space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-[#E5DFD3]">
            <ShieldCheck className="w-5 h-5 text-[#354B35]" />
            <div>
              <h2 className="font-serif text-base font-bold text-[#1E2B1E]">
                Authorized Access
              </h2>
              <p className="text-xs text-[#354B35]/70">
                Please sign in with your administrator credentials
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1E2B1E] mb-1.5">
                Admin Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@bentobabu.in"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2B1E] mb-1.5">
                Security Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50 hover:text-[#1E2B1E]"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[#354B35]/80">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-[#E5DFD3] text-[#354B35] focus:ring-[#354B35]"
                />
                <span>Remember session</span>
              </label>
              <span className="text-[11px] text-[#B99A60] font-medium">
                256-bit encrypted
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2"
            >
              {loading ? (
                "Signing In..."
              ) : (
                <>
                  <span>Enter Admin Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#354B35]/60 mt-6">
          © {new Date().getFullYear()} Bento Babu Cloud Kitchens Pvt. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
