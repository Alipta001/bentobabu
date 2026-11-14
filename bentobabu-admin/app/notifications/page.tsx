"use client";

import React, { useState } from "react";
import {
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  Send,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminNotifications,
  useNotificationStats,
  useRetryNotification,
} from "@/hooks/useAdminQueries";

export default function NotificationsCenterPage() {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  const { data: stats, isLoading: statsLoading } = useNotificationStats();
  const { data: notificationData, isLoading, refetch } = useAdminNotifications({
    channel: channelFilter === "all" ? undefined : channelFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: 25,
  });

  const retryMutation = useRetryNotification();

  const notifications = notificationData?.notifications || [];
  const total = notificationData?.total || 0;
  const totalPages = notificationData?.totalPages || 1;

  const handleRetry = async (id: string) => {
    try {
      await retryMutation.mutateAsync(id);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to retry notification delivery.");
    }
  };

  const totalSent = stats?.statusBreakdown?.SENT || 0;
  const totalFailed = stats?.statusBreakdown?.FAILED || 0;
  const totalPending = (stats?.statusBreakdown?.PENDING || 0) + (stats?.statusBreakdown?.PROCESSING || 0);
  const totalDispatches = stats?.totalCount || 0;
  const successRate = totalDispatches > 0 ? Math.round((totalSent / totalDispatches) * 100) : 100;

  return (
    <AdminShell
      title="Customer Notifications Center"
      subtitle="Auditing, delivery metrics and retry queue for automated transactional Email and WhatsApp dispatches"
    >
      {/* 1. Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667266]">Total Dispatches</span>
            <div className="w-8 h-8 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#354B35]">
              <Send className="w-4 h-4 text-[#B99A60]" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-3">
            {statsLoading ? "..." : totalDispatches}
          </div>
          <div className="text-[10px] text-[#8A9A86] mt-1">
            Email: {stats?.channelBreakdown?.EMAIL || 0} • WhatsApp: {stats?.channelBreakdown?.WHATSAPP || 0}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667266]">Delivered Successfully</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-emerald-700 mt-3">
            {statsLoading ? "..." : totalSent}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-1">
            {successRate}% delivery rate
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667266]">Failed Deliveries</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-rose-700 mt-3">
            {statsLoading ? "..." : totalFailed}
          </div>
          <div className="text-[10px] text-[#8A9A86] mt-1">
            Manual retry available
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#667266]">Pending / Queue</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-3">
            {statsLoading ? "..." : totalPending}
          </div>
          <div className="text-[10px] text-[#8A9A86] mt-1">
            Background workers active
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-[#667266] mr-2">Channel:</span>
          {["all", "EMAIL", "WHATSAPP"].map((c) => (
            <button
              key={c}
              onClick={() => {
                setChannelFilter(c);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                channelFilter === c
                  ? "bg-[#354B35] text-white"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {c === "all" ? "All Channels" : c}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-[#667266] mr-2">Status:</span>
          {["all", "SENT", "FAILED", "PENDING"].map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === s
                  ? "bg-[#354B35] text-white"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {s === "all" ? "All Statuses" : s}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Notifications Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5DFC5] bg-[#F7F3EA]/70 text-[11px] font-semibold text-[#667266] uppercase tracking-wider">
                <th className="py-3 px-6">Channel</th>
                <th className="py-3 px-6">Event Type</th>
                <th className="py-3 px-6">Recipient</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Order #</th>
                <th className="py-3 px-6">Time</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE1] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#8A9A86]">
                    Loading notification logs...
                  </td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#8A9A86]">
                    No notification logs found for the selected criteria.
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr key={n._id || n.id} className="hover:bg-[#F9F7F1]/60 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2">
                        {n.channel === "EMAIL" ? (
                          <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                            <Mail className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <span className="font-semibold text-[#1E2B1E]">{n.channel}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-[11px] text-[#354B35]">
                      {n.eventType}
                    </td>
                    <td className="py-3.5 px-6 text-[#1E2B1E] font-medium">
                      {n.recipient}
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          n.status === "SENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : n.status === "FAILED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-[#667266] font-mono text-[11px]">
                      {n.order?.orderNumber || "—"}
                    </td>
                    <td className="py-3.5 px-6 text-[11px] text-[#8A9A86]">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {n.status === "FAILED" && (
                        <button
                          onClick={() => handleRetry(n._id || n.id || "")}
                          disabled={retryMutation.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#354B35] text-white text-[10px] font-bold hover:bg-[#253525] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-[#E5DFC5] bg-[#F7F3EA]/30 text-xs">
            <span className="text-[#667266]">
              Showing page {page} of {totalPages} ({total} logs)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] bg-white text-[#1E2B1E] font-semibold disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] bg-white text-[#1E2B1E] font-semibold disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

