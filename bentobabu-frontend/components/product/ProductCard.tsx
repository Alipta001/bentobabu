"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Minus, Check, Clock, Flame, Video } from "lucide-react";
import { Product } from "@/types";
import { DietaryBadge } from "@/components/ui/DietaryBadge";
import { useAppSelector } from "@/store/hooks";
import { useCartSync } from "@/hooks/useCartSync";
import { useToast } from "@/context/ToastContext";
import { getOptimizedImageUrl } from "@/utils/mediaUrl";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

function ProductCardComponent({ product, priority = false }: ProductCardProps) {
  const { addItem, setQuantity } = useCartSync();
  const { showToast } = useToast();
  const [justAdded, setJustAdded] = useState(false);

  const productId = product.id || product._id;
  const quantityInCart = useAppSelector((state) => {
    const item = state.cart.items.find(
      (i) => (i?.product?.id || i?.product?._id) === productId
    );
    return item?.quantity || 0;
  });

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
          sizes="(max-width: 640px) 380px, (max-width: 1024px) 50vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
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
        {product.preparationTimeMinutes && (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#B99A60]" />
            <span>{product.preparationTimeMinutes}m prep</span>
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

          <p className="text-xs text-[#4F5B4F] line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Cart Actions */}
        <div className="pt-3 border-t border-[#F0ECE1] flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-[#354B35]">
                ₹{product.price}
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
          </div>

          {/* Cart Stepper or Add Button */}
          {!product.isAvailable ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              Unavailable Today
            </span>
          ) : (product.stockQuantity ?? 1) <= 0 ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              Out of Stock
            </span>
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

