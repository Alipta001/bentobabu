"use client";

import React, { useState, useEffect, Suspense, useTransition } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Sparkles,
  Video,
  Play,
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { VideoCard } from "@/components/video/VideoCard";
import { useVideos, useFeaturedVideos } from "@/hooks/useQueries";
import { VideoContent, VideoFilterOptions } from "@/types";

const CATEGORIES = [
  "All",
  "Healthy Meals",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
];

const CONTENT_TYPES = [
  "All",
  "Recipes",
  "Food Preparation",
  "Nutrition Tips",
  "Meal Ideas",
];

const PREPARATION_METHODS = [
  "All",
  "Boiled",
  "Grilled",
  "Baked",
  "Steamed",
  "No-Cook",
  "Roasted",
];

const DIETARY_TAGS = [
  "All",
  "Vegetarian",
  "Vegan",
  "Non-Vegetarian",
];

function VideosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState<string>(
    searchParams.get("category") || "All"
  );
  const [contentType, setContentType] = useState<string>(
    searchParams.get("contentType") || "All"
  );
  const [prepMethod, setPrepMethod] = useState<string>(
    searchParams.get("prepMethod") || "All"
  );
  const [dietary, setDietary] = useState<string>(
    searchParams.get("dietary") || "All"
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get("search") || ""
  );
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchQuery);
  const [page, setPage] = useState<number>(
    parseInt(searchParams.get("page") || "1", 10)
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync state to URL search parameters
  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "All") params.set("category", category);
    if (contentType !== "All") params.set("contentType", contentType);
    if (prepMethod !== "All") params.set("prepMethod", prepMethod);
    if (dietary !== "All") params.set("dietary", dietary);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (page > 1) params.set("page", page.toString());

    const queryString = params.toString();
    const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
    startTransition(() => {
      router.replace(targetUrl, { scroll: false });
    });
  }, [category, contentType, prepMethod, dietary, debouncedSearch, page, pathname, router]);

  const filterOptions: VideoFilterOptions = {
    category: category !== "All" ? category : undefined,
    contentType: contentType !== "All" ? contentType : undefined,
    preparationMethod: prepMethod !== "All" ? prepMethod : undefined,
    dietaryTag: dietary !== "All" ? dietary : undefined,
    search: debouncedSearch.trim() || undefined,
    page,
    limit: 12,
  };

  const { data: videoData, isLoading, isError } = useVideos(filterOptions);
  const { data: featuredVideos = [] } = useFeaturedVideos(4);

  const videos = videoData?.videos || [];
  const pagination = videoData?.pagination || {
    page: 1,
    limit: 12,
    total: videos.length,
    pages: 1,
  };

  const handleResetFilters = () => {
    setCategory("All");
    setContentType("All");
    setPrepMethod("All");
    setDietary("All");
    setSearchQuery("");
    setDebouncedSearch("");
    setPage(1);
  };

  const hasActiveFilters =
    category !== "All" ||
    contentType !== "All" ||
    prepMethod !== "All" ||
    dietary !== "All" ||
    debouncedSearch.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 pb-20">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-[#243324] to-[#2E402E] text-white pt-14 pb-16 px-4 sm:px-6 lg:px-8 border-b border-[#354B35]">
          <div className="max-w-7xl mx-auto text-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#354B35] border border-[#4B654B] text-[#DFC89B] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#DFC89B]" />
              <span>BentoBabu Kitchen & Discovery</span>
            </div>

            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#F7F3EA]">
              Discover Healthy Food
            </h1>

            <p className="text-sm sm:text-base text-[#B5C4B1] max-w-2xl mx-auto leading-relaxed">
              Explore step-by-step healthy recipes, chef preparation secrets, and nutrition tips. Watch how our kitchen brings mindful culinary traditions to life.
            </p>

            {/* Search Bar */}
            <div className="pt-3 max-w-xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8A9A86]" />
                <input
                  type="text"
                  placeholder="Search recipes, ingredients, tips (e.g. Steamed Millet, Paneer Bowl)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-full bg-white/10 backdrop-blur-md border border-[#4B654B] text-white placeholder:text-[#8A9A86] text-sm focus:outline-none focus:ring-2 focus:ring-[#DFC89B] focus:bg-white/15 transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#DFC89B] hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Featured Videos Spotlight (when not searching or on first page) */}
        {!hasActiveFilters && page === 1 && featuredVideos.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#8C713B]" />
                <h2 className="font-serif text-2xl font-bold text-[#243324]">
                  Featured Kitchen Videos
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredVideos.map((video, idx) => (
                <VideoCard key={video._id || video.slug} video={video} priority={idx < 2} />
              ))}
            </div>
          </section>
        )}

        {/* Main Content & Filters */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-8">
          {/* Filter Bar Controls */}
          <div className="bg-white rounded-3xl p-6 border border-[#E8E2D2] shadow-sm space-y-5">
            {/* Content Type Filter Tabs */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8C713B]">
                Content Type
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {CONTENT_TYPES.map((type) => {
                  const active = contentType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setContentType(type);
                        setPage(1);
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                        active
                          ? "bg-[#354B35] text-[#F7F3EA] shadow-xs"
                          : "bg-[#F7F3EA] text-[#4A584A] hover:bg-[#E8E2D2]"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Pills */}
            <div className="space-y-2 pt-2 border-t border-[#F0ECE1]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8C713B]">
                Meal Category
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setPage(1);
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                        active
                          ? "bg-[#8C713B] text-white shadow-xs"
                          : "bg-[#FAF8F5] text-[#4A584A] border border-[#E8E2D2] hover:border-[#8C713B]"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sub-Filters: Preparation Method & Dietary Tags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#F0ECE1]">
              {/* Preparation Methods */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B776A]">
                  Preparation Method
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PREPARATION_METHODS.map((method) => {
                    const active = prepMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPrepMethod(method);
                          setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                          active
                            ? "bg-[#354B35] text-white"
                            : "bg-[#F0ECE1]/70 text-[#4A584A] hover:bg-[#E8E2D2]"
                        }`}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dietary Tags */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B776A]">
                  Dietary Preference
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DIETARY_TAGS.map((tag) => {
                    const active = dietary === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setDietary(tag);
                          setPage(1);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                          active
                            ? "bg-[#354B35] text-white"
                            : "bg-[#F0ECE1]/70 text-[#4A584A] hover:bg-[#E8E2D2]"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Filters Clear Row */}
            {hasActiveFilters && (
              <div className="pt-3 border-t border-[#F0ECE1] flex items-center justify-between text-xs">
                <span className="text-[#6B776A]">
                  Showing filtered video library results
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 font-bold text-[#C86D51] hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            )}
          </div>

          {/* Videos Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-[#243324]">
                {hasActiveFilters ? "Filtered Videos" : "All Discovery Videos"}
              </h2>
              <span className="text-xs text-[#6B776A]">
                {pagination.total} {pagination.total === 1 ? "video" : "videos"} available
              </span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-3xl overflow-hidden border border-[#E8E2D2] p-4 space-y-4 animate-pulse"
                  >
                    <div className="aspect-video bg-[#E8E2D2] rounded-2xl w-full" />
                    <div className="h-4 bg-[#E8E2D2] rounded-md w-3/4" />
                    <div className="h-3 bg-[#E8E2D2] rounded-md w-full" />
                    <div className="h-3 bg-[#E8E2D2] rounded-md w-1/2" />
                  </div>
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-[#E8E2D2] space-y-4 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-[#F7F3EA] text-[#354B35] flex items-center justify-center mx-auto">
                  <Video className="w-7 h-7" />
                </div>
                <h3 className="font-serif text-xl font-bold text-[#222922]">
                  No videos match your criteria
                </h3>
                <p className="text-xs text-[#6B776A] leading-relaxed">
                  Try adjusting your search terms or resetting filters to explore other recipes and nutrition tips.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-6 py-2.5 rounded-full bg-[#354B35] text-[#F7F3EA] font-semibold text-xs hover:bg-[#253525] transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {videos.map((video) => (
                  <VideoCard key={video._id || video.slug} video={video} />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="pt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full border border-[#E8E2D2] bg-white text-xs font-semibold text-[#354B35] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F7F3EA] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <span className="px-4 py-2 text-xs font-bold text-[#4A584A]">
                  Page {page} of {pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full border border-[#E8E2D2] bg-white text-xs font-semibold text-[#354B35] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F7F3EA] transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default function VideosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F7F3EA]">
          <div className="w-8 h-8 rounded-full border-2 border-[#354B35] border-t-transparent animate-spin" />
        </div>
      }
    >
      <VideosContent />
    </Suspense>
  );
}
