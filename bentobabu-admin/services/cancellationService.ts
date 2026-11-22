import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { CancellationRequest } from "@/types";

export interface CancellationFilterParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CancellationResponse {
  cancellationRequests: CancellationRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  pendingCount?: number;
}

export const cancellationService = {
  /**
   * Fetch all cancellation requests with optional filtering
   */
  async getAll(params?: CancellationFilterParams): Promise<CancellationResponse> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: CancellationResponse;
    }>(ADMIN_API_ENDPOINTS.CANCELLATIONS.LIST, { params });

    const data = res.data?.data || (res.data as unknown as CancellationResponse);
    return {
      cancellationRequests: Array.isArray(data?.cancellationRequests)
        ? data.cancellationRequests.map((req: any) => ({
            ...req,
            id: req._id || req.id,
          }))
        : [],
      pagination: data?.pagination || { page: 1, limit: 20, total: 0, pages: 1 },
      pendingCount: data?.pendingCount || 0,
    };
  },

  /**
   * Fetch details of a single cancellation request
   */
  async getById(id: string): Promise<CancellationRequest> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: { cancellationRequest: CancellationRequest };
    }>(ADMIN_API_ENDPOINTS.CANCELLATIONS.DETAIL(id));

    const item = res.data?.data?.cancellationRequest || (res.data as any);
    return {
      ...item,
      id: item._id || item.id,
    };
  },

  /**
   * Admin approves cancellation request: cancels order and initiates refund if paid
   */
  async approve(id: string): Promise<{ cancellationRequest: CancellationRequest; order: any }> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: { cancellationRequest: CancellationRequest; order: any };
    }>(ADMIN_API_ENDPOINTS.CANCELLATIONS.APPROVE(id));

    return res.data?.data;
  },

  /**
   * Admin rejects cancellation request with mandatory rejection reason
   */
  async reject(id: string, rejectionReason: string): Promise<{ cancellationRequest: CancellationRequest }> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: { cancellationRequest: CancellationRequest };
    }>(ADMIN_API_ENDPOINTS.CANCELLATIONS.REJECT(id), { rejectionReason });

    return res.data?.data;
  },

  /**
   * Admin retries failed Razorpay refund safely
   */
  async retryRefund(id: string): Promise<{ cancellationRequest: CancellationRequest; refund: any }> {
    const res = await adminApiClient.post<{
      success: boolean;
      message: string;
      data: { cancellationRequest: CancellationRequest; refund: any };
    }>(ADMIN_API_ENDPOINTS.CANCELLATIONS.RETRY_REFUND(id));

    return res.data?.data;
  },
};
