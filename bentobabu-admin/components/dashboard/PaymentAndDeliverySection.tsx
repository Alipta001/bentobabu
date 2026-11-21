"use client";

import React from "react";
import {
  CreditCard,
  Banknote,
  Truck,
  Bike,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { DashboardPaymentsResponse, DashboardDeliveryResponse } from "@/types";

interface PaymentAndDeliverySectionProps {
  paymentsData?: DashboardPaymentsResponse;
  deliveryData?: DashboardDeliveryResponse;
  isLoading: boolean;
}

export function PaymentAndDeliverySection({
  paymentsData,
  deliveryData,
  isLoading,
}: PaymentAndDeliverySectionProps) {
  if (isLoading || !paymentsData || !deliveryData) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
        <div className="h-64 bg-white/70 rounded-3xl border border-[#E5DFC5]" />
        <div className="h-64 bg-white/70 rounded-3xl border border-[#E5DFC5]" />
      </div>
    );
  }

  const { statusBreakdown, methodDistribution, refunds } = paymentsData;
  const { fleet, ordersQueue, avgDeliveryMinutes } = deliveryData;

  const totalMethodOrders = methodDistribution.reduce((acc, m) => acc + m.count, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Payment Analytics */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1F271F] flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#354B35]" />
              <span>Payment Analytics &amp; Gateway Health</span>
            </h3>
            <p className="text-xs text-[#667266]">
              Razorpay gateway transactions, COD settlements, and refund reconciliation
            </p>
          </div>
        </div>

        {/* Payment Methods Ratio */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#667266]">
            Payment Method Split:
          </div>
          <div className="grid grid-cols-2 gap-3">
            {methodDistribution.map((m) => {
              const pct = totalMethodOrders > 0 ? Math.round((m.count / totalMethodOrders) * 100) : 0;
              const isRazorpay = m.method.toUpperCase() === "RAZORPAY";
              return (
                <div key={m.method} className="p-3.5 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1F271F] flex items-center gap-1.5">
                      {isRazorpay ? <CreditCard className="w-3.5 h-3.5 text-[#354B35]" /> : <Banknote className="w-3.5 h-3.5 text-[#B99A60]" />}
                      {isRazorpay ? "Razorpay (Online)" : "Cash on Delivery"}
                    </span>
                    <span className="font-mono text-[#354B35] font-bold">{pct}%</span>
                  </div>
                  <div className="font-serif text-lg font-bold text-[#1F271F]">
                    ₹{m.amount.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-[#8A9A86]">{m.count} orders</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Statuses Grid */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <span className="text-emerald-800 font-semibold block text-[11px]">Paid / Collected</span>
            <span className="font-mono font-bold text-emerald-900 text-sm">
              ₹{(statusBreakdown.PAID?.amount || 0).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-emerald-700 block">
              {statusBreakdown.PAID?.count || 0} orders
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
            <span className="text-amber-800 font-semibold block text-[11px]">Pending COD</span>
            <span className="font-mono font-bold text-amber-900 text-sm">
              ₹{(statusBreakdown.COD_PENDING?.amount || 0).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-amber-700 block">
              {statusBreakdown.COD_PENDING?.count || 0} orders
            </span>
          </div>

          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs">
            <span className="text-red-800 font-semibold block text-[11px]">Refunds Processed</span>
            <span className="font-mono font-bold text-red-900 text-sm">
              ₹{refunds.amount.toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-red-700 block">{refunds.count} orders</span>
          </div>
        </div>
      </div>

      {/* Right: Delivery Fleet Performance */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1F271F] flex items-center gap-2">
              <Truck className="w-5 h-5 text-[#354B35]" />
              <span>Delivery Fleet &amp; Fulfillment</span>
            </h3>
            <p className="text-xs text-[#667266]">
              Partner availability, dispatch queues, and average delivery durations
            </p>
          </div>
        </div>

        {/* Fleet KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#667266]">
              <span className="font-semibold uppercase tracking-wider">Active Fleet (Online)</span>
              <Bike className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-serif text-2xl font-bold text-emerald-800">
              {fleet.activeOnline} / {fleet.total}
            </div>
            <div className="text-[11px] text-[#8A9A86]">
              Delivery partners currently on duty
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#667266]">
              <span className="font-semibold uppercase tracking-wider">Avg Delivery Time</span>
              <Clock className="w-4 h-4 text-[#354B35]" />
            </div>
            <div className="font-serif text-2xl font-bold text-[#1F271F]">
              ~{avgDeliveryMinutes} mins
            </div>
            <div className="text-[11px] text-[#8A9A86]">
              From dispatch to customer doorstep
            </div>
          </div>
        </div>

        {/* Fulfillment Queues Bar */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-2.5">
          <div className="text-xs font-bold text-[#1F271F] uppercase tracking-wider">
            Current Dispatch Pipeline
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-white rounded-xl border border-[#E5DFC5]">
              <span className="text-[10px] text-[#667266] block">Awaiting Rider</span>
              <span className="font-bold text-amber-700 font-mono text-base">
                {ordersQueue.awaitingAssignment}
              </span>
            </div>
            <div className="p-2 bg-white rounded-xl border border-[#E5DFC5]">
              <span className="text-[10px] text-[#667266] block">In Transit</span>
              <span className="font-bold text-blue-700 font-mono text-base">
                {ordersQueue.inTransit}
              </span>
            </div>
            <div className="p-2 bg-white rounded-xl border border-[#E5DFC5]">
              <span className="text-[10px] text-[#667266] block">Delivered in Period</span>
              <span className="font-bold text-[#354B35] font-mono text-base">
                {ordersQueue.deliveredInPeriod}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
