"use client";

import React from "react";
import {
  Users,
  UserCheck,
  Award,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Percent,
} from "lucide-react";
import { DashboardCustomersResponse } from "@/types";

interface CustomerInsightsSectionProps {
  customersData?: DashboardCustomersResponse;
  isLoading: boolean;
}

export function CustomerInsightsSection({
  customersData,
  isLoading,
}: CustomerInsightsSectionProps) {
  if (isLoading || !customersData) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const {
    totalCustomers,
    purchasingCustomers,
    newRegistrationsInPeriod,
    firstTimePurchasersInPeriod,
    repeatPurchaseRate,
    segmentation,
    topCustomers = [],
  } = customersData;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF0E9] text-[#354B35] text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Audience &amp; Retention Analytics</span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            Know Your Customers
          </h3>
          <p className="text-xs text-[#667266]">
            Transparent cohort segmentation, repeat rates, and top customer loyalty
          </p>
        </div>

        {/* Repeat Rate Pill */}
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs">
          <TrendingUp className="w-4 h-4 text-[#354B35]" />
          <span>
            Repeat Purchase Rate: <strong className="text-[#354B35] font-mono text-sm">{repeatPurchaseRate}%</strong>
          </span>
        </div>
      </div>

      {/* 4 Customer Segmentation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* New Customers */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">New Buyers</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#1F271F]">
            {segmentation.newCustomers.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Customers with exactly 1 completed order
          </div>
        </div>

        {/* Repeat Customers */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">Repeat Buyers</span>
            <UserCheck className="w-4 h-4 text-[#354B35]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#354B35]">
            {segmentation.repeatCustomers.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Placed 2 or more orders in lifetime
          </div>
        </div>

        {/* High-Value Customers */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">High-Value VIPs</span>
            <Award className="w-4 h-4 text-[#B99A60]" />
          </div>
          <div className="font-serif text-2xl font-bold text-amber-900">
            {segmentation.highValueCustomers.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Lifetime food spend ≥ ₹2,000
          </div>
        </div>

        {/* Inactive Customers */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">Inactive Accounts</span>
            <Clock className="w-4 h-4 text-gray-500" />
          </div>
          <div className="font-serif text-2xl font-bold text-gray-700">
            {segmentation.inactiveCustomers.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            No orders in past 60 days
          </div>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#1F271F] flex items-center gap-2">
            <Award className="w-4 h-4 text-[#B99A60]" />
            <span>Top Spenders &amp; Frequent Diners (Period)</span>
          </h4>
          <span className="text-xs text-[#8A9A86]">
            Showing top {topCustomers.length} customers
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#E5DFC5]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F3EA] text-[#667266] font-semibold uppercase tracking-wider border-b border-[#E5DFC5]">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-center">Orders</th>
                <th className="py-3 px-4 text-right">Total Spent</th>
                <th className="py-3 px-4 text-right">Avg Order Value</th>
                <th className="py-3 px-4 text-right">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE1] bg-white">
              {topCustomers.length > 0 ? (
                topCustomers.map((c, idx) => (
                  <tr key={c.userId || idx} className="hover:bg-[#F7F3EA]/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#1F271F]">{c.name}</div>
                      <div className="text-[11px] text-[#8A9A86] font-mono">
                        {c.email} • {c.phone}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-[#1F271F]">
                      {c.orders}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#354B35]">
                      ₹{c.totalSpent.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#667266]">
                      ₹{c.averageOrderValue.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-right text-[11px] text-[#8A9A86]">
                      {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString("en-IN") : "N/A"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#8A9A86]">
                    No customer order data for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
