"use client";

import React, { useState } from "react";
import {
  Search,
  X,
  History,
  PlusCircle,
  MinusCircle,
  Equal,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminProducts,
  useAdjustStock,
  useInventoryHistory,
} from "@/hooks/useAdminQueries";
import { Product } from "@/types";

export default function AdminInventoryPage() {
  const { data: products = [], isLoading } = useAdminProducts();
  const adjustStockMutation = useAdjustStock();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStockStatus, setFilterStockStatus] = useState<"all" | "low" | "out">("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<"add" | "subtract" | "set">("add");
  const [quantity, setQuantity] = useState<number>(10);
  const [reason, setReason] = useState("");

  // Audit History Modal State
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const { data: historyData, isLoading: historyLoading } = useInventoryHistory(
    historyProduct?.id || ""
  );

  const totalStockUnits = products.reduce((acc, p) => acc + p.stockQuantity, 0);
  const lowStockCount = products.filter(
    (p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold
  ).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity === 0).length;

  const filteredProducts = products.filter((p) => {
    if (filterStockStatus === "low" && (p.stockQuantity === 0 || p.stockQuantity > p.lowStockThreshold)) {
      return false;
    }
    if (filterStockStatus === "out" && p.stockQuantity > 0) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0) return;

    try {
      await adjustStockMutation.mutateAsync({
        productId: selectedProduct.id,
        adjustmentType: adjustType,
        quantity,
        reason: reason || "Standard kitchen prep batch restocking",
      });

      setSelectedProduct(null);
      setReason("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to adjust stock.");
    }
  };

  return (
    <AdminShell
      title="Kitchen Inventory & Batch Stock Control"
      subtitle="Track raw meal portions, record replenishment batches and review real-time audit trails"
    >
      {/* 1. Inventory Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667266]">
            Total Catalogue Dishes
          </span>
          <div className="font-serif text-2xl font-bold text-[#1F271F]">
            {products.length}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667266]">
            Total Ready Portions
          </span>
          <div className="font-serif text-2xl font-bold text-[#354B35]">
            {totalStockUnits}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Low Stock Portions
          </span>
          <div className="font-serif text-2xl font-bold text-amber-900">
            {lowStockCount}
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
            Out of Stock
          </span>
          <div className="font-serif text-2xl font-bold text-red-900">
            {outOfStockCount}
          </div>
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by meal name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
          />
          <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2">
          {(["all", "low", "out"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStockStatus(st)}
              className={`px-4 py-2 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer ${
                filterStockStatus === st
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {st === "all" ? "All Items" : st === "low" ? "Low Stock Only" : "Out of Stock"}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Inventory Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading stock status...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Dish & SKU</th>
                  <th className="py-3.5 px-4 font-bold">Portion Size</th>
                  <th className="py-3.5 px-4 font-bold">Available Portions</th>
                  <th className="py-3.5 px-4 font-bold">Safety Threshold</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {filteredProducts.map((p) => {
                  const isOut = p.stockQuantity === 0;
                  const isLow = p.stockQuantity <= p.lowStockThreshold && !isOut;

                  return (
                    <tr key={p.id} className="hover:bg-[#F9F7F1] transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-[#1F271F]">{p.name}</div>
                        <div className="text-[11px] text-[#667266]">SKU: {p.sku}</div>
                      </td>

                      <td className="py-3.5 px-4 text-[#667266]">
                        {p.servingSize || "1 portion"}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isOut
                              ? "text-red-700"
                              : isLow
                              ? "text-amber-800"
                              : "text-[#354B35]"
                          }`}
                        >
                          {p.stockQuantity}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[#667266]">
                        {p.lowStockThreshold} units
                      </td>

                      <td className="py-3.5 px-4">
                        {isOut ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                            Low Stock Alert
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                            Sufficient
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-right space-x-2">
                        <button
                          onClick={() => setHistoryProduct(p)}
                          title="View adjustment logs"
                          className="px-2.5 py-1.5 rounded-xl border border-[#E5DFC5] text-[#667266] text-[11px] font-semibold hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 inline mr-1" />
                          History
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProduct(p);
                            setQuantity(10);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-[11px] font-bold hover:bg-[#253525] transition-colors cursor-pointer"
                        >
                          Adjust Portions
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

      {/* Adjust Stock Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedProduct(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5]">
            <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#1F271F]">
                  Adjust Stock Portions
                </h3>
                <p className="text-xs text-[#667266] truncate">
                  {selectedProduct.name} ({selectedProduct.sku})
                </p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              <div className="flex gap-2">
                {[
                  { label: "Restock (+)", value: "add" },
                  { label: "Deduct (-)", value: "subtract" },
                  { label: "Override (=)", value: "set" },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAdjustType(t.value as "add" | "subtract" | "set")}
                    className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                      adjustType === t.value
                        ? "bg-[#354B35] text-white border-[#354B35]"
                        : "bg-[#F7F3EA] text-[#667266] border-[#E5DFC5]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">Portion Quantity</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-sm font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F271F]">
                  Batch / Kitchen Note Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Fresh 8:00 AM morning batch prepared"
                  className="w-full p-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="px-4 py-2 rounded-full border border-gray-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustStockMutation.isPending}
                  className="px-5 py-2 rounded-full bg-[#354B35] text-white font-semibold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {adjustStockMutation.isPending ? "Updating..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Drawer / Modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setHistoryProduct(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl border border-[#E5DFC5] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE1]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                  Stock Adjustment Audit Log
                </h3>
                <p className="text-xs text-[#667266] truncate">
                  {historyProduct.name} ({historyProduct.sku})
                </p>
              </div>
              <button
                onClick={() => setHistoryProduct(null)}
                className="p-1 rounded-lg text-[#667266] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-[#667266]">
                  Loading adjustment records...
                </div>
              ) : !historyData?.history || historyData.history.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8A9A86]">
                  No historical stock adjustments logged for this item yet.
                </div>
              ) : (
                historyData.history.map((log) => (
                  <div
                    key={log._id || log.id}
                    className="p-3.5 rounded-2xl bg-[#F9F7F1] border border-[#E5DFC5] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1E2B1E] flex items-center gap-1.5">
                        {log.adjustmentType === "ADD" ? (
                          <PlusCircle className="w-4 h-4 text-emerald-700" />
                        ) : log.adjustmentType === "REMOVE" ? (
                          <MinusCircle className="w-4 h-4 text-rose-700" />
                        ) : (
                          <Equal className="w-4 h-4 text-amber-700" />
                        )}
                        {log.adjustmentType}: {Math.abs(log.quantityChange)} units
                      </span>
                      <span className="font-mono text-[11px] text-[#667266]">
                        {log.previousStock} → {log.newStock}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#667266]">
                      <span className="font-semibold">Reason:</span> {log.reason}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#8A9A86] pt-1 border-t border-[#E5DFC5]/60">
                      <span>By: {log.admin?.name || "Kitchen Admin"}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#F0ECE1] flex justify-end">
              <button
                onClick={() => setHistoryProduct(null)}
                className="px-4 py-2 rounded-xl bg-[#F7F3EA] text-xs font-semibold text-[#1E2B1E] hover:bg-[#EDE8DE] cursor-pointer"
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
