"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Store,
  Mail,
  Phone,
  MapPin,
  Clock,
  Percent,
  Truck,
  Power,
  Save,
  CheckCircle2,
  ShoppingBag,
  FileText,
  ShieldCheck,
  Calendar,
  Upload,
  ExternalLink,
  Globe,
  AlertCircle,
  Loader2,
  MessageSquare,
  Share2,
} from "lucide-react";
import { useAdminSettings, useUpdateSettings } from "@/hooks/useAdminQueries";
import { mediaService } from "@/services/mediaService";
import { BusinessSettings, FssaiStatus } from "@/types";

function SettingsForm({ initialSettings }: { initialSettings: BusinessSettings }) {
  const updateMutation = useUpdateSettings();
  const [formData, setFormData] = useState<BusinessSettings>(() => initialSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [uploadingFssai, setUploadingFssai] = useState(false);
  const [uploadingGst, setUploadingGst] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Live Ordering Status Modal & Toggle state
  const [orderingModalOpen, setOrderingModalOpen] = useState(false);
  const [targetOrderingState, setTargetOrderingState] = useState<boolean | null>(null);
  const [isSavingOrdering, setIsSavingOrdering] = useState(false);
  const [orderingFeedback, setOrderingFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const requestOrderingToggle = (newState: boolean) => {
    setTargetOrderingState(newState);
    setOrderingModalOpen(true);
  };

  const confirmOrderingToggle = async () => {
    if (targetOrderingState === null) return;
    setIsSavingOrdering(true);
    setOrderingFeedback(null);
    try {
      await updateMutation.mutateAsync({ isOrderingEnabled: targetOrderingState });
      setFormData((prev) => ({ ...prev, isOrderingEnabled: targetOrderingState }));
      setOrderingFeedback({
        type: "success",
        message: targetOrderingState
          ? "Live Ordering Status switched ON: Kitchen is accepting new customer orders."
          : "Live Ordering Status switched OFF: New customer orders are paused. Existing orders continue normally.",
      });
      setOrderingModalOpen(false);
    } catch (err: any) {
      setOrderingFeedback({
        type: "error",
        message: err?.message || "Failed to update Live Ordering Status.",
      });
    } finally {
      setIsSavingOrdering(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "fssaiCertificateUrl" | "gstCertificateUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    if (field === "fssaiCertificateUrl") setUploadingFssai(true);
    else setUploadingGst(true);

    try {
      const res = await mediaService.uploadImage(file, "bentobabu/legal_documents");
      const uploadedUrl = res?.media?.secureUrl || res?.deliveryUrls?.original;
      if (uploadedUrl) {
        setFormData((prev) => ({
          ...prev,
          [field]: uploadedUrl,
        }));
      }
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload document.");
    } finally {
      if (field === "fssaiCertificateUrl") setUploadingFssai(false);
      else setUploadingGst(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateMutation.mutateAsync(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Settings saved successfully
        </div>
      )}

      {/* Live Ordering Status / Global Switch */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          formData.isOrderingEnabled
            ? "bg-emerald-50/70 border-emerald-300 shadow-xs"
            : "bg-rose-50/70 border-rose-300 shadow-xs"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                formData.isOrderingEnabled
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
              }`}
            >
              <Power className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Live Ordering Status
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-xs ${
                    formData.isOrderingEnabled
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-rose-100 text-rose-800 border border-rose-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      formData.isOrderingEnabled ? "bg-emerald-600 animate-pulse" : "bg-rose-600"
                    }`}
                  />
                  {formData.isOrderingEnabled ? "ON — Accepting Orders" : "OFF — Ordering Paused"}
                </span>
              </div>
              <p className="text-xs text-[#354B35]/80 mt-1">
                Control whether customers can place new orders through the BentoBabu website.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <button
              type="button"
              onClick={() => requestOrderingToggle(!formData.isOrderingEnabled)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                formData.isOrderingEnabled
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {formData.isOrderingEnabled ? "Turn OFF Ordering" : "Turn ON Ordering"}
            </button>
          </div>
        </div>

        {/* State description bullets */}
        <div className="mt-4 pt-3.5 border-t border-[#354B35]/10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {formData.isOrderingEnabled ? (
            <>
              <div className="flex items-center gap-2 text-emerald-800 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Kitchen accepts new customer orders.</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-800 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Checkout is available. New orders can be created.</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-rose-800 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>New customer orders are blocked.</span>
              </div>
              <div className="flex items-center gap-2 text-rose-800 font-medium">
                <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Existing orders continue normally through kitchen and delivery.</span>
              </div>
            </>
          )}
        </div>

        {orderingFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
              orderingFeedback.type === "success"
                ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                : "bg-rose-100 border-rose-300 text-rose-900"
            }`}
          >
            {orderingFeedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
            )}
            <span>{orderingFeedback.message}</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {orderingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#E5DFD3] shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  targetOrderingState
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-serif text-base font-bold text-[#1E2B1E]">
                  {targetOrderingState ? "Turn ON Live Ordering?" : "Turn OFF Live Ordering?"}
                </h4>
                <p className="text-xs text-[#354B35]/70">
                  {targetOrderingState ? "Resume accepting new orders" : "Pause new order placement"}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#222922] leading-relaxed">
              {targetOrderingState
                ? "Are you sure you want to resume accepting new customer orders? Customers will be able to place new orders through checkout immediately."
                : "Are you sure you want to stop accepting new orders? Customers will no longer be able to place new orders. Existing orders will continue normally."}
            </p>

            <div className="bg-[#F9F7F1] p-3 rounded-xl border border-[#E5DFD3] text-[11px] text-[#354B35] space-y-1">
              <div className="font-semibold text-[#1E2B1E]">Operational impact:</div>
              {targetOrderingState ? (
                <>
                  <div>• Checkout becomes available immediately across the customer portal.</div>
                  <div>• Kitchen resumes accepting new incoming order notifications.</div>
                </>
              ) : (
                <>
                  <div>• Customers can still browse the menu, meal boxes, and videos.</div>
                  <div>• All existing orders in preparation or delivery continue without interruption.</div>
                  <div>• Razorpay payment webhooks and order tracking continue normally.</div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSavingOrdering}
                onClick={() => setOrderingModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#354B35] hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingOrdering}
                onClick={confirmOrderingToggle}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                  targetOrderingState
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isSavingOrdering ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>
                    {targetOrderingState ? "Confirm & Turn ON" : "Confirm & Turn OFF"}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand & Store Profile */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5DFD3]">
          <Store className="w-4 h-4 text-[#354B35]" />
          <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
            Brand & Business Profile
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Store / Brand Name
            </label>
            <input
              type="text"
              required
              value={formData.businessName}
              onChange={(e) =>
                setFormData({ ...formData, businessName: e.target.value })
              }
              className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Brand Tagline
            </label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) =>
                setFormData({ ...formData, tagline: e.target.value })
              }
              className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Customer Support Email
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="email"
                required
                value={formData.supportEmail}
                onChange={(e) =>
                  setFormData({ ...formData, supportEmail: e.target.value })
                }
                className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Support Hotline Phone
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="text"
                required
                value={formData.supportPhone}
                onChange={(e) =>
                  setFormData({ ...formData, supportPhone: e.target.value })
                }
                className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              WhatsApp Support Helpline
            </label>
            <div className="relative">
              <MessageSquare className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="text"
                placeholder="+91 85840 85669"
                value={formData.supportWhatsapp || ""}
                onChange={(e) =>
                  setFormData({ ...formData, supportWhatsapp: e.target.value })
                }
                className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Direct chat link used across website header, footer, and support cards.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Support & Order Assistance Hours
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="text"
                placeholder="7:00 AM – 10:30 PM (Daily)"
                value={formData.supportHours || ""}
                onChange={(e) =>
                  setFormData({ ...formData, supportHours: e.target.value })
                }
                className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Displayed in customer header, footer, and help desk pages.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
            Primary Cloud Kitchen Address
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 absolute left-3 top-3 text-[#354B35]/50" />
            <textarea
              rows={2}
              required
              value={formData.kitchenAddress}
              onChange={(e) =>
                setFormData({ ...formData, kitchenAddress: e.target.value })
              }
              className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
            Kitchen Operating Hours
          </label>
          <div className="relative">
            <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
            <input
              type="text"
              required
              value={formData.operatingHours}
              onChange={(e) =>
                setFormData({ ...formData, operatingHours: e.target.value })
              }
              className="w-full pl-9 pr-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>
        </div>
      </div>

      {/* Financial & Delivery Parameters */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5DFD3]">
          <Truck className="w-4 h-4 text-[#354B35]" />
          <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
            Delivery Charge & Logistics Policy
          </h3>
        </div>

        {/* Admin Delivery Charge Control */}
        <div className="p-4 bg-[#F9F7F1] rounded-xl border border-[#E5DFD3] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-[#1E2B1E] block">
                Apply Delivery Charge to Orders
              </span>
              <p className="text-[11px] text-[#354B35]/70">
                When disabled, all customer orders automatically receive ₹0 Free Delivery.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.deliveryChargeEnabled ?? true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    deliveryChargeEnabled: e.target.checked,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#354B35]"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                Standard Delivery Charge (₹)
              </label>
              <div className="relative">
                <Truck className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type="number"
                  required
                  min={0}
                  disabled={!(formData.deliveryChargeEnabled ?? true)}
                  value={formData.deliveryChargeAmount ?? 30}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      deliveryChargeAmount: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35] disabled:bg-gray-100 disabled:opacity-60"
                />
              </div>
              <p className="text-[10px] text-[#354B35]/60 mt-1">
                Set to ₹0 for operational free delivery across all orders.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                Minimum Order Value (₹)
              </label>
              <div className="relative">
                <ShoppingBag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type="number"
                  required
                  min={0}
                  value={formData.minimumOrderValue ?? 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      minimumOrderValue: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>
              <p className="text-[10px] text-[#354B35]/60 mt-1">
                Set to ₹0 to disable minimum order requirement across checkout.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                GST Rate (% on food preparation)
              </label>
              <div className="relative">
                <Percent className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
                <input
                  type="number"
                  required
                  min={0}
                  max={28}
                  value={formData.gstRatePercentage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gstRatePercentage: Number(e.target.value),
                    })
                  }
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                />
              </div>
              <p className="text-[10px] text-[#354B35]/60 mt-1">
                Standard cloud kitchen food service GST is 5% (no ITC).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Booking Controls */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5DFD3]">
          <Clock className="w-4 h-4 text-[#354B35]" />
          <div>
            <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
              Delivery Booking Controls
            </h3>
            <p className="text-xs text-[#354B35]/70">
              Operational controls for initial launch: configure advance slot cut-off minutes and maximum future booking days.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Delivery Slot Booking Cut-off (Minutes)
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="number"
                required
                min={0}
                max={1440}
                step={1}
                value={formData.deliverySlotBookingCutoffMinutes ?? 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    deliverySlotBookingCutoffMinutes: Math.max(
                      0,
                      Math.min(1440, Math.floor(Number(e.target.value) || 0))
                    ),
                  })
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Minutes before slot start when booking closes (0 = no advance cutoff; e.g. 60 = 1 hr before slot start).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Maximum Advance Booking Days
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="number"
                required
                min={0}
                max={30}
                step={1}
                value={formData.maxAdvanceBookingDays ?? 3}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxAdvanceBookingDays: Math.max(
                      0,
                      Math.min(30, Math.floor(Number(e.target.value) || 0))
                    ),
                  })
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              How many days ahead customers can select dates (0 = today only, 1 = today + tomorrow, 3 = today + 3 days).
            </p>
          </div>
        </div>
      </div>

      {/* Business Documents & Legal Details */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5DFD3]">
          <ShieldCheck className="w-4 h-4 text-[#354B35]" />
          <div>
            <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
              Business Documents & Legal Details
            </h3>
            <p className="text-xs text-[#354B35]/70">
              Manage FSSAI food safety compliance, GSTIN details, and registered legal address for official order receipts.
            </p>
          </div>
        </div>

        {uploadError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            {uploadError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              FSSAI Food Safety Status
            </label>
            <select
              value={formData.fssaiStatus || "APPLICATION_SUBMITTED"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  fssaiStatus: e.target.value as FssaiStatus,
                })
              }
              className="w-full px-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            >
              <option value="APPLICATION_SUBMITTED">
                Application Submitted (Reg. in Progress)
              </option>
              <option value="APPROVED">Approved & Active</option>
              <option value="NOT_APPLIED">Not Applied</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Customer receipts will display application status or approved licence number accurately.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              FSSAI Registration / Licence Number
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="text"
                maxLength={14}
                placeholder="14-digit FSSAI number (e.g. 12824013000123)"
                value={formData.fssaiNumber || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fssaiNumber: e.target.value.trim(),
                  })
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Must be exactly 14 digits when issued by the food safety authority.
            </p>
          </div>
        </div>

        {/* FSSAI Certificate Upload */}
        <div className="p-4 bg-[#FBF9F4] rounded-xl border border-[#EAE4D8] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1E2B1E]">
              FSSAI Certificate / Application Acknowledgment Document
            </span>
            {formData.fssaiCertificateUrl && (
              <a
                href={formData.fssaiCertificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#354B35] hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> View Certificate
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#D8D0C0] rounded-lg text-xs font-medium text-[#1E2B1E] hover:bg-gray-50 cursor-pointer transition-colors shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-[#354B35]" />
              <span>{uploadingFssai ? "Uploading..." : "Upload FSSAI Doc"}</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => handleFileUpload(e, "fssaiCertificateUrl")}
                disabled={uploadingFssai}
                className="sr-only"
              />
            </label>
            <span className="text-[11px] text-[#354B35]/70 truncate max-w-md">
              {formData.fssaiCertificateUrl || "No certificate uploaded yet"}
            </span>
          </div>
        </div>

        {/* GSTIN and GST Certificate */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              GSTIN (Goods and Services Tax ID)
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="text"
                maxLength={15}
                placeholder="15-character GSTIN (optional)"
                value={formData.gstin || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    gstin: e.target.value.toUpperCase().trim(),
                  })
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Leave blank if operating under the small business GST threshold. Never enter fake GSTINs.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Official Website URL
            </label>
            <div className="relative">
              <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
              <input
                type="url"
                placeholder="https://bentobabu.com"
                value={formData.websiteUrl || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    websiteUrl: e.target.value.trim(),
                  })
                }
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <p className="text-[10px] text-[#354B35]/60 mt-1">
              Printed on receipt headers and footers for customer support.
            </p>
          </div>
        </div>

        {/* GST Certificate Upload */}
        <div className="p-4 bg-[#FBF9F4] rounded-xl border border-[#EAE4D8] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1E2B1E]">
              GST Registration Certificate (Optional)
            </span>
            {formData.gstCertificateUrl && (
              <a
                href={formData.gstCertificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#354B35] hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> View GST Certificate
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#D8D0C0] rounded-lg text-xs font-medium text-[#1E2B1E] hover:bg-gray-50 cursor-pointer transition-colors shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-[#354B35]" />
              <span>{uploadingGst ? "Uploading..." : "Upload GST Doc"}</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => handleFileUpload(e, "gstCertificateUrl")}
                disabled={uploadingGst}
                className="sr-only"
              />
            </label>
            <span className="text-[11px] text-[#354B35]/70 truncate max-w-md">
              {formData.gstCertificateUrl || "No GST certificate uploaded"}
            </span>
          </div>
        </div>

        {/* Registered Business Address */}
        <div>
          <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
            Registered Legal Business Address
          </label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 absolute left-3 top-3 text-[#354B35]/50" />
            <textarea
              rows={2}
              value={
                formData.businessAddress ||
                "Chandanpukur (Nonachandanpukur) Bazar, Barrackpore, West Bengal - 700122, India"
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  businessAddress: e.target.value,
                })
              }
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>
          <p className="text-[10px] text-[#354B35]/60 mt-1">
            Official commercial address printed on tax invoices and payment receipts.
          </p>
        </div>
      </div>

      {/* Social Media & Digital Channels */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5DFD3]">
          <Share2 className="w-4 h-4 text-[#354B35]" />
          <div>
            <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
              Social Media & Digital Channels
            </h3>
            <p className="text-xs text-[#354B35]/70">
              Configure official links for social community channels rendered in the customer storefront footer.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Instagram Profile URL
            </label>
            <input
              type="url"
              placeholder="https://instagram.com/bentobabu"
              value={formData.instagramUrl || ""}
              onChange={(e) =>
                setFormData({ ...formData, instagramUrl: e.target.value })
              }
              className="w-full px-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Facebook Page URL
            </label>
            <input
              type="url"
              placeholder="https://facebook.com/bentobabu"
              value={formData.facebookUrl || ""}
              onChange={(e) =>
                setFormData({ ...formData, facebookUrl: e.target.value })
              }
              className="w-full px-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              Twitter / X URL
            </label>
            <input
              type="url"
              placeholder="https://twitter.com/bentobabu"
              value={formData.twitterUrl || ""}
              onChange={(e) =>
                setFormData({ ...formData, twitterUrl: e.target.value })
              }
              className="w-full px-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
              LinkedIn Company URL
            </label>
            <input
              type="url"
              placeholder="https://linkedin.com/company/bentobabu"
              value={formData.linkedinUrl || ""}
              onChange={(e) =>
                setFormData({ ...formData, linkedinUrl: e.target.value })
              }
              className="w-full px-3 py-2 bg-white border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
            />
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors shadow-xs disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? "Saving..." : "Save Business Settings"}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useAdminSettings();

  return (
    <AdminShell>
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
            Business & Kitchen Settings
          </h1>
          <p className="text-sm text-[#354B35]/70 mt-1">
            Configure brand identity, operating hours, dispatch parameters, taxes, and live ordering killswitch.
          </p>
        </div>

        {isLoading || !settings ? (
          <div className="bg-white p-12 rounded-2xl border border-[#E5DFD3] text-center text-[#354B35]/60 text-xs">
            Loading settings...
          </div>
        ) : (
          <SettingsForm initialSettings={settings} />
        )}
      </div>
    </AdminShell>
  );
}
