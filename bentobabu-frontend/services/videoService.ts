import apiClient from "@/api/axios/axios";
import { API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { VideoContent, VideoFilterOptions } from "@/types";

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface VideoListResponse {
  videos: VideoContent[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface VideoDetailResponse {
  video: VideoContent;
  relatedVideos: VideoContent[];
}

export const videoService = {
  async getAll(
    filters?: VideoFilterOptions,
    signal?: AbortSignal
  ): Promise<VideoListResponse> {
    try {
      const params: Record<string, unknown> = {};

      if (filters?.search && filters.search.trim()) {
        params.search = filters.search.trim();
      }
      if (filters?.category && filters.category !== "All") {
        params.category = filters.category;
      }
      if (filters?.contentType && filters.contentType !== "All") {
        params.contentType = filters.contentType;
      }
      if (filters?.preparationMethod && filters.preparationMethod !== "All") {
        params.preparationMethod = filters.preparationMethod;
      }
      if (filters?.dietaryTag && filters.dietaryTag !== "All") {
        params.dietaryTag = filters.dietaryTag;
      }
      if (filters?.isFeatured !== undefined) {
        params.isFeatured = filters.isFeatured;
      }
      if (filters?.page) params.page = filters.page;
      if (filters?.limit) params.limit = filters.limit;

      const response = await apiClient.get<ApiResponse<VideoListResponse>>(
        API_ENDPOINTS.VIDEOS.LIST,
        { params, signal }
      );

      const resData = response.data?.data;
      if (resData && Array.isArray(resData.videos)) {
        return {
          videos: resData.videos,
          pagination: resData.pagination,
        };
      }

      return {
        videos: Array.isArray(resData) ? (resData as unknown as VideoContent[]) : [],
      };
    } catch (error) {
      console.error("videoService.getAll failed:", error);
      return { videos: [] };
    }
  },

  async getFeatured(limit = 6): Promise<VideoContent[]> {
    try {
      const response = await apiClient.get<ApiResponse<{ videos: VideoContent[] }>>(
        API_ENDPOINTS.VIDEOS.FEATURED,
        { params: { limit } }
      );

      const resData = response.data?.data;
      if (resData && Array.isArray(resData.videos)) {
        return resData.videos;
      }
      return [];
    } catch (error) {
      console.error("videoService.getFeatured failed:", error);
      return [];
    }
  },

  async getBySlug(slug: string): Promise<VideoDetailResponse | null> {
    try {
      const response = await apiClient.get<ApiResponse<VideoDetailResponse>>(
        API_ENDPOINTS.VIDEOS.DETAIL(slug)
      );

      const resData = response.data?.data;
      if (resData && resData.video) {
        return resData;
      }
      return null;
    } catch (error) {
      console.error(`videoService.getBySlug(${slug}) failed:`, error);
      return null;
    }
  },
};
