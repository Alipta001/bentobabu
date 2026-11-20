import apiClient, { clearCsrfToken, bumpAuthGeneration } from "@/api/axios/axios";
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
  phone?: string;
  password?: string;
}

export interface RegisterResponse {
  requiresVerification?: boolean;
  challengeId?: string;
  channel?: "email" | "sms";
  destination?: string;
  maskedDestination?: string;
  cooldownSeconds?: number;
  cooldown?: number;
  user?: User;
}

export interface StoredOtpChallenge {
  challengeId: string;
  channel: "email" | "sms";
  destination: string;
  cooldownSeconds?: number;
  createdAt: number;
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

export interface VerifyMobileWidgetPayload {
  mobile: string;
  accessToken: string;
}

export interface VerifyMobileWidgetResponse {
  verified: boolean;
  phone: string;
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

export interface OtpConfigResponse {
  otpEmailEnabled: boolean;
  otpSmsEnabled: boolean;
  phoneRequired: boolean;
  phoneVerificationRequired: boolean;
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
   * Fetches the active OTP registration policy from backend (/auth/otp-config)
   */
  async getOtpConfig(): Promise<OtpConfigResponse> {
    try {
      const response = await apiClient.get<ApiResponse<OtpConfigResponse>>(
        API_ENDPOINTS.AUTH.OTP_CONFIG
      );
      if (response.data && response.data.data) {
        return response.data.data;
      }
      return {
        otpEmailEnabled: true,
        otpSmsEnabled: false,
        phoneRequired: false,
        phoneVerificationRequired: false,
      };
    } catch {
      const envSms = process.env.NEXT_PUBLIC_OTP_SMS_ENABLED === "true";
      return {
        otpEmailEnabled: true,
        otpSmsEnabled: envSms,
        phoneRequired: envSms,
        phoneVerificationRequired: envSms,
      };
    }
  },

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
    bumpAuthGeneration();
    return authData;
  },

  /**
   * Google Identity Services authentication using verified ID token.
   * Access and refresh tokens are stored exclusively in HttpOnly cookies.
   */
  async googleLogin(idToken: string): Promise<AuthResponse> {
    const response = await apiClient.post<
      ApiResponse<{ user: User }> | AuthResponse
    >(API_ENDPOINTS.AUTH.GOOGLE, { idToken });

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
    bumpAuthGeneration();
    return authData;
  },

