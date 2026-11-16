"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Bike,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Calendar,
  User,
  Phone,
  Mail,
  RefreshCw,
} from "lucide-react";
import { onboardingApi } from "@/lib/api/onboarding.api";
import { ApplicationStatusResponse } from "@/types";
import { toast } from "sonner";

function ApplicationStatusContent() {
  const searchParams = useSearchParams();
  const initialIdentifier = searchParams.get("identifier") || "";

  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<ApplicationStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStatus = async (searchQuery: string) => {
    const clean = searchQuery.trim();
    if (!clean) {
      toast.error("Please enter your Application Reference ID or registered mobile number.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await onboardingApi.getStatus(clean);
      setStatusData(data);
    } catch (err: any) {
      setStatusData(null);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Could not find any application matching your query. Please check and try again.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialIdentifier) {
      fetchStatus(initialIdentifier);
    }
  }, [initialIdentifier]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatus(identifier);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FBF9F6] via-[#F5EFE6] to-[#FBF9F6] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/login" className="inline-flex items-center gap-2 group mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              B
            </div>
            <span className="font-bold text-lg text-[#241C1A] tracking-tight group-hover:text-[#C86D51] transition">
              BentoBabu
            </span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#241C1A] tracking-tight">
            Track Application Status
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 max-w-sm mx-auto">
            Check the real-time review progress of your delivery partner onboarding application.
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 sm:p-6 rounded-3xl border border-[#EFECE6] shadow-md">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter Application ID (e.g. BBD-...) or 10-digit Phone"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-300 text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/30 focus:border-[#C86D51] transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs sm:text-sm hover:bg-[#B35D42] disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <span>Check Status</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error State */}
        {errorMessage && (
          <div className="p-5 rounded-3xl bg-red-50/80 border border-red-200 text-xs text-red-800 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-semibold leading-relaxed">{errorMessage}</div>
            </div>
            <div className="pt-2 pl-6.5 flex items-center gap-3">
              <Link
                href="/register"
                className="font-bold text-[#C86D51] hover:underline"
              >
                Register as a New Delivery Partner →
              </Link>
            </div>
          </div>
        )}

        {/* Result Card */}
        {statusData && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFECE6] shadow-xl space-y-6 animate-in zoom-in-95 duration-200">
            {/* Top Bar with ID and Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                  Application Reference ID
                </span>
                <span className="font-mono text-lg sm:text-xl font-extrabold text-[#241C1A]">
                  {statusData.applicationNumber}
                </span>
              </div>

              {/* Status Badge */}
              <div className="self-start sm:self-auto">
                {statusData.status === "APPROVED" && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    APPROVED
                  </span>
                )}
                {(statusData.status === "PENDING_APPROVAL" ||
                  statusData.status === "PENDING_VERIFICATION") && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300">
                    <Clock className="w-4 h-4 text-amber-600" />
                    UNDER REVIEW
                  </span>
                )}
                {statusData.status === "CORRECTIONS_REQUESTED" && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-100 text-orange-800 font-bold text-xs border border-orange-300">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    CORRECTIONS REQUESTED
                  </span>
                )}
                {statusData.status === "REJECTED" && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-100 text-red-800 font-bold text-xs border border-red-300">
                    <XCircle className="w-4 h-4 text-red-600" />
                    NOT APPROVED
                  </span>
                )}
                {statusData.status === "SUSPENDED" && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-100 text-gray-800 font-bold text-xs border border-gray-300">
                    <AlertCircle className="w-4 h-4 text-gray-600" />
                    SUSPENDED
                  </span>
                )}
              </div>
            </div>

            {/* Applicant Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[#FBF9F6] border border-gray-200/80 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Applicant Name
                </span>
                <span className="font-bold text-gray-800 mt-0.5 block truncate">
                  {statusData.applicantName}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Phone
                </span>
                <span className="font-bold text-gray-800 mt-0.5 block">
                  {statusData.maskedPhone}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Vehicle Type
                </span>
                <span className="font-bold text-gray-800 mt-0.5 block">
                  {statusData.vehicleType.replace("_", " ")}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Applied Date
                </span>
                <span className="font-bold text-gray-800 mt-0.5 block">
                  {new Date(statusData.appliedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Status-specific Callout Card */}
            {statusData.status === "APPROVED" && (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Welcome to the BentoBabu Delivery Fleet!</span>
                </div>
                <p className="text-xs leading-relaxed text-emerald-800/90">
                  Your identity documents and vehicle information have been successfully verified and approved. Your delivery partner account is now fully active.
                </p>
                <div className="pt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
                  >
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {(statusData.status === "PENDING_APPROVAL" ||
              statusData.status === "PENDING_VERIFICATION") && (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span>Application Under Active Review</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-800/90">
                  Our operations team is currently validating your driving license and registration certificate with official databases. Standard review turnaround is within <strong>24 to 48 business hours</strong>.
                </p>
                <div className="text-[11px] text-amber-700 pt-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>You will receive an SMS and email notification upon approval.</span>
                </div>
              </div>
            )}

            {statusData.status === "CORRECTIONS_REQUESTED" && (
              <div className="p-5 rounded-2xl bg-orange-50 border border-orange-200 text-orange-900 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-orange-800">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <span>Action Required: Document Corrections</span>
                </div>
                <div className="p-3 rounded-xl bg-white/80 border border-orange-200 text-xs font-medium text-orange-950">
                  <strong>Notes from reviewer:</strong>
                  <p className="mt-1 italic">
                    "{statusData.requestedCorrections || "Please provide clearer copies of your documents."}"
                  </p>
                </div>
                <p className="text-[11px] text-orange-800">
                  Please contact BentoBabu Onboarding Support at <strong>partner-support@bentobabu.in</strong> or WhatsApp helpline to update the requested documents.
                </p>
              </div>
            )}

            {statusData.status === "REJECTED" && (
              <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-red-800">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span>Application Not Approved</span>
                </div>
                {statusData.rejectionReason && (
                  <div className="p-3 rounded-xl bg-white/80 border border-red-200 text-xs font-medium text-red-950">
                    <strong>Reason:</strong>
                    <p className="mt-1 italic">"{statusData.rejectionReason}"</p>
                  </div>
                )}
                <p className="text-[11px] text-red-800">
                  If you believe this was in error or you have updated documentation, please reach out to our partner support desk.
                </p>
              </div>
            )}

            {statusData.status === "SUSPENDED" && (
              <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-sm text-gray-800">
                  <AlertCircle className="w-5 h-5 text-gray-600" />
                  <span>Account Suspended</span>
                </div>
                <p className="text-xs leading-relaxed text-gray-700">
                  Your delivery partner account has been suspended. Please contact fleet management for resolution.
                </p>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
              <Link
                href="/login"
                className="text-gray-500 hover:text-gray-800 font-semibold flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Login</span>
              </Link>
              <button
                type="button"
                onClick={() => fetchStatus(identifier)}
                className="text-[#C86D51] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Status</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApplicationStatusPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FBF9F6]">
          <div className="w-8 h-8 rounded-full border-2 border-[#C86D51] border-t-transparent animate-spin" />
        </div>
      }
    >
      <ApplicationStatusContent />
    </React.Suspense>
  );
}
