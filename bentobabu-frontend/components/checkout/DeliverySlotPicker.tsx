"use client";

import React, { useState, useEffect } from "react";
import { Clock, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { useDeliverySlots } from "@/hooks/useQueries";
import { DeliverySlot } from "@/types";

interface DeliverySlotPickerProps {
  pincode: string;
  selectedSlotId?: string;
  onSelectSlot: (slot: DeliverySlot | null) => void;
}

export function DeliverySlotPicker({
  pincode,
  selectedSlotId,
  onSelectSlot,
}: DeliverySlotPickerProps) {
  // Generate date tabs: Today, Tomorrow, +2, +3
  const dateOptions = React.useMemo(() => {
    const list: Array<{ label: string; date: string }> = [];
    const today = new Date();

    for (let i = 0; i <= 3; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateString = d.toISOString().split("T")[0];
      let label = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      if (i === 0) label = `Today, ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
      if (i === 1) label = `Tomorrow, ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
      list.push({ label, date: dateString });
    }
    return list;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0].date);

  const { data: slots = [], isLoading, error } = useDeliverySlots(pincode, selectedDate);

  // Auto-select first available slot if none selected or if selected slot not in current date
  useEffect(() => {
    if (slots.length > 0) {
      const currentSelected = slots.find((s) => (s.id || s._id) === selectedSlotId);
      if (!currentSelected) {
        const firstAvailable = slots.find((s) => s.isActive && (s.capacity - s.bookedCount > 0));
        if (firstAvailable) {
          onSelectSlot(firstAvailable);
        }
      }
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
            key={opt.date}
            type="button"
            onClick={() => setSelectedDate(opt.date)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedDate === opt.date
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

      {/* Available Slots List */}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-[#6B776A] bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5]">
          Loading delivery slots for {selectedDate}...
        </div>
      ) : error || slots.length === 0 ? (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>No Delivery Slots Scheduled</span>
          </div>
          <p>
            Slots for this date are fully booked or not yet open. Please choose another delivery day or check back shortly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {slots.map((slot) => {
            const slotId = slot.id || slot._id;
            const isFull = slot.bookedCount >= slot.capacity || !slot.isActive;
            const isSelected = selectedSlotId === slotId;
            const remaining = Math.max(0, slot.capacity - slot.bookedCount);

            return (
              <button
                key={slotId}
                type="button"
                disabled={isFull}
                onClick={() => onSelectSlot(slot)}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  isFull
                    ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                    : isSelected
                    ? "bg-[#354B35]/5 border-[#354B35] text-[#222922] shadow-xs"
                    : "bg-white border-[#E5DFC5] text-[#222922] hover:border-[#354B35]/50"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#222922]">
                    <Clock className={`w-3.5 h-3.5 ${isSelected ? "text-[#354B35]" : "text-[#8A9A86]"}`} />
                    <span>{slot.startTime} – {slot.endTime}</span>
                  </div>
                  <div className="text-[10px] text-[#6B776A]">
                    {isFull ? (
                      <span className="text-red-600 font-semibold">Slot Full</span>
                    ) : remaining <= 5 ? (
                      <span className="text-amber-700 font-semibold">Only {remaining} slots left!</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">Available</span>
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

