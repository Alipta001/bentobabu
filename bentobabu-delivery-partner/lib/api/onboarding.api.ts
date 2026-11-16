import apiClient, { getCsrfToken } from "./axios";
import {
  ApplicationStatusResponse,
  DeliveryApplication,
  DeliveryApplicationAddress,
  DeliveryApplicationDocuments,
  DeliveryApplicationPersonalInfo,
  DeliveryApplicationVehicleInfo,
  DocumentItem,
} from "@/types";

export interface SendOtpResponse {
  success: boolean;
  message: string;
  data: {
    challengeToken: string;
    destination: string;
    channel: string;
  };
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  data: {
    verified: boolean;
    email: string;
    emailVerificationToken: string;
    phone?: string;
    phoneVerificationToken?: string;
  };
}

export interface SubmitApplicationPayload {
  personalInfo: DeliveryApplicationPersonalInfo;
  address: DeliveryApplicationAddress;
  vehicleInfo: DeliveryApplicationVehicleInfo;
  documents: DeliveryApplicationDocuments;
  termsAccepted: boolean;
  emailVerificationToken?: string;
  phoneVerificationToken?: string;
}

export interface SubmitApplicationResponse {
  success: boolean;
  message: string;
  data: {
    applicationNumber: string;
    status: string;
    applicantName: string;
  };
}

export const onboardingApi = {
  /**
   * Send 6-digit verification code to applicant's email address
   */
  async sendOtp(email: string): Promise<SendOtpResponse["data"]> {
    const response = await apiClient.post<SendOtpResponse>("/delivery/onboarding/otp/send", {
      email,
    });
    return response.data.data;
  },

  /**
   * Verify email OTP with challenge token
   */
  async verifyOtp(challengeToken: string, otp: string): Promise<VerifyOtpResponse["data"]> {
    const response = await apiClient.post<VerifyOtpResponse>("/delivery/onboarding/otp/verify", {
      challengeToken,
      otp,
    });
    return response.data.data;
  },

  /**
   * Uploads verification document (image or PDF, max 10MB)
   */
  async uploadDocument(file: File, category: string): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append("document", file);
    formData.append("category", category);

    // Ensure CSRF token is attached for multipart form request
    const csrfToken = await getCsrfToken();
    const headers: Record<string, string> = {
      "Content-Type": "multipart/form-data",
    };
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    const response = await apiClient.post<{ success: boolean; data: DocumentItem }>(
      "/delivery/onboarding/upload-document",
      formData,
      { headers }
    );

    return response.data.data;
  },

  /**
   * Submit complete delivery partner onboarding application
   */
  async submitApplication(payload: SubmitApplicationPayload): Promise<SubmitApplicationResponse["data"]> {
    const response = await apiClient.post<SubmitApplicationResponse>(
      "/delivery/onboarding/submit",
      payload
    );
    return response.data.data;
  },

  /**
   * Check applicant status by application reference ID or phone
   */
  async getStatus(identifier: string): Promise<ApplicationStatusResponse> {
    const response = await apiClient.get<{ success: boolean; data: ApplicationStatusResponse }>(
      "/delivery/onboarding/status",
      {
        params: { identifier },
      }
    );
    return response.data.data;
  },
};
