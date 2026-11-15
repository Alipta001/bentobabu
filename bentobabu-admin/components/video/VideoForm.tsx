"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Video,
  Play,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Flame,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { videoService, CreateVideoPayload } from "@/services/videoService";
import { useAdminProducts } from "@/hooks/useAdminQueries";
import { VideoContent } from "@/types";

interface VideoFormProps {
  initialData?: VideoContent;
  isEdit?: boolean;
  onSubmit: (payload: CreateVideoPayload) => Promise<void>;
}

const PREPARATION_OPTIONS = ["Boiled", "Grilled", "Baked", "Steamed", "No-Cook", "Roasted"];
const DIETARY_OPTIONS = ["VEG", "NON_VEG", "VEGAN", "EGG", "GLUTEN_FREE"];
const MEAL_TYPE_OPTIONS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "DAILY_MENU"];
const CONTENT_TYPE_OPTIONS = ["Recipes", "Food Preparation", "Nutrition Tips", "Meal Ideas"];
const CATEGORY_OPTIONS = [
  "Healthy Meals",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "High Protein",
  "Low Calorie",
];

export function VideoForm({ initialData, isEdit = false, onSubmit }: VideoFormProps) {
  const router = useRouter();
  const { data: productsData } = useAdminProducts({ limit: 100 } as any);
  const products = productsData || [];

  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialData?.youtubeUrl || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [category, setCategory] = useState(initialData?.category || "Healthy Meals");
  const [contentType, setContentType] = useState(initialData?.contentType || "Recipes");
  const [preparationMethods, setPreparationMethods] = useState<string[]>(
    initialData?.preparationMethods || []
  );
  const [dietaryTags, setDietaryTags] = useState<string[]>(initialData?.dietaryTags || []);
  const [mealType, setMealType] = useState<string[]>(initialData?.mealType || []);
  const [relatedProduct, setRelatedProduct] = useState<string>(
    typeof initialData?.relatedProduct === "object"
      ? (initialData.relatedProduct as any)?._id || (initialData.relatedProduct as any)?.id || ""
      : initialData?.relatedProduct || ""
  );
  const [isFeatured, setIsFeatured] = useState<boolean>(initialData?.isFeatured || false);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(
    initialData?.status || "PUBLISHED"
  );

  const [urlValidation, setUrlValidation] = useState<{
    isValid: boolean;
    videoId?: string;
    error?: string;
  }>({ isValid: false });
  const [showEmbedPreview, setShowEmbedPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validate YouTube URL on change
  useEffect(() => {
    if (!youtubeUrl.trim()) {
      setUrlValidation({ isValid: false });
      return;
    }
    const result = videoService.extractVideoId(youtubeUrl);
    setUrlValidation(result);
  }, [youtubeUrl]);

  const toggleArrayItem = (item: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(item)) {
      setter(current.filter((i) => i !== item));
    } else {
      setter([...current, item]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setSubmitError("Video title is required.");
      return;
    }
    if (!urlValidation.isValid) {
      setSubmitError("Please provide a valid YouTube URL before saving.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        youtubeUrl: youtubeUrl.trim(),
        thumbnailUrl: urlValidation.videoId ? videoService.getThumbnail(urlValidation.videoId) : undefined,
        category,
        contentType,
        preparationMethods,
        dietaryTags,
        mealType,
        relatedProduct: relatedProduct || undefined,
        isFeatured,
        status,
      });
      router.push("/videos");
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || err.message || "Failed to save video.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Header Actions */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E5DFC5]">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667266] hover:text-[#354B35] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Video Library</span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/videos")}
            className="px-5 py-2 rounded-full border border-gray-300 text-xs font-semibold text-[#1F271F] hover:bg-[#F7F3EA] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors disabled:opacity-50 shadow-xs"
          >
            {isSubmitting ? "Saving..." : isEdit ? "Update Video" : "Publish Video"}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs rounded-2xl border border-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Main Form Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Core Fields */}
        <div className="lg:col-span-7 space-y-5 bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs">
          <div className="space-y-1">
            <label className="font-bold text-[#1F271F] text-xs">Video Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Teriyaki Chicken Bento Meal Prep Guide"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-[#1F271F] text-xs">Custom URL Slug (Optional)</label>
            <input
              type="text"
              placeholder="Auto-generated from title if blank"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
          </div>

          {/* YouTube URL with Live Validation */}
          <div className="space-y-1.5">
            <label className="font-bold text-[#1F271F] text-xs flex items-center justify-between">
              <span>YouTube Video URL *</span>
              {urlValidation.isValid && (
                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid ID: {urlValidation.videoId}
                </span>
              )}
            </label>
            <input
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className={`w-full p-2.5 rounded-xl bg-[#F7F3EA] border text-xs text-[#1F271F] focus:outline-none ${
                youtubeUrl && !urlValidation.isValid
                  ? "border-red-400 focus:border-red-500"
                  : "border-[#E5DFC5] focus:border-[#354B35]"
              }`}
            />
            {youtubeUrl && !urlValidation.isValid && (
              <p className="text-[11px] text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{urlValidation.error || "Please enter a valid YouTube video URL"}</span>
              </p>
            )}
            <p className="text-[10px] text-[#667266]">
              Accepts youtube.com/watch, youtu.be, and youtube.com/shorts URLs. Privacy-enhanced embeds are generated automatically.
            </p>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-[#1F271F] text-xs">Description</label>
            <textarea
              rows={4}
              placeholder="Describe the recipe, key steps, nutritional highlights, or cooking techniques..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
          </div>

          {/* Category & Content Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-[#1F271F] text-xs">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-[#1F271F] text-xs">Content Type *</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
              >
                {CONTENT_TYPE_OPTIONS.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preparation Methods Multi-Select */}
          <div className="space-y-1.5 pt-2">
            <label className="font-bold text-[#1F271F] text-xs">Preparation Methods</label>
            <div className="flex flex-wrap gap-1.5">
              {PREPARATION_OPTIONS.map((m) => {
                const active = preparationMethods.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleArrayItem(m, preparationMethods, setPreparationMethods)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-[#354B35] text-white border-[#354B35]"
                        : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5] hover:border-[#354B35]"
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary Tags Multi-Select */}
          <div className="space-y-1.5 pt-2">
            <label className="font-bold text-[#1F271F] text-xs">Dietary Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {DIETARY_OPTIONS.map((d) => {
                const active = dietaryTags.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleArrayItem(d, dietaryTags, setDietaryTags)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-[#B99A60] text-white border-[#B99A60]"
                        : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5] hover:border-[#B99A60]"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meal Types Multi-Select */}
          <div className="space-y-1.5 pt-2">
            <label className="font-bold text-[#1F271F] text-xs">Meal Type</label>
            <div className="flex flex-wrap gap-1.5">
              {MEAL_TYPE_OPTIONS.map((mt) => {
                const active = mealType.includes(mt);
                return (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => toggleArrayItem(mt, mealType, setMealType)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? "bg-[#354B35] text-white border-[#354B35]"
                        : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5] hover:border-[#354B35]"
                    }`}
                  >
                    {mt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Related Product Selector */}
          <div className="space-y-1 pt-2">
            <label className="font-bold text-[#1F271F] text-xs">
              Link to Related Dish from Catalogue (Optional)
            </label>
            <select
              value={relatedProduct}
              onChange={(e) => setRelatedProduct(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            >
              <option value="">No related dish linked</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (₹{p.price})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#667266]">
              When linked, customers watching this video will see a direct card to order this Bento.
            </p>
          </div>
        </div>

        {/* Right Column: Preview & Publication State */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live YouTube Preview Card */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-[#1F271F] flex items-center gap-1.5">
                <Video className="w-4 h-4 text-[#354B35]" />
                <span>Live YouTube Preview</span>
              </h3>
              {urlValidation.isValid && (
                <button
                  type="button"
                  onClick={() => setShowEmbedPreview(!showEmbedPreview)}
                  className="text-[11px] font-semibold text-[#354B35] hover:underline"
                >
                  {showEmbedPreview ? "Show Thumbnail" : "Test Embed Player"}
                </button>
              )}
            </div>

            {urlValidation.isValid && urlValidation.videoId ? (
              <div className="space-y-3">
                {showEmbedPreview ? (
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#E5DFC5]">
                    <iframe
                      src={videoService.getEmbedUrl(urlValidation.videoId)}
                      title="YouTube Preview"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/90 border border-[#E5DFC5] group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={videoService.getThumbnail(urlValidation.videoId)}
                      alt="Thumbnail Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-[#667266] space-y-1">
                  <div>
                    <span className="font-semibold text-[#1F271F]">Video ID:</span>{" "}
                    {urlValidation.videoId}
                  </div>
                  <div>
                    <span className="font-semibold text-[#1F271F]">Privacy Mode:</span>{" "}
                    youtube-nocookie.com
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video rounded-2xl border-2 border-dashed border-[#E5DFC5] bg-[#F7F3EA] flex flex-col items-center justify-center p-6 text-center space-y-2">
                <Video className="w-8 h-8 text-[#8A9A86] opacity-40" />
                <div className="text-xs font-semibold text-[#667266]">
                  Enter a YouTube URL to preview thumbnail and video
                </div>
              </div>
            )}
          </div>

          {/* Visibility & Settings Card */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-5">
            <h3 className="font-bold text-xs text-[#1F271F]">Visibility & Publishing</h3>

            <div className="space-y-1">
              <label className="font-bold text-[#1F271F] text-xs">Publication Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F]"
              >
                <option value="PUBLISHED">Published (Visible to all customers)</option>
                <option value="DRAFT">Draft (Admin review only)</option>
                <option value="ARCHIVED">Archived (Hidden from discovery)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]">
              <div className="space-y-0.5">
                <div className="font-bold text-xs text-[#1F271F] flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[#B99A60]" />
                  <span>Feature on Discovery & Home</span>
                </div>
                <div className="text-[10px] text-[#667266]">
                  Featured videos are highlighted in hero carousels
                </div>
              </div>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="w-4 h-4 accent-[#354B35] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
