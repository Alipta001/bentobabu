"use client";

import React, { useState } from "react";
import Link from "next/link";
import { History, Search, Calendar, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DeliveryCard } from "@/components/delivery/DeliveryCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useDeliveryHistory } from "@/hooks/useDeliveryQueries";

export default function DeliveryHistoryPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, refetch, isFetching } = useDeliveryHistory({
    page,
    limit: 15,
  });

  const rawOrders = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const totalCount = data?.total || 0;

  // Client-side search filter by order number or customer name
  const filteredOrders = rawOrders.filter((order) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      order.orderNumber.toLowerCase().includes(term) ||
      order.deliveryAddress?.fullName.toLowerCase().includes(term)
    );
  });

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
              Delivery History
            </h1>
            <p className="text-xs text-gray-500">
              Completed and delivered orders verified by customer OTP.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-[#EFECE6] text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[#C86D51]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Order # or Customer Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-[#EFECE6] text-xs sm:text-sm text-[#241C1A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C86D51]/20 shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* List Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-[#EFECE6] space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
              <History className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-base text-[#241C1A]">
              No past deliveries found
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {searchTerm
                ? "No completed deliveries match your search query."
                : "You haven't completed any deliveries yet. Start accepting orders from the new requests queue."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOrders.map((order) => (
              <DeliveryCard key={order.id || order._id} order={order} variant="COMPLETED" />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-2xl border border-gray-300 bg-white text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span className="px-3 text-xs font-bold text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-2xl border border-gray-300 bg-white text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
