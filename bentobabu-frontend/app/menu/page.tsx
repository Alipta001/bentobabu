"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Filter,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  RotateCcw,
  Sparkles,
  Calendar,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/product/ProductCard";
import { useProducts, useCategories } from "@/hooks/useQueries";
import { DietaryType, ProductFilterOptions } from "@/types";
import { deduplicateProductsById } from "@/lib/menuUtils";

function getKolkataToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysKolkata(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function UrlParamsSync({
  onCategorySync,
  onSearchSync,
  onDateSync,
}: {
  onCategorySync: (cat: string) => void;
  onSearchSync: (q: string) => void;
  onDateSync: (date: string) => void;
}) {
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("category") || "";
  const urlSearch = searchParams.get("search") || "";
  const urlDate = searchParams.get("date") || "";

  useEffect(() => {
    if (urlCategory) onCategorySync(urlCategory);
    if (urlSearch) onSearchSync(urlSearch);
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) onDateSync(urlDate);
  }, [urlCategory, urlSearch, urlDate, onCategorySync, onSearchSync, onDateSync]);

  return null;
}

export default function MenuPage() {
  const todayKolkata = useMemo(() => getKolkataToday(), []);
  const tomorrowKolkata = useMemo(() => addDaysKolkata(todayKolkata, 1), [todayKolkata]);
  const [selectedDate, setSelectedDate] = useState<string>(() => getKolkataToday());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedDietary, setSelectedDietary] = useState<DietaryType[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(500);
  const [sortBy, setSortBy] = useState<ProductFilterOptions["sortBy"]>("popularity");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: categories = [] } = useCategories();

  const handleCategorySync = React.useCallback((cat: string) => {
    setSelectedCategory((prev) => prev || cat);
  }, []);

  const handleSearchSync = React.useCallback((q: string) => {
    setSearchQuery((prev) => prev || q);
    setDebouncedSearch((prev) => prev || q);
  }, []);

  const handleDateSync = React.useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  // Synchronize category from URL query parameters (slug to id)
  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      if (selectedCategory.toLowerCase() === "all") {
        setSelectedCategory("");
        return;
      }
      const match = categories.find((c) => c.slug === selectedCategory);
      if (match && match.id !== selectedCategory) {
        setSelectedCategory(match.id);
      }
    }
  }, [selectedCategory, categories]);

  const isAllCategory = !selectedCategory || selectedCategory.toLowerCase() === "all";

  const filterPayload: ProductFilterOptions = useMemo(
    () => ({
      categoryId: isAllCategory ? undefined : selectedCategory,
      search: debouncedSearch || undefined,
      dietary: selectedDietary.length > 0 ? selectedDietary : undefined,
      maxPrice: maxPrice < 500 ? maxPrice : undefined,
      sortBy,
      date: selectedDate || undefined,
    }),
    [isAllCategory, selectedCategory, debouncedSearch, selectedDietary, maxPrice, sortBy, selectedDate]
  );

  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useProducts(filterPayload);

  const isSearchActive = Boolean(debouncedSearch.trim());

  const displayedProducts = useMemo(
    () => (isSearchActive ? deduplicateProductsById(products) : products),
    [isSearchActive, products]
  );

  const signatureProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      if (!p.isSignatureItem || !p.isAvailable) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [products]);

  const toggleDietary = (type: DietaryType) => {
    setSelectedDietary((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleResetFilters = () => {
    setSelectedCategory("");
    setSearchQuery("");
    setSelectedDietary([]);
    setMaxPrice(500);
    setSortBy("popularity");
  };

  const hasActiveFilters =
    Boolean(selectedCategory && selectedCategory.toLowerCase() !== "all") ||
    Boolean(searchQuery) ||
    selectedDietary.length > 0 ||
    maxPrice < 500;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Suspense fallback={null}>
        <UrlParamsSync
          onCategorySync={handleCategorySync}
          onSearchSync={handleSearchSync}
          onDateSync={handleDateSync}
        />
      </Suspense>
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header & Title Banner */}
          <div className="bg-white rounded-3xl p-6 md:p-10 border border-[#E5DFC5] shadow-xs mb-8">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#755C2B]">
                Fresh Daily Kitchen
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#243324]">
                Explore Our Healthy Food Catalogue
              </h1>
              <p className="text-xs sm:text-sm text-[#4A584A] leading-relaxed">
                Filter by targeted wellness category, dietary preferences, or price to find the
                exact nutrition your body requires today.
              </p>
            </div>

            {/* Delivery Date Availability Selector */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#354B35]">
                <Calendar className="w-3.5 h-3.5 text-[#755C2B]" />
                <span>Delivery Date:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(todayKolkata)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  selectedDate === todayKolkata
                    ? "bg-[#354B35] text-white border-[#354B35]"
                    : "bg-[#F7F3EA] text-[#222922] border-[#E5DFC5] hover:border-[#354B35]"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(tomorrowKolkata)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                  selectedDate === tomorrowKolkata
                    ? "bg-[#354B35] text-white border-[#354B35]"
                    : "bg-[#F7F3EA] text-[#222922] border-[#E5DFC5] hover:border-[#354B35]"
                }`}
              >
                Tomorrow
              </button>
              <input
                type="date"
                min={todayKolkata}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                aria-label="Select delivery date"
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922] focus:outline-none focus:border-[#354B35]"
              />
            </div>

            {/* Quick Search & Sort Bar */}
            <div className="mt-6 pt-6 border-t border-[#F0ECE1] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  aria-label="Search by meal name, ingredient, or tag"
                  placeholder="Search by meal name, ingredient, tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-[#222922] focus:outline-none focus:border-[#354B35]"
                />
                <Search className="w-4 h-4 text-[#4A584A] absolute left-3.5 top-3 pointer-events-none" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2.5 text-[#4A584A] hover:text-[#222922]"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
                  className="md:hidden flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-semibold"
                >
                  <Filter className="w-4 h-4 text-[#DFC89B]" />
                  <span>Filters {hasActiveFilters ? "• Active" : ""}</span>
                </button>

                <div className="flex items-center gap-2 text-xs font-medium text-[#4A584A] ml-auto">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#755C2B]" />
                  <span>Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as ProductFilterOptions["sortBy"])
                    }
                    aria-label="Sort products by"
                    className="bg-[#F7F3EA] border border-[#E5DFC5] rounded-full px-3 py-1.5 text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
                  >
                    <option value="popularity">Popularity</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Main Layout: Sidebar Filters + Products Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Desktop Filters Sidebar */}
            <aside className="hidden lg:block space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-6 sticky top-28">
                <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
                  <div className="flex items-center gap-2 font-serif font-bold text-base text-[#222922]">
                    <SlidersHorizontal className="w-4 h-4 text-[#B99A60]" />
                    <span>Filter Products</span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={handleResetFilters}
                      className="text-[11px] font-semibold text-[#C86D51] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* Categories */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#4A584A] block">
                    Target Category
                  </label>
                  <div className="space-y-1">
                    <button
                      onClick={() => setSelectedCategory("")}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        isAllCategory
                          ? "bg-[#354B35] text-white"
                          : "text-[#4A584A] hover:bg-[#F7F3EA]"
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((c) => {
                      const isCatSelected = selectedCategory === c.id || selectedCategory === c.slug;
                      return (
                        <button
                          key={c.id || c.slug}
                          onClick={() => setSelectedCategory(c.id || c.slug)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                            isCatSelected
                              ? "bg-[#354B35] text-white"
                              : "text-[#4A584A] hover:bg-[#F7F3EA]"
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dietary Preference */}
                <div className="space-y-2 pt-2 border-t border-[#F0ECE1]">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#4A584A] block">
                    Dietary Choice
                  </label>
                  <div className="space-y-2">
                    {[
                      { label: "Vegetarian", value: "vegetarian" as DietaryType },
                      { label: "Non-Vegetarian", value: "non-vegetarian" as DietaryType },
                      { label: "Vegan (Plant-based)", value: "vegan" as DietaryType },
                      { label: "Contains Egg", value: "egg" as DietaryType },
                    ].map((item) => (
                      <label
                        key={item.value}
                        className="flex items-center gap-2 text-xs text-[#222922] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDietary.includes(item.value)}
                          onChange={() => toggleDietary(item.value)}
                          className="rounded text-[#354B35] focus:ring-[#354B35]"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price Range Filter */}
                <div className="space-y-2 pt-2 border-t border-[#F0ECE1]">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold uppercase tracking-wider text-[#4A584A]">
                      Max Price
                    </label>
                    <span className="font-bold text-[#354B35]">₹{maxPrice}</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="500"
                    step="20"
                    value={maxPrice}
                    aria-label="Maximum price filter"
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-full accent-[#354B35] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#4A584A]">
                    <span>₹150</span>
                    <span>₹500</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Mobile Filters Modal */}
            {mobileFilterOpen && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end lg:hidden">
                <div className="w-full bg-[#F7F3EA] rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5DFC5]">
                    <span className="font-serif font-bold text-lg text-[#222922]">
                      Filter Meals
                    </span>
                    <button
                      onClick={() => setMobileFilterOpen(false)}
                      className="p-1 rounded-full text-[#626F62]"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8A9A86]">
                      Category
                    </label>
                    <select
                      value={isAllCategory ? "" : selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-white border border-[#E5DFC5] text-xs text-[#222922]"
                    >
                      <option value="">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#8A9A86]">
                      Dietary Choice
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Veg", value: "vegetarian" as DietaryType },
                        { label: "Non-Veg", value: "non-vegetarian" as DietaryType },
                        { label: "Vegan", value: "vegan" as DietaryType },
                        { label: "Egg", value: "egg" as DietaryType },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => toggleDietary(item.value)}
                          className={`p-2 rounded-xl text-xs font-medium border text-center transition-colors ${
                            selectedDietary.includes(item.value)
                              ? "bg-[#354B35] text-white border-[#354B35]"
                              : "bg-white text-[#222922] border-[#E5DFC5]"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-[#E5DFC5]">
                    <button
                      onClick={handleResetFilters}
                      className="flex-1 py-3 rounded-full border border-[#354B35] text-[#354B35] font-semibold text-xs text-center"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={() => setMobileFilterOpen(false)}
                      className="flex-1 py-3 rounded-full bg-[#354B35] text-white font-semibold text-xs text-center shadow-md"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Product Grid */}
            <div className="lg:col-span-3">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-96 rounded-3xl bg-white/60 animate-pulse border border-[#E5DFC5]"
                    />
                  ))}
                </div>
              ) : isError ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-4 max-w-lg mx-auto">
                  <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto text-red-600">
                    <X className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-[#222922]">
                    Unable to Load Menu
                  </h3>
                  <p className="text-xs text-[#6B776A] leading-relaxed">
                    {error instanceof Error ? error.message : "We couldn't connect to our kitchen servers. Please check your connection and try again."}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold shadow-sm hover:bg-[#253525] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : displayedProducts.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-[#E5DFC5] space-y-4 max-w-lg mx-auto">
                  <div className="w-16 h-16 rounded-full bg-[#EDE8DE] flex items-center justify-center mx-auto text-[#8A9A86]">
                    <Search className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-[#222922]">
                    No Dishes Found
                  </h3>
                  <p className="text-xs text-[#6B776A] leading-relaxed">
                    We couldn&apos;t find any meals matching your active filters. Try adjusting
                    or resetting your criteria.
                  </p>
                  <button
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold shadow-sm hover:bg-[#253525] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All Filters</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-8 sm:space-y-10">
                  {!isSearchActive && signatureProducts.length > 0 && (
                    <>
                      <section
                        aria-labelledby="signature-items-heading"
                        className="space-y-4"
                      >
                        <div className="flex items-end justify-between gap-4">
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#755C2B]">
                              <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
                              <span>Chef&apos;s Curation</span>
                            </div>
                            <h2
                              id="signature-items-heading"
                              className="font-serif text-2xl sm:text-3xl font-bold text-[#243324]"
                            >
                              Signature Items
                            </h2>
                            <p className="text-xs sm:text-sm text-[#4A584A]">
                              Our specially selected favourites.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {signatureProducts.map((product, idx) => (
                            <ProductCard
                              key={`signature-${product.id}`}
                              product={product}
                              priority={idx === 0}
                              deliveryDate={selectedDate}
                            />
                          ))}
                        </div>
                      </section>

                      {/* Premium Section Divider */}
                      <div
                        role="separator"
                        aria-label="Full Daily Menu"
                        className="py-2 sm:py-3 flex items-center gap-3 sm:gap-4"
                      >
                        <div className="flex-1 flex flex-col gap-1">
                          <div className="h-px bg-gradient-to-r from-transparent via-[#B99A60]/60 to-[#B99A60]/80" />
                          <div className="h-px bg-gradient-to-r from-transparent via-[#354B35]/20 to-[#354B35]/35" />
                        </div>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#DFC89B] shadow-xs shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B99A60]" aria-hidden="true" />
                          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#354B35]">
                            Full Daily Menu
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#B99A60]" aria-hidden="true" />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                          <div className="h-px bg-gradient-to-l from-transparent via-[#B99A60]/60 to-[#B99A60]/80" />
                          <div className="h-px bg-gradient-to-l from-transparent via-[#354B35]/20 to-[#354B35]/35" />
                        </div>
                      </div>
                    </>
                  )}

                  <section
                    aria-labelledby={isSearchActive ? "search-results-heading" : undefined}
                    className="space-y-4"
                  >
                    {isSearchActive ? (
                      <div className="space-y-1">
                        <h2
                          id="search-results-heading"
                          className="font-serif text-2xl sm:text-3xl font-bold text-[#243324]"
                        >
                          Search Results
                        </h2>
                        <p className="text-xs text-[#4F5B4F] font-medium">
                          Showing {displayedProducts.length} matching{" "}
                          {displayedProducts.length === 1 ? "dish" : "dishes"} for &ldquo;
                          {debouncedSearch.trim()}&rdquo;
                        </p>
                      </div>
                    ) : (
                      <>
                        <h2 className="sr-only">Available Meals</h2>
                        <div className="text-xs text-[#4F5B4F] font-medium flex items-center justify-between">
                          <span>Showing {displayedProducts.length} fresh healthy dishes</span>
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {displayedProducts.map((product, idx) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          priority={(isSearchActive || signatureProducts.length === 0) && idx === 0}
                          deliveryDate={selectedDate}
                        />
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
