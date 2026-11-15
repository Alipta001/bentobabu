"use client";

import React from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { VideoForm } from "@/components/video/VideoForm";
import { useCreateVideo } from "@/hooks/useAdminQueries";
import { CreateVideoPayload } from "@/services/videoService";

export default function NewVideoPage() {
  const createMutation = useCreateVideo();

  const handleCreate = async (payload: CreateVideoPayload) => {
    await createMutation.mutateAsync(payload);
  };

  return (
    <AdminShell
      title="Add New Video"
      subtitle="Paste a YouTube link to generate video thumbnails, configure culinary tags, and publish to discovery"
    >
      <VideoForm onSubmit={handleCreate} />
    </AdminShell>
  );
}
