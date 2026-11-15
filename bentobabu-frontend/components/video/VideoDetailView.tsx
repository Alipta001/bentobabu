"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Play,
  ArrowLeft,
  Share2,
  Calendar,
  Sparkles,
  UtensilsCrossed,
  ShoppingBag,
  ExternalLink,
  Check,
} from "lucide-react";
import { VideoContent, Product } from "@/types";
import { VideoCard } from "@/components/video/VideoCard";
import { useVideo } from "@/hooks/useQueries";
import { useCartSync } from "@/hooks/useCartSync";
import { useToast } from "@/context/ToastContext";

interface VideoDetailViewProps {
  slug: string;
  initialData?: {
    video: VideoContent;
    relatedVideos: VideoContent[];
  } | null;
}

export function VideoDetailView({ slug, initialData }: VideoDetailViewProps) {
  const { data: fetchedData, isLoading } = useVideo(slug);
  const data = initialData || fetchedData;
  const video = data?.video;
  const relatedVideos = data?.relatedVideos || [];

  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const { addItem } = useCartSync();
  const { showToast } = useToast();

  if (isLoading && !video) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-[#E8E2D2] rounded" />
        <div className="aspect-video w-full bg-[#E8E2D2] rounded-3xl" />
        <div className="h-8 w-2/3 bg-[#E8E2D2] rounded" />
        <div className="h-20 w-full bg-[#E8E2D2] rounded" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#E8E2D2] text-[#354B35] flex items-center justify-center mx-auto">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#222922]">
          Video Not Found
        </h2>
        <p className="text-xs text-[#6B776A] leading-relaxed">
          The video you requested is either unavailable or has been archived.
        </p>
        <Link
          href="/videos"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Explore All Videos</span>
        </Link>
      </div>
    );
  }

  const thumbnail =
    video.thumbnailUrl ||
    `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`;

  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}?autoplay=1&rel=0`;

  const relatedProduct =
    typeof video.relatedProduct === "object" && video.relatedProduct !== null
      ? (video.relatedProduct as Product)
      : null;

  const handleShare = async () => {
    if (navigator?.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      showToast({
        title: "Link Copied",
        message: "Video link copied to clipboard.",
        type: "success",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddDishToCart = () => {
    if (relatedProduct) {
      addItem(relatedProduct, 1);
      showToast({
        title: "Added to Cart",
        message: `${relatedProduct.name} (1x) • ₹${relatedProduct.price}`,
        type: "success",
        action: {
          label: "View Cart & Checkout →",
          href: "/cart",
        },
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Top Breadcrumb & Back Link */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/videos"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#8C713B] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Video Library</span>
        </Link>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E8E2D2] text-xs font-semibold text-[#354B35] hover:bg-[#F7F3EA] transition-colors shadow-2xs cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied!" : "Share"}</span>
        </button>
      </div>

      {/* 16:9 Video Player Container */}
      <div className="relative aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-2xl border border-[#354B35]/20">
        {!isPlaying ? (
          <div className="relative w-full h-full group cursor-pointer" onClick={() => setIsPlaying(true)}>
            <Image
              src={thumbnail}
              alt={video.title}
              fill
              priority
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover group-hover:scale-102 transition-transform duration-500"
            />
            {/* Dark Gradient Overlay */}
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />

            {/* Play Button */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                aria-label={`Play ${video.title}`}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 text-[#354B35] flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:bg-[#354B35] group-hover:text-[#DFC89B] transition-all duration-300"
              >
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
              </button>
              <span className="text-xs sm:text-sm font-semibold text-white/90 drop-shadow-md">
                Click to Watch
              </span>
            </div>

            {/* Privacy Badge */}
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-white/80">
              Enhanced Privacy Player
            </div>
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        )}
      </div>

      {/* Main Video Meta & Two-Column Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left / Primary Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tag Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#354B35] text-[#DFC89B]">
              {video.category}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#8C713B] text-white">
              {video.contentType}
            </span>
            {video.isFeatured && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#DFC89B] text-[#243324]">
                <Sparkles className="w-3.5 h-3.5 text-[#243324]" />
                Featured Video
              </span>
            )}
            {video.dietaryTags?.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0ECE1] text-[#4A584A]"
              >
                {tag}
              </span>
            ))}
            {video.preparationMethods?.map((m) => (
              <span
                key={m}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EAF0E9] text-[#354B35]"
              >
                {m}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#243324] leading-tight">
            {video.title}
          </h1>

          {/* Published Date */}
          {video.publishedAt && (
            <div className="flex items-center gap-2 text-xs text-[#6B776A]">
              <Calendar className="w-4 h-4 text-[#8A9A86]" />
              <span>
                Published on{" "}
                {new Date(video.publishedAt).toLocaleDateString("en-IN", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}

          {/* Description */}
          {video.description && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E8E2D2] shadow-sm space-y-3">
              <h2 className="font-serif text-lg font-bold text-[#243324]">
                About this Recipe & Preparation
              </h2>
              <div className="text-sm text-[#4A584A] leading-relaxed whitespace-pre-line">
                {video.description}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Related Dish Card */}
        <div className="lg:col-span-4 space-y-6">
          {relatedProduct ? (
            <div className="bg-white rounded-3xl p-6 border-2 border-[#354B35]/20 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-[#F0ECE1] pb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C713B]">
                  Featured Dish in Video
                </span>
                <span className="text-xs font-bold text-[#354B35]">
                  Order Fresh
                </span>
              </div>

              {/* Product Thumbnail */}
              <Link
                href={`/product/${relatedProduct.slug}`}
                className="relative aspect-video w-full rounded-2xl overflow-hidden block bg-[#F7F3EA] group"
              >
                <Image
                  src={
                    relatedProduct.imageUrl ||
                    relatedProduct.images?.[0] ||
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"
                  }
                  alt={relatedProduct.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 300px"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Product Info */}
              <div className="space-y-2">
                <Link
                  href={`/product/${relatedProduct.slug}`}
                  className="font-serif font-bold text-base text-[#222922] hover:text-[#354B35] transition-colors block"
                >
                  {relatedProduct.name}
                </Link>

                <p className="text-xs text-[#6B776A] line-clamp-2 leading-relaxed">
                  {relatedProduct.description}
                </p>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-lg font-serif font-bold text-[#354B35]">
                    ₹{relatedProduct.price}
                  </div>
                  {relatedProduct.dietary && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF0E9] text-[#354B35] uppercase">
                      {relatedProduct.dietary}
                    </span>
                  )}
                </div>
              </div>

              {/* Order Actions */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleAddDishToCart}
                  className="w-full py-3 rounded-full bg-[#354B35] text-[#F7F3EA] font-bold text-xs hover:bg-[#253525] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4 text-[#DFC89B]" />
                  <span>Add to Order • ₹{relatedProduct.price}</span>
                </button>
                <Link
                  href={`/product/${relatedProduct.slug}`}
                  className="w-full py-2.5 rounded-full border border-[#354B35]/40 text-[#354B35] font-semibold text-xs hover:bg-[#354B35]/5 transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>View Full Dish Details</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-[#243324] text-white rounded-3xl p-6 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#DFC89B]">
                BentoBabu Kitchen
              </span>
              <h3 className="font-serif text-lg font-bold">
                Mindful Nutrition at Your Door
              </h3>
              <p className="text-xs text-[#B5C4B1] leading-relaxed">
                Enjoy hot, preservative-free bento boxes calibrated for your lifestyle.
              </p>
              <Link
                href="/menu"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#B99A60] text-[#243324] text-xs font-bold hover:bg-[#DFC89B] transition-colors mt-2"
              >
                <span>Browse Daily Menu</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Related Videos Row */}
      {relatedVideos.length > 0 && (
        <section className="pt-12 border-t border-[#E8E2D2] space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-bold text-[#243324]">
              Related Cooking & Nutrition Videos
            </h2>
            <Link
              href="/videos"
              className="text-xs font-bold text-[#354B35] hover:text-[#8C713B] transition-colors"
            >
              View All Videos →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedVideos.slice(0, 4).map((rv) => (
              <VideoCard key={rv._id || rv.slug} video={rv} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
