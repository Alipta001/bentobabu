import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { VideoDetailView } from "@/components/video/VideoDetailView";
import { videoService } from "@/services/videoService";

interface VideoPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: VideoPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await videoService.getBySlug(slug);

  if (!data?.video) {
    return {
      title: "Video Not Found | BentoBabu",
      description: "The requested video could not be found.",
    };
  }

  const video = data.video;
  const thumbnail =
    video.thumbnailUrl ||
    `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;

  return {
    title: `${video.title} | BentoBabu Video Library`,
    description:
      video.description?.slice(0, 160) ||
      `Watch ${video.title} and discover healthy mindful cooking recipes on BentoBabu.`,
    alternates: {
      canonical: `/videos/${video.slug || slug}`,
    },
    openGraph: {
      title: `${video.title} | BentoBabu`,
      description:
        video.description?.slice(0, 160) ||
        `Watch ${video.title} on BentoBabu.`,
      images: [
        {
          url: thumbnail,
          width: 1280,
          height: 720,
          alt: video.title,
        },
      ],
    },
  };
}

export default async function VideoDetailPage({ params }: VideoPageProps) {
  const { slug } = await params;
  const data = await videoService.getBySlug(slug);

  if (!data?.video) {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />
      <main className="flex-1">
        <VideoDetailView slug={slug} initialData={data} />
      </main>
      <Footer />
    </div>
  );
}
