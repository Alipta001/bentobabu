"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageCheck, IndianRupee, User, Sparkles } from "lucide-react";
import { useActiveDeliveries, useNewRequests } from "@/hooks/useDeliveryQueries";

export function BottomNav() {
  const pathname = usePathname();
  const { data: newRequestsData } = useNewRequests();
  const { data: activeDeliveriesData } = useActiveDeliveries();

  const newCount = newRequestsData?.count || 0;
  const activeCount = activeDeliveriesData?.count || 0;
  const totalTasks = newCount + activeCount;

  const navItems = [
    {
      label: "Home",
      href: "/",
      icon: Home,
      exact: true,
    },
    {
      label: "Deliveries",
      href: "/requests",
      icon: PackageCheck,
      badge: totalTasks > 0 ? totalTasks : undefined,
      activeMatches: ["/requests", "/active", "/orders"],
    },
    {
      label: "Earnings",
      href: "/earnings",
      icon: IndianRupee,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: User,
    },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EFECE6] px-2 py-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : item.activeMatches
            ? item.activeMatches.some((m) => pathname.startsWith(m))
            : pathname.startsWith(item.href);

          const IconComponent = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-2xl transition-all relative ${
                isActive
                  ? "text-[#C86D51] font-bold"
                  : "text-gray-500 hover:text-gray-900 font-medium"
              }`}
            >
              <div className="relative">
                <IconComponent className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C86D51] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#C86D51] mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
