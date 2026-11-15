"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { VideoForm } from "@/components/video/VideoForm";
import { useAdminVideo, useUpdateVideo } from "@/hooks/useAdminQueries";
import { CreateVideoPayload } from "@/services/videoService";
import { RefreshCw } from "lucide-react";

export default function EditVideoPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id as string;

  const { data: video, isLoading, error } = useAdminVideo(id);
  const updateMutation = useUpdateVideo();

  const handleUpdate = async (payload: CreateVideoPayload) => {
    await updateMutation.mutateAsync({ id, data: payload });
  };

  if (isLoading) {
    return (
      <AdminShell title="Edit Video" subtitle="Loading video details...">
        <div className="bg-white p-12 rounded-3xl border border-[#E5DFC5] flex items-center justify-center gap-2 text-xs text-[#667266]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#354B35]" />
          <span>Fetching video information...</span>
        </div>
      </AdminShell>
    );
  }

  if (error || !video) {
    return (
      <AdminShell title="Edit Video" subtitle="Video not found">
        <div className="bg-white p-12 rounded-3xl border border-[#E5DFC5] text-center space-y-3">
          <div className="text-xs text-red-600 font-semibold">Video record could not be loaded.</div>
          <button
            onClick={() => router.push("/videos")}
            className="px-5 py-2 rounded-full bg-[#354B35] text-white text-xs font-semibold"
          >
            Return to Video Library
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={`Edit: ${video.title}`}
      subtitle="Modify YouTube URL, categories, culinary preparation tags, or toggle status"
    >
      <VideoForm initialData={video} isEdit={true} onSubmit={handleUpdate} />
    </AdminShell>
  );
}
