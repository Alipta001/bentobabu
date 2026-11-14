"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Download,
  Calendar,
  TrendingUp,
  Boxes,
  Users,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import {
  useAdminOrders,
  useAdminProducts,
  useAdminCustomers,
} from "@/hooks/useAdminQueries";

export default function ReportsPage() {
  const { data: orders = [] } = useAdminOrders();
  const { data: products = [] } = useAdminProducts();
  const { data: customers = [] } = useAdminCustomers();

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "all">("all");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const triggerDownload = (fileName: string, csvContent: string) => {
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccess(fileName);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleExportSales = () => {
    const headers = [
      "Order ID",
      "Customer Name",
      "Customer Phone",
      "Date",
      "Status",
      "Payment Status",
      "Payment Method",
      "Subtotal (INR)",
      "Discount (INR)",
      "Delivery Fee (INR)",
      "GST Tax (INR)",
      "Total (INR)",
    ];
    const rows = orders.map((o) => [
      o.id,
      `"${o.customerName}"`,
      `"${o.customerPhone}"`,
      `"${new Date(o.createdAt).toLocaleDateString("en-IN")}"`,
      o.status,
      o.paymentStatus,
      o.paymentMethod,
      o.subtotal,
      o.discount,
      o.deliveryFee,
      o.tax,
      o.total,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    triggerDownload(`bentobabu-sales-report-${Date.now()}.csv`, csv);
  };

  const handleExportInventory = () => {
    const headers = [
      "SKU",
      "Product Name",
      "Dietary",
      "Price (INR)",
      "Cost Price (INR)",
      "Current Stock Portions",
      "Low Stock Threshold",
      "Is Available",
      "Inventory Value (INR)",
    ];
    const rows = products.map((p) => [
      p.sku,
      `"${p.name}"`,
      p.dietary,
      p.price,
      p.costPrice || Math.round(p.price * 0.45),
      p.stockQuantity,
      p.lowStockThreshold,
      p.isAvailable ? "YES" : "NO",
      p.stockQuantity * p.price,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    triggerDownload(`bentobabu-inventory-report-${Date.now()}.csv`, csv);
  };

  const handleExportCustomers = () => {
    const headers = [
      "Customer ID",
      "Full Name",
      "Email Address",
      "Phone Number",
      "Total Orders",
      "Lifetime Spend (INR)",
      "Joined Date",
      "Account Status",
    ];
    const rows = customers.map((c) => [
      c.id,
      `"${c.name}"`,
      `"${c.email}"`,
      `"${c.phone}"`,
      c.totalOrders,
      c.totalSpent,
      `"${new Date(c.createdAt).toLocaleDateString("en-IN")}"`,
      c.isBlocked ? "BLOCKED" : "ACTIVE",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    triggerDownload(`bentobabu-customers-report-${Date.now()}.csv`, csv);
  };

  const handleExportTax = () => {
    const headers = [
      "Invoice / Order ID",
      "Date",
      "Customer",
      "Taxable Value (INR)",
      "CGST 2.5% (INR)",
      "SGST 2.5% (INR)",
      "Total GST 5% (INR)",
      "Invoice Total (INR)",
    ];
    const rows = orders.map((o) => {
      const cgst = (o.tax / 2).toFixed(2);
      const sgst = (o.tax / 2).toFixed(2);
      return [
        o.id,
        `"${new Date(o.createdAt).toLocaleDateString("en-IN")}"`,
        `"${o.customerName}"`,
        o.subtotal - o.discount,
        cgst,
        sgst,
        o.tax,
        o.total,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    triggerDownload(`bentobabu-gst-tax-report-${Date.now()}.csv`, csv);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
              Business Reports & Data Exports
            </h1>
            <p className="text-sm text-[#354B35]/70 mt-1">
              Download clean, standardized CSV files for accounting, tax audits, inventory planning, and cohort analytics.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white border border-[#E5DFD3] rounded-xl p-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#354B35]/60 ml-2" />
            <button
              onClick={() => setDateRange("7d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === "7d"
                  ? "bg-[#354B35] text-white"
                  : "text-[#354B35]/70 hover:text-[#1E2B1E]"
              }`}
            >
              Past 7 Days
            </button>
            <button
              onClick={() => setDateRange("30d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === "30d"
                  ? "bg-[#354B35] text-white"
                  : "text-[#354B35]/70 hover:text-[#1E2B1E]"
              }`}
            >
              Past 30 Days
            </button>
            <button
              onClick={() => setDateRange("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === "all"
                  ? "bg-[#354B35] text-white"
                  : "text-[#354B35]/70 hover:text-[#1E2B1E]"
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {downloadSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Successfully generated and downloaded: {downloadSuccess}
          </div>
        )}

        {/* Export Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sales Report */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#354B35]/10 text-[#354B35] flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F7F3EA] text-[#354B35] px-2.5 py-1 rounded-full border border-[#E5DFD3]">
                  {orders.length} Records
                </span>
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Sales & Order Fulfilment Report
              </h3>
              <p className="text-xs text-[#354B35]/70 mt-1 leading-relaxed">
                Granular order records with customer details, order statuses, delivery fee splits, coupon deductions, and payment gateways.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5DFD3] flex items-center justify-between">
              <span className="text-xs text-[#354B35]/60 font-medium">Format: CSV</span>
              <button
                onClick={handleExportSales}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Sales CSV
              </button>
            </div>
          </div>

          {/* Inventory Movement */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Boxes className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200">
                  {products.length} Products
                </span>
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Product Inventory & Stock Valuation
              </h3>
              <p className="text-xs text-[#354B35]/70 mt-1 leading-relaxed">
                Portion availability, SKUs, cost prices, current inventory valuation in INR, and low-stock replenishment indicators.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5DFD3] flex items-center justify-between">
              <span className="text-xs text-[#354B35]/60 font-medium">Format: CSV</span>
              <button
                onClick={handleExportInventory}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Inventory CSV
              </button>
            </div>
          </div>

          {/* Customer Cohort Report */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-800 px-2.5 py-1 rounded-full border border-purple-200">
                  {customers.length} Profiles
                </span>
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Customer Cohorts & Lifetime Spend
              </h3>
              <p className="text-xs text-[#354B35]/70 mt-1 leading-relaxed">
                Verified customer directories, frequency of purchase, lifetime value (LTV), phone contacts, and engagement status.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5DFD3] flex items-center justify-between">
              <span className="text-xs text-[#354B35]/60 font-medium">Format: CSV</span>
              <button
                onClick={handleExportCustomers}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Cohorts CSV
              </button>
            </div>
          </div>

          {/* GST Tax Report */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#B99A60]/10 text-[#B99A60] flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F7F3EA] text-[#B99A60] px-2.5 py-1 rounded-full border border-[#E5DFD3]">
                  GST Compliance
                </span>
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                GST & Tax Reconciliation Statement
              </h3>
              <p className="text-xs text-[#354B35]/70 mt-1 leading-relaxed">
                Itemized GST statement with CGST (2.5%) and SGST (2.5%) split calculations for monthly chartered accountant filings.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5DFD3] flex items-center justify-between">
              <span className="text-xs text-[#354B35]/60 font-medium">Format: CSV</span>
              <button
                onClick={handleExportTax}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Tax Ledger CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
