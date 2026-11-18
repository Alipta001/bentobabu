import apiClient, { clearCsrfToken, bumpAuthGeneration } from "./axios";
import { User } from "@/types";

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data: {
    user: User;
  };
}

export const authApi = {
  async login(payload: LoginPayload): Promise<User> {
    const response = await apiClient.post<AuthResponse>("/auth/login", {
      identifier: payload.identifier.trim(),
      password: payload.password,
    });

    const user = response.data?.data?.user;
    if (!user) {
      throw new Error("Invalid response from server: user details missing.");
    }

    if (user.role !== "DELIVERY") {
      // Role Guard: Reject non-delivery roles immediately
      await apiClient.post("/auth/logout").catch(() => {});
      throw new Error(
        `Access Denied: Account role '${user.role}' is not authorized for the Delivery Partner Dashboard.`
      );
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("bb_delivery_user", JSON.stringify(user));
    }

    bumpAuthGeneration();

    return user;
  },

  async getMe(): Promise<User | null> {
    try {
      const response = await apiClient.get<AuthResponse>("/auth/me");
      const user = response.data?.data?.user;
      if (!user) return null;

      if (user.role !== "DELIVERY") {
        await apiClient.post("/auth/logout").catch(() => {});
        if (typeof window !== "undefined") {
          localStorage.removeItem("bb_delivery_user");
        }
        return null;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("bb_delivery_user", JSON.stringify(user));
      }

      return user;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    bumpAuthGeneration();
    try {
      await apiClient.post("/auth/logout");
    } finally {
      clearCsrfToken();
      if (typeof window !== "undefined") {
        localStorage.removeItem("bb_delivery_user");
      }
    }
  },

  async updateProfile(updates: { name?: string; phone?: string }): Promise<User> {
    const response = await apiClient.patch<AuthResponse>("/auth/profile", updates);
    const updatedUser = response.data?.data?.user;
    if (typeof window !== "undefined" && updatedUser) {
      localStorage.setItem("bb_delivery_user", JSON.stringify(updatedUser));
    }
    return updatedUser;
  },
};
