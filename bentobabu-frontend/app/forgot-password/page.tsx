"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-16 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-3xl p-8 sm:p-10 border border-[#E5DFC5] shadow-xs space-y-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-[#354B35] font-semibold hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>

            <div className="text-center space-y-2">
              <h1 className="font-serif text-3xl font-bold text-[#222922]">
                Reset Password
              </h1>
              <p className="text-xs text-[#6B776A]">
                Enter your registered email address and we&apos;ll send you an instant reset link.
              </p>
            </div>

            {submitted ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-xs text-emerald-900">
                  Reset Link Dispatched
                </h4>
                <p className="text-[11px] text-emerald-700">
                  If an account exists for {email}, you will receive reset instructions shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <span>Send Reset Instructions</span>
                  <ArrowRight className="w-4 h-4 text-[#B99A60]" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

