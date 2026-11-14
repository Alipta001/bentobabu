"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  TicketPercent,
  Plus,
  Calendar,
  CheckCircle2,
  X,
  Tag,
  Copy,
  Check,
} from "lucide-react";
import {
  useAdminCoupons,
  useCreateCoupon,
  useToggleCoupon,
} from "@/hooks/useAdminQueries";

export default function CouponsPage() {
  const { data: coupons = [], isLoading } = useAdminCoupons();
  const createMutation = useCreateCoupon();
  const toggleMutation = useToggleCoupon();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "flat">("percentage");
  const [discountValue, setDiscountValue] = useState<number>(15);
  const [minOrderValue, setMinOrderValue] = useState<number>(299);
  const [maxDiscount, setMaxDiscount] = useState<number>(100);
  const [usageLimit, setUsageLimit] = useState<number>(100);
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("2026-12-31");

  const handleCopy = (couponCode: string) => {
    navigator.clipboard.writeText(couponCode);
    setCopiedCode(couponCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;

    await createMutation.mutateAsync({
      code: code.toUpperCase().trim(),
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount: discountType === "percentage" ? maxDiscount : undefined,
      usageLimit,
      description,
      expiresAt,
      isActive: true,
    });

    setIsModalOpen(false);
    // Reset form
    setCode("");
    setDescription("");
  };

  const totalRedemptions = coupons.reduce((sum, c) => sum + c.usageCount, 0);
  const activeCouponsCount = coupons.filter((c) => c.isActive).length;

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
              Coupons & Promotions
            </h1>
            <p className="text-sm text-[#354B35]/70 mt-1">
              Configure discount codes, welcome offers, minimum order values, and redemption limits.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Create New Coupon
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Active Promotions
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                {activeCouponsCount} Active
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                {coupons.length} total coupon programs
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#354B35]/10 text-[#354B35] flex items-center justify-center">
              <TicketPercent className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Total Redemptions
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                {totalRedemptions} Uses
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Across customer checkout flows
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Standard Welcome Offer
              </div>
              <div className="font-serif text-2xl font-bold text-[#B99A60] mt-1">
                FIRSTBOWL
              </div>
              <div className="text-[11px] text-[#354B35]/60 mt-0.5">
                20% off for new customers
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#B99A60]/10 text-[#B99A60] flex items-center justify-center">
              <Tag className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Coupons Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-[#354B35]/60">
              Loading promotional coupons...
            </div>
          ) : coupons.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[#354B35]/60">
              No coupons created yet. Click Create New Coupon above to get started.
            </div>
          ) : (
            coupons.map((coupon) => (
              <div
                key={coupon.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs flex flex-col justify-between ${
                  coupon.isActive ? "border-[#E5DFD3]" : "border-gray-200 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-[#1E2B1E] bg-[#F7F3EA] border border-[#E5DFD3] px-2.5 py-1 rounded-lg tracking-wider">
                        {coupon.code}
                      </span>
                      <button
                        onClick={() => handleCopy(coupon.code)}
                        className="p-1 text-[#354B35]/60 hover:text-[#1E2B1E]"
                        title="Copy code"
                      >
                        {copiedCode === coupon.code ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => toggleMutation.mutate(coupon.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        coupon.isActive
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {coupon.isActive ? "Active" : "Paused"}
                    </button>
                  </div>

                  <p className="text-xs text-[#354B35]/80 mt-3 font-medium">
                    {coupon.description}
                  </p>

                  <div className="mt-4 pt-4 border-t border-[#E5DFD3] space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#354B35]/70">Discount:</span>
                      <span className="font-bold text-[#1E2B1E]">
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}% OFF (Max ₹${coupon.maxDiscount || "No cap"})`
                          : `Flat ₹${coupon.discountValue} OFF`}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#354B35]/70">Min Order:</span>
                      <span className="font-medium text-[#1E2B1E]">
                        ₹{coupon.minOrderValue}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#354B35]/70">Redemptions:</span>
                      <span className="font-medium text-[#1E2B1E]">
                        {coupon.usageCount} / {coupon.usageLimit || "∞"} used
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#354B35]/70">Expires:</span>
                      <span className="font-medium text-[#1E2B1E]">
                        {new Date(coupon.expiresAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[#E5DFD3] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#354B35]/60 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Valid until {coupon.expiresAt}
                  </span>
                  <button
                    onClick={() => toggleMutation.mutate(coupon.id)}
                    className="text-xs font-semibold text-[#354B35] hover:underline"
                  >
                    {coupon.isActive ? "Pause Offer" : "Enable Offer"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create Coupon Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-[#E5DFD3] shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-[#E5DFD3]">
                <div className="flex items-center gap-2">
                  <TicketPercent className="w-5 h-5 text-[#354B35]" />
                  <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                    Create Promo Code
                  </h3>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-[#354B35]/60 hover:text-[#1E2B1E]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCoupon} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Coupon Code (Uppercase)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MONSOON25, PROTEIN50"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs font-mono uppercase focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Discount Type
                    </label>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as "percentage" | "flat")}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="flat">Flat Amount (₹)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Discount Value
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Min Order Value (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minOrderValue}
                      onChange={(e) => setMinOrderValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Max Discount Cap (₹)
                    </label>
                    <input
                      type="number"
                      disabled={discountType === "flat"}
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35] disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Max Total Redemptions
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={usageLimit}
                      onChange={(e) => setUsageLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                      Expiration Date
                    </label>
                    <input
                      type="date"
                      required
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Offer Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 15% off on your high-protein meal box orders"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFD3]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-[#354B35] hover:bg-[#F7F3EA]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#354B35] text-white hover:bg-[#2A3C2A] transition-colors disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Creating..." : "Launch Coupon"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
