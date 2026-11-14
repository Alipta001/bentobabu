"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import apiClient, { onAuthFailure } from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { User } from "@/types";
import {
  authService,
  LoginCredentials,
  RegisterData,
  RegisterResponse,
} from "@/services/authService";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (data: RegisterData) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  verifySession: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const isInitializingRef = useRef(false);

  /**
   * Authoritative session verification:
   * 1. Status starts as 'loading'.
   * 2. Call /auth/me via apiClient (which automatically performs single-flight refresh on 401).
   * 3. Set 'authenticated' ONLY after successful verification.
   * 4. Set 'unauthenticated' ONLY after verification has definitively failed.
   */
  const verifySession = useCallback(async (): Promise<User | null> => {
    try {
      const response = await apiClient.get<
        { success: boolean; data: { user: User } } | { user: User }
      >(API_ENDPOINTS.AUTH.ME);

      const raw = response.data;
      const verifiedUser =
        raw && "data" in raw && raw.data?.user
          ? raw.data.user
          : (raw as any)?.user || raw;

      if (verifiedUser && (verifiedUser.id || verifiedUser._id)) {
        setUser(verifiedUser);
        setStatus("authenticated");
        return verifiedUser;
      }
    } catch {
      // Definitive verification failure (neither valid access nor refresh token)
    }

    setUser(null);
    setStatus("unauthenticated");
    return null;
  }, []);

  // Listen for definitive background refresh failures from Axios interceptor
  useEffect(() => {
    const unsubscribe = onAuthFailure(() => {
      setUser(null);
      setStatus("unauthenticated");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isInitializingRef.current) {
      isInitializingRef.current = true;
      verifySession();
    }
  }, [verifySession]);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<User> => {
      const authData = await authService.login(credentials);
      const loggedInUser = authData.user;
      setUser(loggedInUser);
      setStatus("authenticated");
      return loggedInUser;
    },
    []
  );

  const register = useCallback(
    async (data: RegisterData): Promise<RegisterResponse> => {
      const regData = await authService.register(data);
      if (regData.user) {
        setUser(regData.user);
        setStatus("authenticated");
      }
      return regData;
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      status,
      user,
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated" && !!user,
      login,
      register,
      logout,
      verifySession,
    }),
    [status, user, login, register, logout, verifySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

