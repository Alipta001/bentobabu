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
} from "lucide-react";
import { useAdminSettings, useUpdateSettings } from "@/hooks/useAdminQueries";
import { BusinessSettings } from "@/types";

function SettingsForm({ initialSettings }: { initialSettings: BusinessSettings }) {
  const updateMutation = useUpdateSettings();
  const [formData, setFormData] = useState<BusinessSettings>(() => initialSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);

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

      {/* Live Kitchen Status / Kill Switch */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          formData.isOrderingEnabled
            ? "bg-emerald-50/60 border-emerald-200"
            : "bg-rose-50/60 border-rose-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                formData.isOrderingEnabled
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
              }`}
            >
              <Power className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-[#1E2B1E]">
                Live Ordering Status
              </h3>
              <p className="text-xs text-[#354B35]/80 mt-0.5">
                {formData.isOrderingEnabled
                  ? "Kitchen is actively accepting customer orders from the web portal"
                  : "Orders paused: Customers will see a friendly kitchen maintenance notice"}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isOrderingEnabled}
              onChange={(e) =>
                setFormData({ ...formData, isOrderingEnabled: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>
      </div>

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
              Support Hotline / WhatsApp
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
