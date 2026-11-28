"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  Minus,
  Check,
  Clock,
  ShieldCheck,
  Flame,
  Sparkles,
  ArrowLeft,
  Share2,
  Video as VideoIcon,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { Product } from "@/types";
import { DietaryBadge } from "@/components/ui/DietaryBadge";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { useCartSync } from "@/hooks/useCartSync";
import { useToast } from "@/context/ToastContext";
import { useOrderingStatus } from "@/context/OrderingStatusContext";
import { getOptimizedImageUrl, isCloudinaryUrl } from "@/utils/mediaUrl";
import { deduplicateUrls } from "@/services/productService";
import { ProductDescription } from "@/components/product/ProductDescription";
import { trackAddToCart, trackViewItem } from "@/lib/analytics";
import { useAnalyticsConsent } from "@/components/analytics/useAnalyticsConsent";

interface ProductDetailViewProps {
  product: Product;
  relatedProducts: Product[];
}

export function ProductDetailView({
  product,
  relatedProducts,
}: ProductDetailViewProps) {
  const { addItem, cartItems } = useCartSync();
  const { showToast } = useToast();
  const { acceptingOrders } = useOrderingStatus();

  const images = useMemo(() => {
    const raw = product.galleryImages && product.galleryImages.length > 0
      ? product.galleryImages
      : product.images && product.images.length > 0
      ? product.images
      : [product.imageUrl];
    return deduplicateUrls(raw.filter(Boolean));
  }, [product.galleryImages, product.images, product.imageUrl]);

  const [activeImage, setActiveImage] = useState(
    images[0] || product.imageUrl || ""
  );

  useEffect(() => {
    if (images.length > 0 && (!activeImage || !images.includes(activeImage))) {
      setActiveImage(images[0]);
    }
  }, [images, activeImage]);

  const [viewMode, setViewMode] = useState<"photo" | "video">("photo");
  const [quantity, setQuantity] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const defaultVariant = useMemo(() => {
    if (!product.hasVariants || !Array.isArray(product.variants) || product.variants.length === 0) {
      return null;
    }
    return product.variants.find((v) => v.isAvailable) || product.variants[0];
  }, [product.hasVariants, product.variants]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    defaultVariant?._id || defaultVariant?.id || null
  );

  useEffect(() => {
    if (defaultVariant && !selectedVariantId) {
      setSelectedVariantId(defaultVariant._id || defaultVariant.id || null);
    }
  }, [defaultVariant, selectedVariantId]);

  const selectedVariant = useMemo(() => {
    if (!product.hasVariants || !Array.isArray(product.variants)) return null;
    return (
      product.variants.find((v) => (v._id || v.id) === selectedVariantId) || defaultVariant
    );
  }, [product.hasVariants, product.variants, selectedVariantId, defaultVariant]);

  const effectivePrice = selectedVariant ? selectedVariant.price : product.price;
  const isVariantUnavailable = product.hasVariants && selectedVariant && selectedVariant.isAvailable === false;

  const isSoldOut = (product.stockQuantity ?? 1) <= 0;
  const maxStock = Math.max(1, product.stockQuantity ?? 99);
  const isLowStock = !isSoldOut && (product.stockQuantity ?? 99) <= (product.lowStockThreshold || 5);

  const targetVariantKey = selectedVariant?._id || selectedVariant?.id || null;
  const cartItem = cartItems.find(
    (item) =>
      item.product.id === product.id &&
      (targetVariantKey ? (item.variantId ? String(item.variantId) : null) === String(targetVariantKey) : true)
  );

  const consentGranted = useAnalyticsConsent();
  const viewedProductIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!consentGranted) return;
    const pid = String(product.id || product._id || "");
    if (!pid || viewedProductIdRef.current === pid) return;
    viewedProductIdRef.current = pid;
    trackViewItem(product, effectivePrice, selectedVariant?.name || null);
  }, [consentGranted, product, effectivePrice, selectedVariant]);

  const handleAddToCart = () => {
    if (isVariantUnavailable) return;
    addItem(
      product,
      quantity,
      selectedVariant?._id || selectedVariant?.id || null,
      selectedVariant?.name || null,
      effectivePrice
    );
    trackAddToCart(
      product,
      quantity,
      selectedVariant?.name || null,
      effectivePrice
    );
    setAddedSuccess(true);
    showToast({
      title: "Added to Bento Cart",
      message: `${quantity}x ${product.name}${selectedVariant?.name ? ` (${selectedVariant.name})` : ""} • Total: ₹${effectivePrice * quantity}`,
      type: "success",
      action: {
        label: "Proceed to Cart →",
        href: "/cart",
      },
    });
    setTimeout(() => setAddedSuccess(false), 2500);
  };

  return (
    <div className="space-y-12">
      {/* Top Breadcrumb & Share */}
      <div className="flex items-center justify-between">
        <Link
          href="/menu"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </Link>
        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: product.name,
                url: window.location.href,
              });
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs text-[#626F62] hover:text-[#354B35] transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      </div>

      {/* Main Product Showcase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 bg-white rounded-3xl p-6 sm:p-10 border border-[#E5DFC5] shadow-xs">
        {/* Left Column: Image Gallery & Video Showcase */}
        <div className="lg:col-span-6 space-y-4">
          {/* Mode Selector Tabs (if video available) */}
          {product.video?.secureUrl && (
            <div className="flex items-center gap-2 p-1 bg-[#F7F3EA] rounded-full border border-[#E5DFC5] w-fit">
              <button
                type="button"
                onClick={() => setViewMode("photo")}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  viewMode === "photo"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "text-[#626F62] hover:text-[#354B35]"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Photos</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("video")}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  viewMode === "video"
                    ? "bg-[#354B35] text-white shadow-xs"
                    : "text-[#626F62] hover:text-[#354B35]"
                }`}
              >
                <VideoIcon className="w-3.5 h-3.5 text-[#B99A60]" />
                <span>Chef Showcase</span>
              </button>
            </div>
          )}

          {viewMode === "video" && product.video?.secureUrl ? (
            <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden bg-black/95 border border-[#E5DFC5] flex items-center justify-center">
              <video
                src={product.video.secureUrl}
                poster={product.video.posterUrl || product.imageUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>
          ) : (
            <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden bg-[#EDE8DE] border border-[#E5DFC5]">
              <Image
                src={getOptimizedImageUrl(activeImage, "detail")}
                alt={product.name}
                fill
                priority
                fetchPriority="high"
                loading="eager"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-all duration-300"
                unoptimized={isCloudinaryUrl(activeImage)}
              />
              <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                <DietaryBadge type={product.dietary} />
                {product.isBestseller && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#B99A60] text-white shadow-sm">
                    <Flame className="w-3.5 h-3.5" />
                    Bestseller
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Thumbnails (for Photos) */}
          {images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActiveImage(img);
                    setViewMode("photo");
                  }}
                  aria-label={`View photo ${idx + 1} of ${product.name}`}
                  className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    activeImage === img && viewMode === "photo"
                      ? "border-[#354B35] scale-102"
                      : "border-[#E5DFC5] opacity-70"
                  }`}
                >
                  <Image
                    src={getOptimizedImageUrl(img, "thumbnail")}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized={isCloudinaryUrl(img)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Information & Controls */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8A9A86] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
              <span>Chef Handcrafted Fresh Bento</span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#222922] leading-tight">
              {product.name}
            </h1>

            {product.totalReviews && product.totalReviews > 0 ? (
              <a
                href="#reviews-section"
                className="inline-flex items-center gap-1.5 text-xs text-[#354B35] hover:underline"
              >
                <div className="flex items-center text-amber-500">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                </div>
                <span className="font-bold text-[#222922]">{product.averageRating?.toFixed(1)}</span>
                <span className="text-[#8A9A86]">({product.totalReviews} verified reviews)</span>
              </a>
            ) : null}

            <div className="flex items-baseline gap-3">
              <span className="font-serif text-3xl font-bold text-[#354B35]">
                ₹{effectivePrice}
              </span>
              {product.originalPrice && product.originalPrice > effectivePrice && (
                <span className="text-sm text-[#8A9A86] line-through">
                  ₹{product.originalPrice}
                </span>
              )}
              {product.servingSize && (
                <span className="text-xs text-[#626F62] bg-[#F7F3EA] px-2.5 py-1 rounded-full border border-[#E5DFC5]">
                  Serving: {product.servingSize}
                </span>
              )}
            </div>

            {/* Dynamic Product Variants / Options Selector */}
            {product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0 && (
              <div className="space-y-2.5 p-4 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#354B35]">
                    {product.variantLabel || "Choose Option"}
                  </label>
                  {selectedVariant && (
                    <span className="text-xs text-[#626F62]">
                      Selected: <strong className="text-[#1F271F]">{selectedVariant.name}</strong> (₹{selectedVariant.price})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const vId = v._id || v.id || v.name;
                    const isSelected = (selectedVariant?._id || selectedVariant?.id) === (v._id || v.id);
                    const isAvailable = v.isAvailable !== false;
                    return (
                      <button
                        key={vId}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedVariantId(v._id || v.id || null)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                          isSelected
                            ? "bg-[#354B35] text-white border-[#354B35] shadow-xs scale-102"
                            : isAvailable
                            ? "bg-white text-[#1F271F] border-[#E5DFC5] hover:border-[#354B35]/40 hover:bg-[#FAF8F3]"
                            : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60 line-through"
                        }`}
                      >
                        <span>{v.name}</span>
                        <span className={isSelected ? "text-[#E5DFC5]" : "text-[#755C2B]"}>
                          ₹{v.price}
                        </span>
                        {!isAvailable && (
                          <span className="text-[10px] text-rose-600 no-underline font-normal">
                            (Unavailable)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <ProductDescription
              content={product.detailedDescription || product.description}
              className="py-1"
            />

            {/* Preparation and Delivery Notes */}
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-[#F0ECE1] text-xs text-[#222922]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#B99A60]" />
                <span>
                  {product.preparationTimeMinutes || product.preparationTime
                    ? `Prep: ${product.preparationTimeMinutes || product.preparationTime} minutes`
                    : "Freshly prepared to order"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#354B35]" />
                <span>Zero Artificial Preservatives</span>
              </div>
            </div>

            {/* Nutritional Macros Table */}
            {product.nutritionalInfo && (
              <div className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#354B35]">
                  Nutrition Facts (Per Serving)
                </h2>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-[#F7F3EA] rounded-2xl p-2.5 border border-[#E5DFC5]">
                    <div className="text-[10px] text-[#4A584A] uppercase">Calories</div>
                    <div className="font-bold text-sm text-[#222922]">
                      {product.nutritionalInfo.calories} kcal
                    </div>
                  </div>
                  <div className="bg-[#F7F3EA] rounded-2xl p-2.5 border border-[#E5DFC5]">
                    <div className="text-[10px] text-[#4A584A] uppercase">Protein</div>
                    <div className="font-bold text-sm text-[#354B35]">
                      {product.nutritionalInfo.protein}g
                    </div>
                  </div>
                  <div className="bg-[#F7F3EA] rounded-2xl p-2.5 border border-[#E5DFC5]">
                    <div className="text-[10px] text-[#4A584A] uppercase">Carbs</div>
                    <div className="font-bold text-sm text-[#222922]">
                      {product.nutritionalInfo.carbs}g
                    </div>
                  </div>
                  <div className="bg-[#F7F3EA] rounded-2xl p-2.5 border border-[#E5DFC5]">
                    <div className="text-[10px] text-[#4A584A] uppercase">Fats</div>
                    <div className="font-bold text-sm text-[#222922]">
                      {product.nutritionalInfo.fats}g
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ingredients & Allergens */}
            {product.ingredients && product.ingredients.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#4A584A]">
                  Key Farm Ingredients
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {product.ingredients.map((ing, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-[#EDE8DE] text-[#222922] px-2.5 py-1 rounded-lg"
                    >
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.allergens && product.allergens.length > 0 && (
              <div className="text-[11px] text-[#4A584A] pt-1">
                <strong>Allergen Notice:</strong> {product.allergens.join(", ")}
              </div>
            )}
          </div>

          {/* Interactive Controls & CTA */}
          <div className="pt-4 border-t border-[#F0ECE1] space-y-3">
            {/* Real-time Inventory Alerts */}
            {isSoldOut ? (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                <span>This item has reached daily kitchen capacity and is sold out for today.</span>
              </div>
            ) : isLowStock ? (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                <span>Hurry! Only {product.stockQuantity} packet(s) remaining for today.</span>
              </div>
            ) : null}

            <div className="flex items-center gap-4">
              {/* Quantity Stepper */}
              <div className="flex items-center gap-3 bg-[#F7F3EA] border border-[#E5DFC5] rounded-full px-3 py-1.5">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={isSoldOut}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5 text-[#222922]" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-[#222922]">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                  disabled={isSoldOut || quantity >= maxStock}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5 text-[#222922]" />
                </button>
              </div>

              {/* Add to Cart CTA */}
              <button
                onClick={handleAddToCart}
                disabled={!acceptingOrders || !product.isAvailable || isSoldOut || Boolean(isVariantUnavailable)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-full text-sm font-bold shadow-md transition-all duration-200 ${
                  !acceptingOrders
                    ? "bg-amber-100 text-amber-900 border border-amber-300 cursor-not-allowed opacity-90"
                    : !product.isAvailable
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300"
                    : isSoldOut
                    ? "bg-rose-100 text-rose-800 border border-rose-300 cursor-not-allowed"
                    : isVariantUnavailable
                    ? "bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed"
                    : addedSuccess
                    ? "bg-emerald-700 text-white cursor-pointer"
                    : "bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525] cursor-pointer"
                }`}
              >
                {!acceptingOrders ? (
                  <span>Ordering is temporarily unavailable</span>
                ) : !product.isAvailable ? (
                  <span>Unavailable on Today&apos;s Menu</span>
                ) : isSoldOut ? (
                  <span>Sold Out for Today</span>
                ) : isVariantUnavailable ? (
                  <span>Option &ldquo;{selectedVariant?.name}&rdquo; is Unavailable</span>
                ) : addedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added {quantity} to Bento Cart!</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-[#B99A60]" />
                    <span>Add {quantity} to Cart • ₹{effectivePrice * quantity}</span>
                  </>
                )}
              </button>
            </div>

            {cartItem && (
              <div className="text-xs text-center text-[#354B35] font-medium flex items-center justify-center gap-2">
                <span>Already in your cart ({cartItem.quantity} units).</span>
                <Link href="/cart" className="underline font-bold hover:text-[#B99A60]">
                  View Cart
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verified Customer Reviews Section */}
      <ProductReviewsSection
        productId={product.id || (product as any)._id}
        productName={product.name}
      />

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="space-y-6 pt-6">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold tracking-widest text-[#755C2B]">
              Pair With
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#243324]">
              You May Also Enjoy
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map((rel) => (
              <ProductCard key={rel.id} product={rel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
