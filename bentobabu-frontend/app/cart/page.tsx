"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Tag,
  CheckCircle2,
  AlertCircle,
  Truck,
  ShieldCheck,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { DietaryBadge } from "@/components/ui/DietaryBadge";
import { useAppDispatch } from "@/store/hooks";
import { applyCoupon } from "@/store/cartSlice";
import { useCartSync } from "@/hooks/useCartSync";
import { cartService } from "@/services/cartService";
import { useDeliveryConfig } from "@/hooks/useQueries";
import { useOrderingStatus } from "@/context/OrderingStatusContext";
import { getOptimizedImageUrl, isCloudinaryUrl } from "@/utils/mediaUrl";

export default function CartPage() {
  const dispatch = useAppDispatch();
  const { cartItems, appliedCoupon, setQuantity, removeItem, clear } = useCartSync();
  const { acceptingOrders } = useOrderingStatus();
  const { data: deliveryConfig } = useDeliveryConfig();

  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponSuccess, setCouponSuccess] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const subtotal = cartItems.reduce(
    (acc, item) => acc + (item.unitPrice ?? item.product.price) * item.quantity,
    0
  );

  const minimumOrderValue = deliveryConfig?.minimumOrderValue ?? 0;
  const isBelowMinimum = minimumOrderValue > 0 && subtotal < minimumOrderValue;
  const shortfall = isBelowMinimum ? minimumOrderValue - subtotal : 0;
  const hasUnavailableItems = cartItems.some((item) => item.product.isAvailable === false);

  const discount = appliedCoupon
    ? appliedCoupon.discountType === "PERCENTAGE"
      ? Math.min(
          Math.round((subtotal * appliedCoupon.discountValue) / 100),
          appliedCoupon.maximumDiscount || Infinity
        )
      : appliedCoupon.discountValue
    : 0;

  const tax = 0;
  const total = Math.max(0, subtotal - discount + tax);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError("");
    setCouponSuccess("");
    if (!couponInput.trim()) return;

    setIsApplyingCoupon(true);
    try {
      const coupon = await cartService.applyCoupon(couponInput, subtotal);
      dispatch(applyCoupon(coupon));
      setCouponSuccess(`Coupon ${coupon.code} applied successfully!`);
      setCouponInput("");
    } catch (err: unknown) {
      setCouponError(
        err instanceof Error ? err.message : "Failed to apply coupon."
      );
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    dispatch(applyCoupon(null));
    setCouponSuccess("");
    setCouponError("");
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="max-w-md w-full mx-auto p-8 bg-white rounded-3xl border border-[#E5DFC5] text-center space-y-5 shadow-xs">
            <div className="w-20 h-20 rounded-full bg-[#EDE8DE] flex items-center justify-center mx-auto text-[#8A9A86]">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#222922]">
              Your Bento Cart is Empty
            </h2>
            <p className="text-xs text-[#6B776A] leading-relaxed">
              Looks like you haven&apos;t added any wholesome meals yet. Discover our chef-crafted
              protein bowls and ancient grain dishes.
            </p>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-sm font-bold shadow-md hover:bg-[#253525] transition-colors"
            >
              <span>Explore Fresh Menu</span>
              <ArrowRight className="w-4 h-4 text-[#B99A60]" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Title Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#755C2B]">
                Checkout Review
              </span>
              <h1 className="font-serif text-3xl font-bold text-[#222922]">
                Your Fresh Bento Cart ({cartItems.length}{" "}
                {cartItems.length === 1 ? "item" : "items"})
              </h1>
            </div>
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear your cart?")) {
                  clear();
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C86D51] hover:underline self-start sm:self-auto cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Cart</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Cart Items List */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-3xl border border-[#E5DFC5] overflow-hidden shadow-xs divide-y divide-[#F0ECE1]">
                {cartItems.map((item) => {
                  const itemPrice = item.unitPrice ?? item.product.price;
                  const itemKey = `${item.product.id}-${item.variantId || "default"}`;
                  return (
                    <div
                      key={itemKey}
                      className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      {/* Thumbnail & Meta */}
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-[#EDE8DE] shrink-0 border border-[#E5DFC5]">
                          <Image
                            src={getOptimizedImageUrl(item.product.imageUrl, "thumbnail")}
                            alt={item.product.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                            unoptimized={isCloudinaryUrl(item.product.imageUrl)}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <DietaryBadge type={item.product.dietary} showText={false} />
                            {item.product.isAvailable === false && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-700 text-white shadow-xs">
                                Currently Unavailable
                              </span>
                            )}
                          </div>
                          <h3 className="font-serif font-bold text-base text-[#222922] hover:text-[#354B35] transition-colors">
                            <Link href={`/product/${item.product.slug}`}>
                              {item.product.name}
                            </Link>
                          </h3>
                          {item.variantName && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 mt-0.5">
                              <span>Option: {item.variantName}</span>
                            </div>
                          )}
                          <div className="text-xs text-[#6B776A]">
                            ₹{itemPrice} each
                            {item.product.servingSize && ` • ${item.product.servingSize}`}
                          </div>
                        </div>
                      </div>

                      {/* Stepper & Line Price */}
                      <div className="flex items-center justify-between w-full sm:w-auto gap-6 sm:justify-end">
                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-2 bg-[#F7F3EA] border border-[#E5DFC5] rounded-full p-1">
                          <button
                            onClick={() => setQuantity(item.product.id, item.quantity - 1, item.variantId)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5 text-[#222922]" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-[#222922]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => setQuantity(item.product.id, item.quantity + 1, item.variantId)}
                            disabled={item.product.isAvailable === false}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#222922]" />
                          </button>
                        </div>

                        {/* Line Item Total */}
                        <div className="text-right min-w-[70px]">
                          <span className="font-serif font-bold text-base text-[#354B35]">
                            ₹{itemPrice * item.quantity}
                          </span>
                        </div>

                        {/* Delete Item */}
                        <button
                          onClick={() => removeItem(item.product.id, item.variantId)}
                          className="text-[#8A9A86] hover:text-[#C86D51] p-1.5 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delivery Policy Notice */}
              <div className="bg-[#EBF0E9] rounded-2xl p-4 border border-[#8A9A86]/30 flex items-center gap-3 text-xs text-[#354B35]">
                <Truck className="w-5 h-5 text-[#354B35] shrink-0" />
                <div>
                  <span className="font-semibold">
                    Doorstep Delivery Available
                  </span>
                  <p className="text-[11px] text-[#4A584A] mt-0.5">
                    Delivery charge is determined by kitchen administration and verified at checkout.
                  </p>
                </div>
              </div>

              <Link
                href="/menu"
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors pt-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Continue Shopping</span>
              </Link>
            </div>

            {/* Right Column: Order Summary & Coupon */}
            <div className="lg:col-span-4 space-y-6 sticky top-28">
              {/* Promo Code Card */}
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#354B35]">
                  <Tag className="w-4 h-4 text-[#B99A60]" />
                  <span>Promo & Coupons</span>
                </div>

                {appliedCoupon ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-emerald-900">
                        {appliedCoupon.code}
                      </span>
                      <p className="text-[11px] text-emerald-700">
                        {appliedCoupon.description}
                      </p>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-emerald-800 hover:text-red-700 font-semibold text-xs ml-3"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. HEALTHY50"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-mono uppercase focus:outline-none focus:border-[#354B35]"
                      />
                      <button
                        type="submit"
                        disabled={isApplyingCoupon || !couponInput.trim()}
                        className="px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] disabled:opacity-50 cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="text-[11px] text-[#8A9A86]">
                      Try code: <strong>HEALTHY50</strong> (₹50 off) or <strong>FIRSTBOWL</strong> (20% off)
                    </div>
                  </form>
                )}

                {couponError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{couponError}</span>
                  </div>
                )}
                {couponSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{couponSuccess}</span>
                  </div>
                )}
              </div>

              {/* Price Breakdown Card */}
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-4">
                <h3 className="font-serif text-lg font-bold text-[#222922] pb-3 border-b border-[#F0ECE1]">
                  Order Bill Details
                </h3>

                <div className="space-y-2.5 text-xs text-[#626F62]">
                  <div className="flex justify-between">
                    <span>Items Subtotal</span>
                    <span className="font-medium text-[#222922]">₹{subtotal}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount Voucher</span>
                      <span className="font-bold">- ₹{discount}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Delivery Charge</span>
                    <span className="text-[#354B35] font-medium text-[11px]">
                      Calculated at checkout
                    </span>
                  </div>

                  {tax > 0 && (
                    <div className="flex justify-between">
                      <span>GST / Taxes</span>
                      <span className="font-medium text-[#222922]">₹{tax}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#F0ECE1] flex items-baseline justify-between">
                  <span className="font-serif font-bold text-base text-[#222922]">
                    To Pay
                  </span>
                  <span className="font-serif font-bold text-2xl text-[#354B35]">
                    ₹{total}
                  </span>
                </div>

                {hasUnavailableItems && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">One or more items in your cart are currently unavailable.</span>
                      <span className="text-[11px] text-rose-800">Please remove unavailable items to continue.</span>
                    </div>
                  </div>
                )}

                {isBelowMinimum && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Minimum order value is ₹{minimumOrderValue}.</span>
                      <span className="text-[11px] text-amber-800">Add ₹{shortfall} more to continue.</span>
                    </div>
                  </div>
                )}

                {!acceptingOrders ? (
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-sm font-bold shadow-none cursor-not-allowed opacity-90"
                    >
                      <span>Ordering is temporarily unavailable</span>
                    </button>
                    <p className="text-center text-xs text-amber-800">
                      Our kitchen is resting. Your cart items are safely saved.
                    </p>
                  </div>
                ) : isBelowMinimum ? (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-full bg-gray-200 text-gray-400 text-sm font-bold shadow-none cursor-not-allowed opacity-80"
                  >
                    <span>Minimum Order ₹{minimumOrderValue} (Add ₹{shortfall})</span>
                  </button>
                ) : hasUnavailableItems ? (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-full bg-gray-200 text-gray-500 text-sm font-bold shadow-none cursor-not-allowed opacity-80"
                  >
                    <span>Remove Unavailable Items to Checkout</span>
                  </button>
                ) : (
                  <Link
                    href="/checkout"
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-full bg-[#354B35] text-[#F7F3EA] text-sm font-bold shadow-md hover:bg-[#253525] transition-all cursor-pointer"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4 text-[#B99A60]" />
                  </Link>
                )}

                <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-[#8A9A86]">
                  <ShieldCheck className="w-4 h-4 text-[#354B35]" />
                  <span>Verified Safe & Contactless Delivery</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
