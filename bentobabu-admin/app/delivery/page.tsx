"use client";

import React, { useState, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Truck,
  MapPin,
  Clock,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  CalendarDays,
  Copy,
  RotateCcw,
  BarChart3,
  Check,
  Ban,
  Lock,
  Bell,
  Save,
} from "lucide-react";
import {
  useAdminDeliveryZones,
  useToggleDeliveryZone,
  useCreateDeliveryZone,
  useUpdateDeliveryZone,
  useDeleteDeliveryZone,
  useAdminDeliverySlots,
  useCreateDeliverySlot,
  useToggleDeliverySlot,
  useAdminWeeklySchedules,
  useUpdateWeeklySchedule,
  useCopyWeeklySchedule,
  useAdminDateSchedule,
  useUpdateDateSchedule,
  useRestoreWeeklySchedule,
  useDeleteDeliverySlot,
  useAdminReminderSettings,
  useUpdateReminderSettings,
} from "@/hooks/useAdminQueries";
import { DeliveryZone } from "@/types";

const WEEKDAYS = [
  { day: 1, name: "Monday" },
  { day: 2, name: "Tuesday" },
  { day: 3, name: "Wednesday" },
  { day: 4, name: "Thursday" },
  { day: 5, name: "Friday" },
  { day: 6, name: "Saturday" },
  { day: 0, name: "Sunday" },
];

const PRESET_SLOTS = [
  { label: "Morning Slot", startTime: "08:00", endTime: "11:00", capacity: 20 },
  { label: "Noon / Lunch Slot", startTime: "12:00", endTime: "15:00", capacity: 25 },
  { label: "Evening Slot", startTime: "16:00", endTime: "19:00", capacity: 20 },
  { label: "Night / Dinner Slot", startTime: "19:30", endTime: "22:30", capacity: 25 },
];

function getTodayKolkataDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function DeliveryZonesPage() {
  const [activeTab, setActiveTab] = useState<"zones" | "slots">("zones");
  const [slotSubTab, setSlotSubTab] = useState<"weekly" | "dates" | "capacity" | "reminders">("weekly");

  const { data: reminderData, isLoading: reminderLoading } = useAdminReminderSettings();
  const updateReminderSettingsMutation = useUpdateReminderSettings();
  const [reminderDraft, setReminderDraft] = useState<Record<string, number> | null>(null);
  const effectiveReminderMap = useMemo(() => {
    const base: Record<string, number> = { ...(reminderData?.reminderMinutes || {}) };
    if (reminderData?.slots) {
      for (const s of reminderData.slots) {
        if (base[s.slotKey] === undefined) {
          base[s.slotKey] = s.reminderMinutes;
        }
      }
    }
    return reminderDraft ? { ...base, ...reminderDraft } : base;
  }, [reminderData, reminderDraft]);

  const handleSaveReminderSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, number> = {};
      for (const [k, v] of Object.entries(effectiveReminderMap)) {
        const mins = Math.floor(Number(v));
        if (isNaN(mins) || mins < 0 || mins > 1440) {
          showToast("error", `Reminder minutes for "${k}" must be between 0 and 1440.`);
          return;
        }
        payload[k] = mins;
      }
      const res = await updateReminderSettingsMutation.mutateAsync(payload);
      setReminderDraft(null);
      showToast(
        "success",
        `Preparation reminder settings saved. ${res.recalculatedCount || 0} active order(s) updated.`
      );
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to save preparation reminder settings."
      );
    }
  };

  // Notification State
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  // ===================== ZONES QUERIES & MUTATIONS =====================
  const { data: zones = [], isLoading: zonesLoading } = useAdminDeliveryZones();
  const toggleZoneMutation = useToggleDeliveryZone();
  const createZoneMutation = useCreateDeliveryZone();
  const updateZoneMutation = useUpdateDeliveryZone();
  const deleteZoneMutation = useDeleteDeliveryZone();

  // Zone Create Modal State
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [zonePincodes, setZonePincodes] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState<number>(30);
  const [minOrderValue, setMinOrderValue] = useState<number>(150);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(35);
  const [zoneSubmitting, setZoneSubmitting] = useState(false);

  // Edit Zone Modal State
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [editZoneName, setEditZoneName] = useState("");
  const [editZonePincodes, setEditZonePincodes] = useState("");
  const [editDeliveryCharge, setEditDeliveryCharge] = useState<number>(30);
  const [editMinOrderValue, setEditMinOrderValue] = useState<number>(0);
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState<number>(35);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Zone Dialog State
  const [deletingZone, setDeletingZone] = useState<DeliveryZone | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ===================== WEEKLY RECURRING SCHEDULE =====================
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number>(1); // Monday default
  const { data: weeklySchedules = [], isLoading: weeklyLoading } = useAdminWeeklySchedules();
  const updateWeeklyScheduleMutation = useUpdateWeeklySchedule();
  const copyWeeklyScheduleMutation = useCopyWeeklySchedule();

  // Weekly Slot Add/Edit Modal
  const [isWeeklySlotModalOpen, setIsWeeklySlotModalOpen] = useState(false);
  const [editingWeeklySlotIndex, setEditingWeeklySlotIndex] = useState<number | null>(null);
  const [weeklySlotLabel, setWeeklySlotLabel] = useState("Morning Slot");
  const [weeklySlotStartTime, setWeeklySlotStartTime] = useState("08:00");
  const [weeklySlotEndTime, setWeeklySlotEndTime] = useState("11:00");
  const [weeklySlotCapacity, setWeeklySlotCapacity] = useState<number>(20);
  const [weeklySlotCutoff, setWeeklySlotCutoff] = useState<number>(60);
  const [weeklySlotSubmitting, setWeeklySlotSubmitting] = useState(false);

  // Copy Weekly Schedule Modal
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [targetCopyDays, setTargetCopyDays] = useState<number[]>([]);
  const [copySubmitting, setCopySubmitting] = useState(false);

  // ===================== DATE-SPECIFIC MANAGEMENT =====================
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(getTodayKolkataDate());
  const { data: dateScheduleData, isLoading: dateScheduleLoading } = useAdminDateSchedule(selectedCalendarDate);
  const updateDateScheduleMutation = useUpdateDateSchedule();
  const restoreWeeklyScheduleMutation = useRestoreWeeklySchedule();

  // Date Slot Add/Edit Modal
  const [isDateSlotModalOpen, setIsDateSlotModalOpen] = useState(false);
  const [dateSlotLabel, setDateSlotLabel] = useState("Special Slot");
  const [dateSlotStartTime, setDateSlotStartTime] = useState("14:00");
  const [dateSlotEndTime, setDateSlotEndTime] = useState("16:00");
  const [dateSlotCapacity, setDateSlotCapacity] = useState<number>(20);
  const [dateSlotCutoff, setDateSlotCutoff] = useState<number>(60);
  const [dateSlotSubmitting, setDateSlotSubmitting] = useState(false);

  // Date Closure Modal State
  const [isCloseDateModalOpen, setIsCloseDateModalOpen] = useState(false);
  const [dateClosureReason, setDateClosureReason] = useState("");
  const [closureSubmitting, setClosureSubmitting] = useState(false);

  // ===================== CAPACITY OVERVIEW =====================
  const { data: capacitySlots = [], isLoading: capacityLoading } = useAdminDeliverySlots({
    date: selectedCalendarDate,
  });

  // Get current active schedule for selected weekday
  const currentDaySchedule = useMemo(() => {
    return (
      weeklySchedules.find((s) => s.dayOfWeek === selectedDayOfWeek) || {
        dayOfWeek: selectedDayOfWeek,
        dayName: WEEKDAYS.find((w) => w.day === selectedDayOfWeek)?.name || "",
        isDeliveryEnabled: true,
        slots: [],
      }
    );
  }, [weeklySchedules, selectedDayOfWeek]);

  // Counts
  const activeZonesCount = zones.filter((z) => z.isServiceable).length;

  // ------------------ Zone Handlers ------------------
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zonePincodes || !zoneName) return;

    setZoneSubmitting(true);
    try {
      const pins = zonePincodes
        .split(",")
        .map((p) => {
          const digits = p.replace(/\D/g, "");
          return digits.length === 6 ? digits : p.trim();
        })
        .filter(Boolean);

      await createZoneMutation.mutateAsync({
        name: zoneName.trim(),
        pincodes: pins,
        deliveryCharge: Number(deliveryCharge),
        minimumOrderAmount: Number(minOrderValue),
        estimatedDeliveryMinutes: Number(estimatedMinutes),
      });

      setIsZoneModalOpen(false);
      setZoneName("");
      setZonePincodes("");
      showToast("success", "Delivery zone created successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to create delivery zone");
    } finally {
      setZoneSubmitting(false);
    }
  };

  const handleOpenEditZone = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setEditZoneName(zone.areaName || "");
    const pinStr = typeof zone.pincode === "string" ? zone.pincode : "";
    setEditZonePincodes(pinStr);
    setEditDeliveryCharge(zone.deliveryFee ?? 30);
    setEditMinOrderValue(zone.minOrderValue ?? 0);
    const minutesNum = parseInt(String(zone.estimatedMinutes || "35"), 10) || 35;
    setEditEstimatedMinutes(minutesNum);
    setEditIsActive(zone.isServiceable !== false);
  };

  const handleSaveEditZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone || !editZoneName.trim()) return;

    setEditSubmitting(true);
    try {
      const pins = editZonePincodes
        .split(",")
        .map((p) => {
          const digits = p.replace(/\D/g, "");
          return digits.length === 6 ? digits : p.trim();
        })
        .filter(Boolean);

      await updateZoneMutation.mutateAsync({
        id: editingZone.id,
        data: {
          name: editZoneName.trim(),
          pincodes: pins,
          deliveryCharge: Number(editDeliveryCharge),
          minimumOrderAmount: Number(editMinOrderValue),
          estimatedDeliveryMinutes: Number(editEstimatedMinutes),
          isActive: Boolean(editIsActive),
        },
      });

      setEditingZone(null);
      showToast("success", "Delivery zone updated successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to update delivery zone");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDeleteZone = async () => {
    if (!deletingZone) return;
    setDeleteSubmitting(true);
    try {
      await deleteZoneMutation.mutateAsync(deletingZone.id);
      setDeletingZone(null);
      showToast("success", "Delivery zone deleted successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete delivery zone");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ------------------ Weekly Schedule Handlers ------------------
  const handleToggleDayDelivery = async () => {
    const updatedEnabled = !currentDaySchedule.isDeliveryEnabled;
    try {
      await updateWeeklyScheduleMutation.mutateAsync({
        dayOfWeek: selectedDayOfWeek,
        data: {
          isDeliveryEnabled: updatedEnabled,
          slots: currentDaySchedule.slots,
        },
      });
      showToast("success", `${currentDaySchedule.dayName} delivery ${updatedEnabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to update weekday delivery status");
    }
  };

  const handleOpenAddWeeklySlot = () => {
    setEditingWeeklySlotIndex(null);
    setWeeklySlotLabel("Morning Slot");
    setWeeklySlotStartTime("08:00");
    setWeeklySlotEndTime("11:00");
    setWeeklySlotCapacity(20);
    setWeeklySlotCutoff(60);
    setIsWeeklySlotModalOpen(true);
  };

  const handleOpenEditWeeklySlot = (index: number) => {
    const slot = currentDaySchedule.slots[index];
    if (!slot) return;
    setEditingWeeklySlotIndex(index);
    setWeeklySlotLabel(slot.label || "");
    setWeeklySlotStartTime(slot.startTime || "08:00");
    setWeeklySlotEndTime(slot.endTime || "11:00");
    setWeeklySlotCapacity(slot.capacity || 20);
    setWeeklySlotCutoff(slot.orderCutoffMinutes ?? 60);
    setIsWeeklySlotModalOpen(true);
  };

  const handleSaveWeeklySlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setWeeklySlotSubmitting(true);

    try {
      const currentSlots = [...(currentDaySchedule.slots || [])];
      const slotKey = weeklySlotLabel.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
      const newSlot = {
        slotKey,
        label: weeklySlotLabel.trim(),
        startTime: weeklySlotStartTime,
        endTime: weeklySlotEndTime,
        capacity: Number(weeklySlotCapacity),
        orderCutoffMinutes: Number(weeklySlotCutoff),
        isActive: true,
      };

      if (editingWeeklySlotIndex !== null) {
        currentSlots[editingWeeklySlotIndex] = {
          ...currentSlots[editingWeeklySlotIndex],
          ...newSlot,
        };
      } else {
        currentSlots.push(newSlot);
      }

      await updateWeeklyScheduleMutation.mutateAsync({
        dayOfWeek: selectedDayOfWeek,
        data: {
          isDeliveryEnabled: currentDaySchedule.isDeliveryEnabled,
          slots: currentSlots,
        },
      });

      setIsWeeklySlotModalOpen(false);
      showToast(
        "success",
        editingWeeklySlotIndex !== null
          ? "Weekly slot updated successfully."
          : "Weekly slot added successfully."
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to save weekly slot");
    } finally {
      setWeeklySlotSubmitting(false);
    }
  };

  const handleDeleteWeeklySlot = async (index: number) => {
    const slot = currentDaySchedule.slots[index];
    if (!slot) return;

    if (!confirm(`Remove "${slot.label}" from ${currentDaySchedule.dayName}'s recurring schedule?`)) {
      return;
    }

    try {
      const updatedSlots = currentDaySchedule.slots.filter((_, i) => i !== index);
      await updateWeeklyScheduleMutation.mutateAsync({
        dayOfWeek: selectedDayOfWeek,
        data: {
          isDeliveryEnabled: currentDaySchedule.isDeliveryEnabled,
          slots: updatedSlots,
        },
      });
      showToast("success", "Slot removed from weekly recurring schedule.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete slot");
    }
  };

  const handleToggleWeeklySlotActive = async (index: number) => {
    const slot = currentDaySchedule.slots[index];
    if (!slot) return;

    try {
      const updatedSlots = [...currentDaySchedule.slots];
      updatedSlots[index] = {
        ...updatedSlots[index],
        isActive: !slot.isActive,
      };

      await updateWeeklyScheduleMutation.mutateAsync({
        dayOfWeek: selectedDayOfWeek,
        data: {
          isDeliveryEnabled: currentDaySchedule.isDeliveryEnabled,
          slots: updatedSlots,
        },
      });
      showToast("success", `Slot ${!slot.isActive ? "activated" : "disabled"}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to toggle slot");
    }
  };

  const handleApplyPreset = (preset: (typeof PRESET_SLOTS)[0]) => {
    setWeeklySlotLabel(preset.label);
    setWeeklySlotStartTime(preset.startTime);
    setWeeklySlotEndTime(preset.endTime);
    setWeeklySlotCapacity(preset.capacity);
  };

  // Copy schedule handlers
  const handleOpenCopyModal = () => {
    const otherDays = WEEKDAYS.filter((w) => w.day !== selectedDayOfWeek).map((w) => w.day);
    setTargetCopyDays(otherDays);
    setIsCopyModalOpen(true);
  };

  const handleToggleTargetCopyDay = (day: number) => {
    setTargetCopyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleExecuteCopy = async () => {
    if (targetCopyDays.length === 0) {
      showToast("error", "Please select at least one target day to copy to.");
      return;
    }

    setCopySubmitting(true);
    try {
      await copyWeeklyScheduleMutation.mutateAsync({
        fromDay: selectedDayOfWeek,
        toDays: targetCopyDays,
      });
      setIsCopyModalOpen(false);
      showToast(
        "success",
        `Copied ${currentDaySchedule.dayName}'s schedule to ${targetCopyDays.length} day(s).`
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to copy schedule");
    } finally {
      setCopySubmitting(false);
    }
  };

  // ------------------ Date-Specific Handlers ------------------
  const handleToggleDateClosure = async (isClosed: boolean) => {
    if (isClosed) {
      setDateClosureReason("Kitchen Holiday / Maintenance");
      setIsCloseDateModalOpen(true);
    } else {
      try {
        await updateDateScheduleMutation.mutateAsync({
          date: selectedCalendarDate,
          data: {
            isClosed: false,
            closureReason: "",
          },
        });
        showToast("success", `Delivery reopened for ${selectedCalendarDate}.`);
      } catch (err) {
        showToast("error", err instanceof Error ? err.message : "Failed to reopen delivery");
      }
    }
  };

  const handleConfirmDateClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    setClosureSubmitting(true);
    try {
      await updateDateScheduleMutation.mutateAsync({
        date: selectedCalendarDate,
        data: {
          isClosed: true,
          closureReason: dateClosureReason.trim() || "Kitchen Closed",
        },
      });
      setIsCloseDateModalOpen(false);
      showToast("success", `Delivery closed for ${selectedCalendarDate}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to close delivery");
    } finally {
      setClosureSubmitting(false);
    }
  };

  const handleRestoreWeeklySchedule = async () => {
    if (
      !confirm(
        `Revert all date-specific overrides for ${selectedCalendarDate} and restore normal weekly schedule?`
      )
    ) {
      return;
    }

    try {
      await restoreWeeklyScheduleMutation.mutateAsync(selectedCalendarDate);
      showToast("success", `Restored recurring weekly schedule for ${selectedCalendarDate}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to restore weekly schedule");
    }
  };

  const handleAddCustomDateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setDateSlotSubmitting(true);

    try {
      const existingCustom = [...(dateScheduleData?.schedule?.customSlots || [])];
      existingCustom.push({
        label: dateSlotLabel.trim(),
        startTime: dateSlotStartTime,
        endTime: dateSlotEndTime,
        capacity: Number(dateSlotCapacity),
        orderCutoffMinutes: Number(dateSlotCutoff),
        isActive: true,
      });

      await updateDateScheduleMutation.mutateAsync({
        date: selectedCalendarDate,
        data: {
          overrideMode: dateScheduleData?.schedule?.overrideMode || "ADDITIVE",
          customSlots: existingCustom,
        },
      });

      setIsDateSlotModalOpen(false);
      showToast("success", "Date-specific slot added successfully.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to add date slot");
    } finally {
      setDateSlotSubmitting(false);
    }
  };

  const handleToggleDateSlotDisabled = async (slotKey: string, currentlyDisabled: boolean) => {
    try {
      const currentDisabledKeys = [...(dateScheduleData?.schedule?.disabledSlotKeys || [])];
      const updatedKeys = currentlyDisabled
        ? currentDisabledKeys.filter((k) => k !== slotKey)
        : [...currentDisabledKeys, slotKey];

      await updateDateScheduleMutation.mutateAsync({
        date: selectedCalendarDate,
        data: {
          disabledSlotKeys: updatedKeys,
        },
      });

      showToast(
        "success",
        currentlyDisabled
          ? "Slot enabled on this date."
          : "Slot disabled on this date."
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to toggle date slot");
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Toast Notification */}
        {notification && (
          <div
            className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all shadow-md animate-in fade-in slide-in-from-top-2 ${
              notification.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-rose-50 text-rose-900 border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-[#667266] hover:text-[#1E2B1E]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header with Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1E2B1E]">
              Delivery Logistics & Scheduling
            </h1>
            <p className="text-xs text-[#667266] mt-1">
              Configure delivery zones, weekly recurring schedules, date overrides, and kitchen batch capacities
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#F7F3EA] p-1.5 rounded-2xl border border-[#E5DFC5]">
            <button
              onClick={() => setActiveTab("zones")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "zones"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1E2B1E]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Zones ({activeZonesCount})</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab("slots")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "slots"
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "text-[#667266] hover:text-[#1E2B1E]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Slots & Schedules</span>
              </span>
            </button>
          </div>
        </div>

        {/* ==================== TAB 1: DELIVERY ZONES ==================== */}
        {activeTab === "zones" && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={() => setIsZoneModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Delivery Zone</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
              <div className="p-6 border-b border-[#E5DFC5]">
                <h2 className="font-serif text-base font-bold text-[#1E2B1E]">
                  Active Coverage Zones
                </h2>
                <p className="text-xs text-[#667266]">
                  Customer checkout validates entered 6-digit postal PIN codes against these designated delivery sectors
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F3EA] text-[#667266] uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      <th className="py-3 px-6">PIN Codes</th>
                      <th className="py-3 px-6">Coverage Sector</th>
                      <th className="py-3 px-6 text-right">Fee (₹)</th>
                      <th className="py-3 px-6 text-right">Min Order</th>
                      <th className="py-3 px-6">Est. Time</th>
                      <th className="py-3 px-6 text-center">Status</th>
                      <th className="py-3 px-6 text-center">Toggle</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE1]">
                    {zonesLoading ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#8A9A86]">
                          Loading delivery zones...
                        </td>
                      </tr>
                    ) : zones.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#8A9A86]">
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
                              {zone.estimatedMinutes} mins
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
                          <td className="py-3.5 px-6 text-center">
                            <button
                              onClick={() =>
                                toggleZoneMutation.mutate({
                                  id: zone.id,
                                  isServiceable: zone.isServiceable,
                                })
                              }
                              className="cursor-pointer text-[#354B35] hover:opacity-80 transition-opacity"
                              title={zone.isServiceable ? "Click to suspend zone" : "Click to activate zone"}
                            >
                              {zone.isServiceable ? (
                                <ToggleRight className="w-6 h-6 text-emerald-700" />
                              ) : (
                                <ToggleLeft className="w-6 h-6 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditZone(zone)}
                                className="p-1.5 rounded-lg border border-[#E5DFC5] text-[#354B35] hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                                title="Edit Delivery Zone"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingZone(zone)}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Delivery Zone"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: SLOTS & SCHEDULES ==================== */}
        {activeTab === "slots" && (
          <div className="space-y-6">
            {/* Sub-tab Navigation */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DFC5] pb-3">
              <button
                onClick={() => setSlotSubTab("weekly")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  slotSubTab === "weekly"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Weekly Recurring Schedules</span>
              </button>

              <button
                onClick={() => setSlotSubTab("dates")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  slotSubTab === "dates"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Date-Specific Overrides & Closures</span>
              </button>

              <button
                onClick={() => setSlotSubTab("capacity")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  slotSubTab === "capacity"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Live Capacity & Load Overview</span>
              </button>

              <button
                onClick={() => setSlotSubTab("reminders")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  slotSubTab === "reminders"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Preparation Reminder Settings</span>
              </button>
            </div>

            {/* SUB-TAB A: WEEKLY RECURRING SCHEDULES */}
            {slotSubTab === "weekly" && (
              <div className="space-y-6">
                {/* 7-Day Weekday Selector */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {WEEKDAYS.map((w) => {
                    const isSelected = selectedDayOfWeek === w.day;
                    const dayData = weeklySchedules.find((s) => s.dayOfWeek === w.day);
                    const slotCount = dayData?.slots?.length || 0;
                    const isEnabled = dayData?.isDeliveryEnabled !== false;

                    return (
                      <button
                        key={w.day}
                        onClick={() => setSelectedDayOfWeek(w.day)}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer flex flex-col items-center min-w-[100px] border ${
                          isSelected
                            ? "bg-[#354B35] text-white border-[#354B35] shadow-xs"
                            : "bg-white text-[#1E2B1E] border-[#E5DFC5] hover:bg-[#F7F3EA]"
                        }`}
                      >
                        <span className="font-bold">{w.name}</span>
                        <span
                          className={`text-[10px] mt-0.5 ${
                            isSelected
                              ? "text-white/80"
                              : isEnabled
                              ? "text-[#667266]"
                              : "text-rose-600 font-semibold"
                          }`}
                        >
                          {isEnabled ? `${slotCount} slots` : "Closed"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Day Header & Actions */}
                <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="font-serif text-lg font-bold text-[#1E2B1E]">
                        {currentDaySchedule.dayName} Recurring Template
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          currentDaySchedule.isDeliveryEnabled
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {currentDaySchedule.isDeliveryEnabled ? "Delivery Enabled" : "Delivery Closed"}
                      </span>
                    </div>
                    <p className="text-xs text-[#667266]">
                      Configured windows automatically apply to every future {currentDaySchedule.dayName} without manual creation
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={handleToggleDayDelivery}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        currentDaySchedule.isDeliveryEnabled
                          ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                          : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      {currentDaySchedule.isDeliveryEnabled ? (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          <span>Close {currentDaySchedule.dayName}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Enable {currentDaySchedule.dayName}</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleOpenCopyModal}
                      className="px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-[#F7F3EA] text-[#1E2B1E] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#354B35]" />
                      <span>Copy Schedule</span>
                    </button>

                    <button
                      onClick={handleOpenAddWeeklySlot}
                      className="px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Slot</span>
                    </button>
                  </div>
                </div>

                {/* Slots Table */}
                <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F7F3EA] text-[#667266] uppercase tracking-wider text-[10px] font-semibold">
                        <tr>
                          <th className="py-3 px-6">Slot Window</th>
                          <th className="py-3 px-6">Timing Range</th>
                          <th className="py-3 px-6 text-center">Batch Capacity</th>
                          <th className="py-3 px-6 text-center">Order Cutoff</th>
                          <th className="py-3 px-6 text-center">Status</th>
                          <th className="py-3 px-6 text-center">Toggle</th>
                          <th className="py-3 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE1]">
                        {weeklyLoading ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                              Loading weekly schedule...
                            </td>
                          </tr>
                        ) : (currentDaySchedule.slots || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                              No slots configured for {currentDaySchedule.dayName}. Click &ldquo;Add Slot&rdquo; to create default periods.
                            </td>
                          </tr>
                        ) : (
                          currentDaySchedule.slots.map((slot, index) => (
                            <tr key={slot.slotKey || index} className="hover:bg-[#F9F7F1]/60 transition-colors">
                              <td className="py-3.5 px-6 font-semibold text-[#1E2B1E]">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-[#8A9A86]" />
                                  <span>{slot.label}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-6 font-mono text-[#354B35] font-medium">
                                {slot.startTime} – {slot.endTime}
                              </td>
                              <td className="py-3.5 px-6 text-center font-bold text-[#1E2B1E]">
                                {slot.capacity} orders
                              </td>
                              <td className="py-3.5 px-6 text-center text-[#667266]">
                                {slot.orderCutoffMinutes ?? 60} mins before
                              </td>
                              <td className="py-3.5 px-6 text-center">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    slot.isActive
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {slot.isActive ? "Active" : "Disabled"}
                                </span>
                              </td>
                              <td className="py-3.5 px-6 text-center">
                                <button
                                  onClick={() => handleToggleWeeklySlotActive(index)}
                                  className="cursor-pointer text-[#354B35] hover:opacity-80 transition-opacity"
                                  title={slot.isActive ? "Disable Slot" : "Activate Slot"}
                                >
                                  {slot.isActive ? (
                                    <ToggleRight className="w-6 h-6 text-emerald-700" />
                                  ) : (
                                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                                  )}
                                </button>
                              </td>
                              <td className="py-3.5 px-6 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditWeeklySlot(index)}
                                    className="p-1.5 rounded-lg border border-[#E5DFC5] text-[#354B35] hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                                    title="Edit Slot"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteWeeklySlot(index)}
                                    className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Delete Slot"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB B: DATE-SPECIFIC OVERRIDES & CLOSURES */}
            {slotSubTab === "dates" && (
              <div className="space-y-6">
                {/* Date Picker & Quick Actions Bar */}
                <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667266]">
                      Select Delivery Date
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="date"
                        value={selectedCalendarDate}
                        onChange={(e) => setSelectedCalendarDate(e.target.value)}
                        className="px-3.5 py-2 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs font-semibold text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
                      />
                      <span className="text-xs font-medium text-[#667266]">
                        {new Date(selectedCalendarDate).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {dateScheduleData?.schedule?.isClosed ? (
                      <button
                        onClick={() => handleToggleDateClosure(false)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Reopen Delivery</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleDateClosure(true)}
                        className="px-3.5 py-2 rounded-xl border border-rose-300 text-rose-700 bg-rose-50 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Close Delivery</span>
                      </button>
                    )}

                    {dateScheduleData?.isOverridden && (
                      <button
                        onClick={handleRestoreWeeklySchedule}
                        className="px-3.5 py-2 rounded-xl border border-[#E5DFC5] bg-[#F7F3EA] text-[#1E2B1E] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Revert custom overrides and restore recurring weekly schedule"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#354B35]" />
                        <span>Restore Weekly</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setDateSlotLabel("Custom Event Slot");
                        setDateSlotStartTime("14:00");
                        setDateSlotEndTime("16:00");
                        setDateSlotCapacity(20);
                        setDateSlotCutoff(60);
                        setIsDateSlotModalOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Date Slot</span>
                    </button>
                  </div>
                </div>

                {/* Date Status Banner */}
                {dateScheduleData?.schedule?.isClosed ? (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Lock className="w-4 h-4 text-rose-700" />
                      <span>Delivery Closed on {selectedCalendarDate}</span>
                    </div>
                    <p className="text-rose-800">
                      Reason: &ldquo;{dateScheduleData?.schedule?.closureReason || "Kitchen Closed"}&rdquo;. Customer checkout will display this closure reason.
                    </p>
                  </div>
                ) : dateScheduleData?.isOverridden ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                    <div>
                      <span className="font-bold">Custom Schedule Active: </span>
                      <span>
                        Mode: {dateScheduleData?.schedule?.overrideMode || "INHERIT"}. This date has specific overrides active.
                      </span>
                    </div>
                    <span className="text-[10px] bg-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                      Override Active
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-[#EDE8DE]/60 border border-[#E5DFC5] text-xs text-[#4E5B4E] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#1E2B1E]">Following Recurring Weekly Schedule: </span>
                      <span>Slots automatically inherited from weekday template.</span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      Inheriting
                    </span>
                  </div>
                )}

                {/* Effective Slots Table */}
                <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
                  <div className="p-5 border-b border-[#E5DFC5]">
                    <h3 className="font-serif text-sm font-bold text-[#1E2B1E]">
                      Effective Delivery Slots for {selectedCalendarDate}
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F7F3EA] text-[#667266] uppercase tracking-wider text-[10px] font-semibold">
                        <tr>
                          <th className="py-3 px-6">Window Label</th>
                          <th className="py-3 px-6">Timing Range</th>
                          <th className="py-3 px-6">Schedule Source</th>
                          <th className="py-3 px-6 text-center">Batch Capacity</th>
                          <th className="py-3 px-6 text-center">Booked Orders</th>
                          <th className="py-3 px-6 text-center">Status</th>
                          <th className="py-3 px-6 text-right">Toggle Date Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE1]">
                        {dateScheduleLoading ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                              Resolving effective schedule...
                            </td>
                          </tr>
                        ) : (dateScheduleData?.effectiveSchedule?.slots || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-[#8A9A86]">
                              No delivery slots scheduled for {selectedCalendarDate}.
                            </td>
                          </tr>
                        ) : (
                          (dateScheduleData?.effectiveSchedule?.slots || []).map((slot: any) => {
                            const isInherited = slot.scheduleSource === "WEEKLY";
                            const isDisabledOnDate =
                              dateScheduleData?.schedule?.disabledSlotKeys?.includes(slot.slotKey);

                            return (
                              <tr key={slot.id || slot.slotKey} className="hover:bg-[#F9F7F1]/60 transition-colors">
                                <td className="py-3.5 px-6 font-semibold text-[#1E2B1E]">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-[#8A9A86]" />
                                    <span>{slot.label}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-6 font-mono text-[#354B35]">
                                  {slot.startTime} – {slot.endTime}
                                </td>
                                <td className="py-3.5 px-6">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold ${
                                      isInherited
                                        ? "bg-[#F7F3EA] text-[#667266] border border-[#E5DFC5]"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {slot.scheduleSource || "WEEKLY"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-6 text-center font-bold text-[#1E2B1E]">
                                  {slot.capacity}
                                </td>
                                <td className="py-3.5 px-6 text-center font-medium text-[#667266]">
                                  {slot.bookedCount || 0} / {slot.capacity}
                                </td>
                                <td className="py-3.5 px-6 text-center">
                                  <span
                                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      slot.isActive && !isDisabledOnDate
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-rose-100 text-rose-800"
                                    }`}
                                  >
                                    {slot.isActive && !isDisabledOnDate ? "Available" : "Disabled"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-6 text-right">
                                  {isInherited && (
                                    <button
                                      onClick={() =>
                                        handleToggleDateSlotDisabled(slot.slotKey, Boolean(isDisabledOnDate))
                                      }
                                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${
                                        isDisabledOnDate
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                          : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                      }`}
                                    >
                                      {isDisabledOnDate ? "Enable on Date" : "Disable on Date"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB C: LIVE CAPACITY & LOAD OVERVIEW */}
            {slotSubTab === "capacity" && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-base font-bold text-[#1E2B1E]">
                      Kitchen Real-Time Batch Capacity
                    </h2>
                    <p className="text-xs text-[#667266]">
                      Monitor booking fill rates per delivery period to prevent kitchen overload
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#8A9A86]" />
                    <input
                      type="date"
                      value={selectedCalendarDate}
                      onChange={(e) => setSelectedCalendarDate(e.target.value)}
                      className="px-3.5 py-2 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs font-semibold text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
                    />
                  </div>
                </div>

                {/* Capacity Cards Grid */}
                {capacityLoading ? (
                  <div className="py-12 text-center text-xs text-[#8A9A86] bg-white rounded-3xl border border-[#E5DFC5]">
                    Loading real-time capacity data...
                  </div>
                ) : capacitySlots.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#8A9A86] bg-white rounded-3xl border border-[#E5DFC5]">
                    No delivery slots found for {selectedCalendarDate}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {capacitySlots.map((slot) => {
                      const booked = slot.currentOrders || slot.bookedCount || 0;
                      const cap = slot.capacity || 25;
                      const pct = Math.min(100, Math.round((booked / cap) * 100));
                      const remaining = Math.max(0, cap - booked);

                      return (
                        <div
                          key={slot._id || slot.id}
                          className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-serif text-sm font-bold text-[#1E2B1E]">
                              {slot.label}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                !slot.isActive
                                  ? "bg-gray-100 text-gray-600"
                                  : remaining === 0
                                  ? "bg-rose-100 text-rose-800"
                                  : remaining <= 5
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {!slot.isActive
                                ? "Disabled"
                                : remaining === 0
                                ? "Full"
                                : `${remaining} left`}
                            </span>
                          </div>

                          <div className="text-xs font-mono text-[#354B35] font-semibold">
                            {slot.startTime} – {slot.endTime}
                          </div>

                          {/* Progress Bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-[#667266]">Current Load:</span>
                              <span className="font-bold text-[#1E2B1E]">
                                {booked} / {cap} orders ({pct}%)
                              </span>
                            </div>
                            <div className="w-full bg-[#F0ECE1] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 rounded-full ${
                                  pct >= 100
                                    ? "bg-rose-600"
                                    : pct >= 80
                                    ? "bg-amber-500"
                                    : "bg-emerald-600"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB D: PREPARATION REMINDER SETTINGS */}
            {slotSubTab === "reminders" && (
              <form
                onSubmit={handleSaveReminderSettings}
                className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs p-6 sm:p-8 space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE1]">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#1E2B1E] flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#B99A60]" />
                      <span>Preparation Reminder Settings</span>
                    </h3>
                    <p className="text-xs text-[#667266] mt-1">
                      Configure how many minutes before each delivery slot starts (in Asia/Kolkata IST) the kitchen receives a preparation reminder. Set 0 minutes for a reminder at slot start.
                    </p>
                  </div>
                </div>

                {reminderLoading ? (
                  <div className="py-10 text-center text-xs text-[#8A9A86]">
                    Loading slot reminder settings...
                  </div>
                ) : (reminderData?.slots || []).length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#8A9A86]">
                    No delivery slots configured yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(reminderData?.slots || []).map((slot) => {
                      const val = effectiveReminderMap[slot.slotKey] ?? slot.reminderMinutes ?? 60;
                      return (
                        <div
                          key={slot.slotKey}
                          className="p-4 rounded-2xl bg-[#F9F7F1] border border-[#E5DFC5] space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-sm text-[#1E2B1E]">
                                {slot.label}
                              </span>
                              <span className="ml-2 text-[11px] font-mono text-[#667266]">
                                ({slot.startTime} – {slot.endTime})
                              </span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-[#E5DFC5] text-[#667266]">
                              ID: {slot.slotKey}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 pt-1">
                            <input
                              type="number"
                              min={0}
                              max={1440}
                              step={1}
                              required
                              value={val}
                              onChange={(e) => {
                                const next = Math.max(
                                  0,
                                  Math.min(1440, Math.floor(Number(e.target.value) || 0))
                                );
                                setReminderDraft((prev) => ({
                                  ...(prev || effectiveReminderMap),
                                  [slot.slotKey]: next,
                                }));
                              }}
                              className="w-28 px-3 py-2 rounded-xl bg-white border border-[#E5DFC5] text-xs font-bold text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
                            />
                            <span className="text-xs text-[#667266]">
                              minutes before slot start
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-[#F0ECE1]">
                  <button
                    type="submit"
                    disabled={updateReminderSettingsMutation.isPending}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {updateReminderSettingsMutation.isPending
                        ? "Saving & Recalculating..."
                        : "Save Preparation Reminder Settings"}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ==================== MODALS ==================== */}

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

      {/* EDIT ZONE MODAL */}
      {editingZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Edit Delivery Zone
                </h3>
              </div>
              <button
                onClick={() => setEditingZone(null)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditZone} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Zone Sector Name
                </label>
                <input
                  type="text"
                  required
                  value={editZoneName}
                  onChange={(e) => setEditZoneName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  6-Digit Postal PIN Codes (Comma-separated)
                </label>
                <input
                  type="text"
                  required
                  value={editZonePincodes}
                  onChange={(e) => setEditZonePincodes(e.target.value)}
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
                    value={editDeliveryCharge}
                    onChange={(e) => setEditDeliveryCharge(Math.max(0, Number(e.target.value)))}
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
                    value={editMinOrderValue}
                    onChange={(e) => setEditMinOrderValue(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Est. Time (Minutes)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    required
                    value={editEstimatedMinutes}
                    onChange={(e) => setEditEstimatedMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Zone Status
                  </label>
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editIsActiveToggle"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="rounded text-[#354B35] focus:ring-[#354B35]"
                    />
                    <label htmlFor="editIsActiveToggle" className="text-xs text-[#1E2B1E] font-medium cursor-pointer">
                      {editIsActive ? "Serviceable" : "Suspended"}
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setEditingZone(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {editSubmitting ? "Saving..." : "Update Delivery Zone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-5">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Delete Delivery Zone
                </h3>
                <p className="text-[11px] text-[#667266]">
                  Confirm removal of zone from active serviceability
                </p>
              </div>
            </div>

            <div className="p-4 bg-[#F9F7F1] rounded-2xl border border-[#E5DFC5] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#667266]">Zone:</span>
                <span className="font-bold text-[#1E2B1E]">{deletingZone.areaName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667266]">PIN Codes:</span>
                <span className="font-mono font-bold text-[#354B35]">{deletingZone.pincode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667266]">Delivery Fee:</span>
                <span className="font-medium text-[#1E2B1E]">₹{deletingZone.deliveryFee}</span>
              </div>
            </div>

            <p className="text-xs text-[#667266] leading-relaxed">
              Are you sure you want to delete this zone? New customer orders with these PIN codes will be stopped. Historical orders referencing this zone remain permanently preserved.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DFC5]">
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => setDeletingZone(null)}
                className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleConfirmDeleteZone}
                className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
              >
                {deleteSubmitting ? "Deleting..." : "Yes, Delete Zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WEEKLY SLOT ADD/EDIT MODAL */}
      {isWeeklySlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  {editingWeeklySlotIndex !== null ? "Edit Recurring Slot" : `Add Slot to ${currentDaySchedule.dayName}`}
                </h3>
              </div>
              <button
                onClick={() => setIsWeeklySlotModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets */}
            {editingWeeklySlotIndex === null && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[#667266] uppercase">
                  Quick Period Presets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_SLOTS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="p-2 rounded-xl border border-[#E5DFC5] bg-[#F9F7F1] hover:bg-[#EDE8DE] text-left transition-colors cursor-pointer"
                    >
                      <div className="font-bold text-[11px] text-[#1E2B1E]">{p.label}</div>
                      <div className="text-[10px] font-mono text-[#667266]">{p.startTime} – {p.endTime}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveWeeklySlot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Slot Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lunch Window (12:00 PM - 03:00 PM)"
                  value={weeklySlotLabel}
                  onChange={(e) => setWeeklySlotLabel(e.target.value)}
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
                    value={weeklySlotStartTime}
                    onChange={(e) => setWeeklySlotStartTime(e.target.value)}
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
                    value={weeklySlotEndTime}
                    onChange={(e) => setWeeklySlotEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Batch Capacity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={weeklySlotCapacity}
                    onChange={(e) => setWeeklySlotCapacity(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Cutoff (Mins Before)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    required
                    value={weeklySlotCutoff}
                    onChange={(e) => setWeeklySlotCutoff(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setIsWeeklySlotModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={weeklySlotSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {weeklySlotSubmitting ? "Saving..." : "Save Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COPY WEEKLY SCHEDULE MODAL */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <Copy className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Copy {currentDaySchedule.dayName} Schedule
                </h3>
              </div>
              <button
                onClick={() => setIsCopyModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#667266]">
              Select which weekdays will receive the exact delivery slots and capacity configured for {currentDaySchedule.dayName}:
            </p>

            <div className="space-y-2">
              {WEEKDAYS.filter((w) => w.day !== selectedDayOfWeek).map((w) => {
                const isChecked = targetCopyDays.includes(w.day);
                return (
                  <label
                    key={w.day}
                    onClick={() => handleToggleTargetCopyDay(w.day)}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-colors ${
                      isChecked
                        ? "bg-[#354B35]/5 border-[#354B35] text-[#1E2B1E]"
                        : "bg-[#F9F7F1] border-[#E5DFC5] text-[#667266] hover:bg-[#EDE8DE]"
                    }`}
                  >
                    <span className="text-xs font-bold">{w.name}</span>
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                        isChecked
                          ? "bg-[#354B35] border-[#354B35] text-white"
                          : "border-[#C5BFA5] bg-white"
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={copySubmitting || targetCopyDays.length === 0}
                onClick={handleExecuteCopy}
                className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
              >
                {copySubmitting ? "Copying..." : `Copy to ${targetCopyDays.length} Days`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATE CLOSURE MODAL */}
      {isCloseDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-5">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Close Kitchen Delivery
                </h3>
                <p className="text-[11px] text-[#667266]">
                  Stop customer orders for {selectedCalendarDate}
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmDateClosure} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Closure Reason (Shown to customers)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Special Holiday / Kitchen Deep Cleaning"
                  value={dateClosureReason}
                  onChange={(e) => setDateClosureReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>

              <p className="text-xs text-[#667266] leading-relaxed">
                Closing this date overrides the weekly schedule and shows this custom message to customers selecting this date during checkout.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  disabled={closureSubmitting}
                  onClick={() => setIsCloseDateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closureSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {closureSubmitting ? "Closing..." : "Close Delivery"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DATE-SPECIFIC SLOT ADD MODAL */}
      {isDateSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-[#E5DFC5] space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#354B35]" />
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Add Date Slot for {selectedCalendarDate}
                </h3>
              </div>
              <button
                onClick={() => setIsDateSlotModalOpen(false)}
                className="p-1 rounded-lg text-[#8A9A86] hover:text-[#1E2B1E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomDateSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                  Slot Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Afternoon Event Window"
                  value={dateSlotLabel}
                  onChange={(e) => setDateSlotLabel(e.target.value)}
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
                    value={dateSlotStartTime}
                    onChange={(e) => setDateSlotStartTime(e.target.value)}
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
                    value={dateSlotEndTime}
                    onChange={(e) => setDateSlotEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Batch Capacity
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={dateSlotCapacity}
                    onChange={(e) => setDateSlotCapacity(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Cutoff (Mins Before)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    required
                    value={dateSlotCutoff}
                    onChange={(e) => setDateSlotCutoff(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#F9F7F1] border border-[#E5DFC5] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFC5]">
                <button
                  type="button"
                  onClick={() => setIsDateSlotModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-semibold text-[#667266] hover:bg-[#F7F3EA] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dateSlotSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {dateSlotSubmitting ? "Saving..." : "Add to Date"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
