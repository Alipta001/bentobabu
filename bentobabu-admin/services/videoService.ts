import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { VideoContent } from "@/types";

export interface CreateVideoPayload {
  title: string;
  slug?: string;
  description?: string;
  youtubeUrl: string;
  thumbnailUrl?: string;
  category: string;
  contentType: string;
  preparationMethods?: string[];
  dietaryTags?: string[];
  mealType?: string[];
  relatedProduct?: string;
  isFeatured?: boolean;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: string;
}

export const videoService = {
  /**
   * Helper to parse and extract video ID on the client for live preview
   */
  extractVideoId(url: string): { isValid: boolean; videoId?: string; error?: string } {
    if (!url || typeof url !== "string") {
      return { isValid: false, error: "Please enter a YouTube video URL." };
    }
    const trimmed = url.trim();
    const regex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmed.match(regex);
    if (!match || !match[1]) {
      return {
        isValid: false,
        error: "Invalid YouTube URL. Accepted formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...",
      };
    }
    return {
      isValid: true,
      videoId: match[1],
    };
  },

  getThumbnail(videoId: string): string {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  },

  getEmbedUrl(videoId: string): string {
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  },

  async getAll(params?: {
    status?: string;
    category?: string;
    contentType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: VideoContent[]; total: number; totalPages: number }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: VideoContent[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(ADMIN_API_ENDPOINTS.VIDEOS.LIST, { params });

    return {
      items: res.data.data,
      total: res.data.pagination?.total || res.data.data.length,
      totalPages: res.data.pagination?.totalPages || 1,
    };
  },

  async getById(id: string): Promise<VideoContent> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: VideoContent;
    }>(ADMIN_API_ENDPOINTS.VIDEOS.DETAIL(id));

    return res.data.data;
  },

  async create(data: CreateVideoPayload): Promise<VideoContent> {
    const res = await adminApiClient.post<{
      success: boolean;
      data: VideoContent;
    }>(ADMIN_API_ENDPOINTS.VIDEOS.CREATE, data);

    return res.data.data;
  },

  async update(id: string, data: Partial<CreateVideoPayload>): Promise<VideoContent> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: VideoContent;
    }>(ADMIN_API_ENDPOINTS.VIDEOS.UPDATE(id), data);

    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.VIDEOS.DELETE(id));
  },

  async updateStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<VideoContent> {
    const res = await adminApiClient.patch<{
      success: boolean;
      data: VideoContent;
    }>(ADMIN_API_ENDPOINTS.VIDEOS.TOGGLE_STATUS(id), { status });

    return res.data.data;
  },
};
