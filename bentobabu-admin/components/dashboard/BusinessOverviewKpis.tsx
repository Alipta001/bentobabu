"use client";

import React from "react";
import {
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  DollarSign,
  Users,
  UserPlus,
  UserCheck,
  AlertOctagon,
  Clock,
  Truck,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
} from "lucide-react";
import { DashboardOverviewResponse, KpiCardData } from "@/types";

interface BusinessOverviewKpisProps {
  overview?: DashboardOverviewResponse;
  isLoading: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  cardData?: KpiCardData;
  isInverse?: boolean; // For cancellation rate, lower is better
  prefix?: string;
  suffix?: string;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  cardData,
  isInverse = false,
  prefix = "",
  suffix = "",
}: MetricCardProps) {
  const growth = cardData?.growth ?? 0;
  const isPositive = growth > 0;
  const isNeutral = growth === 0;

  // For normal metrics, positive is good. For cancellation rate, negative is good.
  const isGood = isInverse ? !isPositive : isPositive;

  return (
    <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs hover:border-[#B99A60] transition-colors flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#667266]">
          {title}
        </span>
        <div className={`w-8 h-8 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div>
        <div className="font-serif text-2xl font-bold text-[#1F271F] tracking-tight">
          {prefix}
          {typeof value === "number" ? value.toLocaleString("en-IN") : value}
          {suffix}
        </div>

        {/* Growth vs Previous Period */}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {cardData && cardData.hasHistorical ? (
            <div
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                isNeutral
                  ? "bg-gray-100 text-gray-700"
                  : isGood
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {!isNeutral && (
                isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )
              )}
              <span>{cardData.text}</span>
            </div>
          ) : (
            <span className="text-[10px] text-[#8A9A86] italic">
              {cardData?.text || "First period baseline"}
            </span>
          )}

          {cardData && cardData.hasHistorical && (
            <span className="text-[11px] text-[#8A9A86]">
              vs prev ({prefix}
              {typeof cardData.prevValue === "number"
                ? cardData.prevValue.toLocaleString("en-IN")
                : cardData.prevValue}
              {suffix})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BusinessOverviewKpis({ overview, isLoading }: BusinessOverviewKpisProps) {
  if (isLoading || !overview) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="h-32 bg-white/70 rounded-3xl border border-[#E5DFC5]" />
        ))}
      </div>
    );
  }

  const { kpis, operations } = overview;

  return (
    <div className="space-y-4">
      {/* 8 Primary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Revenue */}
        <MetricCard
          title="Total Net Revenue"
          value={kpis.totalRevenue.value}
          icon={TrendingUp}
          iconBg="bg-[#EBF0E9]"
          iconColor="text-[#354B35]"
          cardData={kpis.totalRevenue}
          prefix="₹"
        />

        {/* 2. Total Orders */}
        <MetricCard
          title="Total Orders Placed"
          value={kpis.totalOrders.value}
          icon={ShoppingBag}
          iconBg="bg-[#EBF0E9]"
          iconColor="text-[#354B35]"
          cardData={kpis.totalOrders}
        />

        {/* 3. Successful Completed Orders */}
        <MetricCard
          title="Completed Orders"
          value={kpis.completedOrders.value}
          icon={CheckCircle2}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-800"
          cardData={kpis.completedOrders}
        />

        {/* 4. Average Order Value (AOV) */}
        <MetricCard
          title="Avg Order Value (AOV)"
          value={kpis.averageOrderValue.value}
          icon={DollarSign}
          iconBg="bg-amber-50"
          iconColor="text-amber-800"
          cardData={kpis.averageOrderValue}
          prefix="₹"
        />

        {/* 5. Total Lifetime Customers */}
        <MetricCard
          title="Total Customers"
          value={kpis.totalCustomers.value}
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-700"
          cardData={kpis.totalCustomers}
        />

        {/* 6. New Customers in Period */}
        <MetricCard
          title="New Registrations"
          value={kpis.newCustomers.value}
          icon={UserPlus}
          iconBg="bg-purple-50"
          iconColor="text-purple-700"
          cardData={kpis.newCustomers}
        />

        {/* 7. Active Purchasing Customers */}
        <MetricCard
          title="Active Customers"
          value={kpis.activeCustomers.value}
          icon={UserCheck}
          iconBg="bg-teal-50"
          iconColor="text-teal-700"
          cardData={kpis.activeCustomers}
        />

        {/* 8. Cancellation Rate */}
        <MetricCard
          title="Cancellation Rate"
          value={kpis.cancellationRate.value}
          icon={AlertOctagon}
          iconBg="bg-red-50"
          iconColor="text-red-700"
          cardData={kpis.cancellationRate}
          isInverse={true}
          suffix="%"
        />
      </div>

      {/* Operational Live Pipeline Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F7F3EA] p-3.5 sm:p-4 rounded-2xl border border-[#E5DFC5]">
        <div className="text-xs font-semibold text-[#667266]">
          Real-time Operations Queue:
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>In Kitchen: <strong>{operations.pendingOrders + operations.confirmedOrders + operations.preparingOrders}</strong></span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] shadow-2xs">
            <Boxes className="w-3.5 h-3.5 text-blue-600" />
            <span>Ready for Dispatch: <strong>{operations.readyForDispatchOrders}</strong></span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] shadow-2xs">
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Out for Delivery: <strong>{operations.outForDeliveryOrders}</strong></span>
          </div>

          {operations.lowStockCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
              <span>Low Stock Alerts: <strong>{operations.lowStockCount}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
