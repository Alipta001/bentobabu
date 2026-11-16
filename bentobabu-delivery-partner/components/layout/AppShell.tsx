"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { useAppSelector } from "@/store/hooks";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAppSelector(
    (state) => state.auth
  );
  const isOnline = useAppSelector((state) => state.delivery.isOnline);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auth guard: If on protected route and not authenticated, redirect to /login
  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      if (!pathname.startsWith("/login")) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    }
  }, [mounted, isLoading, isAuthenticated, pathname, router]);

  // Prevent flash of protected content
  if (!mounted || isLoading || (!isAuthenticated && !pathname.startsWith("/login"))) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FBF9F6] p-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#C86D51] to-[#D9532F] text-white flex items-center justify-center font-bold text-2xl animate-pulse shadow-md mb-4">
          B
        </div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#241C1A]">
          Loading Delivery Portal...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F6] text-[#241C1A]">
      <Header />

      {/* Offline Alert Banner if agent is currently Offline */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-16 z-30 shadow-xs flex items-center justify-center gap-2">
          <span>You are currently OFFLINE. Switch Online to receive new delivery assignments.</span>
        </div>
      )}

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-24 lg:pb-12 px-4 sm:px-6 lg:px-8 pt-6">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
