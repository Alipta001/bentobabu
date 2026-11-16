import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface DeliveryState {
  isOnline: boolean;
  activeOrderId: string | null;
  autoRefreshIntervalSeconds: number;
}

const getInitialOnlineStatus = (): boolean => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("bb_delivery_online");
    if (stored !== null) {
      return stored === "true";
    }
  }
  return true; // Default online
};

const initialState: DeliveryState = {
  isOnline: getInitialOnlineStatus(),
  activeOrderId: null,
  autoRefreshIntervalSeconds: 15,
};

export const deliverySlice = createSlice({
  name: "delivery",
  initialState,
  reducers: {
    toggleOnlineStatus: (state) => {
      state.isOnline = !state.isOnline;
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(state.isOnline));
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_online", String(state.isOnline));
      }
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
  setOnlineStatus,
  setActiveOrderId,
  setAutoRefreshInterval,
} = deliverySlice.actions;

export default deliverySlice.reducer;
