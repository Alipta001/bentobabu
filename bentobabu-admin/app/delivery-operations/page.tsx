"use client";

import React, { useState, useMemo } from "react";
import {
  Bike,
  Radio,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  SlidersHorizontal,
  Navigation,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useDeliveryOperationsOverview,
  useMonitoredPartners,
} from "@/hooks/useAdminQueries";
import { PartnerLocationMap } from "@/components/delivery-operations/PartnerLocationMap";
import { PartnerDetailsDrawer } from "@/components/delivery-operations/PartnerDetailsDrawer";

const STATUS_FILTERS = [
  { label: "All Partners", value: "ALL" },
  { label: "Online", value: "ONLINE" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Busy (Delivering)", value: "BUSY" },
  { label: "Offline", value: "OFFLINE" },
  { label: "Disconnected", value: "DISCONNECTED" },
  { label: "Suspended", value: "SUSPENDED" },
] as const;

export default function DeliveryOperationsPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"lastSeen" | "name" | "status">("lastSeen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"split" | "map" | "table">("split");

  // Selection state
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [drawerPartnerId, setDrawerPartnerId] = useState<string | null>(null);

  // Queries (Auto-refreshes every 8 seconds)
  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useDeliveryOperationsOverview();

  const {
    data: partnersData,
    isLoading: partnersLoading,
    isRefetching,
    refetch: refetchPartners,
  } = useMonitoredPartners({
    search: search.trim() || undefined,
    filter: activeFilter,
    sortBy,
    sortOrder,
    page,
    limit: 50,
  });

  const partners = partnersData?.partners || [];
  const total = partnersData?.total || 0;
  const totalPages = partnersData?.totalPages || 1;

  const handleRefresh = () => {
    refetchOverview();
    refetchPartners();
  };

  const handleSelectPartner = (id: string) => {
    setSelectedPartnerId(id);
    setDrawerPartnerId(id);
  };

  const handleFocusMapOnly = (id: string) => {
    setSelectedPartnerId(id);
    if (viewMode === "table") {
      setViewMode("split");
    }
  };

  return (
    <AdminShell
      title="Delivery Fleet Operations & Live Tracking"
      subtitle="Real-time presence monitoring, live GPS telemetry, connection heartbeats, and partner dispatch availability"
    >
      <div className="space-y-6">
        {/* 1. Overview Statistics KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Total Approved */}
          <div className="bg-white p-4 rounded-3xl border border-[#E5DFC5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A9A86] block">
              Approved Fleet
            </span>
            <div className="text-2xl font-serif font-bold text-[#1E2B1E] mt-1">
              {overviewLoading ? "..." : overview?.totalApproved ?? 0}
            </div>
            <span className="text-[10px] text-[#667266] mt-0.5 block">Total onboarded</span>
          </div>

          {/* Online Fleet */}
          <div className="bg-emerald-50/70 p-4 rounded-3xl border border-emerald-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                Online
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-serif font-bold text-emerald-950 mt-1">
              {overviewLoading ? "..." : overview?.online ?? 0}
            </div>
            <span className="text-[10px] text-emerald-700 mt-0.5 block">Logged on duty</span>
          </div>

          {/* Available for orders */}
          <div className="bg-emerald-50/40 p-4 rounded-3xl border border-emerald-100 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              Available
            </span>
            <div className="text-2xl font-serif font-bold text-emerald-900 mt-1">
              {overviewLoading ? "..." : overview?.available ?? 0}
            </div>
            <span className="text-[10px] text-emerald-600 mt-0.5 block">Ready for orders</span>
          </div>

          {/* Busy (Out for delivery) */}
          <div className="bg-amber-50/70 p-4 rounded-3xl border border-amber-200/80 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
              Busy
            </span>
            <div className="text-2xl font-serif font-bold text-amber-950 mt-1">
              {overviewLoading ? "..." : overview?.busy ?? 0}
            </div>
            <span className="text-[10px] text-amber-700 mt-0.5 block">On active deliveries</span>
          </div>

          {/* Offline Partners */}
          <div className="bg-white p-4 rounded-3xl border border-[#E5DFC5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A9A86] block">
              Offline
            </span>
            <div className="text-2xl font-serif font-bold text-[#64748B] mt-1">
              {overviewLoading ? "..." : overview?.offline ?? 0}
            </div>
            <span className="text-[10px] text-[#667266] mt-0.5 block">Off duty</span>
          </div>

          {/* Disconnected Partners */}
          <div className="bg-gray-50 p-4 rounded-3xl border border-gray-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
              Disconnected
            </span>
            <div className="text-2xl font-serif font-bold text-gray-700 mt-1">
              {overviewLoading ? "..." : overview?.disconnected ?? 0}
            </div>
            <span className="text-[10px] text-gray-500 mt-0.5 block">Missed heartbeat</span>
          </div>

          {/* Suspended Partners */}
          <div className="bg-red-50/50 p-4 rounded-3xl border border-red-200/60 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block">
              Suspended
            </span>
            <div className="text-2xl font-serif font-bold text-red-900 mt-1">
              {overviewLoading ? "..." : overview?.suspendedOrDeactivated ?? 0}
            </div>
            <span className="text-[10px] text-red-600 mt-0.5 block">Blocked / inactive</span>
          </div>
        </div>

        {/* 2. View Mode & Live Refresh Toolbar */}
        <div className="bg-white p-4 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-wrap items-center justify-between gap-4">
          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === "split"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              Split View (Map & Table)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === "map"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              Full Map View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              Full Table View
            </button>
          </div>

          {/* Live Status indicator & Manual Refresh */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[#667266]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>Live polling active (8s)</span>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F3EA] hover:bg-[#EDE8DE] text-xs font-bold text-[#1E2B1E] border border-[#E5DFC5] transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 3. Interactive Map (Shown in Split or Map mode) */}
        {(viewMode === "split" || viewMode === "map") && (
          <div className={viewMode === "map" ? "h-[680px]" : "h-[420px]"}>
            <PartnerLocationMap
              partners={partners}
              selectedPartnerId={selectedPartnerId}
              onSelectPartner={handleSelectPartner}
              className="h-full"
            />
          </div>
        )}

        {/* 4. Table & Filters Section (Shown in Split or Table mode) */}
        {(viewMode === "split" || viewMode === "table") && (
          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            {/* Table Filter Tabs */}
            <div className="p-4 border-b border-[#F0ECE1] space-y-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => {
                      setActiveFilter(f.value);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      activeFilter === f.value
                        ? "bg-[#354B35] text-white shadow-xs"
                        : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search and Sort Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-[#F0ECE1]">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A9A86]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by partner name, phone or application ID..."
                    className="w-full pl-10 pr-4 py-2 bg-[#F7F3EA] border border-[#E5DFC5] rounded-2xl text-xs text-[#241C1A] placeholder-[#8A9A86] focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#667266]">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#8A9A86]" />
                    <span className="font-semibold">Sort by:</span>
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-1.5 bg-[#F7F3EA] border border-[#E5DFC5] rounded-xl text-xs font-bold text-[#1E2B1E] focus:outline-none cursor-pointer"
                  >
                    <option value="lastSeen">Last Heartbeat</option>
                    <option value="name">Partner Name</option>
                    <option value="status">Availability</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="px-2.5 py-1.5 bg-[#F7F3EA] border border-[#E5DFC5] rounded-xl text-xs font-bold text-[#1E2B1E] hover:bg-[#EDE8DE] cursor-pointer"
                  >
                    {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
                  </button>
                </div>
              </div>
            </div>

            {/* Delivery Partners Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F7F3EA]/70 text-[#667266] uppercase text-[10px] font-bold tracking-wider border-b border-[#E5DFC5]">
                  <tr>
                    <th className="py-3 px-4">Partner Details</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3">Account</th>
                    <th className="py-3 px-3">Availability</th>
                    <th className="py-3 px-3">Connection</th>
                    <th className="py-3 px-3">Current Order</th>
                    <th className="py-3 px-3">Location Status</th>
                    <th className="py-3 px-3">Last Heartbeat</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE1]">
                  {partnersLoading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#8A9A86]">
                        <div className="flex items-center justify-center gap-2">
                          <Radio className="w-4 h-4 animate-spin text-[#354B35]" />
                          <span>Loading delivery partner presence data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : partners.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#8A9A86]">
                        No approved delivery partners found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    partners.map((partner) => {
                      const isSelected = partner.id === selectedPartnerId;
                      const isSuspended = partner.accountStatus === "SUSPENDED";
                      const isBusy = partner.availabilityStatus === "BUSY" || !!partner.currentOrderId;
                      const isOnline = partner.availabilityStatus === "ONLINE" && !isBusy;
                      const isConnected = partner.connectionStatus === "CONNECTED";
                      const isLive = partner.locationFreshness === "LIVE";

                      return (
                        <tr
                          key={partner.id}
                          onClick={() => handleSelectPartner(partner.id)}
                          className={`hover:bg-[#F7F3EA]/50 transition-colors cursor-pointer ${
                            isSelected ? "bg-[#F7F3EA] font-medium" : ""
                          }`}
                        >
                          {/* Partner Name & Photo */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {partner.profilePhoto ? (
                                <img
                                  src={partner.profilePhoto}
                                  alt={partner.name}
                                  className="w-9 h-9 rounded-xl object-cover border border-[#E5DFC5]"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-[#1E2B1E] text-[#DFC89B] flex items-center justify-center font-bold text-xs shrink-0">
                                  {partner.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-[#1E2B1E]">{partner.name}</div>
                                <div className="text-[10px] text-[#8A9A86]">
                                  #{partner.applicationNumber || partner.id.slice(-6).toUpperCase()}
                                  {partner.vehicleInfo?.vehicleType
                                    ? ` • ${partner.vehicleInfo.vehicleType}`
                                    : ""}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Phone */}
                          <td className="py-3 px-3 text-[#241C1A] whitespace-nowrap">
                            {partner.phone}
                          </td>

                          {/* Account Status */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSuspended
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {partner.accountStatus}
                            </span>
                          </td>

                          {/* Availability Status */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                isBusy
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : isOnline
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              }`}
                            >
                              {isBusy ? "BUSY" : partner.availabilityStatus}
                            </span>
                          </td>

                          {/* Connection Status */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isConnected
                                    ? "bg-emerald-500 animate-pulse"
                                    : "bg-gray-300"
                                }`}
                              />
                              <span
                                className={`text-[11px] font-bold ${
                                  isConnected ? "text-emerald-700" : "text-gray-500"
                                }`}
                              >
                                {partner.connectionStatus}
                              </span>
                            </div>
                          </td>

                          {/* Current Order */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {partner.currentOrder ? (
                              <span className="font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
                                #{partner.currentOrder.orderNumber}
                              </span>
                            ) : (
                              <span className="text-[#8A9A86]">—</span>
                            )}
                          </td>

                          {/* Location Status */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {partner.lastLocation?.latitude ? (
                              <div>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                    isLive
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                                      : "bg-gray-100 text-gray-600 border border-gray-200"
                                  }`}
                                >
                                  {isLive ? "● LIVE" : "○ LAST KNOWN"}
                                </span>
                                <div className="text-[10px] text-[#8A9A86] font-mono mt-0.5">
                                  {partner.lastLocation.latitude.toFixed(4)},{" "}
                                  {partner.lastLocation.longitude.toFixed(4)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[#8A9A86] italic text-[11px]">No GPS fix</span>
                            )}
                          </td>

                          {/* Last Heartbeat */}
                          <td className="py-3 px-3 text-[#667266] whitespace-nowrap text-[11px]">
                            {partner.lastHeartbeat
                              ? new Date(partner.lastHeartbeat).toLocaleTimeString()
                              : "Never"}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {partner.lastLocation?.latitude && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFocusMapOnly(partner.id);
                                  }}
                                  title="Focus on Map"
                                  className="p-1.5 rounded-lg bg-[#F7F3EA] hover:bg-[#EDE8DE] text-[#354B35] transition-colors cursor-pointer"
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectPartner(partner.id);
                                }}
                                title="View Details"
                                className="px-2.5 py-1 rounded-lg bg-[#354B35] text-white font-bold text-[11px] hover:bg-[#2C3E2C] transition-colors cursor-pointer"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-[#F0ECE1] flex items-center justify-between text-xs text-[#667266]">
                <div>
                  Showing {partners.length} of {total} delivery partners
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-[#1E2B1E] px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Partner Details Slide-over Drawer */}
        <PartnerDetailsDrawer
          partnerId={drawerPartnerId}
          onClose={() => setDrawerPartnerId(null)}
          onFocusMap={handleFocusMapOnly}
        />
      </div>
    </AdminShell>
  );
}
