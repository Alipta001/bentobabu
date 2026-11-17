"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { onMessage } from "firebase/messaging";
import { getFirebaseMessagingClient } from "@/config/firebase";

/**
 * Play a gentle double chime using Web Audio API for staff notification
 */
const playNotificationChime = () => {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playTone = (freq: number, delayMs: number) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
      }, delayMs);
    };

    playTone(587.33, 0);   // D5
    playTone(880.0, 150);  // A5
  } catch {
    // Audio autostart may be blocked by browser policy until user interacts
  }
};

/**
 * Hook to attach foreground Firebase message listener in the Admin dashboard
 */
export function useForegroundNotifications() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const recentEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      const messaging = await getFirebaseMessagingClient();
      if (!messaging || !isMounted) return;

      try {
        unsubscribe = onMessage(messaging, (payload) => {
          console.log("[FCM:Foreground] Order alert received:", payload);

          const eventId =
            payload.data?.orderId ||
            payload.data?.notificationId ||
            payload.messageId ||
            String(Date.now());

          // Deduplicate foreground events
          if (recentEventsRef.current.has(eventId)) {
            return;
          }
          recentEventsRef.current.add(eventId);

          // Keep recent events cache small
          if (recentEventsRef.current.size > 50) {
            const arr = Array.from(recentEventsRef.current);
            recentEventsRef.current = new Set(arr.slice(arr.length - 25));
          }

          const title =
            payload.notification?.title ||
            payload.data?.title ||
            "BentoBabu — New Order Received!";

          const body =
            payload.notification?.body ||
            payload.data?.body ||
            `New order received.`;

          const targetUrl = payload.data?.clickAction || "/orders";

          // 1. Play audible sound chime
          playNotificationChime();

          // 2. Invalidate order and KPI caches immediately
          queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] });

          // 3. Display rich Sonner toast with action button
          toast.success(title, {
            description: body,
            duration: 8000,
            action: {
              label: "View Order",
              onClick: () => router.push(targetUrl),
            },
          });
        });
      } catch (err) {
        console.warn("[FCM] Failed to attach onMessage listener:", err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [queryClient, router]);
}
