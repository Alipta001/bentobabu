"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Tags,
  Boxes,
  CalendarCheck2,
  Users,
  TrendingUp,
  CreditCard,
  TicketPercent,
  Truck,
  Star,
  FileBarChart,
  Settings,
  Bell,
  UserCheck,
  X,
} from "lucide-react";
import { useKPISummary } from "@/hooks/useAdminQueries";

interface AdminSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: ShoppingBag, badgeKey: "pendingOrders" },
  { label: "Products", href: "/products", icon: UtensilsCrossed },
  { label: "Categories", href: "/categories", icon: Tags },
  { label: "Inventory", href: "/inventory", icon: Boxes, badgeKey: "lowStockCount" },
  { label: "Daily Menu", href: "/menu", icon: CalendarCheck2 },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Staff", href: "/staff", icon: UserCheck },
  { label: "Revenue", href: "/revenue", icon: TrendingUp },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Coupons", href: "/coupons", icon: TicketPercent },
  { label: "Delivery Zones", href: "/delivery", icon: Truck },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Reviews", href: "/reviews", icon: Star },
  { label: "Reports", href: "/reports", icon: FileBarChart },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AdminSidebar({ mobileOpen, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const { data: kpi } = useKPISummary();

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#1E2B1E] text-[#EDE8DE] border-r border-[#2C3E2C]">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#2C3E2C] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-[#354B35] flex items-center justify-center font-serif text-xl font-bold text-[#B99A60] shadow-sm border border-[#4A654A] group-hover:scale-105 transition-transform">
            B
          </div>
          <div>
            <div className="font-serif text-lg font-bold tracking-tight text-white leading-none">
              Bento Babu
            </div>
            <div className="text-[10px] tracking-widest uppercase font-semibold text-[#B99A60] mt-0.5">
              Kitchen Admin
            </div>
          </div>
        </Link>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-[#8A9A86] hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          const badgeVal =
            item.badgeKey && kpi
              ? (kpi as unknown as Record<string, number>)[item.badgeKey]
              : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? "bg-[#354B35] text-white shadow-xs border border-[#4A654A]"
                  : "text-[#EDE8DE]/70 hover:bg-[#253525] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-[#B99A60]" : "text-[#8A9A86]"
                  }`}
                />
                <span>{item.label}</span>
              </div>

              {badgeVal > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    item.badgeKey === "lowStockCount"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-[#B99A60] text-[#1E2B1E]"
                  }`}
                >
                  {badgeVal}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Storefront Link */}
      <div className="p-4 border-t border-[#2C3E2C] space-y-2">
        <a
          href={process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://bentobabu.com"}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#253525] border border-[#354B35] text-xs font-semibold text-[#DFC89B] hover:bg-[#354B35] transition-colors"
        >
          <span>Open Customer Storefront ↗</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
