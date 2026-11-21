"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  UtensilsCrossed,
  ArrowUpDown,
  TrendingDown,
  Tags,
  Layers,
  Sparkles,
} from "lucide-react";
import { DashboardProductsResponse } from "@/types";

interface ProductPerformanceSectionProps {
  productsData?: DashboardProductsResponse;
  isLoading: boolean;
}

export function ProductPerformanceSection({
  productsData,
  isLoading,
}: ProductPerformanceSectionProps) {
  const [sortBy, setSortBy] = useState<"units" | "revenue" | "orders">("units");

  if (isLoading || !productsData) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const { topSellingProducts = [], leastSellingProducts = [], categoryPerformance = [] } =
    productsData;

  // Client-side sort toggle
  const sortedTopProducts = [...topSellingProducts].sort((a, b) => {
    if (sortBy === "revenue") return b.grossSales - a.grossSales;
    if (sortBy === "orders") return b.orderCount - a.orderCount;
    return b.unitsSold - a.unitsSold;
  });

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF0E9] text-[#354B35] text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Menu &amp; Dish Analytics</span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            What&apos;s Selling the Most?
          </h3>
          <p className="text-xs text-[#667266]">
            Item sales velocity, order inclusions, and gross category contribution
          </p>
        </div>

        {/* Sorting Controls */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-[#8A9A86] hidden sm:inline">Sort by:</span>
          <div className="flex items-center bg-[#F7F3EA] p-1 rounded-xl border border-[#E5DFC5]">
            <button
              type="button"
              onClick={() => setSortBy("units")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                sortBy === "units"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1F271F]"
              }`}
            >
              Units Sold
            </button>
            <button
              type="button"
              onClick={() => setSortBy("revenue")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                sortBy === "revenue"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1F271F]"
              }`}
            >
              Revenue
            </button>
            <button
              type="button"
              onClick={() => setSortBy("orders")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                sortBy === "orders"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1F271F]"
              }`}
            >
              Orders Count
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left (8 cols): Top-Selling Dishes Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#1F271F] flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-[#354B35]" />
              <span>Top Dishes Performance</span>
            </h4>
            <span className="text-xs text-[#8A9A86]">
              Showing top {sortedTopProducts.length} items
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E5DFC5]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F3EA] text-[#667266] font-semibold uppercase tracking-wider border-b border-[#E5DFC5]">
                <tr>
                  <th className="py-3 px-4">Dish</th>
                  <th className="py-3 px-4 text-center">Units Sold</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Gross Sales</th>
                  <th className="py-3 px-4 text-right">% Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1] bg-white">
                {sortedTopProducts.length > 0 ? (
                  sortedTopProducts.map((p, idx) => (
                    <tr key={p.productId || idx} className="hover:bg-[#F7F3EA]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] overflow-hidden shrink-0 relative flex items-center justify-center">
                            {p.image ? (
                              <Image
                                src={p.image}
                                alt={p.name}
                                fill
                                sizes="40px"
                                className="object-cover"
                              />
                            ) : (
                              <UtensilsCrossed className="w-4 h-4 text-[#8A9A86]" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/products?search=${encodeURIComponent(p.name)}`}
                              className="font-bold text-[#1F271F] hover:text-[#354B35] transition-colors"
                            >
                              {p.name}
                            </Link>
                            <div className="text-[11px] text-[#8A9A86]">
                              Rank #{idx + 1}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-[#1F271F] font-mono">
                        {p.unitsSold}
                      </td>
                      <td className="py-3 px-4 text-center text-[#667266] font-mono">
                        {p.orderCount}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[#1F271F] font-mono">
                        ₹{p.grossSales.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-[#EBF0E9] text-[#354B35] font-bold text-[11px]">
                          {p.contributionPercentage}%
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#8A9A86]">
                      No product sales recorded in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right (4 cols): Category Performance & Least-Selling */}
        <div className="lg:col-span-4 space-y-6">
          {/* Category Performance */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-[#1F271F] flex items-center gap-2">
              <Tags className="w-4 h-4 text-[#B99A60]" />
              <span>Category Revenue Contribution</span>
            </h4>

            <div className="space-y-3">
              {categoryPerformance.map((c) => (
                <div key={c.categoryId} className="p-3 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1F271F]">{c.name}</span>
                    <span className="font-mono text-[#354B35] font-bold">
                      ₹{c.revenue.toLocaleString("en-IN")} ({c.contributionPercentage}%)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-[#E5DFC5] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#354B35] h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, c.contributionPercentage)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#8A9A86]">
                    <span>{c.unitsSold} items sold</span>
                    <span>{c.orders} orders</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Least-Selling Food Items */}
          {leastSellingProducts.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-700" />
                <span>Low Velocity Items (Review)</span>
              </h4>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                <p className="text-xs text-amber-800">
                  Active dishes with low or zero sales during this period:
                </p>
                <div className="space-y-1.5 divide-y divide-amber-200/50">
                  {leastSellingProducts.slice(0, 5).map((lp) => (
                    <div key={lp.productId} className="flex items-center justify-between pt-1.5 text-xs">
                      <span className="font-medium text-amber-950 truncate max-w-[180px]">
                        {lp.name}
                      </span>
                      <span className="text-amber-800 font-mono font-bold text-[11px]">
                        {lp.unitsSold} sold (₹{lp.grossSales})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
