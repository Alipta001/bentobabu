"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Mail,
  Check,
  Clock,
  ArrowLeft,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  useNotifications,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useUserProfile,
} from "@/hooks/useQueries";
import { notificationService } from "@/services/notificationService";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/hooks/useQueries";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useUserProfile();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [markingAll, setMarkingAll] = useState(false);

  const { data: notifData, isLoading, isError, refetch } = useNotifications(
    filter === "unread" ? false : undefined,
    !!user
  );
  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;

  const { data: preferences } = useNotificationPreferences(!!user);
  const updatePreferencesMutation = useUpdateNotificationPreferences();

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.UNREAD_NOTIFICATIONS_COUNT });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllAsRead();
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.UNREAD_NOTIFICATIONS_COUNT });
    } finally {
      setMarkingAll(false);
    }
  };

  const handleTogglePreference = (channel: "email") => {
    if (!preferences) return;
    updatePreferencesMutation.mutate({
      ...preferences,
      [channel]: !preferences[channel],
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 text-xs text-[#354B35] font-semibold hover:underline mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Account</span>
              </Link>
              <h1 className="font-serif text-3xl font-bold text-[#222922] flex items-center gap-3">
                <span>Notifications & Updates</span>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#dc2626] text-white">
                    {unreadCount} new
                  </span>
                )}
              </h1>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E5DFC5] bg-white hover:bg-[#EDE8DE] text-xs font-semibold text-[#354B35] transition-colors cursor-pointer"
              >
                {markingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Mark All as Read</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left 8 Cols: Notifications Feed */}
            <div className="lg:col-span-8 space-y-4">
              {/* Filter Tabs */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filter === "all"
                      ? "bg-[#354B35] text-white shadow-xs"
                      : "bg-white text-[#626F62] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("unread")}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filter === "unread"
                      ? "bg-[#354B35] text-white shadow-xs"
                      : "bg-white text-[#626F62] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                  }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {/* Feed Content */}
              {isLoading ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] text-xs text-[#6B776A]">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#354B35]" />
                  <span>Loading your notifications...</span>
                </div>
              ) : isError && !notifData ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-3">
                  <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-600">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[#222922]">
                    Unable to Load Notifications
                  </h3>
                  <p className="text-xs text-[#6B776A] max-w-sm mx-auto">
                    We couldn&apos;t fetch your latest updates right now. Please try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-3">
                  <div className="w-14 h-14 rounded-full bg-[#EDE8DE] flex items-center justify-center mx-auto text-[#8A9A86]">
                    <Bell className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[#222922]">
                    No Notifications
                  </h3>
                  <p className="text-xs text-[#6B776A] max-w-sm mx-auto">
                    {filter === "unread"
                      ? "You are all caught up! No unread updates."
                      : "You will receive updates here regarding your order progress, kitchen preparation, and delivery dispatches."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => {
                    const notifId = notif.id || notif._id || "";
                    return (
                      <div
                        key={notifId || notif.createdAt}
                        className={`bg-white rounded-2xl p-5 border transition-all ${
                          notif.isRead
                            ? "border-[#E5DFC5] opacity-80"
                            : "border-[#354B35]/40 shadow-xs bg-emerald-50/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {!notif.isRead && (
                                <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
                              )}
                              <span className="font-bold text-xs text-[#222922]">
                                {notif.subject}
                              </span>
                            </div>
                            <p className="text-xs text-[#626F62] leading-relaxed">
                              {notif.message}
                            </p>
                            <div className="flex items-center gap-2 pt-1 text-[10px] text-[#8A9A86]">
                              <Clock className="w-3 h-3" />
                              <span>
                                {new Date(notif.createdAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>

                          {!notif.isRead && notifId && (
                            <button
                              type="button"
                              onClick={() => handleMarkAsRead(notifId)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-[#354B35] bg-[#354B35]/10 hover:bg-[#354B35]/20 cursor-pointer shrink-0 transition-colors"
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right 4 Cols: Notification Preferences */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-4">
                <h3 className="font-serif text-base font-bold text-[#222922]">
                  Channel Preferences
                </h3>
                <p className="text-xs text-[#6B776A] leading-relaxed">
                  Control how BentoBabu sends order confirmations, kitchen status, and delivery OTP updates.
                </p>

                <div className="space-y-3 pt-2">
                  {/* Email Toggle */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-[#354B35]" />
                      <div>
                        <div className="text-xs font-bold text-[#222922]">Email Updates</div>
                        <div className="text-[10px] text-[#6B776A]">Receipts & status updates</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTogglePreference("email")}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        preferences?.email ? "bg-[#354B35]" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform rounded-full bg-white transition-transform ${
                          preferences?.email ? "translate-x-6" : "translate-x-1"
                        } mt-1`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
