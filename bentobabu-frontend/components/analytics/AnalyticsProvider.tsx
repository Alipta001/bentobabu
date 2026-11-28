"use client";

import React, { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import {
  CONSENT_CHANGED_EVENT,
  ensureConsentModeInitialized,
  getGtmId,
  hasAnalyticsConsent,
  isAnalyticsEnabled,
  isConsentModeInitialized,
  sanitizeUrlPath,
  sanitizeVercelUrl,
  trackPageView,
} from "@/lib/analytics";

function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

function RoutePageViewTracker({ consentGranted }: { consentGranted: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!consentGranted) return;
    const sanitizedPath = sanitizeUrlPath(pathname, searchParams);
    if (lastTrackedRef.current === sanitizedPath) return;
    lastTrackedRef.current = sanitizedPath;
    trackPageView(sanitizedPath);
  }, [pathname, searchParams, consentGranted]);

  return null;
}

export function AnalyticsProvider() {
  const enabled = isAnalyticsEnabled();
  const gtmId = getGtmId();
  const consentInitialized = useSyncExternalStore(
    subscribeConsent,
    () => (enabled ? isConsentModeInitialized() : false),
    () => false
  );
  const consentGranted = useSyncExternalStore(
    subscribeConsent,
    () => (enabled ? hasAnalyticsConsent() : false),
    () => false
  );

  const retryAttemptsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    ensureConsentModeInitialized();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || consentInitialized) {
      retryAttemptsRef.current = 0;
      return;
    }
    if (!consentGranted) {
      return;
    }

    const MAX_RECOVERY_ATTEMPTS = 10;
    const attemptRecovery = () => {
      if (retryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) return;
      retryAttemptsRef.current += 1;
      ensureConsentModeInitialized();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        attemptRecovery();
      }
    };

    attemptRecovery();

    window.addEventListener("focus", attemptRecovery);
    window.addEventListener("online", attemptRecovery);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", attemptRecovery);
      window.removeEventListener("online", attemptRecovery);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, consentGranted, consentInitialized]);

  if (!enabled) return null;

  const canTrack = consentInitialized && consentGranted;

  return (
    <>
      {gtmId && canTrack && <GoogleTagManager gtmId={gtmId} />}
      {canTrack && (
        <Analytics
          beforeSend={(event) => {
            if (!hasAnalyticsConsent()) return null;
            return {
              ...event,
              url: sanitizeVercelUrl(event.url),
            };
          }}
        />
      )}
      <Suspense fallback={null}>
        <RoutePageViewTracker consentGranted={canTrack} />
      </Suspense>
    </>
  );
}
