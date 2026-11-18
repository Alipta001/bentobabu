import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { Review, AdminReviewStats, ReviewStatus } from "@/types";

export interface GetAdminReviewsParams {
  page?: number;
  limit?: number;
  rating?: string;
  status?: string;
  search?: string;
  productId?: string;
}

export const reviewService = {
  /**
   * Fetch paginated customer reviews with filters and search
   */
  async getAll(params?: GetAdminReviewsParams): Promise<{
    reviews: Review[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: Review[];
      total: number;
      totalPages: number;
      page: number;
    }>(ADMIN_API_ENDPOINTS.REVIEWS.LIST, { params });

    const reviews = (res.data?.data || []).map((r) => ({
      ...r,
      // Provide compatibility fallbacks
      productName: r.product?.name || r.productName || "Product",
      customerName: r.customer?.name || r.customerName || "Customer",
    }));

    return {
      reviews,
      total: res.data?.total || 0,
      totalPages: res.data?.totalPages || 1,
      currentPage: res.data?.page || 1,
    };
  },

  /**
   * Fetch review moderation metrics & rating breakdown
   */
  async getStats(): Promise<AdminReviewStats> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: AdminReviewStats;
    }>(ADMIN_API_ENDPOINTS.REVIEWS.STATS);

    return (
      res.data?.data || {
        totalCount: 0,
        approvedCount: 0,
        hiddenCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        averageRating: 0,
        ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      }
    );
  },

  /**
   * Moderate review status (APPROVED, HIDDEN, REJECTED)
   */
  async updateStatus(
    id: string,
    status: ReviewStatus,
    moderationNote?: string
  ): Promise<Review> {
    const res = await adminApiClient.patch<{
      success: boolean;
      message: string;
      data: Review;
    }>(ADMIN_API_ENDPOINTS.REVIEWS.UPDATE_STATUS(id), {
      status,
      moderationNote,
    });

    return res.data?.data;
  },

  /**
   * Quick toggle between approved and hidden
   */
  async toggleApproval(id: string, isCurrentlyApproved: boolean): Promise<Review> {
    const targetStatus: ReviewStatus = isCurrentlyApproved ? "HIDDEN" : "APPROVED";
    return this.updateStatus(id, targetStatus);
  },

  /**
   * Delete review permanently
   */
  async deleteReview(id: string): Promise<boolean> {
    const res = await adminApiClient.delete<{
      success: boolean;
      message: string;
    }>(ADMIN_API_ENDPOINTS.REVIEWS.DELETE(id));

    return Boolean(res.data?.success);
  },
};
