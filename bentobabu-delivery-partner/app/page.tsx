"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  PackageCheck,
  Bike,
  IndianRupee,
  History,
  ArrowRight,
  Sparkles,
  Inbox,
  AlertCircle,
  Power,
  RefreshCw,
  Navigation,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DeliveryCard } from "@/components/delivery/DeliveryCard";
import { OtpVerificationModal } from "@/components/delivery/OtpVerificationModal";
import { DeliverySuccessView } from "@/components/delivery/DeliverySuccessView";
import { CardSkeleton, StatCardSkeleton } from "@/components/ui/LoadingSkeleton";
import {
  useNewRequests,
  useActiveDeliveries,
  useEarnings,
} from "@/hooks/useDeliveryQueries";
import { useDeliveryPresence } from "@/hooks/useDeliveryPresence";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { Order } from "@/types";

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const { isOnline, isChangingAvailability, toggleAvailability } = useDeliveryPresence();

  const { data: newRequestsData, isLoading: isLoadingRequests } = useNewRequests();
  const { data: activeDeliveriesData, isLoading: isLoadingActive } = useActiveDeliveries();
  const { data: earningsData } = useEarnings();

  const [selectedOrderForOtp, setSelectedOrderForOtp] = useState<Order | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const newRequests = newRequestsData?.data || [];
  const activeDeliveries = activeDeliveriesData?.data || [];

  const todayDeliveries = earningsData?.todayDeliveries || 0;
  const todayEarnings = earningsData?.todayEarnings || 0;
  const activeCount = activeDeliveries.length;
  const totalDeliveries = earningsData?.totalDeliveries || 0;

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Success Modal overlay when an order was just delivered */}
        {completedOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <DeliverySuccessView
              order={completedOrder}
              onReset={() => setCompletedOrder(null)}
            />
          </div>
        )}

        {/* 1. Agent Status Banner */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#EFECE6] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {user?.name?.charAt(0).toUpperCase() || "R"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-[#241C1A]">
                  {user?.name || "Delivery Partner"}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                  Verified Agent
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                ID: #{user?.id?.slice(-6).toUpperCase() || "AGT001"} • {isOnline ? "Receiving Orders" : "Currently Paused"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAvailability}
              disabled={isChangingAvailability}
              className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                isOnline
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {isChangingAvailability ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              <span>
                {isChangingAvailability
                  ? "Updating..."
                  : isOnline
                  ? "Online (Active)"
                  : "Offline (Tap to Go Online)"}
              </span>
            </button>
          </div>
        </section>

        {/* 2. Key Daily Metrics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-[#EFECE6] shadow-sm">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Today&apos;s Deliveries
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#241C1A] mt-1 font-mono">
              {todayDeliveries}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              Completed today
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#EFECE6] shadow-sm">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Today&apos;s Earnings
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#C86D51] mt-1 font-mono">
              ₹{todayEarnings}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-0.5">
              Avg ₹{earningsData?.averageEarningsPerDelivery || 60}/drop
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#EFECE6] shadow-sm">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              In-Progress
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#241C1A] mt-1 font-mono">
              {activeCount}
            </div>
            <div className="text-[11px] text-blue-600 font-semibold mt-0.5">
              Out for delivery
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#EFECE6] shadow-sm">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Total Lifetime Drops
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#241C1A] mt-1 font-mono">
              {totalDeliveries}
            </div>
            <div className="text-[11px] text-gray-500 font-medium mt-0.5">
              Lifetime completed
            </div>
          </div>
        </section>

        {/* 3. Active Delivery Card Highlight (if any out for delivery) */}
        {activeDeliveries.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bike className="w-5 h-5 text-blue-600 animate-bounce" />
                <h2 className="font-bold text-base text-[#241C1A]">
                  Active Deliveries in Progress ({activeDeliveries.length})
                </h2>
              </div>
              <Link
                href="/active"
                className="text-xs font-bold text-[#C86D51] hover:underline"
              >
                View All →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeDeliveries.map((order) => (
                <DeliveryCard
                  key={order.id || order._id}
                  order={order}
                  variant="ACTIVE"
                  onVerifyOtpClick={(ord) => setSelectedOrderForOtp(ord)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 4. New Incoming Delivery Assignments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-[#C86D51]" />
              <h2 className="font-bold text-base text-[#241C1A]">
                Available Kitchen Pickups
              </h2>
            </div>
            <span className="text-xs font-bold text-gray-500">
              {newRequests.length} {newRequests.length === 1 ? "order" : "orders"} waiting
            </span>
          </div>

          {!isOnline ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-[#EFECE6] space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Power className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-[#241C1A]">
                You are currently offline
              </h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                Switch your status to Online to start receiving immediate delivery assignments and earn per drop.
              </p>
              <button
                type="button"
                onClick={toggleAvailability}
                disabled={isChangingAvailability}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-60"
              >
                {isChangingAvailability ? "Connecting..." : "Go Online Now"}
              </button>
            </div>
          ) : isLoadingRequests ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : newRequests.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-[#EFECE6] space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-[#241C1A]">
                No pending kitchen pickups right now
              </h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                You are online! New meals preparing in the central kitchen will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newRequests.map((order) => (
                <DeliveryCard
                  key={order.id || order._id}
                  order={order}
                  variant="REQUEST"
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        order={selectedOrderForOtp}
        isOpen={!!selectedOrderForOtp}
        onClose={() => setSelectedOrderForOtp(null)}
        onSuccess={(delivered) => {
          setSelectedOrderForOtp(null);
          setCompletedOrder(delivered);
        }}
      />
    </AppShell>
  );
}
