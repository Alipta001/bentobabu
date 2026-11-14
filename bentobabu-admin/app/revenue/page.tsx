"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  TrendingUp,
  Receipt,
  Percent,
  Truck,
  IndianRupee,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  useRevenueSummary,
  useRevenueAnalytics,
  useAdminOrders,
} from "@/hooks/useAdminQueries";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RevenuePage() {
  const { data: summary, isLoading: isSummaryLoading } = useRevenueSummary();
  const { data: analytics } = useRevenueAnalytics();
  const { data: orders = [] } = useAdminOrders();
  const [selectedRange, setSelectedRange] = useState<"all" | "month" | "today">("all");

  const exportCSV = () => {
    if (!orders.length) return;
    const headers = [
      "Order ID",
      "Customer",
      "Date",
      "Subtotal",
      "Discount",
      "Delivery Fee",
      "Tax",
      "Total",
      "Payment Status",
      "Method",
    ];
    const rows = orders.map((o) => [
      o.id,
      `"${o.customerName}"`,
      `"${new Date(o.createdAt).toLocaleDateString("en-IN")}"`,
      o.subtotal,
      o.discount,
      o.deliveryFee,
      o.tax,
      o.total,
      o.paymentStatus,
      o.paymentMethod,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bentobabu-revenue-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
              Revenue & Financials
            </h1>
            <p className="text-sm text-[#354B35]/70 mt-1">
              Detailed tracking of gross sales, net realization, taxes collected, and settlement metrics.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-[#E5DFD3] rounded-xl p-1 text-xs">
              <button
                onClick={() => setSelectedRange("all")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  selectedRange === "all"
                    ? "bg-[#354B35] text-white"
                    : "text-[#354B35]/70 hover:text-[#1E2B1E]"
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setSelectedRange("month")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  selectedRange === "month"
                    ? "bg-[#354B35] text-white"
                    : "text-[#354B35]/70 hover:text-[#1E2B1E]"
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setSelectedRange("today")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  selectedRange === "today"
                    ? "bg-[#354B35] text-white"
                    : "text-[#354B35]/70 hover:text-[#1E2B1E]"
                }`}
              >
                Today
              </button>
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#2A3C2A] transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              Export Financials
            </button>
          </div>
        </div>

        {/* Financial KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Gross Sales */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-[#354B35]/10 flex items-center justify-center text-[#354B35] mb-3">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              Gross Sales
            </div>
            <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.grossSales.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-emerald-700 mt-1 font-medium">
              Total invoiced value
            </div>
          </div>

          {/* Net Sales */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 mb-3">
              <IndianRupee className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              Net Sales
            </div>
            <div className="font-serif text-2xl font-bold text-emerald-800 mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.netSales.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-[#354B35]/60 mt-1">
              Food cost & revenue
            </div>
          </div>

          {/* Taxes Collected */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-[#B99A60]/10 flex items-center justify-center text-[#B99A60] mb-3">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              GST (5%)
            </div>
            <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.taxCollected.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-[#354B35]/60 mt-1">
              Government tax liability
            </div>
          </div>

          {/* Delivery Charges */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 mb-3">
              <Truck className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              Delivery Fees
            </div>
            <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.deliveryCharges.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-[#354B35]/60 mt-1">
              Logistics recovery
            </div>
          </div>

          {/* Discounts */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 mb-3">
              <Percent className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              Discounts Given
            </div>
            <div className="font-serif text-2xl font-bold text-amber-900 mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.totalDiscounts.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-[#354B35]/60 mt-1">
              Promotional coupons
            </div>
          </div>

          {/* Average Order Value */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-700 mb-3">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#354B35]/70">
              Avg Order Value
            </div>
            <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
              {isSummaryLoading ? "..." : `₹${summary?.avgOrderValue.toLocaleString("en-IN")}`}
            </div>
            <div className="text-[10px] text-[#354B35]/60 mt-1">
              Per successful order
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                  Revenue Trajectory
                </h3>
                <p className="text-xs text-[#354B35]/70">Daily sales performance</p>
              </div>
              <div className="text-xs font-semibold text-[#354B35] bg-[#354B35]/10 px-3 py-1 rounded-full">
                Past 7 Days
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics?.dailyRevenue || []}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#354B35" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#354B35" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0" vertical={false} />
                  <XAxis dataKey="date" stroke="#8A9A86" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#8A9A86"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1E2B1E",
                      color: "#fff",
                      borderRadius: "12px",
                      border: "none",
                      fontSize: "12px",
                    }}
                    formatter={(value: unknown) => [`₹${Number(value || 0).toLocaleString("en-IN")}`, "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#354B35"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E5DFD3] shadow-xs">
            <div className="mb-6">
              <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Category Contribution
              </h3>
              <p className="text-xs text-[#354B35]/70">Sales by healthy segment</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics?.categoryRevenue || []}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#8A9A86"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <YAxis
                    dataKey="category"
                    type="category"
                    stroke="#354B35"
                    fontSize={11}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1E2B1E",
                      color: "#fff",
                      borderRadius: "12px",
                      border: "none",
                      fontSize: "12px",
                    }}
                    formatter={(val: unknown) => [`₹${Number(val || 0).toLocaleString("en-IN")}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#B99A60" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Payment Reconciliation Statuses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-emerald-50 border border-emerald-200/70 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-emerald-800 font-medium">Settled / Paid</div>
              <div className="text-xl font-bold text-emerald-950 font-serif">
                {summary?.successfulCount || 0} Orders
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200/70 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-amber-800 font-medium">Pending Settlements</div>
              <div className="text-xl font-bold text-amber-950 font-serif">
                {summary?.pendingCount || 0} Orders
              </div>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200/70 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-rose-800 font-medium">Failed Transactions</div>
              <div className="text-xl font-bold text-rose-950 font-serif">
                {summary?.failedCount || 0} Orders
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200/70 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-indigo-800 font-medium">Processed Refunds</div>
              <div className="text-xl font-bold text-indigo-950 font-serif">
                {summary?.refundedCount || 0} Orders
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Financial Ledger */}
        <div className="bg-white rounded-2xl border border-[#E5DFD3] shadow-xs overflow-hidden">
          <div className="p-6 border-b border-[#E5DFD3] flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1E2B1E]">
                Financial Order Breakdown
              </h2>
              <p className="text-xs text-[#354B35]/70">
                Itemized breakdown showing taxes, discounts, delivery fees, and net values
              </p>
            </div>
            <span className="text-xs text-[#354B35]/70 font-medium">
              Showing {orders.length} transaction records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F3EA] text-[#354B35] uppercase tracking-wider text-[10px] font-semibold">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">Discount</th>
                  <th className="py-3 px-4 text-right">Delivery</th>
                  <th className="py-3 px-4 text-right">GST (5%)</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD3]">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#F9F7F1]/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#1E2B1E]">
                      {o.id}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#1E2B1E]">
                      {o.customerName}
                    </td>
                    <td className="py-3.5 px-4 text-[#354B35]/70">
                      {new Date(o.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#354B35]/80">
                      ₹{o.subtotal.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right text-amber-700">
                      {o.discount > 0 ? `-₹${o.discount.toLocaleString("en-IN")}` : "₹0"}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#354B35]/80">
                      ₹{o.deliveryFee.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right text-[#354B35]/80">
                      ₹{o.tax.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-[#1E2B1E]">
                      ₹{o.total.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          o.paymentStatus === "paid"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : o.paymentStatus === "refunded"
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                            : o.paymentStatus === "failed"
                            ? "bg-rose-50 text-rose-800 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
