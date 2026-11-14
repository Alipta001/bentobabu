"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminProducts,
  useToggleDailyMenu,
} from "@/hooks/useAdminQueries";

export default function AdminDailyMenuPage() {
  const { data: products = [], isLoading } = useAdminProducts();
  const toggleDailyMenuMutation = useToggleDailyMenu();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);

  const dailyCount = products.filter((p) => p.isDailyMenu).length;

  const filtered = products.filter((p) => {
    if (filterActiveOnly && !p.isDailyMenu) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <AdminShell
      title="Daily Menu & Shift Availability"
      subtitle="Publish which nutritional bentos are fresh and orderable on today's customer storefront"
    >
      {/* Overview & Quick Toggle Header */}
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#B99A60]">
            Today&apos;s Active Kitchen Lineup
          </span>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            {dailyCount} of {products.length} Dishes Published for Today
          </h3>
          <p className="text-xs text-[#667266] mt-0.5">
            Customers on the website will only see dishes marked &quot;In Daily Menu&quot;.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
            <input
              type="text"
              placeholder="Search dish or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
          </div>
          <button
            onClick={() => setFilterActiveOnly(!filterActiveOnly)}
            className={`px-4 py-2.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              filterActiveOnly
                ? "bg-[#354B35] text-white border-[#354B35]"
                : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5]"
            }`}
          >
            {filterActiveOnly ? "Showing Live Only" : "Show All Dishes"}
          </button>
        </div>
      </div>

      {/* Grid of Dishes with Live Toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 p-12 text-center text-xs text-[#667266]">
            Loading daily menu states...
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`bg-white rounded-3xl border p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 ${
                p.isDailyMenu
                  ? "border-[#354B35]/40 ring-1 ring-[#354B35]/20"
                  : "border-[#E5DFC5] opacity-75"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.imageUrl}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover border border-[#E5DFC5] shrink-0"
                />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="capitalize text-[10px] font-bold text-[#B99A60]">
                      {p.dietary}
                    </span>
                    <span className="font-bold text-xs text-[#1F271F]">₹{p.price}</span>
                  </div>
                  <h4 className="font-serif font-bold text-sm text-[#1F271F] line-clamp-1">
                    {p.name}
                  </h4>
                  <div className="text-[11px] text-[#667266]">
                    Stock: {p.stockQuantity} portions remaining
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#F0ECE1] flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    p.isDailyMenu ? "text-[#354B35]" : "text-[#8A9A86]"
                  }`}
                >
                  {p.isDailyMenu ? "Available Today" : "Not on Today's Menu"}
                </span>

                <button
                  onClick={() => toggleDailyMenuMutation.mutate(p.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    p.isDailyMenu
                      ? "bg-[#354B35] text-white hover:bg-[#253525]"
                      : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
                  }`}
                >
                  {p.isDailyMenu ? "Active" : "Publish"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
