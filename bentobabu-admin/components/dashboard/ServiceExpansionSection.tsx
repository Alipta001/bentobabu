"use client";

import React, { useState } from "react";
import {
  MapPin,
  Heart,
  TrendingUp,
  Download,
  Search,
  Filter,
  Edit3,
  CheckCircle2,
  Clock,
  Compass,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  useServiceExpansionSummary,
  useServiceExpansionLocations,
} from "@/hooks/useAdminQueries";
import { serviceExpansionService } from "@/services/serviceExpansionService";
import { ServiceExpansionLocationItem } from "@/types";

export function ServiceExpansionSection() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<"votes" | "lastVotedAt" | "pincode">("votes");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Status edit modal state
  const [selectedLoc, setSelectedLoc] = useState<ServiceExpansionLocationItem | null>(null);
  const [editStatus, setEditStatus] = useState<string>("NEW");
  const [editNotes, setEditNotes] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateSuccess, setUpdateSuccess] = useState<string>("");

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } =
    useServiceExpansionSummary(30);

  const {
    data: locationsData,
    isLoading: isLocationsLoading,
    refetch: refetchLocations,
  } = useServiceExpansionLocations({
    status: statusFilter,
    search: searchTerm,
    sortBy,
    sortOrder,
    limit: 50,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await serviceExpansionService.exportCsv();
    } catch {
      alert("Failed to export service expansion CSV. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const openEditModal = (loc: ServiceExpansionLocationItem) => {
    setSelectedLoc(loc);
    setEditStatus(loc.status);
    setEditNotes(loc.internalNotes || "");
    setUpdateSuccess("");
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoc) return;
    setIsUpdating(true);
    try {
      await serviceExpansionService.updateStatus(selectedLoc.pincode, {
        status: editStatus,
        internalNotes: editNotes,
      });
      setUpdateSuccess("Status and internal notes saved successfully!");
      refetchLocations();
      refetchSummary();
      setTimeout(() => {
        setSelectedLoc(null);
      }, 1000);
    } catch {
      alert("Failed to update status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "LAUNCHED":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "PLANNED":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "UNDER_CONSIDERATION":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "REJECTED":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const locations = locationsData?.locations || [];

  return (
    <div id="service-expansion-section" className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-8">
      {/* Header with Title and Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF0E9] text-[#354B35] text-xs font-semibold mb-2">
            <Compass className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Customer Demand &amp; Expansion Voting</span>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1F271F]">
            Where Should BentoBabu Expand Next?
          </h3>
          <p className="text-xs text-[#667266]">
            Live unserviceable location votes recorded from checkout attempts with customer interest
          </p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#243324] transition-colors shadow-xs disabled:opacity-60 self-start sm:self-auto"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#DFC89B]" />
          ) : (
            <Download className="w-4 h-4 text-[#DFC89B]" />
          )}
          <span>Export Votes (CSV)</span>
        </button>
      </div>

      {/* 4 Service Expansion KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Votes */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">Total Customer Votes</span>
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#1F271F]">
            {isSummaryLoading ? "..." : summary?.totalVotes.toLocaleString("en-IN") || 0}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Across all unserved PIN codes
          </div>
        </div>

        {/* Unique PIN Codes */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">Unique PIN Codes</span>
            <MapPin className="w-4 h-4 text-[#354B35]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#354B35]">
            {isSummaryLoading ? "..." : summary?.uniquePincodesCount.toLocaleString("en-IN") || 0}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            Distinct postal areas requesting food
          </div>
        </div>

        {/* Top Requested Area */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">#1 Requested Area</span>
            <Sparkles className="w-4 h-4 text-[#B99A60]" />
          </div>
          <div className="font-serif text-xl font-bold text-amber-900 truncate">
            {summary?.topRequestedArea ? (
              `PIN ${summary.topRequestedArea.pincode}`
            ) : (
              "None recorded"
            )}
          </div>
          <div className="text-[11px] text-[#8A9A86] truncate">
            {summary?.topRequestedArea
              ? `${summary.topRequestedArea.votes} votes • ${summary.topRequestedArea.locality || summary.topRequestedArea.city || "Bengal"}`
              : "No voting activity yet"}
          </div>
        </div>

        {/* Recent Period Votes */}
        <div className="p-4 rounded-2xl bg-[#F7F3EA]/70 border border-[#E5DFC5] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#667266]">
            <span className="font-semibold uppercase tracking-wider">Recent Activity</span>
            <Clock className="w-4 h-4 text-teal-600" />
          </div>
          <div className="font-serif text-2xl font-bold text-teal-900">
            {isSummaryLoading ? "..." : summary?.newVotesInPeriod.toLocaleString("en-IN") || 0}
          </div>
          <div className="text-[11px] text-[#8A9A86]">
            New votes in last 30 days
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by PIN code, locality, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E5DFC5] bg-white text-xs text-[#1F271F] focus:outline-hidden focus:ring-1 focus:ring-[#354B35]"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8A9A86] hidden sm:inline">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#E5DFC5] bg-white text-xs font-semibold text-[#1F271F] focus:outline-hidden"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="UNDER_CONSIDERATION">Under Consideration</option>
            <option value="PLANNED">Planned</option>
            <option value="LAUNCHED">Launched</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Sort Order */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [f, o] = e.target.value.split("-") as [any, any];
              setSortBy(f);
              setSortOrder(o);
            }}
            className="px-3 py-2 rounded-xl border border-[#E5DFC5] bg-white text-xs font-semibold text-[#1F271F] focus:outline-hidden"
          >
            <option value="votes-desc">Highest Votes</option>
            <option value="votes-asc">Lowest Votes</option>
            <option value="lastVotedAt-desc">Recently Voted</option>
            <option value="pincode-asc">PIN Code (Asc)</option>
          </select>
        </div>
      </div>

      {/* Ranked Locations Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#E5DFC5]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F7F3EA] text-[#667266] font-semibold uppercase tracking-wider border-b border-[#E5DFC5]">
            <tr>
              <th className="py-3 px-4 text-center">Rank</th>
              <th className="py-3 px-4">PIN Code</th>
              <th className="py-3 px-4">Locality / Area</th>
              <th className="py-3 px-4">City / State</th>
              <th className="py-3 px-4 text-center">Customer Votes</th>
              <th className="py-3 px-4 text-center">Expansion Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0ECE1] bg-white">
            {isLocationsLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-[#8A9A86]">
                  Loading expansion voting data...
                </td>
              </tr>
            ) : locations.length > 0 ? (
              locations.map((loc) => (
                <tr key={loc.pincode} className="hover:bg-[#F7F3EA]/50 transition-colors">
                  <td className="py-3 px-4 text-center font-bold text-[#8A9A86] font-mono">
                    #{loc.rank}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#1F271F] font-mono">
                    {loc.pincode}
                  </td>
                  <td className="py-3 px-4 text-[#4A554A]">
                    {loc.locality || "General Area"}
                  </td>
                  <td className="py-3 px-4 text-[#667266]">
                    {loc.city || "Bengal"}, {loc.state || "WB"}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-[#354B35]">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EBF0E9]">
                      <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                      <span>{loc.votes}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${getStatusBadge(
                        loc.status
                      )}`}
                    >
                      {loc.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditModal(loc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E5DFC5] bg-white hover:bg-[#F7F3EA] text-[#354B35] font-semibold text-xs transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Manage</span>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-[#8A9A86]">
                  No service expansion votes match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Status & Internal Notes Modal */}
      {selectedLoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md bg-white rounded-3xl border border-[#E5DFC5] shadow-2xl p-6 sm:p-8 space-y-5 animate-in zoom-in-95">
            <button
              onClick={() => setSelectedLoc(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#8A9A86] hover:text-[#1F271F]"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#354B35]">
                Manage Expansion Priority
              </div>
              <h4 className="font-serif text-xl font-bold text-[#1F271F] mt-1">
                PIN {selectedLoc.pincode} ({selectedLoc.locality || selectedLoc.city || "Area"})
              </h4>
              <p className="text-xs text-[#667266]">
                Total customer votes: <strong>{selectedLoc.votes}</strong>
              </p>
            </div>

            <form onSubmit={handleSaveStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A554A] mb-1.5">
                  Expansion Consideration Status:
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5DFC5] bg-white text-xs font-semibold text-[#1F271F] focus:outline-hidden focus:ring-1 focus:ring-[#354B35]"
                >
                  <option value="NEW">New (Reviewing)</option>
                  <option value="UNDER_CONSIDERATION">Under Consideration</option>
                  <option value="PLANNED">Planned for Launch</option>
                  <option value="LAUNCHED">Launched (Zone Activated)</option>
                  <option value="REJECTED">Rejected (Unserviceable)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A554A] mb-1.5">
                  Internal Kitchen / Fleet Notes (Private):
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g., Distance is 6.2 km from central kitchen. Will require 1 dedicated rider..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-[#E5DFC5] bg-white text-xs text-[#1F271F] focus:outline-hidden focus:ring-1 focus:ring-[#354B35]"
                />
              </div>

              {updateSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{updateSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedLoc(null)}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#243324] flex items-center gap-1.5 disabled:opacity-60 shadow-xs"
                >
                  {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
