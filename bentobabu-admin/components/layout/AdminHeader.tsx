"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  LogOut,
  Flame,
  Bell,
} from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";

interface AdminHeaderProps {
  onOpenMobileSidebar: () => void;
  title: string;
  subtitle?: string;
}

export function AdminHeader({
  onOpenMobileSidebar,
  title,
  subtitle,
}: AdminHeaderProps) {
  const router = useRouter();
  const { admin, isLoading, logout } = useAdminAuth();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const displayName = admin?.name?.trim() || admin?.email || "Admin";
  const displayInitial = (displayName.charAt(0) || "A").toUpperCase();
  const displayRole = (admin?.role || "ADMIN").replace(/_/g, " ");

  return (
    <header className="sticky top-0 z-30 bg-[#F9F7F1]/95 backdrop-blur-md border-b border-[#E5DFC5] px-4 sm:px-8 py-4">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-xl border border-[#E5DFC5] bg-white text-[#1F271F] hover:bg-[#EDE8DE]"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#1F271F] leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-[#667266] mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Right: Kitchen Status, Notification Bell & Admin Profile */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-[#EBF0E9] border border-[#8A9A86]/30 px-3 py-1.5 rounded-full text-xs font-semibold text-[#354B35]">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <Flame className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Kitchen Live • Dispatch Active</span>
          </div>

          {/* Quick Notification Bell */}
          <Link
            href="/notifications"
            title="Push Notifications & Alert Settings"
            className="relative p-2 rounded-xl text-[#667266] hover:text-[#354B35] hover:bg-[#EDE8DE] border border-[#E5DFC5] bg-white transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white" />
            <span className="sr-only">Notifications</span>
          </Link>

          {/* Admin User Info */}
          {isLoading ? (
            <div
              className="flex items-center gap-2.5 pl-2 sm:border-l border-[#E5DFC5]"
              aria-hidden="true"
            >
              <div className="w-8 h-8 rounded-full bg-[#EDE8DE] animate-pulse" />
              <div className="hidden md:block space-y-1">
                <div className="w-20 h-3 bg-[#EDE8DE] rounded-md animate-pulse" />
                <div className="w-12 h-2 bg-[#EDE8DE] rounded-md animate-pulse" />
              </div>
            </div>
          ) : admin ? (
            <div className="flex items-center gap-2.5 pl-2 sm:border-l border-[#E5DFC5]">
              <div className="w-8 h-8 rounded-full bg-[#354B35] text-[#F7F3EA] flex items-center justify-center font-bold text-xs shadow-xs">
                {displayInitial}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-bold text-[#1F271F] leading-none">
                  {displayName}
                </div>
                <div className="text-[10px] text-[#B99A60] font-semibold uppercase tracking-wider mt-0.5">
                  {displayRole}
                </div>
              </div>
            </div>
          ) : null}

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Sign out of Admin Dashboard"
            className="p-2 rounded-xl text-[#667266] hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
