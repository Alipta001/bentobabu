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

export interface RegisterResponse {
  requiresVerification?: boolean;
  challengeId?: string;
  channel?: "email" | "sms";
  destination?: string;
  cooldownSeconds?: number;
  user?: User;
}

export interface VerifyOtpPayload {
  challengeId?: string;
  identifier?: string;
  email?: string;
  phone?: string;
  otp: string;
}

export interface ResendOtpPayload {
  challengeId?: string;
  identifier?: string;
  email?: string;
  phone?: string;
}

export interface OtpStatusResponse {
  challengeId: string;
  channel: "email" | "sms";
  destination: string;
  isConsumed: boolean;
  isExpired: boolean;
  cooldownRemaining: number;
  resendCount: number;
  maxResends: number;
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
   * User registration. Creates customer account and dispatches verification OTP.
   */
  async register(data: RegisterData): Promise<RegisterResponse> {
    const response = await apiClient.post<
      ApiResponse<RegisterResponse> | RegisterResponse
    >(API_ENDPOINTS.AUTH.REGISTER, {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      password: data.password,
    });

    const raw = response.data;
    let registerData: RegisterResponse;

    if (raw && "data" in raw && raw.data) {
      registerData = raw.data;
    } else {
      registerData = raw as RegisterResponse;
    }

    if (registerData.user && typeof window !== "undefined") {
      localStorage.setItem("bb_user", JSON.stringify(registerData.user));
    }
    return registerData;
  },

  /**
   * Verifies signup OTP code for an unverified customer account
   */
  async verifySignupOtp(payload: VerifyOtpPayload): Promise<{ verified: boolean }> {
    const response = await apiClient.post<
      ApiResponse<{ verified: boolean }> | { verified: boolean }
    >(API_ENDPOINTS.AUTH.VERIFY_SIGNUP_OTP, payload);

    const raw = response.data;
    if (raw && "data" in raw && raw.data) {
      return raw.data;
    }
    return raw as { verified: boolean };
  },

  /**
   * Resends fresh signup OTP code to the registered email/mobile
   */
  async resendSignupOtp(payload: ResendOtpPayload): Promise<{
    challengeId?: string;
    channel: string;
    destination: string;
    cooldownSeconds: number;
    resendCount: number;
    maxResends?: number;
  }> {
    const response = await apiClient.post<
      ApiResponse<{
        challengeId?: string;
        channel: string;
        destination: string;
        cooldownSeconds: number;
        resendCount: number;
        maxResends?: number;
      }>
    >(API_ENDPOINTS.AUTH.RESEND_SIGNUP_OTP, payload);

    const raw = response.data;
    if (raw && "data" in raw && raw.data) {
      return raw.data;
    }
    return raw as any;
  },

  /**
   * Fetches status and masked destination of an active OTP challenge (no PII exposed)
   */
  async getOtpStatus(challengeId: string): Promise<OtpStatusResponse> {
    const response = await apiClient.get<ApiResponse<OtpStatusResponse>>(
      `${API_ENDPOINTS.AUTH.OTP_STATUS}?challengeId=${encodeURIComponent(challengeId)}`
    );

    const raw = response.data;
    if (raw && "data" in raw && raw.data) {
      return raw.data;
    }
    return raw as any;
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
