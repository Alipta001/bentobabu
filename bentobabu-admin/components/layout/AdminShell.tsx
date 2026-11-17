"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useForegroundNotifications } from "@/hooks/useForegroundNotifications";

interface AdminShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AdminShell({
  children,
  title = "Bento Babu Administration",
  subtitle,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { admin, status, isLoading } = useAdminAuth();

  // Role & Authentication Guard: Only ADMIN and KITCHEN staff can access the admin shell
  useEffect(() => {
    if (!isLoading) {
      if (status === "unauthenticated" || !admin) {
        router.push("/login");
      } else if (!["ADMIN", "KITCHEN"].includes(admin.role)) {
        router.push("/login");
      }
    }
  }, [isLoading, status, admin, router]);

  // Activate real-time FCM foreground listener with audio chime and order cache invalidation
  useForegroundNotifications();

  return (
    <div className="min-h-screen flex bg-[#F9F7F1]">
      <AdminSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader
          title={title}
          subtitle={subtitle}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-8">
          {children}
        </main>
      </div>
    </div>
  );
}
