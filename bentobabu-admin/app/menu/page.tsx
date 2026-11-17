"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Save,
  RotateCcw,
  Sparkles,
  Table as TableIcon,
  ListFilter,
  Check,
  X,
  Clock,
  AlertCircle,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useDailyMenu,
  useSaveDailyMenu,
  useContinueYesterday,
  useWeeklyMenu,
  useSaveWeeklyMenu,
  useApplyWeekAll,
} from "@/hooks/useAdminQueries";
import {
  getKolkataToday,
  addDays,
  getMondayOfWeek,
  formatDateLabel,
} from "@/lib/dateUtils";

export default function AdminDailyMenuPage() {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly">("daily");

  // ==========================================
  // DAILY MENU STATE
  // ==========================================
  const [selectedDate, setSelectedDate] = useState<string>(() => getKolkataToday());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "AVAILABLE" | "UNAVAILABLE">("ALL");

  // Local draft availability map: { [productId]: boolean }
  const [dailyDraft, setDailyDraft] = useState<Record<string, boolean>>({});
  const [isDailyDirty, setIsDailyDirty] = useState(false);
  const [dailyActionMessage, setDailyActionMessage] = useState<string | null>(null);

  // Daily queries and mutations
  const { data: dailyData, isLoading: isDailyLoading } = useDailyMenu(selectedDate);
  const saveDailyMutation = useSaveDailyMenu();
  const continueYesterdayMutation = useContinueYesterday();

  // Synchronize draft state when dailyData loads or date changes
  useEffect(() => {
    if (dailyData?.items) {
      const map: Record<string, boolean> = {};
      dailyData.items.forEach((item) => {
        map[item.product.id] = item.isAvailable;
      });
      setDailyDraft(map);
      setIsDailyDirty(false);
    }
  }, [dailyData, selectedDate]);

  // Handle individual dish toggle in daily view
  const handleToggleDailyItem = (productId: string) => {
    setDailyDraft((prev) => {
      const current = prev[productId] !== undefined ? prev[productId] : true;
      return {
        ...prev,
        [productId]: !current,
      };
    });
    setIsDailyDirty(true);
  };

  // Quick batch actions
  const handleSetAllAvailability = (isAvailable: boolean) => {
    if (!dailyData?.items) return;
    const map: Record<string, boolean> = {};
    dailyData.items.forEach((item) => {
      map[item.product.id] = isAvailable;
    });
    setDailyDraft(map);
    setIsDailyDirty(true);
  };

  // Save / Publish Daily Menu
  const handleSaveDailyMenu = async () => {
    if (!dailyData?.items) return;

    const payloadItems = dailyData.items.map((item) => ({
      product: item.product.id,
      isAvailable:
        dailyDraft[item.product.id] !== undefined
          ? dailyDraft[item.product.id]
          : item.isAvailable,
    }));

    try {
      await saveDailyMutation.mutateAsync({
        date: selectedDate,
        items: payloadItems,
        isPublished: true,
      });
      setIsDailyDirty(false);
      setDailyActionMessage(`Menu for ${formatDateLabel(selectedDate)} published successfully!`);
      setTimeout(() => setDailyActionMessage(null), 3500);
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to save daily menu");
    }
  };

  // Continue Yesterday's Menu handler
  const handleContinueYesterday = async () => {
    try {
      const res = await continueYesterdayMutation.mutateAsync(selectedDate);
      if (res?.items) {
        const map: Record<string, boolean> = {};
        res.items.forEach((item) => {
          map[item.product.id] = item.isAvailable;
        });
        setDailyDraft(map);
        setIsDailyDirty(false);
      }
      setDailyActionMessage("Yesterday's menu configuration copied to today!");
      setTimeout(() => setDailyActionMessage(null), 3500);
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to copy yesterday's menu");
    }
  };

  // Filtered dishes for daily view
  const filteredDailyItems = useMemo(() => {
    if (!dailyData?.items) return [];

    return dailyData.items.filter((item) => {
      const currentAvailable =
        dailyDraft[item.product.id] !== undefined
          ? dailyDraft[item.product.id]
          : item.isAvailable;

      if (filterMode === "AVAILABLE" && !currentAvailable) return false;
      if (filterMode === "UNAVAILABLE" && currentAvailable) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.product.name.toLowerCase().includes(q);
        const catMatch = item.product.category?.name?.toLowerCase().includes(q);
        return nameMatch || catMatch;
      }
      return true;
    });
  }, [dailyData, dailyDraft, filterMode, searchQuery]);

  const dailyAvailableCount = useMemo(() => {
    if (!dailyData?.items) return 0;
    return dailyData.items.filter((item) => {
      return dailyDraft[item.product.id] !== undefined
        ? dailyDraft[item.product.id]
        : item.isAvailable;
    }).length;
  }, [dailyData, dailyDraft]);

  // ==========================================
  // WEEKLY MENU STATE
  // ==========================================
  const [weekStartDate, setWeekStartDate] = useState<string>(() =>
    getMondayOfWeek(getKolkataToday())
  );
  // Matrix draft: { [date]: { [productId]: boolean } }
  const [weeklyDraft, setWeeklyDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [isWeeklyDirty, setIsWeeklyDirty] = useState(false);
  const [weeklyActionMessage, setWeeklyActionMessage] = useState<string | null>(null);

  const { data: weeklyData, isLoading: isWeeklyLoading } = useWeeklyMenu(weekStartDate);
  const saveWeeklyMutation = useSaveWeeklyMenu();
  const applyWeekAllMutation = useApplyWeekAll();

  // Synchronize weekly draft from loaded weeklyData
  useEffect(() => {
    if (weeklyData?.days) {
      const draft: Record<string, Record<string, boolean>> = {};
      weeklyData.days.forEach((day) => {
        draft[day.date] = { ...day.availability };
      });
      setWeeklyDraft(draft);
      setIsWeeklyDirty(false);
    }
  }, [weeklyData, weekStartDate]);

  // Toggle individual matrix cell
  const handleToggleWeeklyCell = (dateStr: string, productId: string) => {
    setWeeklyDraft((prev) => {
      const dayMap = prev[dateStr] || {};
      const current = dayMap[productId] !== undefined ? dayMap[productId] : true;
      return {
        ...prev,
        [dateStr]: {
          ...dayMap,
          [productId]: !current,
        },
      };
    });
    setIsWeeklyDirty(true);
  };

  // Apply one day's menu across all other days in the week
  const handleApplyDayToWeek = async (sourceDate: string) => {
    if (!weeklyData?.days) return;
    const targetDates = weeklyData.days.map((d) => d.date).filter((d) => d !== sourceDate);

    try {
      await applyWeekAllMutation.mutateAsync({ sourceDate, targetDates });
      setWeeklyActionMessage(`Applied ${formatDateLabel(sourceDate)}'s menu to all 7 days of the week!`);
      setTimeout(() => setWeeklyActionMessage(null), 3500);
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to apply menu across week");
    }
  };

  // Save the full weekly schedule
  const handleSaveWeeklySchedule = async () => {
    if (!weeklyData?.days || !weeklyData?.products) return;

    const daysPayload = weeklyData.days.map((day) => {
      const dayDraft = weeklyDraft[day.date] || day.availability || {};
      const items = weeklyData.products.map((p) => ({
        product: p.id,
        isAvailable: dayDraft[p.id] !== undefined ? dayDraft[p.id] : p.masterIsAvailable,
      }));

      return {
        date: day.date,
        items,
        isPublished: true,
      };
    });

    try {
      await saveWeeklyMutation.mutateAsync({ days: daysPayload });
      setIsWeeklyDirty(false);
      setWeeklyActionMessage("Weekly menu schedule saved and published successfully!");
      setTimeout(() => setWeeklyActionMessage(null), 3500);
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to save weekly schedule");
    }
  };

  return (
    <AdminShell
      title="Daily Menu & Weekly Scheduling"
      subtitle="Publish and schedule food availability for daily operations, copy previous days, or schedule the entire week."
    >
      {/* View Switcher Tabs */}
      <div className="flex items-center gap-3 border-b border-[#E5DFC5] pb-4 mb-6">
        <button
          onClick={() => setActiveTab("daily")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "daily"
              ? "bg-[#354B35] text-white shadow-xs"
              : "bg-white text-[#4A584A] border border-[#E5DFC5] hover:bg-[#F9F7F1]"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Daily Menu View</span>
        </button>

        <button
          onClick={() => setActiveTab("weekly")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "weekly"
              ? "bg-[#354B35] text-white shadow-xs"
              : "bg-white text-[#4A584A] border border-[#E5DFC5] hover:bg-[#F9F7F1]"
          }`}
        >
          <TableIcon className="w-4 h-4" />
          <span>Weekly Schedule Matrix</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: DAILY MENU MANAGEMENT */}
      {/* ======================================================== */}
      {activeTab === "daily" && (
        <div className="space-y-6">
          {dailyActionMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{dailyActionMessage}</span>
            </div>
          )}

          {/* Date Selector & Primary Action Header */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Date Navigator */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
                className="p-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35] hover:bg-[#EDE8DE] cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-bold text-[#1F271F] focus:outline-none focus:border-[#354B35] cursor-pointer"
                />
              </div>

              <button
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                className="p-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35] hover:bg-[#EDE8DE] cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSelectedDate(getKolkataToday())}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  selectedDate === getKolkataToday()
                    ? "bg-[#354B35] text-white border-[#354B35]"
                    : "bg-[#F7F3EA] text-[#4A584A] border-[#E5DFC5] hover:bg-[#EDE8DE]"
                }`}
              >
                Today
              </button>

              <div className="ml-2">
                <span className="font-serif text-base font-bold text-[#1F271F] block">
                  {formatDateLabel(selectedDate)}
                </span>
                <span className="text-[11px] text-[#667266]">
                  {dailyData?.isConfigured
                    ? "✓ Custom schedule published for this day"
                    : "• Using catalog default availability"}
                </span>
              </div>
            </div>

            {/* Actions for this day */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleContinueYesterday}
                disabled={continueYesterdayMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-bold text-[#354B35] hover:bg-[#EDE8DE] transition-colors cursor-pointer disabled:opacity-50"
                title="Copy yesterday's menu configuration to this date"
              >
                <Copy className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>Continue Yesterday&apos;s Menu</span>
              </button>

              <button
                onClick={handleSaveDailyMenu}
                disabled={saveDailyMutation.isPending || !isDailyDirty}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>{saveDailyMutation.isPending ? "Publishing..." : isDailyDirty ? "Save & Publish Menu *" : "Published"}</span>
              </button>
            </div>
          </div>

          {/* Quick Filter & Stats Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E5DFC5]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#1F271F]">
                Lineup: {dailyAvailableCount} of {dailyData?.items?.length || 0} Dishes Available
              </span>
              {isDailyDirty && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                  Unsaved Changes
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type="text"
                  placeholder="Filter by dish or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35] w-52"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#F7F3EA] p-1 rounded-xl border border-[#E5DFC5]">
                {(["ALL", "AVAILABLE", "UNAVAILABLE"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                      filterMode === mode
                        ? "bg-[#354B35] text-white"
                        : "text-[#4A584A] hover:text-[#1F271F]"
                    }`}
                  >
                    {mode === "ALL" ? "All" : mode === "AVAILABLE" ? "Available" : "Unavailable"}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleSetAllAvailability(true)}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-[#F7F3EA] text-[#354B35] border border-[#E5DFC5] hover:bg-[#EDE8DE] cursor-pointer"
              >
                All Available
              </button>
              <button
                onClick={() => handleSetAllAvailability(false)}
                className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-[#F7F3EA] text-rose-700 border border-[#E5DFC5] hover:bg-[#EDE8DE] cursor-pointer"
              >
                All Unavailable
              </button>
            </div>
          </div>

          {/* Dishes List with Independent Date Toggle */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isDailyLoading ? (
              <div className="col-span-3 p-12 text-center text-xs text-[#667266]">
                Loading menu availability for {formatDateLabel(selectedDate)}...
              </div>
            ) : filteredDailyItems.length === 0 ? (
              <div className="col-span-3 bg-white p-12 rounded-3xl border border-[#E5DFC5] text-center text-xs text-[#667266]">
                No dishes found matching your current filter.
              </div>
            ) : (
              filteredDailyItems.map((item) => {
                const isItemAvailable =
                  dailyDraft[item.product.id] !== undefined
                    ? dailyDraft[item.product.id]
                    : item.isAvailable;

                return (
                  <div
                    key={item.product.id}
                    className={`bg-white rounded-2xl border p-4 shadow-xs transition-all flex flex-col justify-between space-y-3 ${
                      isItemAvailable
                        ? "border-[#354B35]/40 ring-1 ring-[#354B35]/20"
                        : "border-[#E5DFC5] bg-[#FDFCFB] opacity-75"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.product.images?.[0] || "/images/placeholder.png"}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover border border-[#E5DFC5] shrink-0"
                      />
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-[#B99A60] uppercase truncate">
                            {item.product.category?.name || "Bento"}
                          </span>
                          <span className="font-bold text-[#1F271F]">₹{item.product.price}</span>
                        </div>
                        <h4 className="font-serif font-bold text-xs text-[#1F271F] truncate">
                          {item.product.name}
                        </h4>
                        <div className="text-[10px] text-[#667266]">
                          Stock: {item.product.stockQuantity} portions
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#F0ECE1] flex items-center justify-between">
                      <span
                        className={`text-[11px] font-bold flex items-center gap-1 ${
                          isItemAvailable ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isItemAvailable ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Available on {selectedDate}</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Unavailable</span>
                          </>
                        )}
                      </span>

                      <button
                        onClick={() => handleToggleDailyItem(item.product.id)}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          isItemAvailable
                            ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                            : "bg-rose-100 text-rose-900 hover:bg-rose-200"
                        }`}
                      >
                        {isItemAvailable ? "Set Unavailable" : "Set Available"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: WEEKLY MENU MATRIX & SCHEDULING */}
      {/* ======================================================== */}
      {activeTab === "weekly" && (
        <div className="space-y-6">
          {weeklyActionMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{weeklyActionMessage}</span>
            </div>
          )}

          {/* Week Selector Bar */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStartDate((d) => addDays(d, -7))}
                className="p-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35] hover:bg-[#EDE8DE] cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => setWeekStartDate(getMondayOfWeek(getKolkataToday()))}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-[#F7F3EA] text-[#4A584A] border border-[#E5DFC5] hover:bg-[#EDE8DE] cursor-pointer"
              >
                Current Week
              </button>

              <button
                onClick={() => setWeekStartDate((d) => addDays(d, 7))}
                className="p-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35] hover:bg-[#EDE8DE] cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="ml-2">
                <span className="font-serif text-base font-bold text-[#1F271F] block">
                  Week of {formatDateLabel(weekStartDate)} — {weeklyData?.endDate ? formatDateLabel(weeklyData.endDate) : ""}
                </span>
                <span className="text-[11px] text-[#667266]">
                  Click any cell to toggle availability for that day. Changes to one day do not affect other days.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleApplyDayToWeek(weekStartDate)}
                disabled={applyWeekAllMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-bold text-[#354B35] hover:bg-[#EDE8DE] transition-colors cursor-pointer disabled:opacity-50"
                title="Copy Monday's availability lineup to all 7 days of this week"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>Apply Monday to Whole Week</span>
              </button>

              <button
                onClick={handleSaveWeeklySchedule}
                disabled={saveWeeklyMutation.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>{saveWeeklyMutation.isPending ? "Saving..." : isWeeklyDirty ? "Save Weekly Schedule *" : "Save Weekly Schedule"}</span>
              </button>
            </div>
          </div>

          {/* Interactive Weekly Matrix Table */}
          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            {isWeeklyLoading || !weeklyData ? (
              <div className="p-12 text-center text-xs text-[#667266]">
                Loading weekly schedule matrix...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                      <th className="py-3.5 px-6 font-bold min-w-[200px]">Food Item</th>
                      <th className="py-3.5 px-4 font-bold">Category</th>
                      {weeklyData.days.map((day) => (
                        <th key={day.date} className="py-3.5 px-3 font-bold text-center min-w-[90px]">
                          <span className="block">{day.dayName.slice(0, 3)}</span>
                          <span className="text-[10px] text-[#8A9A86] block font-normal">
                            {day.date.slice(5)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE1]">
                    {weeklyData.products.map((prod) => (
                      <tr key={prod.id} className="hover:bg-[#F9F7F1] transition-colors">
                        <td className="py-3 px-6 font-bold text-[#1F271F]">
                          <div className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={prod.images?.[0] || "/images/placeholder.png"}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover border border-[#E5DFC5]"
                            />
                            <span>{prod.name}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-[#667266]">
                          {prod.category?.name || "Bento"}
                        </td>

                        {weeklyData.days.map((day) => {
                          const isAvailable =
                            weeklyDraft[day.date]?.[prod.id] !== undefined
                              ? weeklyDraft[day.date][prod.id]
                              : day.availability[prod.id] !== undefined
                              ? day.availability[prod.id]
                              : prod.masterIsAvailable;

                          return (
                            <td key={day.date} className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleToggleWeeklyCell(day.date, prod.id)}
                                className={`w-8 h-8 rounded-xl inline-flex items-center justify-center font-bold text-xs transition-all cursor-pointer ${
                                  isAvailable
                                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                    : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                                }`}
                                title={`${prod.name} on ${day.dayName}: ${isAvailable ? "Available" : "Unavailable"}`}
                              >
                                {isAvailable ? "Yes" : "No"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
