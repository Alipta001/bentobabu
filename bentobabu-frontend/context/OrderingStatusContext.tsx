"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsService, OrderingStatusResponse } from "@/services/settingsService";

interface OrderingStatusContextType {
  acceptingOrders: boolean;
  message: string | null;
  isLoading: boolean;
  isModalOpen: boolean;
  closeModal: () => void;
  openModal: () => void;
  refetchStatus: () => Promise<any>;
}

const OrderingStatusContext = createContext<OrderingStatusContextType>({
  acceptingOrders: true,
  message: null,
  isLoading: false,
  isModalOpen: false,
  closeModal: () => {},
  openModal: () => {},
  refetchStatus: async () => {},
});

const SESSION_DISMISSED_KEY = "bb_ordering_paused_dismissed";

export function OrderingStatusProvider({ children }: { children: React.ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const prevStatusRef = useRef<boolean | null>(null);

  const { data, isLoading, refetch } = useQuery<OrderingStatusResponse>({
    queryKey: ["settings", "ordering-status"],
    queryFn: () => settingsService.getOrderingStatus(),
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // Sync status every 30 seconds
    staleTime: 10000,
  });

  const acceptingOrders = data ? data.acceptingOrders : true;
  const message = data ? data.message : null;

  useEffect(() => {
    if (isLoading || data === undefined) return;

    if (!acceptingOrders) {
      // If ordering just transitioned from true -> false while browsing, always alert user
      if (prevStatusRef.current === true) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(SESSION_DISMISSED_KEY);
        }
        setIsModalOpen(true);
      } else {
        // Initial load while ordering is OFF: check if already dismissed in this session
        const dismissed = typeof window !== "undefined" && sessionStorage.getItem(SESSION_DISMISSED_KEY);
        if (!dismissed) {
          setIsModalOpen(true);
        }
      }
    } else {
      // Ordering is active: reset dismissal so subsequent shutdowns prompt again
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(SESSION_DISMISSED_KEY);
      }
      setIsModalOpen(false);
    }

    prevStatusRef.current = acceptingOrders;
  }, [acceptingOrders, data, isLoading]);

  const closeModal = () => {
    setIsModalOpen(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_DISMISSED_KEY, "true");
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  return (
    <OrderingStatusContext.Provider
      value={{
        acceptingOrders,
        message,
        isLoading,
        isModalOpen,
        closeModal,
        openModal,
        refetchStatus: refetch,
      }}
    >
      {children}
    </OrderingStatusContext.Provider>
  );
}

export function useOrderingStatus() {
  return useContext(OrderingStatusContext);
}
