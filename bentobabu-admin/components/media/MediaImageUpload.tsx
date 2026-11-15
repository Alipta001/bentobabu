"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, X, RefreshCw, AlertCircle, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { mediaService, UploadImageResponse } from "@/services/mediaService";
import { ProductMediaImage } from "@/types";

interface MediaImageUploadProps {
  label?: string;
  folder?: string;
  productId?: string;
  categoryId?: string;
  initialImages?: ProductMediaImage[];
  initialImageUrl?: string;
  maxFiles?: number;
  onChange: (images: ProductMediaImage[], primaryUrl: string) => void;
}

export function MediaImageUpload({
  label = "Food Images (Cloudinary)",
  folder = "bentobabu/products",
  productId,
  categoryId,
  initialImages = [],
  initialImageUrl,
  maxFiles = 4,
  onChange,
}: MediaImageUploadProps) {
  const [images, setImages] = useState<ProductMediaImage[]>(() => {
    if (initialImages && initialImages.length > 0) return initialImages;
    if (initialImageUrl) {
      return [{ publicId: "legacy", secureUrl: initialImageUrl }];
    }
    return [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavings, setLastSavings] = useState<{
    originalSize: number;
    optimizedSize: number;
    savingsPercent: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (images.length + files.length > maxFiles) {
      setError(`You can only upload up to ${maxFiles} images.`);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const updatedImages = [...images];
      let latestSavings = null;

      for (const file of files) {
        // Validate MIME type
        const validTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!validTypes.includes(file.type.toLowerCase())) {
          throw new Error(`Unsupported file type: ${file.name}. Only JPEG, PNG, and WebP are allowed.`);
        }

        // Validate max size (8MB)
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`File ${file.name} exceeds 8 MB size limit.`);
        }

        const res: UploadImageResponse = await mediaService.uploadImage(
          file,
          folder,
          productId,
          categoryId
        );

        updatedImages.push({
          publicId: res.media.publicId || "",
          secureUrl: res.deliveryUrls?.card || res.media.secureUrl,
          format: res.media.format,
          sizeBytes: res.optimizedSize,
          width: res.media.width,
          height: res.media.height,
        });

        latestSavings = {
          originalSize: res.originalSize,
          optimizedSize: res.optimizedSize,
          savingsPercent: res.savingsPercent,
        };
      }

      setImages(updatedImages);
      setLastSavings(latestSavings);
      const primaryUrl = updatedImages[0]?.secureUrl || "";
      onChange(updatedImages, primaryUrl);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to upload image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async (index: number) => {
    const itemToRemove = images[index];
    const updated = images.filter((_, idx) => idx !== index);
    setImages(updated);
    onChange(updated, updated[0]?.secureUrl || "");

    if (itemToRemove?.publicId && itemToRemove.publicId !== "legacy") {
      try {
        await mediaService.deleteImage(itemToRemove.publicId);
      } catch (err) {
        console.warn("Could not delete from Cloudinary immediately:", err);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-[#1F271F] text-xs flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-[#354B35]" />
          <span>{label}</span>
          <span className="text-[10px] text-[#667266] font-normal">
            ({images.length}/{maxFiles} WebP Auto-Optimized)
          </span>
        </label>
        {lastSavings && (
          <span className="text-[10px] text-[#354B35] bg-[#E8EFE8] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-[#354B35]" />
            Saved {lastSavings.savingsPercent}% ({formatBytes(lastSavings.originalSize)} →{" "}
            {formatBytes(lastSavings.optimizedSize)})
          </span>
        )}
      </div>

      {/* Grid of uploaded images */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img, idx) => (
            <div
              key={idx}
              className="relative group rounded-xl overflow-hidden border border-[#E5DFC5] bg-[#F7F3EA] aspect-square flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.secureUrl}
                alt="Product Preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1 left-1 bg-black/60 text-[9px] text-white px-1.5 py-0.5 rounded font-mono">
                {idx === 0 ? "Cover" : `#${idx + 1}`}
              </div>
              {img.sizeBytes && (
                <div className="absolute bottom-1 right-1 bg-black/60 text-[9px] text-white px-1.5 py-0.5 rounded font-mono">
                  {formatBytes(img.sizeBytes)}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 cursor-pointer shadow-xs"
                title="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dropzone */}
      {images.length < maxFiles && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-colors ${
            isUploading
              ? "border-[#354B35] bg-[#E8EFE8]/30"
              : "border-[#E5DFC5] hover:border-[#354B35] bg-[#F7F3EA]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={maxFiles > 1}
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          <div className="flex flex-col items-center justify-center gap-1.5">
            {isUploading ? (
              <>
                <RefreshCw className="w-5 h-5 text-[#354B35] animate-spin" />
                <span className="text-xs font-semibold text-[#354B35]">
                  Optimizing & Uploading to Cloudinary...
                </span>
                <span className="text-[10px] text-[#667266]">
                  Converting to WebP & stripping metadata for max compression
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="w-6 h-6 text-[#354B35]" />
                <div className="text-xs font-semibold text-[#1F271F]">
                  Click or drag images to upload
                </div>
                <div className="text-[10px] text-[#667266]">
                  JPEG, PNG, WebP up to 8 MB • Max 1800x1800px auto-scaled
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
