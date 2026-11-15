import axios from "axios";
import adminApiClient from "@/api/axios/axios";
import { ADMIN_API_ENDPOINTS } from "@/api/endPoints/endPoints";
import { MediaAsset, MediaUsageStats, ProductMediaImage, ProductVideo } from "@/types";

export interface UploadImageResponse {
  media: MediaAsset;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
  deliveryUrls: {
    thumbnail: string;
    card: string;
    detail: string;
    original: string;
  };
}

export interface VideoUploadProgressCallback {
  (percentage: number): void;
}

export const mediaService = {
  /**
   * Upload and optimize an image via backend to Cloudinary
   */
  async uploadImage(
    file: File,
    folder: string = "bentobabu/products",
    productId?: string,
    categoryId?: string
  ): Promise<UploadImageResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    if (productId) formData.append("productId", productId);
    if (categoryId) formData.append("categoryId", categoryId);

    const res = await adminApiClient.post<{ success: boolean; data: UploadImageResponse }>(
      ADMIN_API_ENDPOINTS.MEDIA.UPLOAD_IMAGE,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return res.data.data;
  },

  /**
   * Delete an image from Cloudinary and catalog
   */
  async deleteImage(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.MEDIA.DELETE_IMAGE(id));
  },

  /**
   * Upload video directly to Cloudflare R2 using presigned PUT URL with progress tracking
   */
  async uploadVideoWithProgress(params: {
    file: File;
    productId?: string;
    posterUrl?: string;
    durationSeconds?: number;
    onProgress?: VideoUploadProgressCallback;
  }): Promise<ProductVideo> {
    const { file, productId, posterUrl, durationSeconds, onProgress } = params;

    // 1. Initialize video upload with backend to get presigned PUT URL
    const initRes = await adminApiClient.post<{
      success: boolean;
      data: {
        mediaId: string;
        uploadUrl: string;
        objectKey: string;
        publicUrl: string;
        expiresIn: number;
      };
    }>(ADMIN_API_ENDPOINTS.MEDIA.INITIALIZE_VIDEO, {
      productId,
      filename: file.name,
      contentType: file.type || "video/mp4",
      sizeBytes: file.size,
      durationSeconds: durationSeconds || 0,
    });

    const { mediaId, uploadUrl, objectKey, publicUrl } = initRes.data.data;

    // 2. Direct browser-to-R2 upload with progress tracking
    await axios.put(uploadUrl, file, {
      headers: {
        "Content-Type": file.type || "video/mp4",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    // 3. Confirm video upload with backend for server-side verification and activation
    const confirmRes = await adminApiClient.post<{
      success: boolean;
      data: MediaAsset;
    }>(ADMIN_API_ENDPOINTS.MEDIA.CONFIRM_VIDEO, {
      mediaId,
      productId,
      posterUrl,
    });

    const confirmedMedia = confirmRes.data.data;

    return {
      secureUrl: confirmedMedia.secureUrl || publicUrl,
      objectKey: confirmedMedia.objectKey || objectKey,
      mimeType: confirmedMedia.mimeType || file.type || "video/mp4",
      sizeBytes: confirmedMedia.sizeBytes || file.size,
      durationSeconds: confirmedMedia.durationSeconds || durationSeconds || 0,
      posterUrl: posterUrl || null,
      mediaId,
    };
  },

  /**
   * Delete a video from Cloudflare R2 and catalog
   */
  async deleteVideo(id: string): Promise<void> {
    await adminApiClient.delete(ADMIN_API_ENDPOINTS.MEDIA.DELETE_VIDEO(id));
  },

  /**
   * Fetch storage and bandwidth usage statistics
   */
  async getUsage(): Promise<MediaUsageStats> {
    const res = await adminApiClient.get<{ success: boolean; data: MediaUsageStats }>(
      ADMIN_API_ENDPOINTS.MEDIA.USAGE
    );
    return res.data.data;
  },

  /**
   * List media assets
   */
  async listMedia(params?: {
    provider?: string;
    mediaType?: string;
    productId?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: MediaAsset[]; total: number }> {
    const res = await adminApiClient.get<{
      success: boolean;
      data: MediaAsset[];
      pagination: { total: number };
    }>(ADMIN_API_ENDPOINTS.MEDIA.LIST, { params });

    return {
      items: res.data.data,
      total: res.data.pagination?.total || res.data.data.length,
    };
  },
};
