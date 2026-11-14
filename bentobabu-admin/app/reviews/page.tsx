"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Star,
  Eye,
  EyeOff,
  Search,
  Filter,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import {
  useAdminReviews,
  useToggleReviewApproval,
} from "@/hooks/useAdminQueries";

export default function ReviewsPage() {
  const { data: reviews = [], isLoading } = useAdminReviews();
  const toggleMutation = useToggleReviewApproval();

  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredReviews = reviews.filter((r) => {
    const matchesSearch =
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.comment.toLowerCase().includes(search.toLowerCase());

    const matchesRating =
      ratingFilter === "all" || r.rating === parseInt(ratingFilter, 10);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "approved" && r.isApproved) ||
      (statusFilter === "hidden" && !r.isApproved);

    return matchesSearch && matchesRating && matchesStatus;
  });

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "5.0";

  const approvedCount = reviews.filter((r) => r.isApproved).length;

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
              Customer Reviews & Feedback
            </h1>
            <p className="text-sm text-[#354B35]/70 mt-1">
              Moderate meal reviews, monitor taste & portion ratings, and curate social proof for the store.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Average Rating
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-serif text-3xl font-bold text-[#1E2B1E]">
                  {avgRating}
                </span>
                <span className="text-xs text-[#354B35]/60">/ 5.0</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 mt-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${
                      i < Math.floor(Number(avgRating))
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

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Published Testimonials
              </div>
              <div className="font-serif text-2xl font-bold text-emerald-800 mt-1">
                {approvedCount} Approved
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                Visible to customers on the frontend
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ThumbsUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Total Feedback Received
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                {reviews.length} Reviews
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                {reviews.length - approvedCount} pending or hidden
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#354B35]/10 text-[#354B35] flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
            <input
              type="text"
              placeholder="Search dish, customer name, review..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 text-xs">
              <Star className="w-3.5 h-3.5 text-[#354B35]/70" />
              <span className="text-[#354B35]/70 font-medium">Rating:</span>
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-1.5 text-xs text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
              >
                <option value="all">All Stars</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#354B35]/70" />
              <span className="text-[#354B35]/70 font-medium">Moderation:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-1.5 text-xs text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
              >
                <option value="all">All Reviews</option>
                <option value="approved">Approved & Live</option>
                <option value="hidden">Hidden / Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reviews List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-[#354B35]/60">
              Loading customer reviews...
            </div>
          ) : filteredReviews.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[#354B35]/60">
              No matching reviews found.
            </div>
          ) : (
            filteredReviews.map((review) => (
              <div
                key={review.id}
                className="bg-white rounded-2xl border border-[#E5DFD3] p-5 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-serif text-sm font-bold text-[#1E2B1E]">
                        {review.productName}
                      </h4>
                      <p className="text-xs text-[#354B35]/70 mt-0.5">
                        Reviewed by <span className="font-semibold text-[#1E2B1E]">{review.customerName}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span className="text-xs font-bold text-amber-900">
                        {review.rating}.0
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#354B35]/90 mt-3 leading-relaxed italic bg-[#F9F7F1] p-3 rounded-xl border border-[#E5DFD3]/60">
                    &ldquo;{review.comment}&rdquo;
                  </p>
                </div>

                <div className="pt-3 border-t border-[#E5DFD3] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#354B35]/60">
                    {new Date(review.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>

                  <button
                    onClick={() => toggleMutation.mutate(review.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                      review.isApproved
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                        : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    {review.isApproved ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Approved & Live
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Hidden (Click to Publish)
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
