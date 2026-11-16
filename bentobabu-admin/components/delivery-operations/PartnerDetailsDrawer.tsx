"use client";

import React, { useState } from "react";
import {
  X,
  Phone,
  Mail,
  MapPin,
  Clock,
  Battery,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Bike,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Radio,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  PartnerDetailData,
  deliveryOperationsService,
} from "@/services/deliveryOperationsService";
import { useMonitoredPartnerDetail, useUpdatePartnerStatus } from "@/hooks/useAdminQueries";

interface PartnerDetailsDrawerProps {
  partnerId: string | null;
  onClose: () => void;
  onFocusMap?: (id: string) => void;
}

export function PartnerDetailsDrawer({
  partnerId,
  onClose,
  onFocusMap,
}: PartnerDetailsDrawerProps) {
  const { data: partner, isLoading, refetch } = useMonitoredPartnerDetail(partnerId);
  const updateStatusMutation = useUpdatePartnerStatus();

  const [confirmModal, setConfirmModal] = useState<{
    action: "SUSPEND" | "ACTIVATE";
    reason: string;
  } | null>(null);

  if (!partnerId) return null;

  const handleStatusSubmit = async () => {
    if (!confirmModal) return;
    try {
      await updateStatusMutation.mutateAsync({
        id: partnerId,
        accountStatus: confirmModal.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE",
        reason: confirmModal.reason,
      });
      setConfirmModal(null);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const isSuspended = partner?.accountStatus === "SUSPENDED";
  const isOnline = partner?.availabilityStatus === "ONLINE";
  const isBusy = partner?.availabilityStatus === "BUSY";
  const isConnected = partner?.connectionStatus === "CONNECTED";
  const isLiveLocation = partner?.locationFreshness === "LIVE";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-lg bg-[#FBF9F6] h-full shadow-2xl flex flex-col z-10 border-l border-[#E5DFC5] overflow-y-auto">
        {/* Drawer Header */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-[#E5DFC5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#354B35] text-[#DFC89B] flex items-center justify-center font-bold text-sm">
              <Bike className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#1E2B1E] leading-tight">
                Delivery Partner Details
              </h3>
              <p className="text-[11px] text-[#667266]">
                App #{partner?.applicationNumber || "RIDER-ACTIVE"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading || !partner ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-[#354B35]/10 animate-pulse flex items-center justify-center text-[#354B35]">
              <Radio className="w-5 h-5 animate-spin" />
            </div>
            <p className="text-xs text-[#667266] font-medium">Loading partner telemetry...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 flex-1">
            {/* 1. Identity & Status Overview */}
            <div className="bg-white rounded-3xl p-5 border border-[#E5DFC5] shadow-xs space-y-4">
              <div className="flex items-start gap-4">
                {partner.profilePhoto ? (
                  <img
                    src={partner.profilePhoto}
                    alt={partner.name}
                    className="w-16 h-16 rounded-2xl object-cover border border-[#E5DFC5] shadow-xs"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#1E2B1E] text-[#DFC89B] flex items-center justify-center font-bold text-2xl shadow-xs">
                    {partner.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg text-[#1E2B1E] truncate">{partner.name}</h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#667266] mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-[#354B35]" />
                    <span>{partner.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#667266] mt-0.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-[#354B35]" />
                    <span className="truncate">{partner.email}</span>
                  </div>
                </div>
              </div>

              {/* Status Badges Row */}
              <div className="pt-3 border-t border-[#F0ECE1] grid grid-cols-3 gap-2 text-center">
                {/* Account Status */}
                <div className="p-2 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]/60 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-bold text-[#8A9A86]">Account</span>
                  <span
                    className={`text-xs font-extrabold mt-0.5 ${
                      isSuspended ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {partner.accountStatus}
                  </span>
                </div>

                {/* Availability Status */}
                <div className="p-2 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]/60 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-bold text-[#8A9A86]">Availability</span>
                  <span
                    className={`text-xs font-extrabold mt-0.5 ${
                      isBusy
                        ? "text-amber-600"
                        : isOnline
                        ? "text-emerald-600"
                        : "text-slate-600"
                    }`}
                  >
                    {partner.availabilityStatus}
                  </span>
                </div>

                {/* Connection Status */}
                <div className="p-2 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]/60 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-bold text-[#8A9A86]">Heartbeat</span>
                  <span
                    className={`text-xs font-extrabold mt-0.5 flex items-center gap-1 ${
                      isConnected ? "text-emerald-600" : "text-gray-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isConnected ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                      }`}
                    />
                    <span>{partner.connectionStatus}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Active Delivery in Progress (if any) */}
            {partner.currentOrder ? (
              <div className="bg-amber-50 rounded-3xl p-5 border border-amber-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
                    <span>Active Delivery Assignment</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold text-[10px]">
                    {partner.currentOrder.status}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="font-bold text-amber-950">
                    Order #{partner.currentOrder.orderNumber} • ₹{partner.currentOrder.total}
                  </div>
                  {partner.currentOrder.address && (
                    <div className="text-amber-800 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {partner.currentOrder.address.houseNo}, {partner.currentOrder.address.street}
                        {partner.currentOrder.address.landmark
                          ? ` (Near ${partner.currentOrder.address.landmark})`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* 3. Live Telemetry & GPS Card */}
            <div className="bg-white rounded-3xl p-5 border border-[#E5DFC5] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-[#354B35]" />
                  <h4 className="font-bold text-sm text-[#1E2B1E]">GPS & Device Telemetry</h4>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isLiveLocation
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-slate-100 text-slate-700 border border-slate-300"
                  }`}
                >
                  {isLiveLocation ? "● LIVE GPS" : "○ LAST KNOWN"}
                </span>
              </div>

              {partner.lastLocation && partner.lastLocation.latitude ? (
                <div className="space-y-2 text-xs text-[#241C1A]">
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#F7F3EA]">
                    <div>
                      <span className="text-[10px] text-[#8A9A86] block">Latitude</span>
                      <span className="font-mono font-bold">
                        {partner.lastLocation.latitude.toFixed(6)}°
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8A9A86] block">Longitude</span>
                      <span className="font-mono font-bold">
                        {partner.lastLocation.longitude.toFixed(6)}°
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[10px] text-gray-500 block">Accuracy</span>
                      <span className="font-bold">
                        {partner.lastLocation.accuracy
                          ? `±${partner.lastLocation.accuracy}m`
                          : "Normal"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[10px] text-gray-500 block">Speed</span>
                      <span className="font-bold">
                        {partner.lastLocation.speed
                          ? `${Math.round(partner.lastLocation.speed * 3.6)} km/h`
                          : "0 km/h"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[10px] text-gray-500 block">Battery</span>
                      <span className="font-bold">
                        {partner.lastLocation.batteryLevel !== null &&
                        partner.lastLocation.batteryLevel !== undefined
                          ? `${partner.lastLocation.batteryLevel}%`
                          : "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-[#8A9A86] pt-1 flex items-center justify-between">
                    <span>
                      Location fix:{" "}
                      {partner.lastLocation.updatedAt
                        ? new Date(partner.lastLocation.updatedAt).toLocaleTimeString()
                        : "None"}
                    </span>
                    <span>
                      Heartbeat:{" "}
                      {partner.lastHeartbeat
                        ? new Date(partner.lastHeartbeat).toLocaleTimeString()
                        : "Never"}
                    </span>
                  </div>

                  {onFocusMap && (
                    <button
                      type="button"
                      onClick={() => onFocusMap(partner.id)}
                      className="w-full mt-2 py-2 px-3 rounded-xl bg-[#354B35] text-white font-bold text-xs hover:bg-[#2C3E2C] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Focus on Live Map</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-[#8A9A86]">
                  No GPS coordinates reported yet by partner device.
                </div>
              )}
            </div>

            {/* 4. Vehicle & Equipment Details */}
            {partner.vehicleInfo && (
              <div className="bg-white rounded-3xl p-5 border border-[#E5DFC5] shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E2B1E]">
                  <Bike className="w-4 h-4 text-[#354B35]" />
                  <span>Assigned Vehicle & Transit</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#241C1A] pt-1">
                  <div>
                    <span className="text-[10px] text-[#8A9A86] block">Vehicle Type</span>
                    <span className="font-bold">{partner.vehicleInfo.vehicleType}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8A9A86] block">Model / Brand</span>
                    <span className="font-bold">
                      {partner.vehicleInfo.brand} {partner.vehicleInfo.model || ""}
                    </span>
                  </div>
                  {partner.vehicleInfo.registrationNumber && (
                    <div className="col-span-2">
                      <span className="text-[10px] text-[#8A9A86] block">Registration Number</span>
                      <span className="font-mono font-bold bg-[#F7F3EA] px-2 py-0.5 rounded">
                        {partner.vehicleInfo.registrationNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Delivery Performance & History */}
            <div className="bg-white rounded-3xl p-5 border border-[#E5DFC5] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1E2B1E]">
                  <TrendingUp className="w-4 h-4 text-[#354B35]" />
                  <span>Delivery History</span>
                </div>
                <span className="text-xs font-extrabold text-[#354B35]">
                  {partner.totalDeliveries} Completed
                </span>
              </div>

              {partner.recentDeliveries && partner.recentDeliveries.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {partner.recentDeliveries.map((del) => (
                    <div
                      key={del.id}
                      className="p-2.5 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]/60 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-[#1E2B1E]">#{del.orderNumber}</div>
                        <div className="text-[10px] text-[#8A9A86]">
                          {del.deliveredAt
                            ? new Date(del.deliveredAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Delivered"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#354B35]">₹{del.total}</div>
                        <div className="text-[10px] text-[#8A9A86]">{del.itemCount} items</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8A9A86] text-center py-2">
                  No completed delivery history records found.
                </p>
              )}
            </div>

            {/* 6. Administrative Actions */}
            <div className="pt-2 border-t border-[#E5DFC5]">
              {isSuspended ? (
                <button
                  type="button"
                  onClick={() => setConfirmModal({ action: "ACTIVATE", reason: "" })}
                  className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Reactivate Delivery Partner Account</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmModal({ action: "SUSPEND", reason: "" })}
                  className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Suspend Delivery Partner</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-[#E5DFC5] shadow-2xl">
            <h4 className="font-bold text-base text-[#1E2B1E]">
              {confirmModal.action === "SUSPEND"
                ? "Confirm Delivery Partner Suspension"
                : "Confirm Partner Reactivation"}
            </h4>
            <p className="text-xs text-[#667266]">
              {confirmModal.action === "SUSPEND"
                ? "Suspension revokes active login sessions immediately, marks the partner offline, and prevents order assignments."
                : "Reactivating this partner restores their access and allows them to toggle online for new delivery orders."}
            </p>

            {confirmModal.action === "SUSPEND" && (
              <div>
                <label className="text-[11px] font-bold text-[#1E2B1E] block mb-1">
                  Reason for Suspension (optional):
                </label>
                <input
                  type="text"
                  value={confirmModal.reason}
                  onChange={(e) =>
                    setConfirmModal({ ...confirmModal, reason: e.target.value })
                  }
                  placeholder="e.g. Conduct review, missed assignments"
                  className="w-full px-3 py-2 rounded-xl border border-[#E5DFC5] text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateStatusMutation.isPending}
                onClick={handleStatusSubmit}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer ${
                  confirmModal.action === "SUSPEND"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {updateStatusMutation.isPending
                  ? "Processing..."
                  : confirmModal.action === "SUSPEND"
                  ? "Suspend Partner"
                  : "Reactivate Partner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
