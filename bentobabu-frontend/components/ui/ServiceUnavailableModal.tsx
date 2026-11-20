"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, UtensilsCrossed, Video, Clock, Sparkles } from "lucide-react";
import { useOrderingStatus } from "@/context/OrderingStatusContext";

export function ServiceUnavailableModal() {
  const { isModalOpen, closeModal } = useOrderingStatus();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Prevent background scrolling while modal is open & handle Esc key
  useEffect(() => {
    if (!isModalOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus close button on mount
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-break-title"
      aria-describedby="kitchen-break-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-[#FAF8F3] rounded-3xl border border-[#E5DFC5] shadow-2xl p-6 sm:p-8 text-center space-y-6 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Close Button Top Right */}
        <button
          ref={closeButtonRef}
          onClick={closeModal}
          className="absolute top-4 right-4 p-2 rounded-full text-[#626F62] hover:text-[#222922] hover:bg-[#EDE8DE] transition-colors cursor-pointer"
          aria-label="Close modal and continue browsing"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Decorative Top Badge */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#EDE8DE] border border-[#E5DFC5] flex items-center justify-center shadow-inner">
              <UtensilsCrossed className="w-10 h-10 sm:w-12 sm:h-12 text-[#354B35]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#B99A60] text-white flex items-center justify-center shadow-md">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-[#354B35]/10 text-[#354B35] border border-[#354B35]/20">
            <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
            Kitchen Status Update
          </span>

          <h2
            id="kitchen-break-title"
            className="font-serif text-2xl sm:text-3xl font-bold text-[#222922] leading-tight"
          >
            Our Kitchen Is Taking a Little Break!
          </h2>

          <p
            id="kitchen-break-desc"
            className="text-xs sm:text-sm text-[#626F62] leading-relaxed max-w-md mx-auto"
          >
            We&apos;re not accepting new orders right now. But you can still explore our menu,
            discover healthy meals, and watch our food preparation videos. We&apos;ll be back soon!
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/menu"
            onClick={closeModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#354B35] hover:bg-[#253525] text-[#F7F3EA] text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
          >
            <UtensilsCrossed className="w-4 h-4 text-[#B99A60]" />
            <span>Explore Menu</span>
          </Link>

          <Link
            href="/videos"
            onClick={closeModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white hover:bg-[#EDE8DE] text-[#354B35] border border-[#E5DFC5] text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
          >
            <Video className="w-4 h-4 text-[#354B35]" />
            <span>Explore Videos</span>
          </Link>
        </div>

        {/* Reassurance note */}
        <p className="text-[11px] text-[#8A9A86]">
          You can continue browsing freely. Previously placed orders continue through preparation & delivery.
        </p>
      </div>
    </div>
  );
}