  /**
   * Safe persistent session storage for OTP challenge information (navigation state without PII in URL)
   */
  saveStoredChallenge(challenge: StoredOtpChallenge): void {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("bb_otp_challenge", JSON.stringify(challenge));
      } catch {
        // Ignore quota/private browsing issues
      }
    }
  },

  getStoredChallenge(): StoredOtpChallenge | null {
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("bb_otp_challenge");
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  },

  clearStoredChallenge(): void {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("bb_otp_challenge");
      } catch {
        // Ignore
      }
    }
  },

  /**
   * Safe persistent session storage for draft registration data (preserved during mobile OTP verification).
   * SECURITY REQUIREMENT: Never stores password or sensitive authentication credentials.
   * Only persists name, email, and normalized phone.
   */
  saveDraftRegistration(data: { name?: string; email?: string; phone?: string }): void {
    if (typeof window !== "undefined") {
      try {
        const payload = {
          name: (data.name || "").trim(),
          email: (data.email || "").trim().toLowerCase(),
          phone: (data.phone || "").replace(/\D/g, "").slice(-10),
          savedAt: Date.now(),
        };
        // Explicitly ensure no password property can ever be written to storage
        delete (payload as any).password;
        sessionStorage.setItem("bb_draft_registration", JSON.stringify(payload));
      } catch {
        // Ignore
      }
    }
  },

  getDraftRegistration(): { name: string; email: string; phone: string } | null {
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("bb_draft_registration");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        // Security check: purge password if present
        delete parsed.password;

        // 15-minute automatic expiry for temporary draft registration state
        if (parsed.savedAt && Date.now() - parsed.savedAt > 15 * 60 * 1000) {
          sessionStorage.removeItem("bb_draft_registration");
          return null;
        }

        return {
          name: parsed.name || "",
          email: parsed.email || "",
          phone: parsed.phone || "",
        };
      } catch {
        return null;
      }
    }
    return null;
  },

  clearDraftRegistration(): void {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("bb_draft_registration");
      } catch {
        // Ignore
      }
    }
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
      phone: data.phone ? data.phone.trim() : undefined,
      password: data.password,
    });

    const raw = response.data;
    const payload =
      raw && typeof raw === "object" && "data" in raw && (raw as any).data
        ? (raw as any).data
        : (raw as any);

    const challengeId =
      payload?.challengeId ||
      payload?.challengeToken ||
      payload?.id ||
      payload?._id ||
      (raw as any)?.challengeId ||
      (raw as any)?.challengeToken;

    const channelRaw = payload?.channel || (raw as any)?.channel || "EMAIL";
    const channel = String(channelRaw).toUpperCase() === "SMS" ? "sms" : "email";

    const destination =
      payload?.maskedDestination ||
      payload?.destination ||
      (raw as any)?.maskedDestination ||
      (raw as any)?.destination ||
      "";

    const cooldown =
      payload?.cooldown ??
      payload?.cooldownSeconds ??
      (raw as any)?.cooldown ??
      (raw as any)?.cooldownSeconds ??
      60;

    const requiresVerification =
      payload?.requiresVerification !== false && (!!challengeId || payload?.requiresVerification === true);

    const registerData: RegisterResponse = {
      challengeId,
      channel,
      destination,
      maskedDestination: destination,
      cooldown,
      cooldownSeconds: cooldown,
      requiresVerification,
      user: payload?.user,
    };

    // Customer accounts require OTP verification; do NOT store unverified user in localStorage
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
   * Fetches the MSG91 widget configuration from the secure Next.js server-side endpoint.
   * Reads NEXT_MSG91_TOKEN_AUTH server-side without exposing it as a client-side bundle token.
   */
  async getMsg91WidgetConfig(): Promise<{ tokenAuth: string; widgetId: string }> {
    const res = await fetch("/api/auth/msg91-token", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success || !body?.data?.tokenAuth) {
      throw new Error(
        body?.message || "Failed to load mobile verification configuration from server."
      );
    }
    return body.data;
  },

  /**
   * Verifies customer mobile using MSG91 OTP widget access token
   */
  async verifyMobileWidget(payload: VerifyMobileWidgetPayload): Promise<VerifyMobileWidgetResponse> {
    const response = await apiClient.post<
      ApiResponse<VerifyMobileWidgetResponse> | VerifyMobileWidgetResponse
    >(API_ENDPOINTS.AUTH.VERIFY_MOBILE_WIDGET, payload);

    const raw = response.data;
    if (raw && "data" in raw && raw.data) {
      return raw.data;
    }
    return raw as VerifyMobileWidgetResponse;
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
    let data: any;
    if (raw && "data" in raw && raw.data) {
      data = raw.data;
    } else {
      data = raw as any;
    }

    if (!data.destination && data.maskedDestination) {
      data.destination = data.maskedDestination;
    }
    if (data.cooldownSeconds === undefined && data.cooldown !== undefined) {
      data.cooldownSeconds = data.cooldown;
    }
    return data;
  },

  /**
   * Fetches status and masked destination of an active OTP challenge (no PII exposed)
   */
  async getOtpStatus(challengeId: string): Promise<OtpStatusResponse> {
    const response = await apiClient.get<ApiResponse<OtpStatusResponse>>(
      `${API_ENDPOINTS.AUTH.OTP_STATUS}?challengeId=${encodeURIComponent(challengeId)}`
    );

    const raw = response.data;
    let data: OtpStatusResponse;
    if (raw && "data" in raw && raw.data) {
      data = raw.data;
    } else {
      data = raw as any;
    }

    if (!data.destination && (data as any).maskedDestination) {
      data.destination = (data as any).maskedDestination;
    }
    if (data.cooldownRemaining === undefined && (data as any).cooldown !== undefined) {
      data.cooldownRemaining = (data as any).cooldown;
    }
    return data;
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
    bumpAuthGeneration();
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
    bumpAuthGeneration();
    try {
      await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT_ALL);
    } catch {
      // Ignore
    } finally {
      this.clearSession();
    }
  },

  clearSession(): void {
    bumpAuthGeneration();
    clearCsrfToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("bb_user");
    }
  },
};
