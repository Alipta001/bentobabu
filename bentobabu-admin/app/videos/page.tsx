"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Video,
  Plus,
  Search,
  Edit2,
  Trash2,
  ExternalLink,
  Flame,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Play,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminVideos,
  useDeleteVideoContent,
  useUpdateVideoStatus,
} from "@/hooks/useAdminQueries";
import { VideoContent } from "@/types";

export default function AdminVideosPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useAdminVideos({
    search: search.trim() || undefined,
    category: selectedCategory !== "all" ? selectedCategory : undefined,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
    page,
    limit: 15,
  });

  const deleteMutation = useDeleteVideoContent();
  const updateStatusMutation = useUpdateVideoStatus();

  const videos = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to delete video.");
    }
  };

  const handleTogglePublish = async (video: VideoContent) => {
    const nextStatus = video.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await updateStatusMutation.mutateAsync({
        id: video.id || video._id,
        status: nextStatus,
      });
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to update status.");
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "PUBLISHED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Published
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
            <Archive className="w-3 h-3" />
            Archived
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            Draft
          </span>
        );
    }
  };

  return (
    <AdminShell
      title="YouTube Video Library"
      subtitle="Curate recipe guides, food preparation tutorials, and nutritional highlights for customer discovery"
    >
      {/* Top Controls Bar */}
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <input
              type="text"
              placeholder="Search videos by title, description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
            <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
          >
            <option value="all">All Categories</option>
            <option value="Healthy Meals">Healthy Meals</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Snacks">Snacks</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
          >
            <option value="all">All Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <Link
          href="/videos/new"
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4 text-[#B99A60]" />
          <span>Add New Video</span>
        </Link>
      </div>

      {/* Video Content Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading video catalogue...
          </div>
        ) : videos.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Video className="w-10 h-10 text-[#8A9A86] mx-auto opacity-50" />
            <div className="font-bold text-sm text-[#1F271F]">No videos found</div>
            <p className="text-xs text-[#667266] max-w-sm mx-auto">
              Start building your food discovery library by adding YouTube recipe and preparation videos.
            </p>
            <Link
              href="/videos/new"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525]"
            >
              <Plus className="w-4 h-4 text-[#B99A60]" />
              <span>Add Your First Video</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Video & Preview</th>
                  <th className="py-3.5 px-4 font-bold">Category</th>
                  <th className="py-3.5 px-4 font-bold">Content Type</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold">Created</th>
                  <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {videos.map((v) => {
                  const videoId = v.id || v._id;
                  return (
                    <tr key={videoId} className="hover:bg-[#F9F7F1] transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="relative w-20 h-12 rounded-xl overflow-hidden bg-black/80 shrink-0 border border-[#E5DFC5] group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={v.thumbnailUrl || `https://i.ytimg.com/vi/${v.youtubeVideoId}/hqdefault.jpg`}
                              alt={v.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                              <Play className="w-4 h-4 text-white fill-white" />
                            </div>
                          </div>
                          <div className="min-w-0 max-w-md">
                            <div className="font-bold text-[#1F271F] flex items-center gap-1.5 truncate">
                              <span>{v.title}</span>
                              {v.isFeatured && (
                                <span title="Featured Video">
                                  <Flame className="w-3.5 h-3.5 text-[#B99A60] shrink-0" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#667266] flex items-center gap-2 truncate">
                              <span>ID: {v.youtubeVideoId}</span>
                              <span>•</span>
                              <a
                                href={v.youtubeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-[#354B35]"
                              >
                                <span>Watch on YouTube</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-[#1F271F]">
                        {v.category}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F7F3EA] border border-[#E5DFC5] text-[#354B35]">
                          {v.contentType}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(v)}
                          title="Click to toggle status"
                          className="cursor-pointer hover:opacity-80"
                        >
                          {statusBadge(v.status)}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-[#667266] text-[11px]">
                        {new Date(v.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/videos/${videoId}/edit`}
                            className="p-1.5 rounded-lg hover:bg-[#E8EFE8] text-[#354B35] transition-colors"
                            title="Edit Video"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(videoId)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                            title="Delete Video"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#E5DFC5] flex items-center justify-between text-xs text-[#667266]">
            <div>
              Showing {videos.length} of {total} videos
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 hover:bg-[#F7F3EA] cursor-pointer"
              >
                Previous
              </button>
              <span className="px-3 py-1 font-semibold text-[#1F271F]">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-[#E5DFC5] disabled:opacity-40 hover:bg-[#F7F3EA] cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-[#E5DFC5] shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-[#1F271F]">Delete Video Content?</h3>
              <p className="text-xs text-[#667266]">
                This video record will be permanently deleted from the BentoBabu catalogue. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-full border border-gray-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
