"use client";

import React from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Boxes,
  CalendarCheck2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useKPISummary,
  useRevenueAnalytics,
  useAdminOrders,
  useAdminProducts,
} from "@/hooks/useAdminQueries";

export default function AdminDashboardPage() {
  const { data: kpi, isLoading: kpiLoading } = useKPISummary();
  const { data: analytics } = useRevenueAnalytics();
  const { data: recentOrders = [] } = useAdminOrders();
  const { data: products = [] } = useAdminProducts();

  const lowStockProducts = products.filter(
    (p) => p.stockQuantity <= p.lowStockThreshold
  );

  return (
    <AdminShell
      title="Business Overview"
      subtitle="Real-time operational KPIs, revenue, kitchen dispatch and stock monitoring"
    >
      {/* 1. Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-[#E5DFC5] shadow-xs">
        <div className="text-xs font-semibold text-[#667266]">
          Quick Kitchen & Inventory Actions:
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/products?action=new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Add New Dish</span>
          </Link>

          <Link
            href="/orders?status=pending"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5DFC5] bg-[#F7F3EA] text-[#354B35] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-[#B99A60]" />
            <span>Pending Orders ({kpi?.pendingOrders || 0})</span>
          </Link>

          <Link
            href="/menu"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5DFC5] bg-white text-[#1F271F] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
          >
            <CalendarCheck2 className="w-3.5 h-3.5 text-[#354B35]" />
            <span>Update Daily Menu</span>
          </Link>

          <Link
            href="/inventory"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E5DFC5] bg-white text-[#1F271F] text-xs font-semibold hover:bg-[#EDE8DE] transition-colors"
          >
            <Boxes className="w-3.5 h-3.5 text-[#354B35]" />
            <span>Restock Inventory</span>
          </Link>
        </div>
      </div>

      {/* 2. Top KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#667266]">
            <span>Total Sales</span>
            <div className="w-8 h-8 rounded-xl bg-[#EBF0E9] text-[#354B35] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#1F271F]">
            {kpiLoading ? "..." : `₹${kpi?.totalRevenue.toLocaleString("en-IN")}`}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold">
            Today: ₹{kpi?.todayRevenue.toLocaleString("en-IN")}
          </div>
        </div>

        {/* Total Orders */}
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#667266]">
            <span>Orders</span>
            <div className="w-8 h-8 rounded-xl bg-[#EBF0E9] text-[#354B35] flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#1F271F]">
            {kpiLoading ? "..." : kpi?.totalOrders}
          </div>
          <div className="text-[11px] text-[#667266]">
            Today: <strong>{kpi?.todayOrders}</strong> placed
          </div>
        </div>

        {/* Pending Orders */}
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#667266]">
            <span>In Kitchen</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-amber-900">
            {kpiLoading ? "..." : kpi?.pendingOrders}
          </div>
          <div className="text-[11px] text-amber-700 font-semibold">
            Awaiting prep & dispatch
          </div>
        </div>

        {/* Completed Orders */}
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#667266]">
            <span>Delivered</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#354B35]">
            {kpiLoading ? "..." : kpi?.completedOrders}
          </div>
          <div className="text-[11px] text-[#667266]">
            Cancelled: {kpi?.cancelledOrders}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white p-5 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-2 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#667266]">
            <span>Low Stock</span>
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-red-700">
            {kpiLoading ? "..." : kpi?.lowStockCount}
          </div>
          <div className="text-[11px] text-red-600 font-medium">
            Requires restocking
          </div>
        </div>
      </div>

      {/* 3. Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Revenue Trend Chart */}
        <div className="lg:col-span-8 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                Revenue & Daily Orders Velocity
              </h3>
              <p className="text-xs text-[#667266]">
                Gross daily sales performance across the past 7 days
              </p>
            </div>
            <span className="text-xs font-bold text-[#354B35] bg-[#EBF0E9] px-3 py-1 rounded-full">
              Past 7 Days
            </span>
          </div>

          <div className="h-72 w-full">
            {analytics?.dailyRevenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.dailyRevenue}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#354B35" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#354B35" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE1" />
                  <XAxis dataKey="date" stroke="#8A9A86" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#8A9A86"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    formatter={(val) => [`₹${val}`, "Daily Revenue"]}
                    contentStyle={{
                      backgroundColor: "#1E2B1E",
                      color: "#FFFFFF",
                      borderRadius: "12px",
                      border: "none",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#354B35"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#667266]">
                Loading revenue analytics...
              </div>
            )}
          </div>
        </div>

        {/* Right: Category Performance Breakdown */}
        <div className="lg:col-span-4 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-6">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1F271F]">
              Sales by Category
            </h3>
            <p className="text-xs text-[#667266]">
              Target segment revenue share
            </p>
          </div>

          <div className="h-72 w-full">
            {analytics?.categoryRevenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.categoryRevenue} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0ECE1" />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="#1F271F"
                    fontSize={11}
                    width={90}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`₹${v}`, "Revenue"]}
                    contentStyle={{
                      backgroundColor: "#1E2B1E",
                      color: "#FFFFFF",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="revenue" fill="#B99A60" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      </div>

      {/* 4. Best-Sellers & Low-Stock Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Bestsellers Table */}
        <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1F271F]">
                Top Selling Meals
              </h3>
              <p className="text-xs text-[#667266]">
                Highest volume dishes by orders and revenue
              </p>
            </div>
            <Link
              href="/products"
              className="text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#F0ECE1]">
            {analytics?.bestsellers.map((item, idx) => (
              <div
                key={idx}
                className="py-3 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-bold text-[#B99A60]">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="font-bold text-[#1F271F]">{item.name}</div>
                    <div className="text-[11px] text-[#667266]">
                      {item.quantity} orders fulfilled
                    </div>
                  </div>
                </div>
                <div className="font-bold text-[#354B35] text-right">
                  ₹{item.revenue.toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Watchlist */}
        <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Low Stock Watchlist</span>
              </h3>
              <p className="text-xs text-[#667266]">
                Dishes below replenishment threshold
              </p>
            </div>
            <Link
              href="/inventory"
              className="text-xs font-semibold text-[#354B35] hover:underline"
            >
              Restock All
            </Link>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#667266]">
              All items are above safety stock thresholds.
            </div>
          ) : (
            <div className="divide-y divide-[#F0ECE1]">
              {lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="py-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-[#1F271F]">{p.name}</div>
                    <div className="text-[11px] text-[#667266]">
                      SKU: {p.sku} • Min: {p.lowStockThreshold} units
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                      {p.stockQuantity} remaining
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Recent Orders Stream */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#1F271F]">
              Recent Customer Orders
            </h3>
            <p className="text-xs text-[#667266]">
              Incoming meal orders and live fulfilment status
            </p>
          </div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#354B35] text-[#354B35] text-xs font-semibold hover:bg-[#354B35] hover:text-white transition-colors"
          >
            <span>Manage All Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#F0ECE1] text-[11px] uppercase tracking-wider text-[#8A9A86] pb-3">
                <th className="py-3 font-bold">Order ID</th>
                <th className="py-3 font-bold">Customer</th>
                <th className="py-3 font-bold">Items</th>
                <th className="py-3 font-bold">Total</th>
                <th className="py-3 font-bold">Payment</th>
                <th className="py-3 font-bold">Kitchen Status</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE1]">
              {recentOrders.slice(0, 5).map((order) => (
                <tr key={order.id} className="hover:bg-[#F9F7F1] transition-colors">
                  <td className="py-3.5 font-mono font-bold text-[#354B35]">
                    {order.id}
                  </td>
                  <td className="py-3.5">
                    <div className="font-semibold text-[#1F271F]">
                      {order.customerName}
                    </div>
                    <div className="text-[11px] text-[#667266]">
                      {order.customerPhone}
                    </div>
                  </td>
                  <td className="py-3.5 text-[#667266]">
                    {order.items.reduce((acc, i) => acc + i.quantity, 0)} items
                  </td>
                  <td className="py-3.5 font-bold text-[#1F271F]">
                    ₹{order.total}
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        order.paymentStatus === "paid"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : order.paymentStatus === "pending"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-red-50 text-red-800 border border-red-200"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className="capitalize text-xs font-semibold text-[#354B35]">
                      {order.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3.5 text-right">
                    <Link
                      href={`/orders?id=${order.id}`}
                      className="text-xs font-semibold text-[#354B35] hover:text-[#B99A60] hover:underline"
                    >
                      Inspect Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
