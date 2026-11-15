"use client";

import React, { useState, useRef } from "react";
import { Video, UploadCloud, X, RefreshCw, AlertCircle, CheckCircle2, Play } from "lucide-react";
import { mediaService } from "@/services/mediaService";
import { ProductVideo } from "@/types";

interface MediaVideoUploadProps {
  productId?: string;
  initialVideo?: ProductVideo | null;
  posterUrl?: string;
  onChange: (video: ProductVideo | null) => void;
}

export function MediaVideoUpload({
  productId,
  initialVideo = null,
  posterUrl,
  onChange,
}: MediaVideoUploadProps) {
  const [video, setVideo] = useState<ProductVideo | null>(initialVideo);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // 1. Validate MIME type
    const validTypes = ["video/mp4", "video/webm"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setError("Only MP4 and WebM video formats are supported.");
      return;
    }

    // 2. Validate Size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(`Video size (${formatBytes(file.size)}) exceeds the maximum allowed 50 MB limit.`);
      return;
    }

    // 3. Validate Duration (max 60s) via temporary video element
    const videoUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = videoUrl;

    tempVideo.onloadedmetadata = async () => {
      URL.revokeObjectURL(videoUrl);
      const duration = Math.round(tempVideo.duration);

      if (duration > 60) {
        setError(`Video duration (${duration}s) exceeds the maximum allowed 60 seconds limit.`);
        return;
      }

      // Proceed with direct R2 upload
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const uploadedVideo = await mediaService.uploadVideoWithProgress({
          file,
          productId,
          posterUrl,
          durationSeconds: duration,
          onProgress: (percent) => setUploadProgress(percent),
        });

        setVideo(uploadedVideo);
        onChange(uploadedVideo);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || "Failed to upload video to Cloudflare R2.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    tempVideo.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      setError("Failed to decode video file. File may be corrupted.");
    };
  };

  const handleRemove = async () => {
    if (!video) return;

    const oldMediaId = video.mediaId;
    setVideo(null);
    onChange(null);

    if (oldMediaId) {
      try {
        await mediaService.deleteVideo(oldMediaId);
      } catch (err) {
        console.warn("Could not delete from R2 immediately:", err);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-[#1F271F] text-xs flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5 text-[#354B35]" />
          <span>Food Video Presentation (Cloudflare R2 Direct Upload)</span>
        </label>
        {video && (
          <span className="text-[10px] text-[#354B35] bg-[#E8EFE8] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#354B35]" />
            Active ({formatBytes(video.sizeBytes)} • {video.durationSeconds || 0}s)
          </span>
        )}
      </div>

      {video ? (
        <div className="relative rounded-2xl overflow-hidden border border-[#E5DFC5] bg-black/90 aspect-video flex items-center justify-center group">
          <video
            src={video.secureUrl}
            poster={video.posterUrl || posterUrl || undefined}
            controls
            preload="metadata"
            className="w-full h-full object-contain max-h-56"
          />
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 bg-red-600/90 text-white rounded-full hover:bg-red-700 cursor-pointer shadow-xs text-xs flex items-center gap-1"
              title="Remove video"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-colors ${
            isUploading
              ? "border-[#354B35] bg-[#E8EFE8]/30 cursor-wait"
              : "border-[#E5DFC5] hover:border-[#354B35] bg-[#F7F3EA]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <div className="flex flex-col items-center justify-center gap-1.5">
            {isUploading ? (
              <div className="w-full max-w-xs space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#354B35]">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Uploading directly to Cloudflare R2...
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-[#E5DFC5] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#354B35] h-2 rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-[10px] text-[#667266]">
                  Presigned direct PUT bypasses backend server to preserve bandwidth
                </div>
              </div>
            ) : (
              <>
                <UploadCloud className="w-6 h-6 text-[#354B35]" />
                <div className="text-xs font-semibold text-[#1F271F]">
                  Upload Food Showcase Video (.mp4 / .webm)
                </div>
                <div className="text-[10px] text-[#667266]">
                  Max 50 MB • Max 60 seconds duration • Streamed from Cloudflare R2
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 p-2 rounded-xl border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
