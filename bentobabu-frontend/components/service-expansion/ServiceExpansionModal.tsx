"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Heart,
  X,
  CheckCircle2,
  Sparkles,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { serviceExpansionService } from "@/services/serviceExpansionService";

interface ServiceExpansionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pincode: string;
  locality?: string;
  city?: string;
  state?: string;
  customerName?: string;
  customerPhone?: string;
}

export function ServiceExpansionModal({
  isOpen,
  onClose,
  pincode,
  locality = "",
  city = "",
  state = "",
  customerName = "",
  customerPhone = "",
}: ServiceExpansionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Close modal on ESC key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleVote = async () => {
    if (!pincode) return;
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await serviceExpansionService.vote({
        pincode,
        locality,
        city,
        state,
        customerName,
        customerPhone,
        source: "CHECKOUT_UNSERVICEABLE",
      });

      if (res.success) {
        setIsSuccess(true);
      } else {
        setErrorMessage(res.message || "Failed to record your vote. Please try again.");
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to record your vote. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expansion-modal-title"
      aria-describedby="expansion-modal-desc"
    >
      <div className="relative w-full max-w-lg bg-[#F7F3EA] rounded-3xl border border-[#E5DFC5] shadow-2xl overflow-hidden transition-all duration-300 animate-in zoom-in-95">
        {/* Top Decorative Header */}
        <div className="relative bg-[#354B35] px-6 py-6 sm:px-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-[#EDE8DE]/70 hover:text-white hover:bg-[#243324] transition-colors focus:outline-hidden focus:ring-2 focus:ring-[#B99A60]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#243324] text-[#DFC89B] text-xs font-semibold mb-3 border border-[#4A654A]">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Expanding Across Bengal</span>
          </div>

          <h2
            id="expansion-modal-title"
            className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight"
          >
            Good food should reach every doorstep!
          </h2>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {!isSuccess ? (
            <>
              {/* Location Badge */}
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white border border-[#E5DFC5] text-xs font-medium text-[#4A554A]">
                <MapPin className="w-4 h-4 text-[#B99A60] shrink-0" />
                <span>
                  Delivery Address Area:{" "}
                  <strong className="text-[#222922]">
                    PIN {pincode}
                    {locality ? ` (${locality}, ${city || "WB"})` : ""}
                  </strong>
                </span>
              </div>

              {/* Message */}
              <p
                id="expansion-modal-desc"
                className="text-sm sm:text-base text-[#4A554A] leading-relaxed"
              >
                Oops! BentoBabu isn&apos;t delivering to your area just yet. But we&apos;re planning to grow, and your opinion matters.
              </p>

              {/* Question */}
              <div className="text-sm sm:text-base font-semibold text-[#222922] font-serif">
                Would you love to have BentoBabu in your area?
              </div>

              {/* Error feedback */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleVote}
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-[#354B35] hover:bg-[#243324] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70 focus:outline-hidden focus:ring-2 focus:ring-[#B99A60]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#DFC89B]" />
                      <span>Recording Vote...</span>
                    </>
                  ) : (
                    <>
                      <span>Yes! Bring BentoBabu Here</span>
                      <Heart className="w-4 h-4 text-red-400 fill-red-400" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto py-3.5 px-6 rounded-2xl border border-[#E5DFC5] bg-white hover:bg-[#EDE8DE] text-[#6B776A] hover:text-[#222922] font-semibold text-sm transition-colors focus:outline-hidden"
                >
                  Maybe Later
                </button>
              </div>

              <p className="text-[11px] text-[#8A9A86] text-center">
                Your vote helps our kitchen team decide which delivery zones to unlock next.
              </p>
            </>
          ) : (
            /* Success State */
            <div className="py-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#354B35] flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-[#354B35]" />
              </div>

              <div className="space-y-2">
                <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#222922]">
                  Thank you for your support! ❤️
                </h3>
                <p className="text-sm text-[#4A554A] max-w-sm mx-auto leading-relaxed">
                  Your vote has been recorded. We&apos;ll consider your area as we expand BentoBabu.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-[#354B35] hover:bg-[#243324] text-white font-semibold text-sm shadow-sm transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
