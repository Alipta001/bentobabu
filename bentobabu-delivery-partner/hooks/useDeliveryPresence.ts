"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setPresenceData,
  setAvailabilityStatus,
  setConnectionStatus,
  setAccountStatus,
  setTrackingLocation,
  setLocationPermission,
  setLastLocation,
  setLastHeartbeat,
  setIsChangingAvailability,
  setDeliveryError,
} from "@/store/slices/deliverySlice";
import { deliveryApi } from "@/lib/api/delivery.api";

export function useDeliveryPresence() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const {
    isOnline,
    availabilityStatus,
    accountStatus,
    connectionStatus,
    lastLocation,
    locationPermission,
    isChangingAvailability,
  } = useAppSelector((state) => state.delivery);

  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const locationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);

  // Sync with backend presence on mount or user login
  const syncPresence = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "DELIVERY") return;

    try {
      const data = await deliveryApi.getMyPresence();
      if (data?.presence) {
        dispatch(
          setPresenceData({
            presence: data.presence,
            activeOrderId: data.activeOrder ? data.activeOrder.id || (data.activeOrder as any)._id : null,
          })
        );
      }
    } catch (err: unknown) {
      console.warn("[Presence] Failed to fetch initial presence:", err);
    }
  }, [dispatch, isAuthenticated, user]);

  useEffect(() => {
    syncPresence();
  }, [syncPresence]);

  // Send single GPS location update
  const sendCurrentLocation = useCallback(async () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        dispatch(setLocationPermission("granted"));
        try {
          const payload: {
            latitude: number;
            longitude: number;
            accuracy: number | null;
            heading: number | null;
            speed: number | null;
            batteryLevel: number | null;
          } = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null,
            heading: pos.coords.heading || null,
            speed: pos.coords.speed || null,
            batteryLevel: null,
          };

          // Try reading battery API if available
          if ("getBattery" in navigator) {
            try {
              const battery: any = await (navigator as any).getBattery();
              payload.batteryLevel = Math.round(battery.level * 100);
            } catch {}
          }

          const res = await deliveryApi.sendLocation(payload);
          if (res?.lastLocation) {
            dispatch(
              setLastLocation({
                latitude: res.lastLocation.latitude,
                longitude: res.lastLocation.longitude,
                accuracy: res.lastLocation.accuracy,
                updatedAt: res.lastLocation.updatedAt,
              })
            );
          }
          dispatch(setTrackingLocation(true));
          dispatch(setConnectionStatus("CONNECTED"));
        } catch (err) {
          console.warn("[Presence] Location push failed:", err);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          dispatch(setLocationPermission("denied"));
        }
        dispatch(setTrackingLocation(false));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }, [dispatch]);

  // Send single heartbeat ping
  const sendHeartbeatPing = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "DELIVERY") return;

    try {
      const res = await deliveryApi.sendHeartbeat();
      if (res.connectionStatus) {
        dispatch(setConnectionStatus("CONNECTED"));
      }
      if (res.accountStatus) {
        dispatch(setAccountStatus(res.accountStatus));
      }
      dispatch(setLastHeartbeat(new Date().toISOString()));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Heartbeat error";
      if (msg.includes("suspended") || msg.includes("deactivated")) {
        dispatch(setAccountStatus("SUSPENDED"));
        dispatch(setAvailabilityStatus("OFFLINE"));
        toast.error("Your delivery partner account has been suspended by administration.");
      }
      dispatch(setConnectionStatus("DISCONNECTED"));
    }
  }, [dispatch, isAuthenticated, user]);

  // Manage Heartbeat and Location intervals when ONLINE or BUSY
  useEffect(() => {
    if (!isAuthenticated || user?.role !== "DELIVERY") {
      return;
    }

    const isActiveOnDuty = availabilityStatus === "ONLINE" || availabilityStatus === "BUSY";

    if (isActiveOnDuty) {
      // 1. Send initial heartbeat immediately
      sendHeartbeatPing();

      // 2. Setup periodic heartbeat (25s)
      heartbeatTimerRef.current = setInterval(sendHeartbeatPing, 25000);

      // 3. Request initial location and setup periodic location updates (20s)
      sendCurrentLocation();
      locationTimerRef.current = setInterval(sendCurrentLocation, 20000);

      // Also setup continuous watchPosition if supported
      if (typeof window !== "undefined" && "geolocation" in navigator) {
        geoWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            dispatch(setLocationPermission("granted"));
            dispatch(
              setLastLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                updatedAt: new Date().toISOString(),
              })
            );
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED) {
              dispatch(setLocationPermission("denied"));
            }
          },
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      }
    } else {
      // OFFLINE: clear all timers and watchers
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (locationTimerRef.current) clearInterval(locationTimerRef.current);
      if (geoWatchIdRef.current !== null && typeof window !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      dispatch(setTrackingLocation(false));
      dispatch(setConnectionStatus("DISCONNECTED"));
    }

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (locationTimerRef.current) clearInterval(locationTimerRef.current);
      if (geoWatchIdRef.current !== null && typeof window !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [availabilityStatus, isAuthenticated, user, sendHeartbeatPing, sendCurrentLocation, dispatch]);

  // Explicit Toggle availability function
  const toggleAvailability = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error("Please log in to manage your availability.");
      return;
    }

    if (accountStatus === "SUSPENDED" || accountStatus === "DEACTIVATED") {
      toast.error("Your account is currently suspended or inactive. Contact operations.");
      return;
    }

    const nextState = isOnline ? "OFFLINE" : "ONLINE";
    dispatch(setIsChangingAvailability(true));

    try {
      if (nextState === "ONLINE") {
        // Request GPS permission first
        if (typeof window !== "undefined" && "geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            () => {},
            (err) => {
              if (err.code === err.PERMISSION_DENIED) {
                toast.warning(
                  "Location permission was denied. Admins may not be able to assign nearby orders.",
                  { duration: 5000 }
                );
              }
            }
          );
        }
      }

      const res = await deliveryApi.updateAvailability(nextState);
      if (res?.presence) {
        dispatch(
          setPresenceData({
            presence: res.presence,
          })
        );
        toast.success(
          nextState === "ONLINE"
            ? "You are now ONLINE and ready for delivery assignments!"
            : "You are now OFFLINE. New assignments paused."
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update availability.";
      toast.error(msg);
      dispatch(setDeliveryError(msg));
    } finally {
      dispatch(setIsChangingAvailability(false));
    }
  }, [accountStatus, dispatch, isAuthenticated, isOnline]);

  return {
    isOnline,
    availabilityStatus,
    accountStatus,
    connectionStatus,
    lastLocation,
    locationPermission,
    isChangingAvailability,
    toggleAvailability,
    syncPresence,
  };
}
