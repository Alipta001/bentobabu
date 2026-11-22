"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Clock,
  CheckCircle2,
  X,
  Phone,
  Mail,
  MapPin,
  FileText,
  Download,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  useAdminOrders,
  useUpdateOrderStatus,
  useAdminCancellationRequests,
  useApproveCancellationRequest,
  useRejectCancellationRequest,
  useRetryRefund,
} from "@/hooks/useAdminQueries";
import { orderService } from "@/services/orderService";
import { OrderStatus } from "@/types";

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "All Orders", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready to Dispatch", value: "ready_for_dispatch" },
  { label: "Rider Accepted", value: "rider_accepted" },
  { label: "Picked Up", value: "picked_up" },
  { label: "Out for Delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
];

function OrdersContent() {
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status") || "all";
  const urlId = searchParams.get("id") || "";

  const [activeStatus, setActiveStatus] = useState<string>(urlStatus);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => urlId || null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [regeneratingReceipt, setRegeneratingReceipt] = useState(false);
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null);

  // Sub-tab state: orders or cancellations
  const [activeTab, setActiveTab] = useState<"orders" | "cancellations">("orders");
  const [cancellationStatus, setCancellationStatus] = useState<string>("pending");
  const [cancellationSearch, setCancellationSearch] = useState<string>("");

  // Modals for cancellation approval/rejection
  const [approveModalItem, setApproveModalItem] = useState<any | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<any | null>(null);
  const [adminRejectionReason, setAdminRejectionReason] = useState<string>("");
  const [cancellationActionError, setCancellationActionError] = useState<string | null>(null);

  const { data: orders = [], isLoading, refetch } = useAdminOrders({
    status: activeStatus,
    search: searchQuery,
  });

  const {
    data: cancellationData,
    isLoading: isCancellationsLoading,
    refetch: refetchCancellations,
  } = useAdminCancellationRequests({
    status: cancellationStatus,
    search: cancellationSearch,
  });

  const approveMutation = useApproveCancellationRequest();
  const rejectMutation = useRejectCancellationRequest();
  const retryRefundMutation = useRetryRefund();

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;
  const pendingCancellationCount = cancellationData?.pendingCount ?? 0;

  const updateStatusMutation = useUpdateOrderStatus();

  const handleAdminDownloadReceipt = async (order: any) => {
    const orderId = order._backendId || order.id;
    setDownloadingReceipt(true);
    setReceiptFeedback(null);
    try {
      const blob = await orderService.downloadReceipt(orderId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BentoBabu-Receipt-${order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setReceiptFeedback(err?.message || "Failed to download receipt.");
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const handleAdminRegenerateReceipt = async (order: any) => {
    const orderId = order._backendId || order.id;
    setRegeneratingReceipt(true);
    setReceiptFeedback(null);
    try {
      await orderService.regenerateReceipt(orderId);
      setReceiptFeedback("Receipt regenerated and stored in Backblaze B2.");
      if (typeof refetch === "function") {
        refetch();
      }
    } catch (err: any) {
      setReceiptFeedback(err?.message || "Failed to regenerate receipt.");
    } finally {
      setRegeneratingReceipt(false);
    }
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await updateStatusMutation.mutateAsync({
        id: (selectedOrder as any)?._backendId || orderId,
        status: nextStatus,
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update order status.");
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    try {
      await updateStatusMutation.mutateAsync({
        id: (selectedOrder as any)?._backendId || selectedOrder.id,
        status: "cancelled",
        note: cancelReason || "Cancelled via admin operations",
      });
      setCancelModalOpen(false);
      setCancelReason("");
      setSelectedOrderId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to cancel order.");
    }
  };

  const handleApproveCancellation = async () => {
    if (!approveModalItem) return;
    setCancellationActionError(null);
    try {
      await approveMutation.mutateAsync(approveModalItem.id || approveModalItem._id);
      setApproveModalItem(null);
      refetchCancellations();
      refetch();
    } catch (err: unknown) {
      setCancellationActionError(
        err instanceof Error ? err.message : "Failed to approve cancellation."
      );
    }
  };

  const handleRejectCancellation = async () => {
    if (!rejectModalItem) return;
    if (!adminRejectionReason || adminRejectionReason.trim().length < 3) {
      setCancellationActionError(
        "Please provide an administrative rejection reason (minimum 3 characters)."
      );
      return;
    }
    setCancellationActionError(null);
    try {
      await rejectMutation.mutateAsync({
        id: rejectModalItem.id || rejectModalItem._id,
        rejectionReason: adminRejectionReason.trim(),
      });
      setRejectModalItem(null);
      setAdminRejectionReason("");
      refetchCancellations();
      refetch();
    } catch (err: unknown) {
      setCancellationActionError(
        err instanceof Error ? err.message : "Failed to reject cancellation request."
      );
    }
  };

  const handleRetryRefund = async (reqId: string) => {
    try {
      await retryRefundMutation.mutateAsync(reqId);
      refetchCancellations();
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to retry refund.");
    }
  };

  return (
    <AdminShell
      title="Kitchen & Dispatch Order Management"
      subtitle="Accept, prepare, assign and track delivery transitions for all healthy meal orders"
    >
      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-[#E5DFC5] pb-3 mb-6">
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "orders"
              ? "bg-[#354B35] text-white shadow-xs"
              : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
          }`}
        >
          <span>Live Kitchen & Dispatch Orders</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/15">
            {orders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("cancellations")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "cancellations"
              ? "bg-[#354B35] text-white shadow-xs"
              : "bg-white text-[#667266] border border-[#E5DFC5] hover:bg-[#F7F3EA]"
          }`}
        >
          <span>Customer Cancellation Requests</span>
          {pendingCancellationCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse">
              {pendingCancellationCount} Pending
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/10">
              0
            </span>
          )}
        </button>
      </div>

      {activeTab === "orders" ? (
        <>
          {/* Top Controls: Filter Tabs & Search Bar */}
          <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
            {/* Status Pill Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveStatus(f.value)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeStatus === f.value
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-[#F0ECE1]">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by Order ID (e.g. BB-849201), Customer Name, Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
            <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
          </div>

          <div className="text-xs text-[#667266] font-medium">
            Showing <strong>{orders.length}</strong> matching orders
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading orders from kitchen database...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#F7F3EA] flex items-center justify-center mx-auto text-[#8A9A86]">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="font-serif text-xl font-bold text-[#1F271F]">
              No Orders Found
            </h3>
            <p className="text-xs text-[#667266] max-w-sm mx-auto">
              There are no orders matching the selected filter criteria or search query.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Order ID</th>
                  <th className="py-3.5 px-4 font-bold">Date & Time</th>
                  <th className="py-3.5 px-4 font-bold">Customer Details</th>
                  <th className="py-3.5 px-4 font-bold">Items & Bento</th>
                  <th className="py-3.5 px-4 font-bold">Total Bill</th>
                  <th className="py-3.5 px-4 font-bold">Payment</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-6 font-bold text-right">Quick Transition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="hover:bg-[#F9F7F1] transition-colors cursor-pointer"
                  >
                    <td className="py-4 px-6 font-mono font-bold text-[#354B35]">
                      {order.id}
                    </td>

                    <td className="py-4 px-4 text-[#667266]">
                      <div>
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="text-[10px] opacity-75">
                        {new Date(order.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-semibold text-[#1F271F]">
                        {order.customerName}
                      </div>
                      <div className="text-[11px] text-[#667266]">
                        {order.customerPhone}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-[#667266]">
                      <div className="font-medium text-[#1F271F] line-clamp-1">
                        {order.items[0]?.productName}
                      </div>
                      {order.items.length > 1 && (
                        <div className="text-[10px] text-[#B99A60] font-semibold">
                          +{order.items.length - 1} other items
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 font-bold text-[#1F271F]">
                      ₹{order.total}
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          order.paymentStatus === "paid"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : order.paymentStatus === "pending"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                        }`}
                      >
                        {order.paymentStatus} • {order.paymentMethod.toUpperCase()}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize ${
                          order.status === "delivered"
                            ? "bg-emerald-100 text-emerald-900"
                            : order.status === "preparing"
                            ? "bg-amber-100 text-amber-900"
                            : order.status === "ready_for_dispatch"
                            ? "bg-sky-100 text-sky-900"
                            : order.status === "rider_accepted"
                            ? "bg-purple-100 text-purple-900"
                            : order.status === "picked_up" ||
                              order.status === "out_for_delivery"
                            ? "bg-blue-100 text-blue-900"
                            : order.status === "cancelled"
                            ? "bg-red-100 text-red-900"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td
                      className="py-4 px-6 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.status === "pending" && (
                        <button
                          onClick={() => handleStatusChange(order.id, "confirmed")}
                          className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-[11px] font-bold hover:bg-[#253525] cursor-pointer"
                        >
                          Accept Order
                        </button>
                      )}

                      {order.status === "confirmed" && (
                        <button
                          onClick={() => handleStatusChange(order.id, "preparing")}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 cursor-pointer"
                        >
                          Mark Preparing
                        </button>
                      )}

                      {order.status === "preparing" && (
                        <button
                          onClick={() =>
                            handleStatusChange(order.id, "ready_for_dispatch")
                          }
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 cursor-pointer"
                        >
                          Ready to Dispatch
                        </button>
                      )}

                      {order.status === "ready_for_dispatch" && (
                        <span className="text-[11px] text-sky-800 font-semibold">
                          Awaiting Rider
                        </span>
                      )}

                      {order.status === "rider_accepted" && (
                        <button
                          onClick={() =>
                            handleStatusChange(order.id, "picked_up")
                          }
                          className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-[11px] font-bold hover:bg-purple-700 cursor-pointer"
                        >
                          Confirm Pickup
                        </button>
                      )}

                      {(order.status === "picked_up" || order.status === "out_for_delivery") && (
                        <button
                          onClick={() => handleStatusChange(order.id, "delivered")}
                          className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-[11px] font-bold hover:bg-emerald-800 cursor-pointer"
                        >
                          Mark Delivered
                        </button>
                      )}

                      {order.status === "delivered" && (
                        <span className="text-[11px] text-emerald-800 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Fulfilled</span>
                        </span>
                      )}

                      {order.status === "cancelled" && (
                        <span className="text-[11px] text-red-700 font-semibold">
                          Cancelled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  ) : (
    /* ================= CANCELLATION REQUESTS TAB ================= */
    <div className="space-y-6">
      {/* Cancellation Controls: Filters & Search */}
      <div className="bg-white p-6 rounded-3xl border border-[#E5DFC5] shadow-xs space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { label: "Pending Review", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
            { label: "All Requests", value: "all" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setCancellationStatus(f.value)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                cancellationStatus === f.value
                  ? "bg-[#354B35] text-white shadow-xs"
                  : "bg-[#F7F3EA] text-[#667266] hover:bg-[#EDE8DE]"
              }`}
            >
              {f.label}
              {f.value === "pending" && pendingCancellationCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                  {pendingCancellationCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-[#F0ECE1]">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by Order ID, Customer Name, Phone..."
              value={cancellationSearch}
              onChange={(e) => setCancellationSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-[#354B35]"
            />
            <Search className="w-4 h-4 text-[#8A9A86] absolute left-3.5 top-3 pointer-events-none" />
          </div>

          <div className="text-xs text-[#667266] font-medium">
            Showing <strong>{cancellationData?.cancellationRequests?.length || 0}</strong> requests
          </div>
        </div>
      </div>

      {/* Cancellation Requests Table */}
      <div className="bg-white rounded-3xl border border-[#E5DFC5] shadow-xs overflow-hidden">
        {isCancellationsLoading ? (
          <div className="p-12 text-center text-xs text-[#667266]">
            Loading cancellation requests...
          </div>
        ) : !cancellationData?.cancellationRequests?.length ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#F7F3EA] flex items-center justify-center mx-auto text-[#8A9A86]">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="font-serif text-xl font-bold text-[#1F271F]">
              No Cancellation Requests
            </h3>
            <p className="text-xs text-[#667266] max-w-sm mx-auto">
              {cancellationStatus === "pending"
                ? "Great news! There are no pending cancellation requests awaiting review."
                : "No requests match the selected filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] border-b border-[#E5DFC5] text-[11px] uppercase tracking-wider text-[#667266]">
                  <th className="py-3.5 px-6 font-bold">Request Date</th>
                  <th className="py-3.5 px-4 font-bold">Order ID & Bill</th>
                  <th className="py-3.5 px-4 font-bold">Customer</th>
                  <th className="py-3.5 px-4 font-bold max-w-xs">Reason Provided</th>
                  <th className="py-3.5 px-4 font-bold">Request Status</th>
                  <th className="py-3.5 px-4 font-bold">Refund Status</th>
                  <th className="py-3.5 px-6 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE1]">
                {cancellationData.cancellationRequests.map((req: any) => {
                  const orderRef = req.order;
                  const orderNum =
                    orderRef?.orderNumber ||
                    (orderRef?._id ? `BB-${String(orderRef._id).slice(-6).toUpperCase()}` : String(req.order || ""));
                  const grandTotal = orderRef?.grandTotal ?? req.refundAmount ?? 0;
                  const customerName = req.customer?.name || orderRef?.user?.name || "Customer";
                  const customerPhone = req.customer?.phone || orderRef?.user?.phone || "";

                  return (
                    <tr key={req.id || req._id} className="hover:bg-[#F9F7F1] transition-colors">
                      <td className="py-4 px-6 text-[#667266]">
                        <div>
                          {new Date(req.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {new Date(req.createdAt).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-mono font-bold text-[#354B35]">
                          {orderNum}
                        </div>
                        <div className="font-bold text-[#1F271F] text-[11px]">
                          ₹{grandTotal}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-semibold text-[#1F271F]">
                          {customerName}
                        </div>
                        {customerPhone && (
                          <div className="text-[11px] text-[#667266]">
                            {customerPhone}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4 max-w-xs">
                        <p className="text-xs text-[#1F271F] font-medium leading-relaxed">
                          &ldquo;{req.reason}&rdquo;
                        </p>
                        {req.rejectionReason && (
                          <p className="text-[11px] text-red-700 mt-1">
                            <strong>Rejection note:</strong> {req.rejectionReason}
                          </p>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            req.status === "APPROVED"
                              ? "bg-emerald-100 text-emerald-800"
                              : req.status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900 border border-amber-300"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            req.refundStatus === "SUCCESS"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : req.refundStatus === "FAILED"
                              ? "bg-rose-100 text-rose-800 font-extrabold border border-rose-300"
                              : req.refundStatus === "PROCESSING" ||
                                req.refundStatus === "INITIATED" ||
                                req.refundStatus === "PENDING"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-gray-100 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {req.refundStatus.replace(/_/g, " ")}
                        </span>
                        {req.refundAmount > 0 && req.refundStatus !== "NOT_REQUIRED" && (
                          <div className="text-[10px] text-[#667266] mt-0.5">
                            ₹{req.refundAmount}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-6 text-right space-x-2">
                        {req.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => {
                                setCancellationActionError(null);
                                setApproveModalItem(req);
                              }}
                              className="px-3 py-1.5 rounded-full bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setCancellationActionError(null);
                                setAdminRejectionReason("");
                                setRejectModalItem(req);
                              }}
                              className="px-3 py-1.5 rounded-full border border-red-300 text-red-700 font-semibold hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {req.refundStatus === "FAILED" && (
                          <button
                            onClick={() => handleRetryRefund(req.id || req._id)}
                            disabled={retryRefundMutation.isPending}
                            className="px-3 py-1.5 rounded-full bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Retry Refund
                          </button>
                        )}

                        {orderRef && (
                          <button
                            onClick={() => {
                              setSelectedOrderId(orderRef.orderNumber || orderRef._id || String(orderRef));
                              setActiveTab("orders");
                            }}
                            className="px-3 py-1.5 rounded-full bg-white border border-[#E5DFC5] text-[#354B35] font-semibold hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                          >
                            View Order
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Order Details Side Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSelectedOrderId(null)}
          />

          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 bg-[#1E2B1E] text-white flex items-center justify-between border-b border-[#2C3E2C]">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#B99A60]">
                  Order Inspection
                </span>
                <h3 className="font-serif text-2xl font-bold">
                  Order #{selectedOrder.id}
                </h3>
                <div className="text-xs text-[#8A9A86] mt-0.5">
                  Placed on {new Date(selectedOrder.createdAt).toLocaleString("en-IN")}
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-[#1F271F]">
              {/* Active Customer Cancellation Request Banner */}
              {selectedOrder.cancellationRequest?.status === "PENDING" && (
                <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-300 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Customer Cancellation Request Pending</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Reason: &ldquo;{selectedOrder.cancellationRequest.reason}&rdquo;
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        setActiveTab("cancellations");
                        setCancellationStatus("pending");
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 cursor-pointer"
                    >
                      Review in Cancellation Requests
                    </button>
                  </div>
                </div>
              )}

              {/* Status Transition Control Card */}
              <div className="p-4 bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-[#667266]">
                    Current Status:
                  </span>
                  <span className="font-bold text-sm text-[#354B35] capitalize">
                    {selectedOrder.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status !== "delivered" &&
                    selectedOrder.status !== "cancelled" && (
                      <>
                        <button
                          onClick={() => handleStatusChange(selectedOrder.id, "confirmed")}
                          className="px-3 py-1.5 rounded-xl bg-[#354B35] text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedOrder.id, "preparing")}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Preparing
                        </button>
                        <button
                          onClick={() =>
                            handleStatusChange(selectedOrder.id, "ready_for_dispatch")
                          }
                          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Ready to Dispatch
                        </button>
                        <button
                          onClick={() =>
                            handleStatusChange(selectedOrder.id, "picked_up")
                          }
                          className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Picked Up
                        </button>
                        <button
                          onClick={() => handleStatusChange(selectedOrder.id, "delivered")}
                          className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Mark Delivered
                        </button>
                        <button
                          onClick={() => setCancelModalOpen(true)}
                          className="px-3 py-1.5 rounded-xl border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 cursor-pointer ml-auto"
                        >
                          Cancel Order
                        </button>
                      </>
                    )}
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="p-4 bg-white rounded-2xl border border-[#E5DFC5] space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#667266]">
                  Customer & Delivery Location
                </h4>
                <div className="space-y-1">
                  <div className="font-bold text-sm text-[#1F271F]">
                    {selectedOrder.customerName}
                  </div>
                  <div className="flex items-center gap-2 text-[#667266]">
                    <Phone className="w-3.5 h-3.5 text-[#B99A60]" />
                    <span>{selectedOrder.customerPhone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#667266]">
                    <Mail className="w-3.5 h-3.5 text-[#B99A60]" />
                    <span>{selectedOrder.customerEmail}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#F0ECE1] space-y-1">
                  <div className="flex items-start gap-2 text-[#1F271F]">
                    <MapPin className="w-4 h-4 text-[#354B35] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {selectedOrder.deliveryAddress.houseNo},{" "}
                        {selectedOrder.deliveryAddress.street}
                      </p>
                      {selectedOrder.deliveryAddress.landmark && (
                        <p className="text-[11px] text-[#667266]">
                          Near {selectedOrder.deliveryAddress.landmark}
                        </p>
                      )}
                      <p className="text-[11px] text-[#667266]">
                        {selectedOrder.deliveryAddress.city},{" "}
                        {selectedOrder.deliveryAddress.state} -{" "}
                        {selectedOrder.deliveryAddress.pincode}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedOrder.deliveryNotes && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                    <strong>Special Instructions:</strong> {selectedOrder.deliveryNotes}
                  </div>
                )}
              </div>

              {/* Items Card */}
              <div className="p-4 bg-white rounded-2xl border border-[#E5DFC5] space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#667266]">
                  Meal Items in Bento Box
                </h4>
                <div className="divide-y divide-[#F0ECE1]">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.productImage}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                        <div>
                          <div className="font-bold text-[#1F271F]">
                            {item.quantity}x {item.productName}
                          </div>
                          <div className="text-[11px] text-[#667266]">
                            ₹{item.price} each
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-[#354B35]">
                        ₹{item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Details */}
              <div className="p-4 bg-[#F7F3EA] rounded-2xl border border-[#E5DFC5] space-y-2">
                <div className="flex justify-between text-[#667266]">
                  <span>Items Subtotal</span>
                  <span>₹{selectedOrder.subtotal}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount Voucher</span>
                    <span>- ₹{selectedOrder.discount}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#667266]">
                  <span>Delivery Fee</span>
                  <span>₹{selectedOrder.deliveryFee}</span>
                </div>
                <div className="flex justify-between text-[#667266]">
                  <span>GST (5%)</span>
                  <span>₹{selectedOrder.tax}</span>
                </div>
                <div className="pt-2 border-t border-[#E5DFC5] flex justify-between font-bold text-base text-[#1F271F]">
                  <span>Total Amount</span>
                  <span className="text-[#354B35]">₹{selectedOrder.total}</span>
                </div>
              </div>

              {/* Official PDF Receipt (Backblaze B2) Card */}
              <div className="p-4 bg-white rounded-2xl border border-[#E5DFC5] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#354B35]" />
                    <h4 className="font-bold text-xs uppercase tracking-wider text-[#667266]">
                      Official PDF Receipt (Backblaze B2)
                    </h4>
                  </div>
                  {/* Status Badge */}
                  {selectedOrder.receipt?.status === "STORED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Stored in B2
                    </span>
                  ) : selectedOrder.receipt?.status === "FAILED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      Storage Failed
                    </span>
                  ) : selectedOrder.receipt?.status === "GENERATING" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      Generating...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Pending Generation
                    </span>
                  )}
                </div>

                {/* Storage Metadata Details */}
                <div className="space-y-1 text-xs text-[#667266] bg-[#F7F3EA] p-3 rounded-xl border border-[#EAE4D6]">
                  {selectedOrder.receipt?.objectKey && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-[#1F271F]">Storage Key:</span>
                      <span className="font-mono truncate max-w-[200px]" title={selectedOrder.receipt.objectKey}>
                        {selectedOrder.receipt.objectKey}
                      </span>
                    </div>
                  )}
                  {selectedOrder.receipt?.fileSize && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-[#1F271F]">File Size:</span>
                      <span>{(selectedOrder.receipt.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                  {selectedOrder.receipt?.uploadedAt && (
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-[#1F271F]">Last Synced:</span>
                      <span>{new Date(selectedOrder.receipt.uploadedAt).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {selectedOrder.receipt?.lastError && (
                    <div className="mt-1 pt-1 border-t border-[#E0D8C8] text-rose-700 text-[10px]">
                      <strong>Storage Error:</strong> {selectedOrder.receipt.lastError}
                    </div>
                  )}
                </div>

                {receiptFeedback && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                    {receiptFeedback}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleAdminDownloadReceipt(selectedOrder)}
                    disabled={downloadingReceipt}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingReceipt ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{downloadingReceipt ? "Downloading..." : "Download Receipt"}</span>
                  </button>

                  <button
                    onClick={() => handleAdminRegenerateReceipt(selectedOrder)}
                    disabled={regeneratingReceipt}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#D5CDBE] bg-white text-[#1F271F] text-xs font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Force regeneration and re-upload to Backblaze B2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#B99A60] ${regeneratingReceipt ? "animate-spin" : ""}`} />
                    <span>{regeneratingReceipt ? "Regenerating..." : "Regenerate"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setCancelModalOpen(false)}
          />
          <div className="relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 border border-[#E5DFC5] shadow-2xl">
            <h3 className="font-serif text-xl font-bold text-red-900">
              Confirm Order Cancellation
            </h3>
            <p className="text-xs text-[#667266]">
              Please state the reason for rejecting or cancelling this order:
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Out of stock for fresh hormone-free chicken / Customer requested"
              className="w-full p-3 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-red-600"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 rounded-full border border-gray-300 text-xs font-semibold cursor-pointer"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelOrder}
                className="px-5 py-2 rounded-full bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Approve Cancellation Request Modal */}
      {approveModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setApproveModalItem(null)}
          />
          <div className="relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 border border-[#E5DFC5] shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Approve Cancellation Request</span>
            </div>

            <h3 className="font-serif text-xl font-bold text-[#1F271F]">
              Approve cancellation for Order #{approveModalItem.order?.orderNumber || approveModalItem.order?._id || approveModalItem.order}?
            </h3>

            <div className="p-3 bg-[#F7F3EA] rounded-xl text-xs space-y-1.5 text-[#1F271F]">
              <div><strong>Customer:</strong> {approveModalItem.customer?.name || "Customer"}</div>
              <div><strong>Reason:</strong> &ldquo;{approveModalItem.reason}&rdquo;</div>
              <div><strong>Order Total:</strong> ₹{approveModalItem.order?.grandTotal ?? approveModalItem.refundAmount ?? 0}</div>
            </div>

            {cancellationActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {cancellationActionError}
              </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
              {approveModalItem.refundAmount > 0 && approveModalItem.refundStatus !== "NOT_REQUIRED" ? (
                <span>
                  Approving will mark the order as <strong>CANCELLED</strong>, release inventory, and automatically trigger an online refund of <strong>₹{approveModalItem.refundAmount}</strong> via Razorpay.
                </span>
              ) : (
                <span>
                  Approving will mark the order as <strong>CANCELLED</strong> and release inventory. No refund is required (unpaid / Cash on Delivery).
                </span>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveModalItem(null)}
                className="px-4 py-2 rounded-full border border-gray-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveCancellation}
                disabled={approveMutation.isPending}
                className="px-5 py-2 rounded-full bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {approveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm & Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Reject Cancellation Request Modal */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setRejectModalItem(null)}
          />
          <div className="relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 border border-[#E5DFC5] shadow-2xl">
            <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Decline Cancellation Request</span>
            </div>

            <h3 className="font-serif text-xl font-bold text-[#1F271F]">
              Reject request for Order #{rejectModalItem.order?.orderNumber || rejectModalItem.order?._id || rejectModalItem.order}?
            </h3>

            <p className="text-xs text-[#667266]">
              Customer Reason: &ldquo;{rejectModalItem.reason}&rdquo;
            </p>

            {cancellationActionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {cancellationActionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#1F271F] mb-1">
                Reason for Declining <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                minLength={3}
                maxLength={500}
                value={adminRejectionReason}
                onChange={(e) => setAdminRejectionReason(e.target.value)}
                placeholder="e.g. Bento preparation has already completed and meals are freshly packed for dispatch..."
                className="w-full p-3 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#1F271F] focus:outline-none focus:border-red-600"
              />
              <div className="flex justify-between items-center text-[10px] text-[#667266] mt-1">
                <span>Minimum 3 characters required</span>
                <span className={adminRejectionReason.length > 500 ? "text-red-500 font-bold" : ""}>
                  {adminRejectionReason.length} / 500
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="px-4 py-2 rounded-full border border-gray-300 text-xs font-semibold cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleRejectCancellation}
                disabled={adminRejectionReason.trim().length < 3 || rejectMutation.isPending}
                className="px-5 py-2 rounded-full bg-red-700 text-white text-xs font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {rejectMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-center">Loading orders...</div>}>
      <OrdersContent />
    </Suspense>
  );
}
