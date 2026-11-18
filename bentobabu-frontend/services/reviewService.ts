import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import {
  CustomerReview,
  ReviewSummary,
  ReviewEligibilityResponse,
  SubmitReviewPayload,
  ReviewImage,
} from "@/types";

export interface GetProductReviewsParams {
  page?: number;
  limit?: number;
  rating?: number;
  sort?: "newest" | "highest" | "lowest";
}

export interface GetProductReviewsResponse {
  reviews: CustomerReview[];
  summary: ReviewSummary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const reviewService = {
  /**
   * Fetch approved reviews and rating summary for a product
   */
  async getProductReviews(
    productId: string,
    params?: GetProductReviewsParams
  ): Promise<GetProductReviewsResponse> {
    const response = await apiClient.get<{
      success: boolean;
      data: GetProductReviewsResponse;
    }>(API_ENDPOINTS.REVIEWS.PRODUCT(productId), { params });

    return (
      response.data.data || {
        reviews: [],
        summary: {
          productId,
          totalReviews: 0,
          averageRating: 0,
          distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }
    );
  },

  /**
   * Check if current authenticated customer is eligible to review a product
   */
  async checkEligibility(productId: string): Promise<ReviewEligibilityResponse> {
    const response = await apiClient.get<{
      success: boolean;
      data: ReviewEligibilityResponse;
    }>(API_ENDPOINTS.REVIEWS.ELIGIBILITY(productId));

    return response.data.data;
  },

  /**
   * Submit a new verified review
   */
  async submitReview(payload: SubmitReviewPayload): Promise<{
    id: string;
    rating: number;
    title?: string;
    comment: string;
    summary: ReviewSummary;
  }> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(API_ENDPOINTS.REVIEWS.SUBMIT, payload);

    return response.data.data;
  },

  /**
   * Update an existing review
   */
  async updateReview(
    id: string,
    payload: {
      rating?: number;
      title?: string;
      comment?: string;
      images?: ReviewImage[];
    }
  ): Promise<{
    id: string;
    rating: number;
    title?: string;
    comment: string;
    summary: ReviewSummary;
  }> {
    const response = await apiClient.put<{
      success: boolean;
      message: string;
      data: any;
    }>(API_ENDPOINTS.REVIEWS.UPDATE(id), payload);

    return response.data.data;
  },

  /**
   * Fetch customer's own submitted reviews
   */
  async getMyReviews(): Promise<any[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: any[];
    }>(API_ENDPOINTS.REVIEWS.MY_REVIEWS);

    return response.data.data || [];
  },

  /**
   * Upload review photo
   */
  async uploadReviewImage(file: File): Promise<{
    url: string;
    publicId?: string;
  }> {
    const formData = new FormData();
    formData.append("image", file);

    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: {
        url: string;
        publicId?: string;
      };
    }>(API_ENDPOINTS.REVIEWS.UPLOAD_IMAGE, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data.data;
  },
};
