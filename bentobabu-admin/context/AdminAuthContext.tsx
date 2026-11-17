"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { adminAuthService, AdminUser, LoginResponse } from "@/services/authService";
import { useQueryClient } from "@tanstack/react-query";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AdminAuthContextType {
  admin: AdminUser | null;
  status: AdminAuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password?: string }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<AdminUser | null>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  // Consistent initial state across server rendering and first client hydration pass
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const isInitializingRef = useRef(false);
  const queryClient = useQueryClient();

  const refreshProfile = useCallback(async (): Promise<AdminUser | null> => {
    try {
      const user = await adminAuthService.getMe();
      if (user && (user.role === "ADMIN" || user.role === "KITCHEN")) {
        setAdmin(user);
        setStatus("authenticated");
        return user;
      }
    } catch {
      // Unauthenticated / expired session
    }

    setAdmin(null);
    setStatus("unauthenticated");
    return null;
  }, []);

  // Asynchronous authentication verification on client mount only
  useEffect(() => {
    if (!isInitializingRef.current) {
      isInitializingRef.current = true;
      refreshProfile();
    }
  }, [refreshProfile]);

  const login = useCallback(
    async (credentials: { email: string; password?: string }): Promise<LoginResponse> => {
      const res = await adminAuthService.login(credentials);
      if (res.admin) {
        setAdmin(res.admin);
        setStatus("authenticated");
      }
      return res;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await adminAuthService.logout();
    } finally {
      setAdmin(null);
      setStatus("unauthenticated");
      queryClient.clear();
    }
  }, [queryClient]);

  const contextValue = useMemo<AdminAuthContextType>(
    () => ({
      admin,
      status,
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      login,
      logout,
      refreshProfile,
    }),
    [admin, status, login, logout, refreshProfile]
  );

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}

