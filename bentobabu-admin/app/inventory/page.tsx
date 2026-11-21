"use client";

import React, { useState } from "react";
import {
  Search,
  X,
  History,
  PlusCircle,
  Calendar,
  RefreshCw,
  Power,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminProducts,
  useAdjustStock,
  useInventoryHistory,
  useDailyInventory,
  useSetDailyCapacity,
  useDailyRestock,
  useToggleDailyAvailability,
  useDailyRestockHistory,
} from "@/hooks/useAdminQueries";
import { DailyInventoryItem } from "@/services/inventoryService";
import { Product } from "@/types";
import { toast } from "sonner";

function getKolkataDateString(offsetDays = 0): string {
  const now = new Date();
  if (offsetDays !== 0) {
    now.setDate(now.getDate() + offsetDays);
  }
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function AdminInventoryPage() {
  const todayStr = getKolkataDateString(0);
  const tomorrowStr = getKolkataDateString(1);

  // Active view: Daily production capacity (default) vs Master Global Stock
  const [activeTab, setActiveTab] = useState<"daily" | "master">("daily");
  const [serviceDate, setServiceDate] = useState<string>(todayStr);

  // Daily Inventory Queries and Mutations
  const {
    data: dailyData,
    isLoading: isDailyLoading,
    refetch: refetchDaily,
    isRefetching: isDailyRefetching,
  } = useDailyInventory(serviceDate);

  const setCapacityMutation = useSetDailyCapacity();
  const restockMutation = useDailyRestock();
  const toggleAvailabilityMutation = useToggleDailyAvailability();

  // Master Stock Queries and Mutations
  const { data: products = [], isLoading: isMasterLoading } = useAdminProducts();
  const adjustStockMutation = useAdjustStock();

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "AVAILABLE" | "LOW_STOCK" | "SOLD_OUT" | "MANUALLY_UNAVAILABLE"
  >("ALL");

  // Modals state for Daily Inventory
  const [capacityItem, setCapacityItem] = useState<DailyInventoryItem | null>(null);
  const [newCapacity, setNewCapacity] = useState<number>(20);
  const [capacityReason, setCapacityReason] = useState("");

  const [restockItem, setRestockItem] = useState<DailyInventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockNote, setRestockNote] = useState("");

  const [historyItem, setHistoryItem] = useState<DailyInventoryItem | null>(null);
  const { data: dailyHistoryData, isLoading: isDailyHistoryLoading } =
    useDailyRestockHistory(historyItem?.productId || "", serviceDate);

  // Master Stock Adjust modal state
  const [selectedMasterProduct, setSelectedMasterProduct] = useState<Product | null>(null);
  const [masterAdjustType, setMasterAdjustType] = useState<"add" | "subtract" | "set">("add");
  const [masterQuantity, setMasterQuantity] = useState<number>(10);
  const [masterReason, setMasterReason] = useState("");
  const [masterHistoryProduct, setMasterHistoryProduct] = useState<Product | null>(null);
  const { data: masterHistoryData, isLoading: isMasterHistoryLoading } = useInventoryHistory(
    masterHistoryProduct?.id || ""
  );

  // Handlers for Daily Inventory
  const handleSetCapacitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capacityItem) return;
    if (newCapacity < 0 || !Number.isInteger(Number(newCapacity))) {
      toast.error("Capacity must be a non-negative integer.");
      return;
    }

    try {
      await setCapacityMutation.mutateAsync({
        productId: capacityItem.productId,
        serviceDate,
        capacity: Number(newCapacity),
        reason: capacityReason || "Daily production capacity updated via Admin Panel",
      });
      toast.success(
        `Initial capacity for ${capacityItem.product.name} set to ${newCapacity} packets.`
      );
      setCapacityItem(null);
      setCapacityReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update capacity.");
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;
    if (restockQty <= 0 || !Number.isInteger(Number(restockQty))) {
      toast.error("Restock quantity must be a positive integer (> 0).");
      return;
    }

    try {
      await restockMutation.mutateAsync({
        productId: restockItem.productId,
        serviceDate,
        additionalQuantity: Number(restockQty),
        note: restockNote || "Mid-day kitchen restocking batch",
      });
      toast.success(
        `Restocked +${restockQty} packets for ${restockItem.product.name}. Automatically re-enabled if sold out.`
      );
      setRestockItem(null);
      setRestockNote("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to restock item.");
    }
  };

  const handleToggleAvailability = async (item: DailyInventoryItem) => {
    const nextDisabled = !item.isManuallyDisabled;
    try {
      await toggleAvailabilityMutation.mutateAsync({
        productId: item.productId,
        serviceDate,
        isManuallyDisabled: nextDisabled,
        reason: nextDisabled
          ? "Manually disabled by kitchen admin"
          : "Manually re-enabled by kitchen admin",
      });
      toast.success(
        nextDisabled
          ? `${item.product.name} is now manually disabled for ${serviceDate}.`
          : `${item.product.name} manual availability restored for ${serviceDate}.`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle availability.");
    }
  };

  // Filter Daily items
  const dailyItems = dailyData?.items || [];
  const dailySummary = dailyData?.summary || {
    totalDishes: 0,
    totalCapacity: 0,
    totalReserved: 0,
    totalRemaining: 0,
    availableCount: 0,
    lowStockCount: 0,
    soldOutCount: 0,
    manuallyDisabledCount: 0,
  };

  const filteredDailyItems = dailyItems.filter((item) => {
    if (statusFilter !== "ALL" && item.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = item.product.name.toLowerCase();
      const slug = item.product.slug.toLowerCase();
      const cat = item.product.category?.name.toLowerCase() || "";
      return name.includes(q) || slug.includes(q) || cat.includes(q);
    }
    return true;
  });

  // Master Stock handlers
  const handleMasterAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMasterProduct || masterQuantity <= 0) return;

    try {
      await adjustStockMutation.mutateAsync({
        productId: selectedMasterProduct.id,
        adjustmentType: masterAdjustType,
        quantity: masterQuantity,
        reason: masterReason || "Master catalogue stock adjustment",
      });
      toast.success(`Master stock updated for ${selectedMasterProduct.name}.`);
      setSelectedMasterProduct(null);
      setMasterReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust stock.");
    }
  };

  return (
    <AdminShell
      title="Daily Inventory & Production Capacity"
      subtitle="Manage daily packet limits, real-time reservations, restocking batches, and service date availability"
    >
      {/* 1. Header Navigation & Date Selector */}
      <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-[#F7F3EA] p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("daily")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "daily"
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#667266] hover:text-[#1F271F]"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 inline mr-1.5" />
            Daily Service Inventory
          </button>
          <button
            onClick={() => setActiveTab("master")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "master"
                ? "bg-[#354B35] text-white shadow-xs"
                : "text-[#667266] hover:text-[#1F271F]"
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1.5" />
            Master Product Catalogue
          </button>
        </div>

        {/* Date Selector (for Daily mode) */}
        {activeTab === "daily" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#667266] mr-1">Service Date:</span>
            <button
              onClick={() => setServiceDate(todayStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                serviceDate === todayStr
                  ? "bg-[#354B35] text-white"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              Today ({todayStr})
            </button>
            <button
              onClick={() => setServiceDate(tomorrowStr)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                serviceDate === tomorrowStr
                  ? "bg-[#354B35] text-white"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              Tomorrow ({tomorrowStr})
            </button>
            <div className="relative">
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => {
                  if (e.target.value) setServiceDate(e.target.value);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs font-semibold text-[#1F271F] focus:outline-none focus:border-[#354B35]"
              />
            </div>
            <button
              onClick={() => refetchDaily()}
              title="Refresh inventory"
              disabled={isDailyRefetching}
              className="p-2 rounded-xl bg-[#F7F3EA] hover:bg-[#EDE8DE] text-[#354B35] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isDailyRefetching ? "animate-spin text-[#354B35]" : ""}`}
              />
            </button>
          </div>
        )}
      </div>

      {activeTab === "daily" ? (
        <>
          {/* 2. Daily Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667266]">
                Scheduled Dishes
              </span>
              <div className="font-serif text-2xl font-bold text-[#1F271F]">
                {dailySummary.totalDishes}
              </div>
              <p className="text-[11px] text-[#8A9A86]">
                {dailySummary.availableCount} available for ordering
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#354B35]">
                Total Daily Capacity
              </span>
              <div className="font-serif text-2xl font-bold text-[#354B35]">
                {dailySummary.totalCapacity}{" "}
                <span className="text-xs font-normal text-[#667266]">pkts</span>
              </div>
              <p className="text-[11px] text-[#8A9A86]">Initial + All Restocks</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Reserved / Ordered
              </span>
              <div className="font-serif text-2xl font-bold text-amber-900">
                {dailySummary.totalReserved}{" "}
                <span className="text-xs font-normal text-amber-700">pkts</span>
              </div>
              <p className="text-[11px] text-[#8A9A86]">Committed customer orders</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Remaining Stock
              </span>
              <div className="font-serif text-2xl font-bold text-emerald-900">
                {dailySummary.totalRemaining}{" "}
                <span className="text-xs font-normal text-emerald-700">pkts</span>
              </div>
              <p className="text-[11px] text-[#8A9A86]">
                {dailySummary.soldOutCount > 0
                  ? `${dailySummary.soldOutCount} items sold out`
                  : "All dishes in stock"}
              </p>
            </div>
          </div>

          {/* 3. Controls & Filter Bar */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search food item by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
              />
              <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: "All Items", value: "ALL" },
                { label: "Available", value: "AVAILABLE" },
                { label: "Low Stock", value: "LOW_STOCK" },
                { label: "Sold Out", value: "SOLD_OUT" },
                { label: "Manually Disabled", value: "MANUALLY_UNAVAILABLE" },
              ].map((st) => (
                <button
                  key={st.value}
                  onClick={() =>
                    setStatusFilter(
                      st.value as
                        | "ALL"
                        | "AVAILABLE"
                        | "LOW_STOCK"
                        | "SOLD_OUT"
                        | "MANUALLY_UNAVAILABLE"
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    statusFilter === st.value
                      ? "bg-[#354B35] text-white shadow-xs"
                      : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Daily Inventory Table */}
          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            {isDailyLoading ? (
              <div className="p-16 text-center text-xs text-[#667266] flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#354B35]" />
                Loading daily production inventory for {serviceDate}...
              </div>
            ) : filteredDailyItems.length === 0 ? (
              <div className="p-16 text-center text-xs text-[#8A9A86] space-y-2">
                <Package className="w-8 h-8 text-[#8A9A86] mx-auto opacity-60" />
                <p className="font-semibold text-[#1F271F]">No food items found.</p>
                <p className="text-[11px]">
                  No items matched your search query or status filter for service date {serviceDate}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                      <th className="py-3.5 px-6 font-bold">Food Item & Portion</th>
                      <th className="py-3.5 px-4 font-bold text-center">Initial Cap</th>
                      <th className="py-3.5 px-4 font-bold text-center">Restocked</th>
                      <th className="py-3.5 px-4 font-bold text-center">Total Stock</th>
                      <th className="py-3.5 px-4 font-bold text-center">Ordered</th>
                      <th className="py-3.5 px-4 font-bold text-center">Remaining</th>
                      <th className="py-3.5 px-4 font-bold text-center">Status</th>
                      <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE1]">
                    {filteredDailyItems.map((item) => {
                      const isSoldOut = item.remainingStock <= 0;
                      const isLowStock =
                        item.remainingStock > 0 &&
                        item.remainingStock <= item.product.lowStockThreshold;

                      return (
                        <tr
                          key={item.productId}
                          className="hover:bg-[#F9F7F1] transition-colors"
                        >
                          {/* Food Item */}
                          <td className="py-3.5 px-6">
                            <div className="font-bold text-[#1F271F]">{item.product.name}</div>
                            <div className="text-[11px] text-[#667266] flex items-center gap-2 mt-0.5">
                              <span>₹{item.product.price}</span>
                              <span>•</span>
                              <span>{item.product.servingSize || "1 portion"}</span>
                              {item.product.category?.name && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#8A9A86]">
                                    {item.product.category.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Initial Capacity */}
                          <td className="py-3.5 px-4 text-center font-mono font-medium text-[#1F271F]">
                            {item.initialStock}
                          </td>

                          {/* Additional Restocked */}
                          <td className="py-3.5 px-4 text-center font-mono">
                            {item.restockedQuantity > 0 ? (
                              <span className="text-emerald-700 font-bold">
                                +{item.restockedQuantity}
                              </span>
                            ) : (
                              <span className="text-[#8A9A86]">—</span>
                            )}
                          </td>

                          {/* Total Stock */}
                          <td className="py-3.5 px-4 text-center font-mono font-bold text-[#1F271F]">
                            {item.totalStock}
                          </td>

                          {/* Reserved / Sold */}
                          <td className="py-3.5 px-4 text-center font-mono text-[#667266]">
                            <span className="font-bold text-amber-800">
                              {item.reservedQuantity}
                            </span>
                          </td>

                          {/* Remaining Stock */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`font-mono font-extrabold text-sm px-2 py-0.5 rounded-lg ${
                                item.isManuallyDisabled
                                  ? "text-gray-500 bg-gray-100"
                                  : isSoldOut
                                  ? "text-red-700 bg-red-100"
                                  : isLowStock
                                  ? "text-amber-800 bg-amber-100"
                                  : "text-[#354B35] bg-emerald-50"
                              }`}
                            >
                              {item.remainingStock}
                            </span>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4 text-center">
                            {item.isManuallyDisabled ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-800 inline-flex items-center gap-1">
                                <Power className="w-3 h-3 text-gray-600" />
                                Manually Disabled
                              </span>
                            ) : isSoldOut ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 inline-flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-red-600" />
                                Sold Out
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Low Stock ({item.remainingStock} left)
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Available
                              </span>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3.5 px-6 text-right space-x-1.5 whitespace-nowrap">
                            {/* Restock History */}
                            <button
                              onClick={() => setHistoryItem(item)}
                              title="View restock audit log"
                              className="px-2.5 py-1.5 rounded-xl border border-[#E5DFC5] text-[#667266] text-[11px] font-semibold hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5 inline mr-1" />
                              History
                            </button>

                            {/* Set Capacity */}
                            <button
                              onClick={() => {
                                setCapacityItem(item);
                                setNewCapacity(item.initialStock || 20);
                                setCapacityReason("");
                              }}
                              title="Set initial daily preparation capacity"
                              className="px-2.5 py-1.5 rounded-xl border border-[#E5DFC5] text-[#1F271F] text-[11px] font-semibold hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                            >
                              Set Capacity
                            </button>

                            {/* Restock */}
                            <button
                              onClick={() => {
                                setRestockItem(item);
                                setRestockQty(10);
                                setRestockNote("");
                              }}
                              title="Restock packets (re-enables item if sold out)"
                              className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-[11px] font-bold hover:bg-[#253525] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              Restock
                            </button>

                            {/* Manual Disable / Enable toggle */}
                            <button
                              onClick={() => handleToggleAvailability(item)}
                              title={
                                item.isManuallyDisabled
                                  ? "Enable ordering for this item"
                                  : "Temporarily stop customer ordering for this item"
                              }
                              className={`p-1.5 rounded-xl border transition-colors cursor-pointer inline-flex items-center justify-center ${
                                item.isManuallyDisabled
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-red-700"
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Master Product Catalogue View */
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                Master Catalog Global Inventory
              </h3>
              <p className="text-xs text-[#667266]">
                Static inventory definitions across all food dishes in the master database.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
            {isMasterLoading ? (
              <div className="p-12 text-center text-xs text-[#667266]">
                Loading master products...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                      <th className="py-3.5 px-6 font-bold">Dish & SKU</th>
                      <th className="py-3.5 px-4 font-bold">Portion Size</th>
                      <th className="py-3.5 px-4 font-bold">Global Stock</th>
                      <th className="py-3.5 px-4 font-bold">Threshold</th>
                      <th className="py-3.5 px-4 font-bold">Catalogue Status</th>
                      <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE1]">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F9F7F1] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="font-bold text-[#1F271F]">{p.name}</div>
                          <div className="text-[11px] text-[#667266]">SKU: {p.sku}</div>
                        </td>
                        <td className="py-3.5 px-4 text-[#667266]">
                          {p.servingSize || "1 portion"}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#354B35]">
                          {p.stockQuantity}
                        </td>
                        <td className="py-3.5 px-4 text-[#667266]">
                          {p.lowStockThreshold} units
                        </td>
                        <td className="py-3.5 px-4">
                          {p.isAvailable ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                              Active
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-right space-x-2">
                          <button
                            onClick={() => setMasterHistoryProduct(p)}
                            className="px-2.5 py-1.5 rounded-xl border border-[#E5DFC5] text-[#667266] text-[11px] font-semibold hover:bg-[#F7F3EA] cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5 inline mr-1" />
                            History
                          </button>
                          <button
                            onClick={() => {
                              setSelectedMasterProduct(p);
                              setMasterQuantity(10);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-[11px] font-bold hover:bg-[#253525] cursor-pointer"
                          >
                            Adjust Stock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 1. Set Daily Capacity Modal */}
      {capacityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setCapacityItem(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                  Set Daily Capacity
                </h3>
                <p className="text-xs text-[#667266]">
                  {capacityItem.product.name} • {serviceDate}
                </p>
              </div>
              <button
                onClick={() => setCapacityItem(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSetCapacitySubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">
                  Initial Production Packets (Daily Limit)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={1}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-base font-mono font-bold text-[#1F271F]"
                />
                <p className="text-[11px] text-[#8A9A86]">
                  Sets how many packets can be prepared for {serviceDate}. Additional restocks will
                  add to this base quantity.
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Notes / Kitchen Reason</label>
                <input
                  type="text"
                  value={capacityReason}
                  onChange={(e) => setCapacityReason(e.target.value)}
                  placeholder="e.g. Planned morning kitchen prep quota"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCapacityItem(null)}
                  className="px-4 py-2 rounded-full border border-gray-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setCapacityMutation.isPending}
                  className="px-5 py-2 rounded-full bg-[#354B35] text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {setCapacityMutation.isPending ? "Saving..." : "Save Capacity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Restock Modal (adds packets, automatically restores availability) */}
      {restockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setRestockItem(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F] flex items-center gap-1.5">
                  <PlusCircle className="w-5 h-5 text-emerald-700" />
                  Restock Food Item
                </h3>
                <p className="text-xs text-[#667266]">
                  {restockItem.product.name} • {serviceDate}
                </p>
              </div>
              <button
                onClick={() => setRestockItem(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Stock Preview Card */}
            <div className="p-3.5 rounded-2xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#667266]">Total Capacity so far:</span>
                <span className="font-mono font-bold text-[#1F271F]">
                  {restockItem.totalStock} packets
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667266]">Already Ordered / Reserved:</span>
                <span className="font-mono font-bold text-amber-800">
                  {restockItem.reservedQuantity} packets
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#E5DFC5]">
                <span className="text-[#667266]">Current Remaining:</span>
                <span
                  className={`font-mono font-extrabold ${
                    restockItem.remainingStock <= 0 ? "text-red-700" : "text-[#354B35]"
                  }`}
                >
                  {restockItem.remainingStock} packets
                </span>
              </div>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">
                  Additional Packets to Add (+N)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-base font-mono font-bold text-emerald-800"
                />
                {restockQty > 0 && (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    New Total Capacity: {restockItem.totalStock + restockQty} pkts • New Remaining:{" "}
                    {restockItem.remainingStock + restockQty} pkts
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Restock Note / Batch Details</label>
                <input
                  type="text"
                  value={restockNote}
                  onChange={(e) => setRestockNote(e.target.value)}
                  placeholder="e.g. Fresh lunch batch prepared at 1:15 PM"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              {restockItem.isManuallyDisabled ? (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-700" />
                  Note: This item was manually disabled. Restocking will add packets, but customer
                  ordering will remain off until you re-enable it.
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
                  Item will automatically become available for customers to order as remaining stock
                  exceeds zero.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockItem(null)}
                  className="px-4 py-2 rounded-full border border-gray-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restockMutation.isPending}
                  className="px-5 py-2 rounded-full bg-[#354B35] text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {restockMutation.isPending ? "Restocking..." : "Confirm Restock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Daily Restock History Audit Modal */}
      {historyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setHistoryItem(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                  Daily Restock Audit Log
                </h3>
                <p className="text-xs text-[#667266]">
                  {historyItem.product.name} • Service Date: {serviceDate}
                </p>
              </div>
              <button
                onClick={() => setHistoryItem(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {isDailyHistoryLoading ? (
                <div className="py-8 text-center text-xs text-[#667266]">
                  Loading restock logs...
                </div>
              ) : !dailyHistoryData?.history || dailyHistoryData.history.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8A9A86] space-y-1">
                  <Package className="w-6 h-6 text-[#8A9A86] mx-auto opacity-50" />
                  <p className="font-semibold text-[#1F271F]">No restocks recorded yet.</p>
                  <p className="text-[11px]">
                    This dish is currently operating with its initial capacity of{" "}
                    {historyItem.initialStock} packets.
                  </p>
                </div>
              ) : (
                dailyHistoryData.history.map((log, idx) => {
                  const adminLabel =
                    typeof log.admin === "object" && log.admin?.name
                      ? `${log.admin.name} (${log.admin.email || ""})`
                      : log.adminName || "Admin Kitchen Manager";

                  return (
                    <div
                      key={log._id || log.id || idx}
                      className="p-3.5 rounded-2xl bg-[#F9F7F1] border border-[#E5DFC5] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <PlusCircle className="w-4 h-4 text-emerald-700" />
                          Restocked +{log.quantityAdded} packets
                        </span>
                        <span className="font-mono text-[11px] text-[#667266]">
                          Capacity: {log.previousTotalStock} → {log.newTotalStock}
                        </span>
                      </div>
                      {log.note && (
                        <div className="text-[11px] text-[#1F271F]">
                          <span className="font-semibold text-[#667266]">Note:</span> {log.note}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-[#8A9A86] pt-1 border-t border-[#E5DFC5]/60">
                        <span>Authorized By: {adminLabel}</span>
                        <span>{new Date(log.timestamp).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-[#F0ECE1] flex justify-end">
              <button
                onClick={() => setHistoryItem(null)}
                className="px-4 py-2 rounded-xl bg-[#F7F3EA] text-xs font-semibold text-[#1E2B1E] hover:bg-[#EDE8DE] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Master Stock Adjust Modal */}
      {selectedMasterProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedMasterProduct(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                  Adjust Master Stock
                </h3>
                <p className="text-xs text-[#667266]">
                  {selectedMasterProduct.name} ({selectedMasterProduct.sku})
                </p>
              </div>
              <button
                onClick={() => setSelectedMasterProduct(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMasterAdjustSubmit} className="space-y-4 text-xs">
              <div className="flex gap-2">
                {[
                  { label: "Add (+)", value: "add" },
                  { label: "Deduct (-)", value: "subtract" },
                  { label: "Override (=)", value: "set" },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setMasterAdjustType(t.value as "add" | "subtract" | "set")}
                    className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                      masterAdjustType === t.value
                        ? "bg-[#354B35] text-white border-[#354B35]"
                        : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Quantity</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={masterQuantity}
                  onChange={(e) => setMasterQuantity(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-sm font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Reason</label>
                <input
                  type="text"
                  value={masterReason}
                  onChange={(e) => setMasterReason(e.target.value)}
                  placeholder="e.g. Master warehouse inventory check"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedMasterProduct(null)}
                  className="px-4 py-2 rounded-full border border-gray-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustStockMutation.isPending}
                  className="px-5 py-2 rounded-full bg-[#354B35] text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {adjustStockMutation.isPending ? "Updating..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Master History Modal */}
      {masterHistoryProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMasterHistoryProduct(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                  Master Stock History
                </h3>
                <p className="text-xs text-[#667266]">{masterHistoryProduct.name}</p>
              </div>
              <button
                onClick={() => setMasterHistoryProduct(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {isMasterHistoryLoading ? (
                <div className="py-8 text-center text-xs text-[#667266]">Loading...</div>
              ) : !masterHistoryData?.history || masterHistoryData.history.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8A9A86]">No history found.</div>
              ) : (
                masterHistoryData.history.map((log) => (
                  <div
                    key={log._id || log.id}
                    className="p-3.5 rounded-2xl bg-[#F9F7F1] border border-[#E5DFC5] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1E2B1E]">
                        {log.adjustmentType}: {Math.abs(log.quantityChange)} units
                      </span>
                      <span className="font-mono text-[11px] text-[#667266]">
                        {log.previousStock} → {log.newStock}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#667266]">{log.reason}</div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#F0ECE1] flex justify-end">
              <button
                onClick={() => setMasterHistoryProduct(null)}
                className="px-4 py-2 rounded-xl bg-[#F7F3EA] text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
