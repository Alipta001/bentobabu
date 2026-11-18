"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Star,
  X,
  Upload,
  ShieldCheck,
  Loader2,
  Trash2,
  AlertCircle,
  PackageCheck,
} from "lucide-react";
import { ReviewImage, ReviewEligibilityResponse } from "@/types";
import { reviewService } from "@/services/reviewService";

interface ReviewModalProps {
  productId: string;
  productName: string;
  eligibility: ReviewEligibilityResponse;
  initialReview?: {
    id: string;
    rating: number;
    title?: string;
    comment: string;
    images?: ReviewImage[];
    orderId?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: "Poor — Disappointing taste or quality",
  2: "Fair — Needs improvement",
  3: "Good — Satisfactory meal",
  4: "Very Good — Delicious & nutritious",
  5: "Excellent — Outstanding gourmet bento!",
};

export function ReviewModal({
  productId,
  productName,
  eligibility,
  initialReview,
  isOpen,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const isEditing = Boolean(initialReview?.id);

  const [rating, setRating] = useState<number>(initialReview?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState<string>(initialReview?.title || "");
  const [comment, setComment] = useState<string>(initialReview?.comment || "");
  const [orderId, setOrderId] = useState<string>(
    initialReview?.orderId || eligibility.eligibleOrders[0]?.id || ""
  );
  const [images, setImages] = useState<ReviewImage[]>(initialReview?.images || []);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (images.length >= 3) {
      setError("Maximum 3 photos allowed per review.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB.");
      return;
    }

    setUploadingImage(true);
    setError("");

    try {
      const uploaded = await reviewService.uploadReviewImage(file);
      setImages((prev) => [...prev, { url: uploaded.url, publicId: uploaded.publicId }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload photo. Please try again.");
    } finally {
      setUploadingImage(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!rating || rating < 1 || rating > 5) {
      setError("Please select a rating between 1 and 5 stars.");
      return;
    }

    if (!comment.trim() || comment.trim().length < 5) {
      setError("Please provide a review comment with at least 5 characters.");
      return;
    }

    if (!isEditing && !orderId) {
      setError("Please select the order for which you are submitting this review.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && initialReview?.id) {
        await reviewService.updateReview(initialReview.id, {
          rating,
          title: title.trim() || undefined,
          comment: comment.trim(),
          images,
        });
      } else {
        await reviewService.submitReview({
          productId,
          orderId,
          rating,
          title: title.trim() || undefined,
          comment: comment.trim(),
          images,
        });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to submit review. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeStarCount = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#FDFBF7] rounded-3xl shadow-2xl border border-[#E5DFC5] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 bg-white border-b border-[#E5DFC5] flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Purchase Review</span>
            </div>
            <h3 className="font-serif text-lg sm:text-xl font-bold text-[#222922]">
              {isEditing ? "Edit Your Review" : "Rate & Review"}
            </h3>
            <p className="text-xs text-[#6B776A] truncate max-w-sm">{productName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#8A9A86] hover:text-[#222922] hover:bg-[#F7F3EA] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Star Rating Picker */}
          <div className="space-y-1.5 text-center py-2 bg-white rounded-2xl border border-[#E5DFC5] p-4">
            <span className="text-xs font-bold text-[#354B35] uppercase tracking-wider block">
              Overall Experience *
            </span>
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {[1, 2, 3, 4, 5].map((starVal) => {
                const isFilled = starVal <= activeStarCount;
                return (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRating(starVal)}
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-amber-400 hover:scale-115 transition-transform cursor-pointer"
                    aria-label={`Rate ${starVal} out of 5 stars`}
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        isFilled
                          ? "fill-amber-400 text-amber-500 drop-shadow-xs"
                          : "text-[#D8D2C2]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <div className="text-xs font-semibold text-[#8C713B] min-h-[20px] transition-all">
              {RATING_LABELS[activeStarCount] || "Tap a star to rate"}
            </div>
          </div>

          {/* Order Selection (if not editing and multiple delivered orders exist) */}
          {!isEditing && eligibility.eligibleOrders.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-[#354B35] mb-1">
                Verified Order *
              </label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-white text-xs font-medium text-[#222922] focus:outline-hidden focus:border-[#354B35]"
              >
                {eligibility.eligibleOrders.map((ord) => (
                  <option key={ord.id} value={ord.id}>
                    Order #{ord.orderNumber} (Delivered{" "}
                    {new Date(ord.deliveredAt).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                    })}
                    )
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Review Title */}
          <div>
            <label className="block text-xs font-bold text-[#354B35] mb-1">
              Review Title (Optional)
            </label>
            <input
              type="text"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Delicious seasoning & super fresh!"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E2D2] bg-white text-xs text-[#222922] placeholder:text-[#8A9A86] focus:outline-hidden focus:border-[#354B35]"
            />
          </div>

          {/* Review Comment */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#354B35]">
                Your Review *
              </label>
              <span className="text-[11px] text-[#8A9A86]">
                {comment.length} / 1000
              </span>
            </div>
            <textarea
              required
              rows={4}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How was the taste, freshness, and packaging? Would you order it again?"
              className="w-full p-3.5 rounded-xl border border-[#E8E2D2] bg-white text-xs text-[#222922] placeholder:text-[#8A9A86] focus:outline-hidden focus:border-[#354B35] resize-none"
            />
          </div>

          {/* Photo Uploads */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#354B35]">
                Add Photos ({images.length}/3)
              </label>
              <span className="text-[10px] text-[#8A9A86]">Max 5MB per photo</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Existing Uploaded Thumbnails */}
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="relative w-18 h-18 rounded-2xl overflow-hidden border border-[#E5DFC5] group bg-white shadow-xs"
                >
                  <Image
                    src={img.url}
                    alt={`Review photo ${idx + 1}`}
                    fill
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition-colors"
                    aria-label="Remove image"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Upload Trigger Button */}
              {images.length < 3 && (
                <label className="w-18 h-18 rounded-2xl border-2 border-dashed border-[#DFC89B] hover:border-[#354B35] bg-[#F7F3EA] flex flex-col items-center justify-center cursor-pointer transition-colors text-center p-1">
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 text-[#354B35] animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-[#8C713B]" />
                      <span className="text-[10px] font-semibold text-[#8C713B] mt-1">
                        Upload
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingImage}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Verified Purchase Assurance */}
          <div className="p-3 bg-[#EBF0E9] rounded-2xl flex items-center gap-2.5 text-xs text-[#243324]">
            <PackageCheck className="w-4 h-4 text-[#354B35] shrink-0" />
            <span className="text-[11px] leading-snug">
              Verified review for BentoBabu Kitchen. Only genuine customers who have ordered this dish can submit reviews.
            </span>
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E5DFC5]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-full border border-[#E5DFC5] text-xs font-bold text-[#667266] hover:bg-[#F7F3EA] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImage || comment.trim().length < 5}
              className="px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{submitting ? "Submitting..." : isEditing ? "Save Changes" : "Submit Review"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
