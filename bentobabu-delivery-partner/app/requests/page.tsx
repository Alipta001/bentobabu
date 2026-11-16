"use client";

import React from "react";
import { Inbox, RotateCcw, Power } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DeliveryCard } from "@/components/delivery/DeliveryCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useNewRequests } from "@/hooks/useDeliveryQueries";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { toggleOnlineStatus } from "@/store/slices/deliverySlice";

export default function RequestsPage() {
  const dispatch = useAppDispatch();
  const isOnline = useAppSelector((state) => state.delivery.isOnline);
  const { data, isLoading, refetch, isFetching } = useNewRequests();

  const orders = data?.data || [];

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
              New Delivery Requests
            </h1>
            <p className="text-xs text-gray-500">
              Kitchen-ready meal orders awaiting delivery partner pickup.
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

        {!isOnline ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-[#EFECE6] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Power className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-[#241C1A]">
              You are currently offline
            </h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto">
              Go online to receive real-time delivery notifications and accept orders.
            </p>
            <button
              type="button"
              onClick={() => dispatch(toggleOnlineStatus())}
              className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
            >
              Switch to Online
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-[#EFECE6] space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-base text-[#241C1A]">
              No pending delivery assignments
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Our central kitchen is preparing the next fresh batches. Stay online and assignments will pop up here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orders.map((order) => (
              <DeliveryCard key={order.id || order._id} order={order} variant="REQUEST" />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
