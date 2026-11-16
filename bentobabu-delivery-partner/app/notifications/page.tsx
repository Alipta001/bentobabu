"use client";

import React, { useState } from "react";
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useDeliveryQueries";
import { toast } from "sonner";

export default function NotificationsPage() {
  const [filterUnread, setFilterUnread] = useState(false);
  const { data, isLoading, refetch, isFetching } = useNotifications({
    isRead: filterUnread ? false : undefined,
  });

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await markAllReadMutation.mutateAsync();
      toast.success("All notifications marked as read");
      refetch();
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markReadMutation.mutateAsync(id);
    } catch {}
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-bold text-xl sm:text-2xl text-[#241C1A]">
              Notifications Center
            </h1>
            <p className="text-xs text-gray-500">
              Live updates on new delivery assignments, route reminders, and earnings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-[#EFECE6] text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[#C86D51]" : ""}`} />
              <span>Refresh</span>
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] transition-colors shadow-xs cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterUnread(false)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              !filterUnread
                ? "bg-[#241C1A] text-white shadow-xs"
                : "bg-white border border-[#EFECE6] text-gray-600 hover:bg-gray-50"
            }`}
          >
            All Notifications
          </button>
          <button
            type="button"
            onClick={() => setFilterUnread(true)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              filterUnread
                ? "bg-[#C86D51] text-white shadow-xs"
                : "bg-white border border-[#EFECE6] text-gray-600 hover:bg-gray-50"
            }`}
          >
            Unread Only {unreadCount > 0 ? `(${unreadCount})` : ""}
          </button>
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
            <div className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
            <div className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-[#EFECE6] space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
              <Bell className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-base text-[#241C1A]">
              No notifications
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {filterUnread
                ? "You have caught up with all notifications."
                : "You don't have any notifications at the moment."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {notifications.map((item) => (
              <div
                key={item._id || item.id}
                onClick={() => !item.isRead && handleMarkRead(item._id || item.id || "")}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  item.isRead
                    ? "bg-white border-[#EFECE6] opacity-80"
                    : "bg-amber-50/40 border-amber-200/80 shadow-xs"
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#241C1A]">
                      {item.subject}
                    </span>
                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#C86D51]" />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 pt-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Date(item.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      at{" "}
                      {new Date(item.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {!item.isRead && (
                  <button
                    type="button"
                    title="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkRead(item._id || item.id || "");
                    }}
                    className="p-1 rounded-full text-gray-400 hover:text-[#C86D51]"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
