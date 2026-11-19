"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Bike, RotateCcw, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DeliveryCard } from "@/components/delivery/DeliveryCard";
import { OtpVerificationModal } from "@/components/delivery/OtpVerificationModal";
import { DeliverySuccessView } from "@/components/delivery/DeliverySuccessView";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useActiveDeliveries } from "@/hooks/useDeliveryQueries";
import { Order } from "@/types";

export default function ActiveDeliveriesPage() {
  const { data, isLoading, refetch, isFetching } = useActiveDeliveries();
  const [selectedOrderForOtp, setSelectedOrderForOtp] = useState<Order | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const orders = data?.data || [];

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Celebration view when an order is delivered */}
        {completedOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <DeliverySuccessView
              order={completedOrder}
              onReset={() => {
                setCompletedOrder(null);
                refetch();
              }}
            />
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
              Active Deliveries
            </h1>
            <p className="text-xs text-gray-500">
              Orders assigned to you awaiting kitchen pickup or in transit to customer.
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

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-[#EFECE6] space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Bike className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-[#241C1A]">
                No active deliveries right now
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                You have no packages currently in transit. Check the new requests tab to accept fresh orders.
              </p>
            </div>
            <Link
              href="/requests"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors shadow-xs"
            >
              <span>View Available Requests</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orders.map((order) => (
              <DeliveryCard
                key={order.id || order._id}
                order={order}
                variant="ACTIVE"
                onVerifyOtpClick={(ord) => setSelectedOrderForOtp(ord)}
              />
            ))}
          </div>
        )}
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
