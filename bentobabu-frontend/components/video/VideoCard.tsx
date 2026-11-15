import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Play, Sparkles } from "lucide-react";
import { VideoContent } from "@/types";

interface VideoCardProps {
  video: VideoContent;
  priority?: boolean;
}

export function VideoCard({ video, priority = false }: VideoCardProps) {
  const thumbnail =
    video.thumbnailUrl ||
    `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;

  return (
    <article className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-[#E8E2D2] shadow-sm hover:shadow-xl hover:border-[#354B35]/40 transition-all duration-300">
      {/* Thumbnail & Media Preview */}
      <Link
        href={`/videos/${video.slug}`}
        className="relative aspect-video w-full overflow-hidden bg-[#243324] block"
      >
        <Image
          src={thumbnail}
          alt={video.title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />

        {/* Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent group-hover:from-black/70 transition-all duration-300" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/90 backdrop-blur-md text-[#354B35] shadow-xs">
            {video.category}
          </span>
          {video.isFeatured && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#354B35] text-[#DFC89B] shadow-xs">
              <Sparkles className="w-3 h-3 text-[#DFC89B]" />
              Featured
            </span>
          )}
        </div>

        {/* Center Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/90 text-[#354B35] flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#354B35] group-hover:text-[#DFC89B] transition-all duration-300">
            <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
          </div>
        </div>

        {/* Content Type Pill on bottom-left */}
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 backdrop-blur-md text-white/90">
            {video.contentType}
          </span>
        </div>
      </Link>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            {video.dietaryTags?.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0ECE1] text-[#4A584A]"
              >
                {tag}
              </span>
            ))}
            {video.preparationMethods?.slice(0, 2).map((method) => (
              <span
                key={method}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF0E9] text-[#354B35]"
              >
                {method}
              </span>
            ))}
          </div>

          {/* Title */}
          <h3 className="font-serif font-bold text-base sm:text-lg text-[#222922] group-hover:text-[#354B35] transition-colors line-clamp-2">
            <Link href={`/videos/${video.slug}`}>{video.title}</Link>
          </h3>

          {/* Description */}
          {video.description && (
            <p className="text-xs text-[#6B776A] line-clamp-2 leading-relaxed">
              {video.description}
            </p>
          )}
        </div>

        {/* Watch Link */}
        <div className="pt-2 border-t border-[#F0ECE1] flex items-center justify-between">
          <Link
            href={`/videos/${video.slug}`}
            className="text-xs font-bold text-[#354B35] group-hover:text-[#8C713B] inline-flex items-center gap-1 transition-colors"
          >
            <span>Watch Video</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
