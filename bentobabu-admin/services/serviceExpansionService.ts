import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  ServiceExpansionSummaryResponse,
  ServiceExpansionLocationsResponse,
  ServiceExpansionLocationItem,
} from "@/types";

export interface ExpansionFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: "votes" | "lastVotedAt" | "pincode";
  sortOrder?: "asc" | "desc";
  periodDays?: number;
}

export const serviceExpansionService = {
  /**
   * Get overall expansion voting statistics
   */
  async getSummary(periodDays: number = 30): Promise<ServiceExpansionSummaryResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: ServiceExpansionSummaryResponse;
    }>(ADMIN_API_ENDPOINTS.SERVICE_EXPANSION.SUMMARY, {
      params: { periodDays },
    });
    return res.data.data;
  },

  /**
   * Get ranked locations requested by customers
   */
  async getLocations(params?: ExpansionFilterParams): Promise<ServiceExpansionLocationsResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: ServiceExpansionLocationsResponse;
    }>(ADMIN_API_ENDPOINTS.SERVICE_EXPANSION.LOCATIONS, {
      params,
    });
    return res.data.data;
  },

  /**
   * Get detailed votes breakdown for a specific PIN code / location
   */
  async getLocationById(id: string): Promise<{
    location: ServiceExpansionLocationItem;
    recentVotes: Array<{
      id: string;
      customerName: string;
      customerPhone: string;
      votedAt: string;
      source: string;
    }>;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: {
        location: ServiceExpansionLocationItem;
        recentVotes: Array<{
          id: string;
          customerName: string;
          customerPhone: string;
          votedAt: string;
          source: string;
        }>;
      };
    }>(ADMIN_API_ENDPOINTS.SERVICE_EXPANSION.DETAIL(id));
    return res.data.data;
  },

  /**
   * Update internal status or notes for a requested expansion location
   */
  async updateStatus(
    id: string,
    payload: { status?: string; internalNotes?: string }
  ): Promise<{ pincode: string; status?: string; internalNotes?: string }> {
    const res = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: { pincode: string; status?: string; internalNotes?: string };
    }>(ADMIN_API_ENDPOINTS.SERVICE_EXPANSION.UPDATE_STATUS(id), payload);
    return res.data.data;
  },

  /**
   * Trigger direct CSV export download
   */
  async exportCsv(): Promise<void> {
    const response = await adminApiClient.get(
      ADMIN_API_ENDPOINTS.SERVICE_EXPANSION.EXPORT,
      { responseType: "blob" }
    );
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bentobabu-service-expansion-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
