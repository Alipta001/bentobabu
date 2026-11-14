"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Truck,
  MapPin,
  Clock,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  useAdminDeliveryZones,
  useToggleDeliveryZone,
  useCreateDeliveryZone,
  useAdminDeliverySlots,
  useCreateDeliverySlot,
  useToggleDeliverySlot,
} from "@/hooks/useAdminQueries";

export default function DeliveryZonesPage() {
  const [activeTab, setActiveTab] = useState<"zones" | "slots">("zones");

  // Zones Queries & Mutations
  const { data: zones = [], isLoading: zonesLoading } = useAdminDeliveryZones();
  const toggleZoneMutation = useToggleDeliveryZone();
  const createZoneMutation = useCreateDeliveryZone();

  // Slots Queries & Mutations
  const { data: slots = [], isLoading: slotsLoading } = useAdminDeliverySlots();
  const toggleSlotMutation = useToggleDeliverySlot();
  const createSlotMutation = useCreateDeliverySlot();

  // Zone Modal State
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [zonePincodes, setZonePincodes] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState<number>(30);
  const [minOrderValue, setMinOrderValue] = useState<number>(150);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(35);
  const [zoneSubmitting, setZoneSubmitting] = useState(false);

  // Slot Modal State
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [slotLabel, setSlotLabel] = useState("Lunch Slot (12:00 PM - 01:30 PM)");
  const [slotStartTime, setSlotStartTime] = useState("12:00");
  const [slotEndTime, setSlotEndTime] = useState("13:30");
  const [slotCapacity, setSlotCapacity] = useState<number>(25);
  const [slotSubmitting, setSlotSubmitting] = useState(false);

  const activeZonesCount = zones.filter((z) => z.isServiceable).length;
  const activeSlotsCount = slots.filter((s) => s.isActive).length;

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zonePincodes || !zoneName) return;

    setZoneSubmitting(true);
    try {
      const pins = zonePincodes
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      await createZoneMutation.mutateAsync({
        name: zoneName.trim(),
        pincodes: pins,
        deliveryCharge,
        minimumOrderAmount: minOrderValue,
        estimatedDeliveryMinutes: estimatedMinutes,
      });

      setIsZoneModalOpen(false);
      setZonePincodes("");
      setZoneName("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create delivery zone.");
    } finally {
      setZoneSubmitting(false);
    }
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlotSubmitting(true);
    try {
      await createSlotMutation.mutateAsync({
        date: slotDate,
        label: slotLabel,
        startTime: slotStartTime,
        endTime: slotEndTime,
        capacity: slotCapacity,
      });

      setIsSlotModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create delivery slot.");
    } finally {
      setSlotSubmitting(false);
    }
  };

  return (
    <AdminShell
      title="Delivery Logistics & Slots"
      subtitle="Control kitchen dispatch radiuses, PIN code serviceability, delivery fees, and order capacity windows"
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("zones")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "zones"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Delivery Zones ({zones.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("slots")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "slots"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Delivery Slots ({slots.length})</span>
            </button>
          </div>

          <div>
            {activeTab === "zones" ? (
              <button
                onClick={() => setIsZoneModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#B99A60]" />
                <span>Add Delivery Zone</span>
              </button>
            ) : (
              <button
                onClick={() => setIsSlotModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#B99A60]" />
                <span>Create Time Slot</span>
              </button>
            )}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#667266]">
                Serviceable Sectors
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                {activeZonesCount} Active Zones
              </div>
              <div className="text-[11px] text-[#8A9A86] mt-0.5">
                {zones.length} total mapped sectors
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-[#354B35]/10 text-[#354B35] flex items-center justify-center">
              <MapPin className="w-5 h-5 text-[#354B35]" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#667266]">
                Active Time Windows
              </div>
              <div className="font-serif text-2xl font-bold text-emerald-800 mt-1">
                {activeSlotsCount} Live Slots
              </div>
              <div className="text-[11px] text-[#8A9A86] mt-0.5">
                Regulated kitchen batching
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#667266]">
                Standard Base Delivery
              </div>
              <div className="font-serif text-2xl font-bold text-[#B99A60] mt-1">
                ₹30 / Order
              </div>
              <div className="text-[11px] text-[#8A9A86] mt-0.5">
                Free above ₹500
              </div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-[#B99A60]/10 text-[#B99A60] flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* TAB 1: ZONES TABLE */}
        {activeTab === "zones" && (
          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#E5DFC5]">
              <h2 className="font-serif text-base font-bold text-[#1E2B1E]">
                Configured PIN Code Sectors
              </h2>
              <p className="text-xs text-[#667266]">
                Orders with PIN codes outside serviceable zones are automatically flagged during customer checkout
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F3EA] text-[#667266] uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="py-3 px-6">Pincode(s)</th>
                    <th className="py-3 px-6">Zone Name</th>
                    <th className="py-3 px-6 text-right">Delivery Charge</th>
                    <th className="py-3 px-6 text-right">Min Order</th>
                    <th className="py-3 px-6">Est. Time</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE1]">
                  {zonesLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                        Loading delivery zones...
                      </td>
                    </tr>
                  ) : zones.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                        No delivery zones configured yet.
                      </td>
                    </tr>
                  ) : (
                    zones.map((zone) => (
                      <tr key={zone.id} className="hover:bg-[#F9F7F1]/60 transition-colors">
                        <td className="py-3.5 px-6 font-mono font-bold text-[#1E2B1E]">
                          <span className="bg-[#F7F3EA] px-2.5 py-1 rounded-md border border-[#E5DFC5]">
                            {zone.pincode}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-semibold text-[#1E2B1E]">
                          {zone.areaName}
                        </td>
                        <td className="py-3.5 px-6 text-right font-medium text-[#1E2B1E]">
                          ₹{zone.deliveryFee}
                        </td>
                        <td className="py-3.5 px-6 text-right text-[#667266]">
                          ₹{zone.minOrderValue}
                        </td>
                        <td className="py-3.5 px-6 text-[#667266]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#B99A60]" />
                            {zone.estimatedMinutes}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              zone.isServiceable
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {zone.isServiceable ? "Serviceable" : "Suspended"}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() =>
                              toggleZoneMutation.mutate({
                                id: zone.id,
                                isServiceable: zone.isServiceable,
                              })
                            }
                            className="cursor-pointer text-[#354B35] hover:opacity-80 transition-opacity"
                          >
                            {zone.isServiceable ? (
                              <ToggleRight className="w-6 h-6 text-emerald-700" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SLOTS TABLE */}
        {activeTab === "slots" && (
          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#E5DFC5]">
              <h2 className="font-serif text-base font-bold text-[#1E2B1E]">
                Kitchen Delivery Time Windows
              </h2>
              <p className="text-xs text-[#667266]">
                Manage capacity slots to prevent kitchen bottlenecks during lunch and dinner peaks
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F3EA] text-[#667266] uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="py-3 px-6">Slot Date</th>
                    <th className="py-3 px-6">Window Label</th>
                    <th className="py-3 px-6">Timing Range</th>
                    <th className="py-3 px-6 text-center">Max Capacity</th>
                    <th className="py-3 px-6 text-center">Current Load</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0ECE1]">
                  {slotsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                        Loading delivery slots...
                      </td>
                    </tr>
                  ) : slots.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                        No delivery slots configured yet.
                      </td>
                    </tr>
                  ) : (
                    slots.map((slot) => (
                      <tr key={slot._id || slot.id} className="hover:bg-[#F9F7F1]/60 transition-colors">
                        <td className="py-3.5 px-6 font-mono text-[#1E2B1E]">
                          {new Date(slot.date).toLocaleDateString([], {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-3.5 px-6 font-semibold text-[#1E2B1E]">
                          {slot.label}
                        </td>
                        <td className="py-3.5 px-6 font-mono text-[#354B35]">
                          {slot.startTime} – {slot.endTime}
                        </td>
                        <td className="py-3.5 px-6 text-center font-bold text-[#1E2B1E]">
                          {slot.capacity} orders
                        </td>
                        <td className="py-3.5 px-6 text-center font-medium text-[#667266]">
                          {slot.currentOrders || 0} / {slot.capacity}
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              slot.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {slot.isActive ? "Available" : "Disabled"}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() =>
                              toggleSlotMutation.mutate({
                                id: slot._id || slot.id || "",
                                isActive: slot.isActive,
                              })
                            }
                            className="cursor-pointer text-[#354B35] hover:opacity-80 transition-opacity"
                          >
                            {slot.isActive ? (
                              <ToggleRight className="w-6 h-6 text-emerald-700" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-gray-400" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE ZONE MODAL */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Add Delivery Zone
                </h3>
              </div>
              <button
                onClick={() => setIsZoneModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateZone} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Zone / Area Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Barrackpore Cantt & Station"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  PIN Codes (comma-separated for multi-PIN zones)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 700120, 700121, 700122"
                  value={zonePincodes}
                  onChange={(e) => setZonePincodes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs font-mono focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Delivery Charge (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Min Order Value (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Est. Delivery Time (Minutes)
                </label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  required
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setIsZoneModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={zoneSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {zoneSubmitting ? "Saving..." : "Save Delivery Zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SLOT MODAL */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Create Delivery Time Slot
                </h3>
              </div>
              <button
                onClick={() => setIsSlotModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Slot Date
                </label>
                <input
                  type="date"
                  required
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Slot Description Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lunch Window A (12:00 PM - 01:30 PM)"
                  value={slotLabel}
                  onChange={(e) => setSlotLabel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={slotStartTime}
                    onChange={(e) => setSlotStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={slotEndTime}
                    onChange={(e) => setSlotEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Batch Order Capacity
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={slotCapacity}
                  onChange={(e) => setSlotCapacity(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={slotSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {slotSubmitting ? "Creating..." : "Save Delivery Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
