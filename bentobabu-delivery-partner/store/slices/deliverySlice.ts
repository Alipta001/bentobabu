import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  AccountStatus,
  AvailabilityStatus,
  ConnectionStatus,
  DeliveryPartnerPresence,
} from "@/types";

interface DeliveryState {
  isOnline: boolean;
  availabilityStatus: AvailabilityStatus;
  accountStatus: AccountStatus;
  connectionStatus: ConnectionStatus;
  activeOrderId: string | null;
  autoRefreshIntervalSeconds: number;
  isTrackingLocation: boolean;
  locationPermission: "prompt" | "granted" | "denied";
  lastLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    updatedAt?: string | null;
  } | null;
  lastHeartbeat: string | null;
  isChangingAvailability: boolean;
  errorMessage: string | null;
}

const getInitialOnlineStatus = (): boolean => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("bb_delivery_online");
    if (stored !== null) {
      return stored === "true";
    }
  }
  return false; // Default offline until presence syncs
};

const initialState: DeliveryState = {
  isOnline: getInitialOnlineStatus(),
  availabilityStatus: getInitialOnlineStatus() ? "ONLINE" : "OFFLINE",
  accountStatus: "ACTIVE",
  connectionStatus: "DISCONNECTED",
  activeOrderId: null,
  autoRefreshIntervalSeconds: 15,
  isTrackingLocation: false,
  locationPermission: "prompt",
  lastLocation: null,
  lastHeartbeat: null,
  isChangingAvailability: false,
  errorMessage: null,
};

export const deliverySlice = createSlice({
  name: "delivery",
  initialState,
  reducers: {
    setPresenceData: (
      state,
      action: PayloadAction<{
        presence: Partial<DeliveryPartnerPresence>;
        activeOrderId?: string | null;
      }>
    ) => {
      const p = action.payload.presence;
      if (p.availabilityStatus) {
        state.availabilityStatus = p.availabilityStatus;
        state.isOnline = p.availabilityStatus === "ONLINE" || p.availabilityStatus === "BUSY";
      }
      if (p.accountStatus) {
        state.accountStatus = p.accountStatus;
      }
      if (p.connectionStatus) {
        state.connectionStatus = p.connectionStatus;
      }
      if (p.lastHeartbeat) {
        state.lastHeartbeat = p.lastHeartbeat;
      }
      if (p.lastLocation && p.lastLocation.latitude && p.lastLocation.longitude) {
        state.lastLocation = {
          latitude: p.lastLocation.latitude,
          longitude: p.lastLocation.longitude,
          accuracy: p.lastLocation.accuracy,
          updatedAt: p.lastLocation.updatedAt,
        };
      }
      if (action.payload.activeOrderId !== undefined) {
        state.activeOrderId = action.payload.activeOrderId;
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(state.isOnline));
      }
    },
    toggleOnlineStatus: (state) => {
      state.isOnline = !state.isOnline;
      state.availabilityStatus = state.isOnline ? "ONLINE" : "OFFLINE";
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(state.isOnline));
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
      state.availabilityStatus = action.payload ? "ONLINE" : "OFFLINE";
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(action.payload));
      }
    },
    setAvailabilityStatus: (state, action: PayloadAction<AvailabilityStatus>) => {
      state.availabilityStatus = action.payload;
      state.isOnline = action.payload === "ONLINE" || action.payload === "BUSY";
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(state.isOnline));
      }
    },
    setConnectionStatus: (state, action: PayloadAction<ConnectionStatus>) => {
      state.connectionStatus = action.payload;
    },
    setAccountStatus: (state, action: PayloadAction<AccountStatus>) => {
      state.accountStatus = action.payload;
    },
    setTrackingLocation: (state, action: PayloadAction<boolean>) => {
      state.isTrackingLocation = action.payload;
    },
    setLocationPermission: (
      state,
      action: PayloadAction<"prompt" | "granted" | "denied">
    ) => {
      state.locationPermission = action.payload;
    },
    setLastLocation: (
      state,
      action: PayloadAction<{
        latitude: number;
        longitude: number;
        accuracy?: number | null;
        updatedAt?: string | null;
      }>
    ) => {
      state.lastLocation = action.payload;
    },
    setLastHeartbeat: (state, action: PayloadAction<string>) => {
      state.lastHeartbeat = action.payload;
    },
    setIsChangingAvailability: (state, action: PayloadAction<boolean>) => {
      state.isChangingAvailability = action.payload;
    },
    setDeliveryError: (state, action: PayloadAction<string | null>) => {
      state.errorMessage = action.payload;
    },
    setActiveOrderId: (state, action: PayloadAction<string | null>) => {
      state.activeOrderId = action.payload;
    },
    setAutoRefreshInterval: (state, action: PayloadAction<number>) => {
      state.autoRefreshIntervalSeconds = action.payload;
    },
  },
});

export const {
  toggleOnlineStatus,
  setPresenceData,
  setOnlineStatus,
  setAvailabilityStatus,
  setConnectionStatus,
  setAccountStatus,
  setTrackingLocation,
  setLocationPermission,
  setLastLocation,
  setLastHeartbeat,
  setIsChangingAvailability,
  setDeliveryError,
  setActiveOrderId,
  setAutoRefreshInterval,
} = deliverySlice.actions;

export default deliverySlice.reducer;
