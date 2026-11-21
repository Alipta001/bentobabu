"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
} from "lucide-react";
import { DashboardOrdersResponse, DashboardPeakHoursResponse } from "@/types";

interface OrderOperationsSectionProps {
  ordersData?: DashboardOrdersResponse;
  peakHoursData?: DashboardPeakHoursResponse;
  isLoading: boolean;
}

export function OrderOperationsSection({
  ordersData,
  peakHoursData,
  isLoading,
}: OrderOperationsSectionProps) {
  if (isLoading || !ordersData || !peakHoursData) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const { statusBreakdown = [], cancellationReasons = [] } = ordersData;
  const { hourlyVelocity = [], dayOfWeekVelocity = [] } = peakHoursData;

  // Status mapping helper
  const statusMap = new Map();
  statusBreakdown.forEach((s) => statusMap.set(s.status, s.count));

  const LIFECYCLE_STEPS = [
    { key: "PENDING", label: "Pending", color: "bg-gray-100 text-gray-800 border-gray-300" },
    { key: "CONFIRMED", label: "Confirmed", color: "bg-blue-50 text-blue-800 border-blue-200" },
    { key: "PREPARING", label: "Cooking", color: "bg-amber-50 text-amber-800 border-amber-200" },
    { key: "READY_FOR_PICKUP", label: "Ready", color: "bg-purple-50 text-purple-800 border-purple-200" },
    { key: "OUT_FOR_DELIVERY", label: "Dispatched", color: "bg-teal-50 text-teal-800 border-teal-200" },
    { key: "DELIVERED", label: "Delivered", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  ];

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF0E9] text-[#354B35] text-xs font-semibold mb-2">
            <Flame className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Kitchen &amp; Operational Efficiency</span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            Order Operations &amp; Peak Velocities
          </h3>
          <p className="text-xs text-[#667266]">
            Lifecycle distribution, hourly order demand in IST, and peak cooking intervals
          </p>
        </div>
      </div>

      {/* Order Lifecycle Flow Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#667266]">
          Order Pipeline Distribution
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {LIFECYCLE_STEPS.map((step) => {
            const count = statusMap.get(step.key) || 0;
            return (
              <div
                key={step.key}
                className={`p-3.5 rounded-2xl border ${step.color} flex flex-col justify-between space-y-1 shadow-2xs`}
              >
                <span className="text-[11px] font-semibold tracking-wider uppercase opacity-80">
                  {step.label}
                </span>
                <span className="font-serif text-2xl font-bold tracking-tight">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Grid: Hourly Demand & Day of Week Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left (8 cols): Orders by Hour of Day in IST */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#1F271F] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#354B35]" />
              <span>Orders by Hour of Day (IST Peak Demand)</span>
            </h4>
            <span className="text-xs text-[#8A9A86]">24-Hour Velocity</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyVelocity} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE1" />
                <XAxis dataKey="label" stroke="#8A9A86" fontSize={10} tickLine={false} interval={2} />
                <YAxis stroke="#8A9A86" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(val: any) => [`${val} orders`, "Orders"]}
                  contentStyle={{
                    backgroundColor: "#1E2B1E",
                    color: "#FFFFFF",
                    borderRadius: "12px",
                    border: "none",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="orders" name="Orders" fill="#354B35" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right (4 cols): Day of Week Demand & Cancellation Reasons */}
        <div className="lg:col-span-4 space-y-6">
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-[#1F271F] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#B99A60]" />
              <span>Orders by Day of Week</span>
            </h4>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayOfWeekVelocity} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE1" />
                  <XAxis dataKey="day" stroke="#8A9A86" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8A9A86" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    formatter={(val: any) => [`${val} orders`, "Orders"]}
                    contentStyle={{
                      backgroundColor: "#1E2B1E",
                      color: "#FFFFFF",
                      borderRadius: "12px",
                      border: "none",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="orders" name="Orders" fill="#B99A60" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cancellation Reasons Breakdown */}
          {cancellationReasons.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#F0ECE1]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Primary Cancellation Reasons</span>
              </h4>
              <div className="space-y-1.5">
                {cancellationReasons.slice(0, 3).map((cr, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-red-50/60 border border-red-100">
                    <span className="text-red-900 truncate max-w-[200px]">{cr.reason}</span>
                    <span className="font-mono font-bold text-red-700">{cr.count} orders</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
