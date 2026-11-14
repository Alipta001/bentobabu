import apiClient, { clearCsrfToken } from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { User } from "@/types";

export interface LoginCredentials {
  email?: string;
  phone?: string;
  emailOrPhone?: string;
  password?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password?: string;
}

export interface AuthResponse {
  user: User;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const authService = {
  /**
   * Authoritatively fetches authenticated user profile from backend (/auth/me)
   */
  async getProfile(): Promise<User | null> {
    try {
      const response = await apiClient.get<ApiResponse<{ user: User }> | User>(
        API_ENDPOINTS.AUTH.ME
      );
      const raw = response.data;
      const user = (raw && "data" in raw && raw.data?.user) ? raw.data.user : (raw as User);
      if (user && typeof window !== "undefined") {
        localStorage.setItem("bb_user", JSON.stringify(user));
      }
      return user;
    } catch {
      // Clear local session on unauthenticated
      this.clearSession();
      return null;
    }
  },

  /**
   * User login. Unwraps backend data envelope and stores user profile.
   * Access and refresh tokens are stored exclusively in HttpOnly cookies.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const payload = {
      identifier: credentials.emailOrPhone || credentials.email || credentials.phone,
      email: credentials.email,
      phone: credentials.phone,
      password: credentials.password,
    };

    const response = await apiClient.post<
      ApiResponse<{ user: User }> | AuthResponse
    >(API_ENDPOINTS.AUTH.LOGIN, payload);

    const raw = response.data;
    let authData: AuthResponse;

    if (raw && "data" in raw && raw.data) {
      authData = {
        user: raw.data.user,
      };
    } else {
      authData = raw as AuthResponse;
    }

    if (authData.user && typeof window !== "undefined") {
      localStorage.setItem("bb_user", JSON.stringify(authData.user));
    }
    return authData;
  },

  /**
   * User registration. Creates customer account with HttpOnly cookies.
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<
      ApiResponse<{ user: User }> | AuthResponse
    >(API_ENDPOINTS.AUTH.REGISTER, {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      password: data.password,
    });

    const raw = response.data;
    let authData: AuthResponse;

    if (raw && "data" in raw && raw.data) {
      authData = {
        user: raw.data.user,
      };
    } else {
      authData = raw as AuthResponse;
    }

    if (authData.user && typeof window !== "undefined") {
      localStorage.setItem("bb_user", JSON.stringify(authData.user));
    }
    return authData;
  },

  /**
   * Update customer profile (/auth/profile)
   */
  async updateProfile(updates: { name?: string; phone?: string }): Promise<User> {
    const response = await apiClient.patch<ApiResponse<{ user: User }> | { user: User }>(
      API_ENDPOINTS.AUTH.PROFILE,
      updates
    );
    const raw = response.data;
    const user = (raw && "data" in raw && raw.data?.user) ? raw.data.user : (raw as { user: User }).user;
    if (user && typeof window !== "undefined") {
      localStorage.setItem("bb_user", JSON.stringify(user));
    }
    return user;
  },

  /**
   * Logs out user, invalidating backend session and clearing cookies.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch {
      // Ignore network errors during logout
    } finally {
      this.clearSession();
    }
  },

  /**
   * Logs out from all active devices
   */
  async logoutAll(): Promise<void> {
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT_ALL);
    } catch {
      // Ignore
    } finally {
      this.clearSession();
    }
  },

  clearSession(): void {
    clearCsrfToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("bb_user");
    }
  },
};
