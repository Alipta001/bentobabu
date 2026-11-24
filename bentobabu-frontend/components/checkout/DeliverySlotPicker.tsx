"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Clock, Calendar, AlertCircle, CheckCircle2, Ban, CalendarX, Lock } from "lucide-react";
import { useDeliverySlots, useDeliveryConfig } from "@/hooks/useQueries";
import { DeliverySlot } from "@/types";

interface DeliverySlotPickerProps {
  pincode: string;
  selectedSlotId?: string;
  onSelectSlot: (slot: DeliverySlot | null) => void;
}

/**
 * Format date in Asia/Kolkata timezone as YYYY-MM-DD
 */
function getKolkataDateString(daysOffset: number): { dateStr: string; label: string } {
  const d = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(d);

  let label = d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  if (daysOffset === 0) {
    label = `Today, ${d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`;
  } else if (daysOffset === 1) {
    label = `Tomorrow, ${d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`;
  }

  return { dateStr, label };
}

export function DeliverySlotPicker({
  pincode,
  selectedSlotId,
  onSelectSlot,
}: DeliverySlotPickerProps) {
  const { data: deliveryConfig } = useDeliveryConfig();
  const maxAdvanceDays = typeof deliveryConfig?.maxAdvanceBookingDays === "number"
    ? Math.max(0, Math.min(30, deliveryConfig.maxAdvanceBookingDays))
    : 3;

  // Dynamically generate dates in Asia/Kolkata from Today (0) up to maxAdvanceBookingDays
  const dateOptions = useMemo(() => {
    const options = [];
    for (let offset = 0; offset <= maxAdvanceDays; offset++) {
      options.push(getKolkataDateString(offset));
    }
    return options.length > 0 ? options : [getKolkataDateString(0)];
  }, [maxAdvanceDays]);

  const [selectedDate, setSelectedDate] = useState<string>(() => dateOptions[0]?.dateStr || "");

  // If maxAdvanceDays changes and current selectedDate is outside allowed options, reset to today
  useEffect(() => {
    const isDateValid = dateOptions.some((opt) => opt.dateStr === selectedDate);
    if (!isDateValid && dateOptions[0]) {
      setSelectedDate(dateOptions[0].dateStr);
      onSelectSlot(null);
    }
  }, [dateOptions, selectedDate, onSelectSlot]);

  const { data: slotResult, isLoading, error } = useDeliverySlots(pincode, selectedDate);

  const slots: DeliverySlot[] = useMemo(() => {
    if (!slotResult) return [];
    if (Array.isArray(slotResult)) return slotResult;
    return slotResult.slots || [];
  }, [slotResult]);

  const scheduleState: string = useMemo(() => {
    if (!slotResult || Array.isArray(slotResult)) {
      return slots.length > 0 ? "AVAILABLE" : "NO_SCHEDULE";
    }
    return slotResult.state || (slots.length > 0 ? "AVAILABLE" : "NO_SCHEDULE");
  }, [slotResult, slots.length]);

  const scheduleMessage: string = useMemo(() => {
    if (!slotResult || Array.isArray(slotResult)) return "";
    return slotResult.message || "";
  }, [slotResult]);

  // Auto-select first bookable slot if none selected or if selected slot not in current date or no longer available
  useEffect(() => {
    if (slots.length > 0) {
      const isBookable = (s: DeliverySlot) =>
        s.isActive &&
        s.isAvailable !== false &&
        !s.isCutoffPassed &&
        !s.isPastWindow &&
        Math.max(0, s.capacity - s.bookedCount) > 0;

      const currentSelected = slots.find((s) => (s.id || s._id) === selectedSlotId);
      if (!currentSelected || !isBookable(currentSelected)) {
        const firstAvailable = slots.find(isBookable);
        if (firstAvailable) {
          onSelectSlot(firstAvailable);
        } else {
          onSelectSlot(null);
        }
      }
    } else {
      onSelectSlot(null);
    }
  }, [slots, selectedSlotId, onSelectSlot]);

  if (!pincode || pincode.trim().length !== 6) {
    return (
      <div className="p-4 rounded-2xl bg-[#EDE8DE]/60 border border-[#E5DFC5] text-xs text-[#6B776A] flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#8A9A86] shrink-0" />
        <span>Please select or enter a delivery address with a valid PIN code to load delivery windows.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date Selector Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {dateOptions.map((opt) => (
          <button
            key={opt.dateStr}
            type="button"
            onClick={() => setSelectedDate(opt.dateStr)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedDate === opt.dateStr
                ? "bg-[#354B35] text-white shadow-xs"
                : "bg-[#F7F3EA] text-[#626F62] hover:bg-[#EDE8DE] border border-[#E5DFC5]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{opt.label}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Available Slots List or State-Specific Empty Message */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-[#6B776A] bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5]">
          Loading delivery slots for {selectedDate}...
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>Unable to Load Slots</span>
          </div>
          <p>We could not fetch delivery windows at this moment. Please try again.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="p-4 rounded-2xl border text-xs space-y-1.5 transition-all">
          {scheduleState === "ADVANCE_BOOKING_EXCEEDED" ? (
            <div className="bg-amber-50/80 -m-4 p-4 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CalendarX className="w-4 h-4 text-amber-700" />
                <span>Advance Booking Period Exceeded</span>
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                {scheduleMessage || "Orders can currently be placed only within the permitted advance booking period. Please select another delivery date."}
              </p>
            </div>
          ) : scheduleState === "PAST_DATE" ? (
            <div className="bg-amber-50/80 -m-4 p-4 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CalendarX className="w-4 h-4 text-amber-700" />
                <span>Past Date Selected</span>
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                {scheduleMessage || "Delivery cannot be scheduled for past dates. Please choose today or an upcoming date."}
              </p>
            </div>
          ) : scheduleState === "ALL_FULL" ? (
            <div className="bg-amber-50/80 -m-4 p-4 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Ban className="w-4 h-4 text-amber-700" />
                <span>All Delivery Slots Fully Booked</span>
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                All delivery windows for this date have reached kitchen batch capacity. Please select another delivery day.
              </p>
            </div>
          ) : scheduleState === "BOOKING_CLOSED" ? (
            <div className="bg-orange-50/80 -m-4 p-4 rounded-2xl border border-orange-200 text-orange-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="w-4 h-4 text-orange-700" />
                <span>Booking Closed For Today</span>
              </div>
              <p className="text-orange-800 text-[11px] leading-relaxed">
                Order preparation cutoffs for today&apos;s delivery slots have passed. Please select tomorrow or an upcoming date.
              </p>
            </div>
          ) : scheduleState === "DELIVERY_CLOSED" ? (
            <div className="bg-rose-50/80 -m-4 p-4 rounded-2xl border border-rose-200 text-rose-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CalendarX className="w-4 h-4 text-rose-700" />
                <span>Kitchen Delivery Closed</span>
              </div>
              <p className="text-rose-800 text-[11px] leading-relaxed">
                {scheduleMessage || "Kitchen delivery is unavailable on this date. Please choose another delivery day."}
              </p>
            </div>
          ) : scheduleState === "UNSERVICEABLE" ? (
            <div className="bg-rose-50/80 -m-4 p-4 rounded-2xl border border-rose-200 text-rose-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-700" />
                <span>PIN Code Not Serviceable</span>
              </div>
              <p className="text-rose-800 text-[11px] leading-relaxed">
                {scheduleMessage || `Delivery is not currently serviceable to PIN code ${pincode}.`}
              </p>
            </div>
          ) : (
            <div className="bg-[#F7F3EA] -m-4 p-4 rounded-2xl border border-[#E5DFC5] text-[#4E5B4E] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#1E2B1E]">
                <Clock className="w-4 h-4 text-[#8A9A86]" />
                <span>No Delivery Slots Scheduled</span>
              </div>
              <p className="text-[11px] text-[#6B776A] leading-relaxed">
                No delivery windows have been configured for this date yet. Please select another date or check back shortly.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {slots.map((slot) => {
            const slotId = slot.id || slot._id;
            const isFull = slot.bookedCount >= slot.capacity;
            const isCutoffOrPast = Boolean(slot.isCutoffPassed || slot.isPastWindow || slot.isAvailable === false);
            const isDisabled = !slot.isActive || isFull || isCutoffOrPast;
            const isSelected = selectedSlotId === slotId;
            const remaining = Math.max(0, slot.capacity - slot.bookedCount);
            const slotLabel = slot.label || `${slot.startTime} – ${slot.endTime}`;

            return (
              <button
                key={slotId}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelectSlot(slot)}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  isDisabled
                    ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                    : isSelected
                    ? "bg-[#354B35]/5 border-[#354B35] text-[#222922] shadow-xs"
                    : "bg-white border-[#E5DFC5] text-[#222922] hover:border-[#354B35]/50"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#1E2B1E]">
                    <Clock className={`w-3.5 h-3.5 ${isSelected ? "text-[#354B35]" : "text-[#8A9A86]"}`} />
                    <span>{slotLabel}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#4E5B4E]">
                    {slot.startTime} – {slot.endTime}
                  </div>
                  <div className="text-[10px]">
                    {!slot.isActive ? (
                      <span className="text-rose-600 font-semibold">Unavailable</span>
                    ) : isFull ? (
                      <span className="text-rose-600 font-semibold">Slot Full</span>
                    ) : slot.isCutoffPassed ? (
                      <span className="text-orange-700 font-semibold">Booking Closed (Cut-off reached)</span>
                    ) : slot.isPastWindow ? (
                      <span className="text-orange-700 font-semibold">Slot Ended</span>
                    ) : remaining <= 5 ? (
                      <span className="text-amber-700 font-semibold">Only {remaining} slots left!</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">{remaining} slots available</span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-[#354B35] shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
