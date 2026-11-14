"use client";

import React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadNotificationsCount, useUserProfile } from "@/hooks/useQueries";

export function NotificationBell() {
  const { data: user } = useUserProfile();
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(!!user);

  return (
    <Link
      href="/notifications"
      className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#E5DFC5] bg-white hover:bg-[#EDE8DE] text-[#354B35] transition-colors cursor-pointer"
      title="Notifications & Updates"
      aria-label="View notifications"
    >
      <Bell className="w-4 h-4 text-[#354B35]" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-[#dc2626] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

