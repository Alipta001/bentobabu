"use client";

import React, { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import { hydrateCart } from "@/store/cartSlice";
import { ToastProvider } from "@/context/ToastContext";
import { AuthProvider } from "@/context/AuthContext";
import { OrderingStatusProvider } from "@/context/OrderingStatusContext";
import { ServiceUnavailableModal } from "@/components/ui/ServiceUnavailableModal";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: (failureCount, error: any) => {
              const status = error?.response?.status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    store.dispatch(hydrateCart());
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <OrderingStatusProvider>
              {children}
              <ServiceUnavailableModal />
            </OrderingStatusProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </Provider>
  );
}

