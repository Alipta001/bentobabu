"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  Star,
  ShieldCheck,
  MessageSquare,
  ThumbsUp,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Filter,
  ArrowUpDown,
  X,
  ExternalLink,
  ChevronDown,
  Edit2,
  Sparkles,
} from "lucide-react";
import {
  CustomerReview,
  ReviewSummary,
  ReviewEligibilityResponse,
  ReviewImage,
} from "@/types";
import { reviewService } from "@/services/reviewService";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { buildLoginUrl } from "@/lib/authRedirect";
import { ReviewModal } from "./ReviewModal";

interface ProductReviewsSectionProps {
  productId: string;
  productName: string;
}

export function ProductReviewsSection({
  productId,
  productName,
}: ProductReviewsSectionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status } = useAuth();
  const { showToast } = useToast();

  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({
    productId,
    totalReviews: 0,
    averageRating: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
  const [loading, setLoading] = useState(true);

  // Filters & sorting
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined);
  const [sortOption, setSortOption] = useState<"newest" | "highest" | "lowest">("newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Eligibility & Review Modal State
  const [eligibility, setEligibility] = useState<ReviewEligibilityResponse | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<any>(null);

  // Lightbox for photos
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Load reviews
  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reviewService.getProductReviews(productId, {
        page,
        limit: 10,
        rating: ratingFilter,
        sort: sortOption,
      });

      setReviews(data.reviews);
      setSummary(data.summary);
      setTotalPages(data.pagination.totalPages);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [productId, page, ratingFilter, sortOption]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Handle Write Review Click
  const handleWriteReviewClick = async () => {
    if (status !== "authenticated" || !user) {
      router.push(buildLoginUrl(pathname));
      return;
    }

    setCheckingEligibility(true);
    try {
      const eligData = await reviewService.checkEligibility(productId);
      setEligibility(eligData);

      if (eligData.canReview) {
        setEditingReview(null);
        setModalOpen(true);
      } else if (eligData.isEligible && eligData.existingReviews.length > 0) {
        // Already reviewed this order, allow editing existing review
        const existing = eligData.existingReviews[0];
        setEditingReview({
          id: existing.id,
          rating: existing.rating,
          title: existing.title,
          comment: existing.comment,
          images: existing.images,
          orderId: existing.orderId,
        });
        setModalOpen(true);
      } else {
        showToast({
          title: "Verified Purchase Required",
          message:
            "Reviews can only be submitted after receiving your order. Order this bento today to share your verified review!",
          type: "info",
        });
      }
    } catch (err: unknown) {
      showToast({
        title: "Could not verify purchase",
        message: err instanceof Error ? err.message : "Please try again later.",
        type: "error",
      });
    } finally {
      setCheckingEligibility(false);
    }
  };

  const handleReviewSubmitted = () => {
    showToast({
      title: "Review Published",
      message: "Thank you for sharing your verified review with BentoBabu!",
      type: "success",
    });
    loadReviews();
  };

  const totalReviews = summary.totalReviews;
  const avgRating = summary.averageRating || 0;

  return (
    <section className="space-y-8 pt-8 border-t border-[#E5DFC5]" id="reviews-section">
      {/* Section Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
              Verified Customer Ratings
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF0E9] text-[#243324]">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              100% Genuine Buyers
            </span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#243324]">
            Taste & Quality Reviews
          </h2>
        </div>

        <button
          type="button"
          onClick={handleWriteReviewClick}
          disabled={checkingEligibility}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold hover:bg-[#253525] transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Sparkles className="w-4 h-4 text-[#DFC89B]" />
          <span>{checkingEligibility ? "Checking Order..." : "Write a Verified Review"}</span>
        </button>
      </div>

      {/* Rating Overview & Distribution Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Big Score Box */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center text-center p-6 bg-[#FDFBF7] rounded-2xl border border-[#E8E2D2]">
            <div className="font-serif text-5xl sm:text-6xl font-black text-[#243324]">
              {totalReviews > 0 ? avgRating.toFixed(1) : "—"}
            </div>

            <div className="flex items-center gap-1.5 text-amber-500 my-2">
              {[1, 2, 3, 4, 5].map((starVal) => (
                <Star
                  key={starVal}
                  className={`w-5 h-5 ${
                    totalReviews > 0 && starVal <= Math.round(avgRating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>

            <div className="text-xs font-semibold text-[#667266]">
              {totalReviews > 0
                ? `Based on ${totalReviews} verified dining experience${
                    totalReviews > 1 ? "s" : ""
                  }`
                : "No reviews yet"}
            </div>

            <div className="mt-3 pt-3 border-t border-[#E8E2D2] flex items-center gap-2 text-[11px] text-[#354B35] font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Delivered Purchases Only</span>
            </div>
          </div>

          {/* Star Distribution Breakdown */}
          <div className="lg:col-span-8 space-y-2.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.distribution[stars as keyof typeof summary.distribution] || 0;
              const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;

              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 w-16 shrink-0 font-bold text-[#222922]">
                    <span>{stars}</span>
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  </div>

                  <div className="flex-1 h-3 rounded-full bg-[#EDE8DE] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-[#755C2B] rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <div className="w-12 text-right text-[11px] font-medium text-[#667266] shrink-0">
                    {percentage}%
                  </div>
                  <div className="w-10 text-right text-[11px] font-bold text-[#354B35] shrink-0">
                    ({count})
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter and Sort Toolbar */}
      {totalReviews > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Star Rating Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRatingFilter(undefined);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                ratingFilter === undefined
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
              }`}
            >
              All Reviews ({totalReviews})
            </button>

            {[5, 4, 3, 2, 1].map((st) => {
              const count = summary.distribution[st as keyof typeof summary.distribution] || 0;
              if (count === 0 && ratingFilter !== st) return null;

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setRatingFilter(ratingFilter === st ? undefined : st);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    ratingFilter === st
                      ? "bg-[#354B35] text-white shadow-xs"
                      : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
                  }`}
                >
                  <span>{st}</span>
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span className="opacity-70 text-[10px]">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <span className="text-xs text-[#8A9A86] font-medium">Sort by:</span>
            <select
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-1.5 bg-white border border-[#E5DFC5] rounded-xl text-xs font-semibold text-[#222922] cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="highest">Highest Rating</option>
              <option value="lowest">Lowest Rating</option>
            </select>
          </div>
        </div>
      )}

      {/* Review Cards Feed */}
      {loading ? (
        <div className="py-12 text-center text-[#8A9A86] space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-[#354B35] border-t-transparent animate-spin mx-auto" />
          <span className="text-xs font-medium">Loading genuine customer reviews...</span>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-[#E5DFC5] shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#F7F3EA] text-[#354B35] flex items-center justify-center mx-auto">
            <MessageSquare className="w-7 h-7 text-[#B99A60]" />
          </div>
          <h3 className="font-serif text-lg font-bold text-[#222922]">
            {ratingFilter ? `No ${ratingFilter}-Star Reviews Found` : "No Customer Reviews Yet"}
          </h3>
          <p className="text-xs text-[#6B776A] max-w-md mx-auto leading-relaxed">
            {ratingFilter
              ? "There are currently no reviews matching this specific star rating."
              : "Have you ordered this nutritious bento? Be the first verified customer to share your dining experience and help fellow health enthusiasts!"}
          </p>
          <button
            type="button"
            onClick={handleWriteReviewClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-bold hover:bg-[#253525] transition-all shadow-xs cursor-pointer mt-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#DFC89B]" />
            <span>Be the First to Review</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs hover:border-[#354B35]/30 transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                {/* Author & Rating Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#354B35] to-[#4B644B] text-[#DFC89B] flex items-center justify-center font-bold text-xs shadow-xs">
                      {rev.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[#222922]">{rev.authorName}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#8A9A86]">
                        <span>
                          {new Date(rev.createdAt).toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {rev.isVerifiedPurchase && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF0E9] text-emerald-800 border border-emerald-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Verified Buyer</span>
                    </span>
                  )}
                </div>

                {/* Stars */}
                <div className="flex items-center gap-1 text-amber-500">
                  {[1, 2, 3, 4, 5].map((starVal) => (
                    <Star
                      key={starVal}
                      className={`w-3.5 h-3.5 ${
                        starVal <= rev.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>

                {/* Review Title & Content */}
                {rev.title && (
                  <h4 className="font-serif text-sm font-bold text-[#222922]">
                    {rev.title}
                  </h4>
                )}

                <p className="text-xs text-[#4F5B4F] leading-relaxed whitespace-pre-line">
                  {rev.comment}
                </p>

                {/* Photo Attachments */}
                {rev.images && rev.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {rev.images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePhoto(img.url)}
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#E5DFC5] hover:scale-105 transition-transform cursor-pointer"
                      >
                        <Image
                          src={img.url}
                          alt="Review photo thumbnail"
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-full border border-[#E5DFC5] bg-white text-xs font-bold text-[#354B35] disabled:opacity-40 hover:bg-[#F7F3EA] transition-colors"
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-[#667266]">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-full border border-[#E5DFC5] bg-white text-xs font-bold text-[#354B35] disabled:opacity-40 hover:bg-[#F7F3EA] transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Review Submission / Edit Modal */}
      {eligibility && (
        <ReviewModal
          productId={productId}
          productName={productName}
          eligibility={eligibility}
          initialReview={editingReview}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={handleReviewSubmitted}
        />
      )}

      {/* Lightbox Photo Preview */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActivePhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-[70vh]">
              <Image
                src={activePhoto}
                alt="Enlarged review photo"
                fill
                className="object-contain rounded-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
