"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { ShieldCheck, X } from "lucide-react";
import {
  CONSENT_CHANGED_EVENT,
  OPEN_PRIVACY_SETTINGS_EVENT,
  getAnalyticsConsent,
  isAnalyticsEnabled,
  requiresAnalyticsConsent,
  setAnalyticsConsent,
} from "@/lib/analytics";

function subscribeToConsentBanner(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

export function ConsentBanner() {
  const [manualOpen, setManualOpen] = useState(false);

  const shouldPrompt = useSyncExternalStore(
    subscribeToConsentBanner,
    () =>
      isAnalyticsEnabled() &&
      requiresAnalyticsConsent() &&
      getAnalyticsConsent() === "unset",
    () => false
  );

  useEffect(() => {
    if (!isAnalyticsEnabled() || !requiresAnalyticsConsent()) {
      return;
    }
    const handleOpenSettings = () => setManualOpen(true);
    const handleConsentChanged = () => setManualOpen(false);

    window.addEventListener(OPEN_PRIVACY_SETTINGS_EVENT, handleOpenSettings);
    window.addEventListener(CONSENT_CHANGED_EVENT, handleConsentChanged);
    return () => {
      window.removeEventListener(OPEN_PRIVACY_SETTINGS_EVENT, handleOpenSettings);
      window.removeEventListener(CONSENT_CHANGED_EVENT, handleConsentChanged);
    };
  }, []);

  if (!manualOpen && !shouldPrompt) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Analytics and privacy preferences"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-white border border-[#E5DFC5] rounded-2xl shadow-xl p-5 text-[#222922]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[#354B35] font-serif font-bold text-sm">
          <ShieldCheck className="w-4 h-4 text-[#B99A60] shrink-0" />
          <span>Analytics & Privacy Preferences</span>
        </div>
        <button
          type="button"
          onClick={() => setAnalyticsConsent("denied")}
          aria-label="Reject analytics and close"
          className="text-[#8A9A86] hover:text-[#222922] p-1 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-2 text-xs text-[#626F62] leading-relaxed">
        We use optional analytics cookies (Google Analytics & Vercel Analytics) to understand menu
        engagement and improve your ordering experience. Essential session and cart cookies remain
        active. You can update your choice anytime in Privacy Settings.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={() => setAnalyticsConsent("denied")}
          className="px-3.5 py-2 rounded-full border border-[#D4CCB5] text-xs font-semibold text-[#354B35] hover:bg-[#F7F3EA] transition-colors"
        >
          Reject Analytics
        </button>
        <button
          type="button"
          onClick={() => setAnalyticsConsent("granted")}
          className="px-4 py-2 rounded-full bg-[#354B35] text-xs font-semibold text-[#F7F3EA] hover:bg-[#253525] transition-colors"
        >
          Accept Analytics
        </button>
      </div>
    </div>
  );
}
