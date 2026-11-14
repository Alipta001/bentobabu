"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { Product } from "@/types";
import { DietaryBadge } from "@/components/ui/DietaryBadge";
import { ProductCard } from "@/components/product/ProductCard";
import { useCartSync } from "@/hooks/useCartSync";
import { useToast } from "@/context/ToastContext";

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
  const [activeImage, setActiveImage] = useState(
    product.imageUrl || product.galleryImages?.[0] || ""
  );
  const [quantity, setQuantity] = useState(1);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const cartItem = cartItems.find((item) => item.product.id === product.id);

  const images = product.galleryImages?.length
    ? product.galleryImages
    : [product.imageUrl];

  const handleAddToCart = () => {
    addItem(product, quantity);
    setAddedSuccess(true);
    showToast({
      title: "Added to Bento Cart",
      message: `${quantity}x ${product.name} • Total: ₹${product.price * quantity}`,
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
        {/* Left Column: Image Gallery */}
        <div className="lg:col-span-6 space-y-4">
          <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden bg-[#EDE8DE] border border-[#E5DFC5]">
            <Image
              src={activeImage}
              alt={product.name}
              fill
              priority
              fetchPriority="high"
              loading="eager"
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-all duration-300"
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

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(img)}
                  aria-label={`View photo ${idx + 1} of ${product.name}`}
                  className={`relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    activeImage === img ? "border-[#354B35] scale-102" : "border-[#E5DFC5] opacity-70"
                  }`}
                >
                  <Image src={img} alt="" fill sizes="80px" className="object-cover" />
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

            <div className="flex items-baseline gap-3">
              <span className="font-serif text-3xl font-bold text-[#354B35]">
                ₹{product.price}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
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

            <p className="text-xs sm:text-sm text-[#626F62] leading-relaxed">
              {product.detailedDescription || product.description}
            </p>

            {/* Preparation and Delivery Notes */}
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-[#F0ECE1] text-xs text-[#222922]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#B99A60]" />
                <span>Prep: {product.preparationTimeMinutes || 15} minutes</span>
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
            <div className="flex items-center gap-4">
              {/* Quantity Stepper */}
              <div className="flex items-center gap-3 bg-[#F7F3EA] border border-[#E5DFC5] rounded-full px-3 py-1.5">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5 text-[#222922]" />
                </button>
                <span className="w-6 text-center text-sm font-bold text-[#222922]">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5 text-[#222922]" />
                </button>
              </div>

              {/* Add to Cart CTA */}
              <button
                onClick={handleAddToCart}
                disabled={!product.isAvailable}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-full text-sm font-bold shadow-md transition-all duration-200 cursor-pointer ${
                  !product.isAvailable
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : addedSuccess
                    ? "bg-emerald-700 text-white"
                    : "bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525]"
                }`}
              >
                {addedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Added {quantity} to Bento Cart!</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-[#B99A60]" />
                    <span>Add {quantity} to Cart • ₹{product.price * quantity}</span>
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
