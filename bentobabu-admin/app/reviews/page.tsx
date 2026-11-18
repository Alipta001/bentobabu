"use client";

import React, { useState } from "react";
import Image from "next/image";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Star,
  Eye,
  EyeOff,
  Search,
  Filter,
  MessageSquare,
  ThumbsUp,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  X,
  ShoppingBag,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdminReviews,
  useAdminReviewStats,
  useUpdateReviewStatus,
  useDeleteReview,
} from "@/hooks/useAdminQueries";
import { Review, ReviewStatus } from "@/types";

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Moderation Dialog State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [moderationNote, setModerationNote] = useState("");

  // Lightbox for photos
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Queries
  const { data: stats, isLoading: isStatsLoading } = useAdminReviewStats();
  const {
    data: reviewData,
    isLoading,
    refetch,
    isFetching,
  } = useAdminReviews({
    page,
    limit: 12,
    rating: ratingFilter === "ALL" ? undefined : ratingFilter,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    search: search.trim() || undefined,
  });

  const updateStatusMutation = useUpdateReviewStatus();
  const deleteMutation = useDeleteReview();

  const reviews = reviewData?.reviews || [];
  const totalReviews = reviewData?.total || 0;
  const totalPages = reviewData?.totalPages || 1;

  // Handle Quick Approve / Hide
  const handleUpdateStatus = async (
    id: string,
    newStatus: ReviewStatus,
    note?: string
  ) => {
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status: newStatus,
        moderationNote: note,
      });
      toast.success(
        newStatus === "APPROVED"
          ? "Review approved and published live!"
          : newStatus === "HIDDEN"
          ? "Review hidden from storefront"
          : "Review marked as rejected"
      );
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update review status");
    }
  };

  // Open Reject Dialog
  const openRejectDialog = (id: string) => {
    setSelectedReviewId(id);
    setModerationNote("");
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedReviewId) return;
    await handleUpdateStatus(selectedReviewId, "REJECTED", moderationNote.trim());
    setRejectModalOpen(false);
    setSelectedReviewId(null);
  };

  // Handle Delete Review
  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this customer review? Product rating will be recalculated."
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Review permanently deleted");
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete review");
    }
  };

  const avgRating = stats?.averageRating ? stats.averageRating.toFixed(1) : "5.0";
  const approvedCount = stats?.approvedCount || 0;
  const totalCount = stats?.totalCount || 0;

  return (
    <AdminShell
      title="Customer Reviews & Ratings"
      subtitle="Moderate verified customer feedback, manage published testimonials, and audit product ratings."
    >
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Average Rating */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-[#354B35]/70">
                Store Average Rating
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-serif text-3xl font-black text-[#1E2B1E]">
                  {avgRating}
                </span>
                <span className="text-xs text-[#354B35]/60 font-semibold">/ 5.0</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-3.5 h-3.5 ${
                      s <= Math.round(Number(avgRating))
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Star className="w-6 h-6 fill-amber-500" />
            </div>
          </div>

          {/* Approved & Live */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-800">
                Published Live
              </div>
              <div className="font-serif text-2xl font-black text-emerald-900 mt-1">
                {approvedCount}
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                Visible on customer product pages
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ThumbsUp className="w-6 h-6" />
            </div>
          </div>

          {/* Hidden or Rejected */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-amber-800">
                Hidden / Rejected
              </div>
              <div className="font-serif text-2xl font-black text-amber-900 mt-1">
                {(stats?.hiddenCount || 0) + (stats?.rejectedCount || 0)}
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                {stats?.hiddenCount || 0} hidden • {stats?.rejectedCount || 0} rejected
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <EyeOff className="w-6 h-6" />
            </div>
          </div>

          {/* Total Feedback */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-[#354B35]/70">
                Total Verified Reviews
              </div>
              <div className="font-serif text-2xl font-black text-[#1E2B1E] mt-1">
                {totalCount}
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                100% verified delivered purchases
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#354B35]/10 text-[#354B35] flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
            <input
              type="text"
              placeholder="Search dish, customer name, email, or review text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refetch()}
              className="w-full pl-10 pr-4 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-hidden focus:border-[#354B35]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Rating Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <Star className="w-3.5 h-3.5 text-[#354B35]/70" />
              <select
                value={ratingFilter}
                onChange={(e) => {
                  setRatingFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-2 text-xs font-semibold text-[#1E2B1E] cursor-pointer"
              >
                <option value="ALL">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#354B35]/70" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-2 text-xs font-semibold text-[#1E2B1E] cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="APPROVED">Approved & Live</option>
                <option value="HIDDEN">Hidden</option>
                <option value="REJECTED">Rejected</option>
                <option value="PENDING">Pending Review</option>
              </select>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 rounded-xl border border-[#E5DFD3] bg-white text-[#354B35] hover:bg-[#F9F7F1] transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Reviews Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-full py-16 text-center text-[#354B35]/60 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#354B35]" />
              <div className="text-xs font-semibold">Loading customer reviews...</div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-[#E5DFD3] shadow-xs space-y-2">
              <MessageSquare className="w-10 h-10 mx-auto text-[#8A9A86] opacity-60" />
              <div className="font-bold text-sm text-[#1E2B1E]">No matching customer reviews found</div>
              <p className="text-xs text-[#6B776A]">
                Try adjusting your search keywords or filter settings.
              </p>
            </div>
          ) : (
            reviews.map((review) => {
              const isApproved = review.status === "APPROVED";
              const isHidden = review.status === "HIDDEN";
              const isRejected = review.status === "REJECTED";

              return (
                <div
                  key={review.id}
                  className="bg-white rounded-3xl border border-[#E5DFD3] p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-[#354B35]/40 transition-all"
                >
                  <div className="space-y-3">
                    {/* Header: Product & Rating */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-serif text-sm font-bold text-[#1E2B1E]">
                            {review.product?.name || review.productName}
                          </h4>
                          {review.isVerifiedPurchase && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#EBF0E9] text-emerald-800">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Verified</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#354B35]/70 mt-0.5">
                          By{" "}
                          <span className="font-semibold text-[#1E2B1E]">
                            {review.customer?.name || review.customerName}
                          </span>
                          {review.customer?.email && (
                            <span className="text-[#8A9A86] text-[11px] ml-1">
                              ({review.customer.email})
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Star Rating Badge */}
                      <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                        <span className="text-xs font-bold text-amber-900">
                          {review.rating}.0
                        </span>
                      </div>
                    </div>

                    {/* Order Reference if populated */}
                    {review.order && (
                      <div className="flex items-center gap-2 text-[11px] text-[#6B776A] bg-[#FDFBF7] px-3 py-1.5 rounded-xl border border-[#E8E2D2]">
                        <ShoppingBag className="w-3.5 h-3.5 text-[#B99A60]" />
                        <span>Order #{review.order.orderNumber}</span>
                        <span>•</span>
                        <span>₹{review.order.grandTotal}</span>
                      </div>
                    )}

                    {/* Review Title & Comment */}
                    <div className="bg-[#F9F7F1] p-3.5 rounded-2xl border border-[#E5DFD3]/80 space-y-1">
                      {review.title && (
                        <div className="font-bold text-xs text-[#1E2B1E]">
                          {review.title}
                        </div>
                      )}
                      <p className="text-xs text-[#354B35]/90 leading-relaxed italic whitespace-pre-wrap">
                        &ldquo;{review.comment}&rdquo;
                      </p>
                    </div>

                    {/* Attached Photos */}
                    {review.images && review.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {review.images.map((img, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setActivePhoto(img.url)}
                            className="relative w-14 h-14 rounded-xl overflow-hidden border border-[#E5DFC5] hover:scale-105 transition-transform cursor-pointer"
                          >
                            <Image
                              src={img.url}
                              alt="Review thumbnail"
                              fill
                              className="object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Moderation Audit Info */}
                    {review.moderation?.moderatedAt && (
                      <div className="text-[10px] text-[#8A9A86] pt-1">
                        Moderated by {review.moderation.moderatedBy?.name || "Staff"} on{" "}
                        {new Date(review.moderation.moderatedAt).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                        {review.moderation.moderationNote && (
                          <span className="block italic text-neutral-600">
                            Note: {review.moderation.moderationNote}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions & Status Toolbar */}
                  <div className="pt-3 border-t border-[#E5DFD3] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#354B35]/60">
                        {new Date(review.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isApproved
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : isHidden
                            ? "bg-amber-50 text-amber-700 border-amber-300"
                            : "bg-red-50 text-red-700 border-red-300"
                        }`}
                      >
                        {isApproved ? "Approved & Live" : isHidden ? "Hidden" : "Rejected"}
                      </span>
                    </div>

                    {/* Moderation Controls */}
                    <div className="flex items-center gap-1.5">
                      {!isApproved && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(review.id, "APPROVED")}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold hover:bg-emerald-100 transition-colors cursor-pointer text-[11px]"
                          title="Approve and make visible on store"
                        >
                          Approve
                        </button>
                      )}

                      {isApproved && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(review.id, "HIDDEN")}
                          className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300 font-semibold hover:bg-amber-100 transition-colors cursor-pointer text-[11px]"
                          title="Hide from store"
                        >
                          Hide
                        </button>
                      )}

                      {!isRejected && (
                        <button
                          type="button"
                          onClick={() => openRejectDialog(review.id)}
                          className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 border border-neutral-300 font-semibold hover:bg-neutral-200 transition-colors cursor-pointer text-[11px]"
                          title="Reject review"
                        >
                          Reject
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(review.id)}
                        className="p-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white p-4 rounded-2xl border border-[#E5DFD3] flex items-center justify-between text-xs text-[#667266]">
            <div>
              Showing page <span className="font-bold text-[#1E2B1E]">{page}</span> of{" "}
              <span className="font-bold text-[#1E2B1E]">{totalPages}</span> ({totalReviews}{" "}
              reviews)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFD3] disabled:opacity-40 hover:bg-[#F9F7F1] font-semibold"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFD3] disabled:opacity-40 hover:bg-[#F9F7F1] font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E5DFC5] animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
              <h3 className="font-bold text-base text-[#1E2B1E]">Reject Customer Review</h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="p-1 rounded-lg text-gray-500 hover:text-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#667266] leading-relaxed">
              Rejecting this review will hide it from the customer storefront and exclude it from product rating averages.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#354B35] mb-1">
                Moderation Reason / Internal Note (Optional)
              </label>
              <textarea
                rows={3}
                value={moderationNote}
                onChange={(e) => setModerationNote(e.target.value)}
                placeholder="e.g. Inappropriate language, spam, or promotional link."
                className="w-full p-3 rounded-xl border border-[#E5DFD3] bg-[#F9F7F1] text-xs text-[#1E2B1E] focus:outline-hidden focus:border-[#354B35] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DFC5]">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E5DFC5] text-xs font-bold text-[#667266] hover:bg-[#F9F7F1]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
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
    </AdminShell>
  );
}
