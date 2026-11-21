"use client";

import React, { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Receipt,
  CreditCard,
  Percent,
  Truck,
  RotateCcw,
  Info,
} from "lucide-react";
import { DashboardRevenueResponse, DashboardOrdersResponse } from "@/types";

interface RevenueAndOrdersSectionProps {
  revenueData?: DashboardRevenueResponse;
  ordersData?: DashboardOrdersResponse;
  isLoading: boolean;
}

export function RevenueAndOrdersSection({
  revenueData,
  ordersData,
  isLoading,
}: RevenueAndOrdersSectionProps) {
  const [activeTab, setActiveTab] = useState<"revenue" | "orders">("revenue");

  if (isLoading || !revenueData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
        <div className="lg:col-span-8 h-96 bg-white/70 rounded-3xl border border-[#E5DFC5]" />
        <div className="lg:col-span-4 h-96 bg-white/70 rounded-3xl border border-[#E5DFC5]" />
      </div>
    );
  }

  const { summary, timeline } = revenueData;
  const bd = summary.breakdown;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left (8 cols): Revenue & Orders Velocity Time Series Chart */}
      <div className="lg:col-span-8 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg sm:text-xl font-bold text-[#1F271F] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#354B35]" />
              <span>Revenue &amp; Orders Velocity Trend</span>
            </h3>
            <p className="text-xs text-[#667266]">
              Real-time velocity aggregated in Indian Standard Time (IST) with continuous zero-baseline dates
            </p>
          </div>

          {/* Toggle between Revenue & Order Count */}
          <div className="flex items-center bg-[#F7F3EA] p-1 rounded-xl border border-[#E5DFC5] text-xs font-semibold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab("revenue")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === "revenue"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1F271F]"
              }`}
            >
              Daily Revenue
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === "orders"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1F271F]"
              }`}
            >
              Order Counts
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-72 sm:h-80 w-full">
          {activeTab === "revenue" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#354B35" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#354B35" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE1" />
                <XAxis
                  dataKey="date"
                  stroke="#8A9A86"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (!val) return "";
                    const parts = val.split("-");
                    return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val;
                  }}
                />
                <YAxis
                  stroke="#8A9A86"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Net Revenue"]}
                  labelFormatter={(label) => `Date: ${label} (IST)`}
                  contentStyle={{
                    backgroundColor: "#1E2B1E",
                    color: "#FFFFFF",
                    borderRadius: "12px",
                    border: "none",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Net Revenue"
                  stroke="#354B35"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ordersData?.dailyTimeline || []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE1" />
                <XAxis
                  dataKey="date"
                  stroke="#8A9A86"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (!val) return "";
                    const parts = val.split("-");
                    return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val;
                  }}
                />
                <YAxis stroke="#8A9A86" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1E2B1E",
                    color: "#FFFFFF",
                    borderRadius: "12px",
                    border: "none",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                <Bar dataKey="completedOrders" name="Completed Orders" fill="#354B35" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelledOrders" name="Cancelled Orders" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Right (4 cols): Authoritative Revenue Financial Breakdown */}
      <div className="lg:col-span-4 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col justify-between space-y-6">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
            <h3 className="font-serif text-lg font-bold text-[#1F271F] flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#B99A60]" />
              <span>Revenue Accounting</span>
            </h3>
            <span className="text-[11px] font-mono text-[#354B35] font-semibold bg-[#EBF0E9] px-2.5 py-0.5 rounded-full">
              {summary.totalPaidOrders} Paid Orders
            </span>
          </div>
          <p className="text-xs text-[#667266] mt-2">
            Audit-safe component reconciliation (excluding failed payments &amp; cancelled orders):
          </p>
        </div>

        {/* Breakdown Items List */}
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F7F3EA]/70 border border-[#E5DFC5]">
            <span className="text-[#4A554A] flex items-center gap-1.5 font-medium">
              <span>Item Subtotal:</span>
            </span>
            <span className="font-bold text-[#1F271F] font-mono">
              ₹{bd.itemSubtotal.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F7F3EA]/70 border border-[#E5DFC5]">
            <span className="text-[#4A554A] flex items-center gap-1.5 font-medium">
              <Truck className="w-3.5 h-3.5 text-[#354B35]" />
              <span>Delivery Charges:</span>
            </span>
            <span className="font-bold text-[#1F271F] font-mono">
              + ₹{bd.deliveryCharges.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F7F3EA]/70 border border-[#E5DFC5]">
            <span className="text-[#4A554A] flex items-center gap-1.5 font-medium">
              <Percent className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Discounts Applied:</span>
            </span>
            <span className="font-bold text-red-600 font-mono">
              - ₹{bd.discounts.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F7F3EA]/70 border border-[#E5DFC5]">
            <span className="text-[#4A554A] flex items-center gap-1.5 font-medium">
              <span>Applicable Taxes:</span>
            </span>
            <span className="font-bold text-[#1F271F] font-mono">
              + ₹{bd.taxes.toLocaleString("en-IN")}
            </span>
          </div>

          {bd.refunds > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-50 border border-red-200">
              <span className="text-red-700 flex items-center gap-1.5 font-medium">
                <RotateCcw className="w-3.5 h-3.5 text-red-600" />
                <span>Processed Refunds:</span>
              </span>
              <span className="font-bold text-red-700 font-mono">
                - ₹{bd.refunds.toLocaleString("en-IN")}
              </span>
            </div>
          )}
        </div>

        {/* Net Collected Total Card */}
        <div className="p-4 rounded-2xl bg-[#354B35] text-white space-y-1">
          <div className="text-[11px] font-medium text-[#DFC89B] uppercase tracking-wider">
            Net Realized Revenue
          </div>
          <div className="font-serif text-2xl font-bold tracking-tight">
            ₹{bd.actualCollectedAmount.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] text-[#EDE8DE]/80 flex items-center gap-1 pt-1">
            <Info className="w-3 h-3 text-[#B99A60] shrink-0" />
            <span>Excludes cancelled orders and uncollected pending COD.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
