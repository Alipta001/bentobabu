"use client";

import { useSyncExternalStore } from "react";
import { hasAnalyticsConsent, subscribeAnalyticsConsent } from "@/lib/analytics";

export function useAnalyticsConsent(): boolean {
  return useSyncExternalStore(
    subscribeAnalyticsConsent,
    () => hasAnalyticsConsent(),
    () => false
  );
}
