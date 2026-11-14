"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  CreditCard,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  X,
} from "lucide-react";
import { useAdminPayments } from "@/hooks/useAdminQueries";
import { paymentService } from "@/services/paymentService";
import { useQueryClient } from "@tanstack/react-query";
import { PaymentRecord } from "@/types";

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { data: payments = [], isLoading } = useAdminPayments();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.orderId.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      (p.transactionRef && p.transactionRef.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesProvider = providerFilter === "all" || p.provider === providerFilter;

    return matchesSearch && matchesStatus && matchesProvider;
  });

  const totalCollected = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const refundedAmount = payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + p.amount, 0);

  const handleOpenRefund = (payment: PaymentRecord) => {
    setRefundTarget(payment);
    setRefundAmount(payment.amount);
    setRefundReason("");
  };

  const handleConfirmRefund = async () => {
    if (!refundTarget) return;
    setIsRefunding(true);
    try {
      await paymentService.refund(
        refundTarget.id,
        refundAmount,
        refundReason || "Admin initiated refund"
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "revenueSummary"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "kpis"] });
      setRefundTarget(null);
    } catch (err) {
      console.error(err);
      alert("Failed to process refund. Please check gateway connection.");
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E2B1E]">
              Payment Transactions
            </h1>
            <p className="text-sm text-[#354B35]/70 mt-1">
              Live gateway status, Razorpay settlements, cash-on-delivery tracking, and customer refunds.
            </p>
          </div>
        </div>

        {/* Financial Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Total Settled Volume
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                ₹{totalCollected.toLocaleString("en-IN")}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                {payments.filter((p) => p.status === "paid").length} cleared payments
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Pending Settlements
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                ₹{pendingAmount.toLocaleString("en-IN")}
              </div>
              <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                {payments.filter((p) => p.status === "pending").length} awaiting gateway clearance
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#E5DFD3] shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[#354B35]/70">
                Total Refunded
              </div>
              <div className="font-serif text-2xl font-bold text-[#1E2B1E] mt-1">
                ₹{refundedAmount.toLocaleString("en-IN")}
              </div>
              <div className="text-[11px] text-indigo-700 font-medium mt-0.5">
                {payments.filter((p) => p.status === "refunded").length} refunded orders
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5DFD3] shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#354B35]/50" />
            <input
              type="text"
              placeholder="Search by Payment ID, Order ID, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35] transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#354B35]/70" />
              <span className="text-[#354B35]/70 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-1.5 text-xs text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <CreditCard className="w-3.5 h-3.5 text-[#354B35]/70" />
              <span className="text-[#354B35]/70 font-medium">Method:</span>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl px-3 py-1.5 text-xs text-[#1E2B1E] focus:outline-none focus:border-[#354B35]"
              >
                <option value="all">All Methods</option>
                <option value="razorpay">Razorpay (Online)</option>
                <option value="cod">Cash on Delivery</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-[#E5DFD3] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F3EA] text-[#354B35] uppercase tracking-wider text-[10px] font-semibold">
                <tr>
                  <th className="py-3 px-4">Transaction Ref</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DFD3]">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#354B35]/60">
                      Loading payment transactions...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#354B35]/60">
                      No matching payment records found.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F9F7F1]/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-[#1E2B1E]">
                        <div>{p.id}</div>
                        {p.transactionRef && (
                          <div className="text-[10px] text-[#354B35]/50 font-mono">
                            {p.transactionRef}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#354B35]">
                        {p.orderId}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#1E2B1E]">
                        {p.customerName}
                      </td>
                      <td className="py-3.5 px-4 text-[#354B35]/80">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F3EA] text-[11px] font-medium text-[#1E2B1E]">
                          <CreditCard className="w-3 h-3 text-[#354B35]" />
                          {p.method}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[#354B35]/70">
                        {new Date(p.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-serif text-sm font-bold text-[#1E2B1E]">
                        ₹{p.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            p.status === "paid"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : p.status === "refunded"
                              ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                              : p.status === "failed"
                              ? "bg-rose-50 text-rose-800 border border-rose-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {p.status === "paid" ? (
                          <button
                            onClick={() => handleOpenRefund(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Refund
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#354B35]/40 italic">
                            No action
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Refund Confirmation Modal */}
        {refundTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#E5DFD3] shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-[#E5DFD3]">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <h3 className="font-serif text-lg font-bold text-[#1E2B1E]">
                    Initiate Refund
                  </h3>
                </div>
                <button
                  onClick={() => setRefundTarget(null)}
                  className="p-1 rounded-lg text-[#354B35]/60 hover:text-[#1E2B1E]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="bg-[#F9F7F1] p-3.5 rounded-xl border border-[#E5DFD3] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#354B35]/70">Transaction:</span>
                    <span className="font-mono font-semibold">{refundTarget.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#354B35]/70">Order ID:</span>
                    <span className="font-mono font-semibold">{refundTarget.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#354B35]/70">Customer:</span>
                    <span className="font-medium">{refundTarget.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#354B35]/70">Original Paid:</span>
                    <span className="font-bold text-emerald-800">
                      ₹{refundTarget.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    max={refundTarget.amount}
                    min={1}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                  <p className="text-[10px] text-[#354B35]/60 mt-1">
                    Maximum refundable: ₹{refundTarget.amount}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1E2B1E] mb-1">
                    Reason for Refund
                  </label>
                  <textarea
                    rows={2}
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. Order cancelled before prep, quality issue, incorrect address..."
                    className="w-full px-3 py-2 bg-[#F9F7F1] border border-[#E5DFD3] rounded-xl text-xs focus:outline-none focus:border-[#354B35]"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#E5DFD3]">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#354B35] hover:bg-[#F7F3EA]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRefund}
                  disabled={isRefunding || refundAmount <= 0}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {isRefunding ? "Processing..." : `Confirm Refund of ₹${refundAmount}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
