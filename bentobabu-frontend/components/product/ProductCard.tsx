"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Minus, Check, Clock, Flame, Video, Star } from "lucide-react";
import { Product } from "@/types";
import { DietaryBadge } from "@/components/ui/DietaryBadge";
import { useAppSelector } from "@/store/hooks";
import { useCartSync } from "@/hooks/useCartSync";
import { useToast } from "@/context/ToastContext";
import { useOrderingStatus } from "@/context/OrderingStatusContext";
import { getOptimizedImageUrl, isCloudinaryUrl } from "@/utils/mediaUrl";
import { stripHtmlTags } from "@/utils/textFormat";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

function ProductCardComponent({ product, priority = false }: ProductCardProps) {
  const { addItem, setQuantity } = useCartSync();
  const { showToast } = useToast();
  const { acceptingOrders } = useOrderingStatus();
  const [justAdded, setJustAdded] = useState(false);

  const productId = product.id || product._id;
  const quantityInCart = useAppSelector((state) => {
    const item = state.cart.items.find(
      (i) => (i?.product?.id || i?.product?._id) === productId
    );
    return item?.quantity || 0;
  });

  const isSoldOut = (product.stockQuantity ?? 1) <= 0;
  const isLowStock = !isSoldOut && (product.stockQuantity ?? 99) <= (product.lowStockThreshold || 5);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSoldOut || !product.isAvailable) return;
    addItem(product, 1);
    setJustAdded(true);
    showToast({
      title: `Added to Cart`,
      message: `${product.name} (1x) • ₹${product.price}`,
      type: "success",
      action: {
        label: "View Cart & Checkout →",
        href: "/cart",
      },
    });
    setTimeout(() => setJustAdded(false), 1500);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const maxStock = product.stockQuantity ?? 99;
    if (quantityInCart >= maxStock) {
      alert(`Only ${maxStock} packet(s) available for today.`);
      return;
    }
    setQuantity(product.id, quantityInCart + 1);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setQuantity(product.id, quantityInCart - 1);
  };

  return (
    <div className="group relative flex flex-col bg-white rounded-3xl border border-[#E5DFC5] shadow-xs hover:shadow-xl hover:border-[#354B35]/30 transition-all duration-300 overflow-hidden">
      {/* Product Image & Badges */}
      <Link href={`/product/${product.slug}`} className="relative aspect-4/3 w-full overflow-hidden bg-[#EDE8DE] block">
        <Image
          src={getOptimizedImageUrl(product.imageUrl, "card")}
          alt={product.name}
          fill
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          unoptimized={isCloudinaryUrl(product.imageUrl)}
        />

        {/* Dietary Badge Top Left */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          <DietaryBadge type={product.dietary} />
          {!product.isAvailable && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-rose-700 text-white shadow-sm">
              Unavailable Today
            </span>
          )}
          {product.isAvailable && product.isBestseller && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-[#755C2B] text-white shadow-sm">
              <Flame className="w-3 h-3" />
              Bestseller
            </span>
          )}
        </div>

        {/* Video Badge Top Right */}
        {product.video?.secureUrl && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 z-10">
            <Video className="w-3 h-3 text-[#B99A60]" />
            <span>Video</span>
          </div>
        )}

        {/* Prep Time Tag Bottom Right */}
        {Boolean(product.preparationTimeMinutes || product.preparationTime) && (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#B99A60]" />
            <span>{product.preparationTimeMinutes || product.preparationTime}m prep</span>
          </div>
        )}
      </Link>

      {/* Body Content */}
      <div className="flex flex-col flex-1 p-5 justify-between gap-4">
        <div className="space-y-2">
          {/* Nutrition Macro Badges */}
          {product.nutritionalInfo && (
            <div className="flex items-center gap-2 text-[11px] font-medium text-[#4F5B4F] bg-[#F7F3EA] px-2.5 py-1 rounded-lg w-fit">
              <span>{product.nutritionalInfo.calories} kcal</span>
              <span className="text-[#755C2B] font-bold">•</span>
              <span className="font-semibold text-[#354B35]">{product.nutritionalInfo.protein}g protein</span>
              <span className="text-[#755C2B] font-bold">•</span>
              <span>{product.nutritionalInfo.carbs}g carbs</span>
            </div>
          )}

          <Link href={`/product/${product.slug}`} className="block">
            <h3 className="font-serif text-lg font-bold text-[#222922] group-hover:text-[#354B35] transition-colors line-clamp-1">
              {product.name}
            </h3>
          </Link>

          {/* Customer Rating if real reviews exist */}
          {Boolean(product.totalReviews && product.totalReviews > 0) && (
            <div className="flex items-center gap-1.5 text-xs text-[#222922]">
              <div className="flex items-center text-amber-500">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              </div>
              <span className="font-bold text-xs">{product.averageRating?.toFixed(1)}</span>
              <span className="text-[11px] text-[#6B776A]">({product.totalReviews})</span>
            </div>
          )}

          <p className="text-xs text-[#4F5B4F] line-clamp-2 leading-relaxed">
            {stripHtmlTags(product.description)}
          </p>
        </div>

        {/* Price & Cart Actions */}
        <div className="pt-3 border-t border-[#F0ECE1] flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-[#354B35]">
                {product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0
                  ? `From ₹${Math.min(...product.variants.map((v) => v.price))}`
                  : `₹${product.price}`}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-xs text-[#5F6D5F] line-through">
                  ₹{product.originalPrice}
                </span>
              )}
            </div>
            {product.servingSize && (
              <span className="text-[10px] text-[#5F6D5F] block">
                Net: {product.servingSize}
              </span>
            )}
            {isLowStock && (
              <span className="text-[10px] font-bold text-amber-800 block">
                Only {product.stockQuantity} left!
              </span>
            )}
          </div>

          {/* Cart Stepper or Add Button */}
          {!acceptingOrders ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              Ordering Paused
            </span>
          ) : !product.isAvailable ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              Unavailable Today
            </span>
          ) : isSoldOut ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
              Sold Out
            </span>
          ) : product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0 ? (
            <Link
              href={`/product/${product.slug}`}
              className="flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-semibold shadow-xs bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525] hover:scale-102 transition-all cursor-pointer"
            >
              <span>Select Option</span>
            </Link>
          ) : quantityInCart > 0 ? (
            <div className="flex items-center gap-2 bg-[#354B35] text-[#F7F3EA] rounded-full p-1 shadow-sm">
              <button
                onClick={handleDecrement}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#253525] transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-xs font-bold">
                {quantityInCart}
              </span>
              <button
                onClick={handleIncrement}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#253525] transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold shadow-xs transition-all duration-200 cursor-pointer ${
                justAdded
                  ? "bg-emerald-700 text-white"
                  : "bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525] hover:scale-102"
              }`}
            >
              {justAdded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Cart</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProductCard = React.memo(ProductCardComponent);

