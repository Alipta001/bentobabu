import adminApiClient, { clearCsrfToken } from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface AdminUser {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  isActive?: boolean;
}

export interface LoginResponse {
  admin: AdminUser;
}

export const adminAuthService = {
  /**
   * Admin Login with HttpOnly cookies
   */
  async login(credentials: { email: string; password?: string }): Promise<LoginResponse> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: {
        user: AdminUser;
      };
    }>(ADMIN_API_ENDPOINTS.AUTH.LOGIN, {
      identifier: credentials.email,
      email: credentials.email,
      password: credentials.password,
    });

    const userData = res.data?.data?.user;

    if (!userData) {
      throw new Error("Invalid response received from authentication server.");
    }

    if (userData.role !== "ADMIN" && userData.role !== "KITCHEN") {
      throw new Error("Access denied. Admin portal is restricted to ADMIN and KITCHEN users only.");
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("bb_admin_user", JSON.stringify(userData));
    }

    return { admin: userData };
  },

  getCurrentAdmin(): AdminUser | null {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bb_admin_user");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore parsing error
        }
      }
    }
    return null;
  },

  async getMe(): Promise<AdminUser | null> {
    try {
      const res = await adminApiClient.get<{
        success: boolean;
        data: {
          user: AdminUser;
        };
      }>(ADMIN_API_ENDPOINTS.AUTH.ME);

      const user = res.data?.data?.user;
      if (user) {
        if (user.role !== "ADMIN" && user.role !== "KITCHEN") {
          await this.logout();
          return null;
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("bb_admin_user", JSON.stringify(user));
        }
        return user;
      }
      return null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await adminApiClient.post(ADMIN_API_ENDPOINTS.AUTH.LOGOUT);
    } catch {
      // ignore
    } finally {
      clearCsrfToken();
      if (typeof window !== "undefined") {
        localStorage.removeItem("bb_admin_user");
      }
    }
  },
};
