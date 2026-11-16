"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Bike,
  History,
  IndianRupee,
  Bell,
  User,
  LogOut,
  Power,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearCredentials } from "@/store/slices/authSlice";
import { toggleOnlineStatus } from "@/store/slices/deliverySlice";
import { authApi } from "@/lib/api/auth.api";
import {
  useNewRequests,
  useActiveDeliveries,
  useUnreadNotificationsCount,
} from "@/hooks/useDeliveryQueries";
import { toast } from "sonner";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const user = useAppSelector((state) => state.auth.user);
  const isOnline = useAppSelector((state) => state.delivery.isOnline);

  const { data: newRequestsData } = useNewRequests();
  const { data: activeDeliveriesData } = useActiveDeliveries();
  const { data: unreadNotificationsCount = 0 } = useUnreadNotificationsCount();

  const newCount = newRequestsData?.count || 0;
  const activeCount = activeDeliveriesData?.count || 0;

  const handleLogout = async () => {
    try {
      await authApi.logout();
      dispatch(clearCredentials());
      toast.success("Logged out successfully");
      router.push("/login");
    } catch {
      dispatch(clearCredentials());
      router.push("/login");
    }
  };

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: "New Requests",
      href: "/requests",
      icon: Inbox,
      badge: newCount,
    },
    {
      label: "Active Deliveries",
      href: "/active",
      icon: Bike,
      badge: activeCount,
    },
    {
      label: "Delivery History",
      href: "/history",
      icon: History,
    },
    {
      label: "Earnings",
      href: "/earnings",
      icon: IndianRupee,
    },
    {
      label: "Notifications",
      href: "/notifications",
      icon: Bell,
      badge: unreadNotificationsCount,
    },
    {
      label: "Profile & Settings",
      href: "/profile",
      icon: User,
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-[#EFECE6] bg-white h-[calc(100vh-4rem)] sticky top-16 p-4 justify-between shrink-0">
      {/* Upper Navigation Links */}
      <div className="space-y-6">
        {/* Availability Card */}
        <div className="p-3.5 rounded-2xl bg-[#FBF9F6] border border-[#EFECE6] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Status
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                isOnline
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                }`}
              />
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => dispatch(toggleOnlineStatus())}
            className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isOnline
                ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isOnline ? "Switch to Offline" : "Go Online to Earn"}</span>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            const IconComponent = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-[#C86D51] text-white shadow-xs font-bold"
                    : "text-gray-700 hover:bg-[#FBF9F6] hover:text-[#C86D51]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? "bg-white text-[#C86D51]"
                        : "bg-[#C86D51]/10 text-[#C86D51]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Logout */}
      <div className="pt-4 border-t border-[#EFECE6] space-y-3">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-[#FBF9F6]">
          <div className="w-9 h-9 rounded-full bg-[#241C1A] text-[#DFC89B] flex items-center justify-center font-bold text-sm shrink-0">
            {user?.name?.charAt(0).toUpperCase() || "R"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#241C1A] truncate">
              {user?.name || "Delivery Partner"}
            </div>
            <div className="text-[11px] text-gray-500 truncate">{user?.phone}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
