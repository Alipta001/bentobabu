"use client";

import React, { useState } from "react";
import {
  IndianRupee,
  TrendingUp,
  Calendar,
  PackageCheck,
  Award,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useEarnings } from "@/hooks/useDeliveryQueries";

export default function EarningsPage() {
  const [activeTab, setActiveTab] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH">("ALL");
  const { data: stats, isLoading, refetch, isFetching } = useEarnings();

  const todayEarnings = stats?.todayEarnings || 0;
  const weeklyEarnings = stats?.weeklyEarnings || 0;
  const monthlyEarnings = stats?.monthlyEarnings || 0;
  const totalEarnings = stats?.totalEarnings || 0;
  const totalDeliveries = stats?.totalDeliveries || 0;
  const avgDrop = stats?.averageEarningsPerDelivery || 0;
  const transactions = stats?.transactions || [];

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
              Earnings Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              Track your payouts, distance incentives, and delivery earnings.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-[#EFECE6] text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[#C86D51]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Hero Earnings Banner */}
        <div className="bg-gradient-to-tr from-[#241C1A] to-[#382C29] text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-widest text-[#DFC89B]">
                Total Lifetime Earnings
              </span>
              <div className="text-3xl sm:text-5xl font-mono font-extrabold text-white flex items-center">
                <span>₹{totalEarnings.toLocaleString("en-IN")}</span>
              </div>
              <p className="text-xs text-gray-300">
                Across {totalDeliveries} completed drops with 100% verified customer OTPs
              </p>
            </div>

            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15">
              <Award className="w-6 h-6 text-[#DFC89B] shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-gray-300">
                  Average / Drop
                </div>
                <div className="text-base font-bold text-white font-mono">
                  ₹{avgDrop}
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Metrics Row */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/15 pt-5 text-center">
            <div>
              <div className="text-[11px] text-gray-300">Today</div>
              <div className="text-lg sm:text-xl font-bold font-mono text-[#DFC89B]">
                ₹{todayEarnings}
              </div>
              <div className="text-[10px] text-gray-400">
                {stats?.todayDeliveries || 0} orders
              </div>
            </div>
            <div className="border-x border-white/15">
              <div className="text-[11px] text-gray-300">Past 7 Days</div>
              <div className="text-lg sm:text-xl font-bold font-mono text-white">
                ₹{weeklyEarnings}
              </div>
              <div className="text-[10px] text-gray-400">
                {stats?.weeklyDeliveries || 0} orders
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-300">This Month</div>
              <div className="text-lg sm:text-xl font-bold font-mono text-white">
                ₹{monthlyEarnings}
              </div>
              <div className="text-[10px] text-gray-400">
                {stats?.monthlyDeliveries || 0} orders
              </div>
            </div>
          </div>
        </div>

        {/* Payout Structure Info Banner */}
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold block text-amber-950">
              BentoBabu Guaranteed Rider Pay Structure
            </span>
            <span className="text-amber-800 text-[11px]">
              Every order pays a base fee (₹50) + ₹10 punctuality/mileage incentive. Cash on delivery orders are settled automatically into your ledger.
            </span>
          </div>
        </div>

        {/* Earnings Transaction Ledger */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#EFECE6] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="font-bold text-sm text-[#241C1A]">
              Delivery Payout Ledger ({transactions.length})
            </div>
            <span className="text-[11px] text-gray-500">
              Direct settlement to verified agent account
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-1">
              <PackageCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <div className="font-bold text-[#241C1A]">No payouts recorded yet</div>
              <div>Completed customer deliveries with OTP will be credited here.</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <div
                  key={tx.orderId}
                  className="py-3.5 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold font-mono text-[#241C1A]">
                      #{tx.orderNumber}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {new Date(tx.deliveredAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      at{" "}
                      {new Date(tx.deliveredAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Payment: {tx.paymentMethod === "COD" ? "Cash Collected" : "Online Prepaid"}
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <div className="font-mono font-extrabold text-[#C86D51] text-sm sm:text-base">
                      +₹{tx.deliveryFee + tx.incentive}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Fee: ₹{tx.deliveryFee} • Inc: ₹{tx.incentive}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
