"use client";

import React, { useState } from "react";
import { MapPin, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { deliveryService, ServiceabilityResult } from "@/services/deliveryService";

interface ServiceabilityCheckProps {
  initialPincode?: string;
  onServiceabilityConfirmed?: (result: ServiceabilityResult) => void;
}

export function ServiceabilityCheck({
  initialPincode = "",
  onServiceabilityConfirmed,
}: ServiceabilityCheckProps) {
  const [pincode, setPincode] = useState(initialPincode);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ServiceabilityResult | null>(null);

  const handleCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pincode || pincode.trim().length !== 6) return;

    setLoading(true);
    try {
      const res = await deliveryService.checkServiceability(pincode.trim());
      setResult(res);
      if (onServiceabilityConfirmed) {
        onServiceabilityConfirmed(res);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#F7F3EA] rounded-2xl p-4 border border-[#E5DFC5] space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#243324]">
        <MapPin className="w-4 h-4 text-[#B99A60]" />
        <span>Check Delivery to Your PIN Code</span>
      </div>

      <form onSubmit={handleCheck} className="flex gap-2">
        <input
          type="text"
          maxLength={6}
          placeholder="e.g. 700120 (Barrackpore)"
          value={pincode}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            setPincode(val);
            if (val.length === 6) {
              deliveryService.checkServiceability(val).then((res) => {
                setResult(res);
                if (onServiceabilityConfirmed) onServiceabilityConfirmed(res);
              });
            } else {
              setResult(null);
            }
          }}
          className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white border border-[#E5DFC5] text-[#222922] focus:outline-none focus:border-[#354B35]"
        />
        <button
          type="submit"
          disabled={loading || pincode.length !== 6}
          className="px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check"}
        </button>
      </form>

      {result && (
        <div
          className={`p-3 rounded-xl text-xs space-y-1 ${
            result.serviceable
              ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            {result.serviceable ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{result.message}</span>
          </div>

          {result.serviceable && (
            <div className="text-[11px] text-emerald-700 flex flex-wrap gap-3 pt-1 border-t border-emerald-200/50">
              <span>Standard Fee: ₹{result.deliveryFee}</span>
              <span>•</span>
              <span>Min Order: ₹{result.minimumOrderAmount}</span>
              {result.freeDeliveryThreshold && (
                <>
                  <span>•</span>
                  <span>Free over ₹{result.freeDeliveryThreshold}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

