"use client";

import React from "react";
import Link from "next/link";
import { Bell, Power, ShieldCheck, User } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toggleOnlineStatus } from "@/store/slices/deliverySlice";
import { useUnreadNotificationsCount } from "@/hooks/useDeliveryQueries";

export function Header() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isOnline = useAppSelector((state) => state.delivery.isOnline);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();

  const handleToggleOnline = () => {
    dispatch(toggleOnlineStatus());
  };

  const agentId = user?.id || user?._id || "AGT-001";
  const displayId = agentId.slice(-6).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#EFECE6] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Agent Identity */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              B
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-[#241C1A] flex items-center gap-1.5">
                <span>BentoBabu</span>
                <span className="px-1.5 py-0.2 rounded-md bg-[#C86D51]/10 text-[#C86D51] text-[10px] font-extrabold uppercase">
                  Rider
                </span>
              </div>
              <div className="text-[11px] text-gray-500 font-medium">
                ID: #{displayId} • {user?.name || "Delivery Partner"}
              </div>
            </div>
          </Link>
        </div>

        {/* Right Controls: Online/Offline Toggle & Notifications */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Prominent Availability Toggle Button */}
          <button
            type="button"
            onClick={handleToggleOnline}
            aria-label={isOnline ? "Go Offline" : "Go Online"}
            className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
                : "bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isOnline ? "bg-emerald-500" : "bg-gray-400"
                }`}
              />
            </span>
            <span className="hidden sm:inline">
              {isOnline ? "Online & Ready" : "Offline"}
            </span>
            <span className="sm:hidden">{isOnline ? "Online" : "Offline"}</span>
            <Power className="w-3.5 h-3.5 ml-0.5" />
          </button>

          {/* Notifications Bell */}
          <Link
            href="/notifications"
            className="relative p-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#C86D51] text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          {/* Profile Shortcut */}
          <Link
            href="/profile"
            className="flex items-center gap-2 p-1 pl-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#241C1A] text-[#DFC89B] flex items-center justify-center font-bold text-xs">
              {user?.name?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
