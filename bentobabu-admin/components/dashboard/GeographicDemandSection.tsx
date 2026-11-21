"use client";

import React from "react";
import { MapPin, Compass, ArrowRight, ExternalLink } from "lucide-react";
import { DashboardLocationsResponse } from "@/types";

interface GeographicDemandSectionProps {
  locationsData?: DashboardLocationsResponse;
  isLoading: boolean;
}

export function GeographicDemandSection({
  locationsData,
  isLoading,
}: GeographicDemandSectionProps) {
  if (isLoading || !locationsData) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-64" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const { serviceableLocations = [] } = locationsData;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF0E9] text-[#354B35] text-xs font-semibold mb-2">
            <Compass className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Territory &amp; Dispatch Intelligence</span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            Where Are Our Customers Ordering From?
          </h3>
          <p className="text-xs text-[#667266]">
            Geographic order volume, gross revenue realization, and average ticket size by delivery area
          </p>
        </div>
      </div>

      {/* Serviceable Locations Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5DFC5]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F7F3EA] text-[#667266] font-semibold uppercase tracking-wider border-b border-[#E5DFC5]">
            <tr>
              <th className="py-3 px-4">PIN Code / Zone</th>
              <th className="py-3 px-4">City / Region</th>
              <th className="py-3 px-4 text-center">Orders Fulfilled</th>
              <th className="py-3 px-4 text-right">Gross Revenue</th>
              <th className="py-3 px-4 text-right">Avg Order Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0ECE1] bg-white">
            {serviceableLocations.length > 0 ? (
              serviceableLocations.map((loc, idx) => (
                <tr key={loc.pincode || idx} className="hover:bg-[#F7F3EA]/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#354B35] shrink-0" />
                      <span className="font-bold text-[#1F271F] font-mono">
                        {loc.pincode}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#4A554A]">
                    {loc.city}, {loc.state}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-[#1F271F]">
                    {loc.orderCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#354B35]">
                    ₹{loc.totalRevenue.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#667266]">
                    ₹{loc.averageOrderValue.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-[#8A9A86]">
                  No delivery order data recorded for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
