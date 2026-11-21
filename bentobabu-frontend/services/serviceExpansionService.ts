import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";

export interface ServiceExpansionVotePayload {
  pincode: string;
  locality?: string;
  city?: string;
  state?: string;
  anonymousIdentifier?: string;
  customerName?: string;
  customerPhone?: string;
  source?: string;
}

export interface ServiceExpansionVoteResponse {
  success: boolean;
  alreadyVoted?: boolean;
  alreadyServiceable?: boolean;
  message: string;
  data?: {
    id: string;
    pincode: string;
    locality?: string;
    city?: string;
    state?: string;
    status: string;
  };
}

const ANON_ID_KEY = "bb_expansion_anon_id";
const VOTED_PINS_KEY = "bb_expansion_voted_pins";

export const serviceExpansionService = {
  /**
   * Retrieve or create a persistent anonymous identifier for guest voters
   */
  getAnonymousIdentifier(): string {
    if (typeof window === "undefined") return "server_guest";
    try {
      let id = localStorage.getItem(ANON_ID_KEY);
      if (!id) {
        id = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem(ANON_ID_KEY, id);
      }
      return id;
    } catch {
      return `anon_${Date.now()}`;
    }
  },

  /**
   * Check if user has already voted for this PIN code in this browser
   */
  hasVotedForPincode(pincode: string): boolean {
    if (typeof window === "undefined" || !pincode) return false;
    try {
      const stored = localStorage.getItem(VOTED_PINS_KEY);
      if (!stored) return false;
      const list: string[] = JSON.parse(stored);
      return Array.isArray(list) && list.includes(pincode.trim());
    } catch {
      return false;
    }
  },

  /**
   * Mark a PIN code as voted in local storage
   */
  markPincodeAsVoted(pincode: string): void {
    if (typeof window === "undefined" || !pincode) return;
    try {
      const stored = localStorage.getItem(VOTED_PINS_KEY);
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(pincode.trim())) {
        list.push(pincode.trim());
        localStorage.setItem(VOTED_PINS_KEY, JSON.stringify(list));
      }
    } catch {
      // Ignore localStorage errors
    }
  },

  /**
   * Send a service expansion vote to the backend
   */
  async vote(payload: ServiceExpansionVotePayload): Promise<ServiceExpansionVoteResponse> {
    const cleanPin = payload.pincode.trim();
    const anonId = payload.anonymousIdentifier || this.getAnonymousIdentifier();

    const response = await apiClient.post<ServiceExpansionVoteResponse>(
      API_ENDPOINTS.SERVICE_EXPANSION.VOTE,
      {
        ...payload,
        pincode: cleanPin,
        anonymousIdentifier: anonId,
      }
    );

    if (response.data?.success) {
      this.markPincodeAsVoted(cleanPin);
    }

    return response.data;
  },
};
