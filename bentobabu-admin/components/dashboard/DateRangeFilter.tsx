"use client";

import React, { useState } from "react";
import { Calendar, ChevronDown, Check, Clock } from "lucide-react";
import { DateRangePreset } from "@/types";

interface DateRangeFilterProps {
  currentPreset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onFilterChange: (params: {
    period: DateRangePreset;
    startDate?: string;
    endDate?: string;
  }) => void;
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "custom", label: "Custom Date Range" },
];

export function DateRangeFilter({
  currentPreset,
  startDate,
  endDate,
  onFilterChange,
}: DateRangeFilterProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate || "");
  const [customEnd, setCustomEnd] = useState(endDate || "");
  const [showCustomInputs, setShowCustomInputs] = useState(currentPreset === "custom");

  const handleSelectPreset = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setShowCustomInputs(true);
      setIsDropdownOpen(false);
    } else {
      setShowCustomInputs(false);
      setIsDropdownOpen(false);
      onFilterChange({ period: preset });
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStart && customEnd) {
      onFilterChange({
        period: "custom",
        startDate: customStart,
        endDate: customEnd,
      });
    }
  };

  const activeLabel =
    PRESETS.find((p) => p.id === currentPreset)?.label || "Select Period";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Dropdown Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] hover:bg-[#F7F3EA] transition-colors shadow-xs"
        >
          <Calendar className="w-3.5 h-3.5 text-[#354B35]" />
          <span>{activeLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#8A9A86] ml-1" />
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 sm:left-0 top-full mt-2 w-52 bg-white rounded-2xl border border-[#E5DFC5] shadow-lg py-1.5 z-30 animate-in fade-in zoom-in-95">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`w-full px-4 py-2 text-left text-xs font-medium flex items-center justify-between transition-colors ${
                  currentPreset === p.id
                    ? "bg-[#EBF0E9] text-[#354B35] font-semibold"
                    : "text-[#4A554A] hover:bg-[#F7F3EA] hover:text-[#1F271F]"
                }`}
              >
                <span>{p.label}</span>
                {currentPreset === p.id && <Check className="w-3.5 h-3.5 text-[#354B35]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom Date Range Inputs */}
      {showCustomInputs && (
        <form onSubmit={handleApplyCustom} className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[#E5DFC5] bg-white text-xs text-[#1F271F] font-mono focus:outline-hidden focus:ring-1 focus:ring-[#354B35]"
            required
          />
          <span className="text-xs text-[#8A9A86]">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[#E5DFC5] bg-white text-xs text-[#1F271F] font-mono focus:outline-hidden focus:ring-1 focus:ring-[#354B35]"
            required
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs"
          >
            Apply
          </button>
        </form>
      )}

      {/* Current Range Info Badge */}
      {startDate && endDate && currentPreset === "custom" && (
        <div className="text-[11px] font-mono text-[#667266] bg-[#F7F3EA] px-2.5 py-1 rounded-lg border border-[#E5DFC5]">
          {startDate} ~ {endDate}
        </div>
      )}
    </div>
  );
}
