"use client";

import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { store } from "@/store";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials, clearCredentials } from "@/store/slices/authSlice";
import { authApi } from "@/lib/api/auth.api";

function AuthSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;

    async function syncSession() {
      try {
        const user = await authApi.getMe();
        if (isMounted) {
          if (user && user.role === "DELIVERY") {
            dispatch(setCredentials({ user }));
          } else {
            dispatch(clearCredentials());
          }
        }
      } catch {
        if (isMounted) {
          dispatch(clearCredentials());
        }
      }
    }

    syncSession();

    return () => {
      isMounted = false;
    };
  }, [dispatch]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 1000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthSync />
        {children}
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </Provider>
  );
}
