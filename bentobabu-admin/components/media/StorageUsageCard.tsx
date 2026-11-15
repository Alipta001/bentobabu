"use client";

import React from "react";
import { HardDrive, Cloud, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import { useMediaUsage } from "@/hooks/useAdminQueries";

export function StorageUsageCard() {
  const { data: usage, isLoading, refetch, isFetching } = useMediaUsage();

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex items-center justify-center text-xs text-[#667266] gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-[#354B35]" />
        <span>Loading storage quotas...</span>
      </div>
    );
  }

  const r2 = usage?.r2;
  const alertLevel = r2?.alertLevel || "NORMAL";

  const alertBadgeStyles = {
    NORMAL: "bg-emerald-50 text-emerald-700 border-emerald-200",
    INFO: "bg-blue-50 text-blue-700 border-blue-200",
    HIGH: "bg-amber-50 text-amber-700 border-amber-200",
    CRITICAL: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[#354B35]" />
          <div>
            <h3 className="font-bold text-[#1F271F] text-sm">Media Storage & Bandwidth Quotas</h3>
            <p className="text-[11px] text-[#667266]">
              Cloudinary (Images) & Cloudflare R2 (Videos)
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-full hover:bg-[#F7F3EA] text-[#667266] transition-colors"
          title="Refresh storage quotas"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-[#354B35]" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cloudflare R2 Storage Card */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[#1F271F] flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-[#354B35]" />
              Cloudflare R2 (Videos)
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${alertBadgeStyles[alertLevel]}`}
            >
              {alertLevel}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#667266]">Used Storage</span>
              <span className="font-bold text-[#1F271F]">
                {r2?.estimatedGB || 0} GB / {r2?.freeTierLimitGB || 10} GB Free
              </span>
            </div>
            <div className="w-full bg-[#E5DFC5] rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  alertLevel === "CRITICAL"
                    ? "bg-red-600"
                    : alertLevel === "HIGH"
                    ? "bg-amber-500"
                    : "bg-[#354B35]"
                }`}
                style={{ width: `${Math.min(100, r2?.usagePercent || 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#667266]">
              <span>{r2?.objectCount || 0} Active Video Assets</span>
              <span>{r2?.usagePercent || 0}% of Free Tier</span>
            </div>
          </div>

          {alertLevel !== "NORMAL" && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {alertLevel === "CRITICAL"
                  ? "CRITICAL: R2 storage exceeded 95%. Immediate action recommended."
                  : alertLevel === "HIGH"
                  ? "WARNING: R2 storage over 85%. Consider removing unused videos."
                  : "NOTICE: R2 storage is at 70% capacity."}
              </span>
            </div>
          )}
        </div>

        {/* Cloudinary Storage Card */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[#1F271F] flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-[#354B35]" />
              Cloudinary (Images)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              WebP Optimized
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[#667266]">Transformation Mode</span>
              <span className="font-bold text-[#1F271F]">Fixed Presets (c_limit)</span>
            </div>
            <div className="text-[11px] text-[#667266]">
              Images auto-compressed to WebP (Quality 84) via Sharp on upload. Cloudinary delivers fixed thumbnail (320px), card (640px), and detail (1200px) presets to eliminate transformation quota sprawl.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
