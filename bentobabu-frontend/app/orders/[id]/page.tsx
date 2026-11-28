"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  Bike,
  Home,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  FileText,
  MapPin,
  CreditCard,
  Phone,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { DownloadReceiptButton } from "@/components/order/DownloadReceiptButton";
import { useOrder, useCancelOrder, useRequestCancellation, useUserProfile } from "@/hooks/useQueries";
import { OrderStatus } from "@/types";
import { buildLoginUrl } from "@/lib/authRedirect";
import { isOrderEligibleForPurchaseTracking, trackPurchaseFromOrder } from "@/lib/analytics";

const TIMELINE_STAGES: Array<{
  key: OrderStatus;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "CONFIRMED",
    title: "Order Confirmed",
    desc: "Received by kitchen",
    icon: CheckCircle2,
  },
  {
    key: "PREPARING",
    title: "In Kitchen",
    desc: "Cooking fresh ingredients",
    icon: ChefHat,
  },
  {
    key: "READY_FOR_PICKUP",
    title: "Packed & Sealed",
    desc: "Awaiting pickup partner",
    icon: PackageCheck,
  },
  {
    key: "RIDER_ACCEPTED",
    title: "Rider Assigned",
    desc: "Heading to kitchen for pickup",
    icon: Bike,
  },
  {
    key: "PICKED_UP",
    title: "On the Way",
    desc: "Out for delivery to you",
    icon: Bike,
  },
  {
    key: "DELIVERED",
    title: "Delivered",
    desc: "Bon appétit!",
    icon: Home,
  },
];

const STAGE_ORDER: Record<string, number> = {
  PENDING: 0,
  pending: 0,
  CONFIRMED: 1,
  confirmed: 1,
  PREPARING: 2,
  preparing: 2,
  READY_FOR_PICKUP: 3,
  ready_for_pickup: 3,
  READY_FOR_DISPATCH: 3,
  ready_for_dispatch: 3,
  RIDER_ACCEPTED: 4,
  rider_accepted: 4,
  PICKED_UP: 5,
  picked_up: 5,
  OUT_FOR_DELIVERY: 5,
  out_for_delivery: 5,
  DELIVERED: 6,
  delivered: 6,
};

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = (params?.id as string) || "";

  const { data: user, isLoading: isUserLoading } = useUserProfile();
  const { data: order, isLoading, error, refetch, isFetching } = useOrder(orderId);
  const cancelOrderMutation = useCancelOrder();
  const requestCancellationMutation = useRequestCancellation();

  // Redirect guest user to login with returnTo preserving this specific order tracking page
  React.useEffect(() => {
    if (!isUserLoading && !user && typeof window !== "undefined") {
      const currentPath = window.location.pathname + window.location.search;
      router.replace(buildLoginUrl(currentPath));
    }
  }, [isUserLoading, user, router]);

  // Safe fallback purchase tracking for confirmed orders not yet tracked during checkout
  React.useEffect(() => {
    if (!user || !order) return;
    if (isOrderEligibleForPurchaseTracking(order)) {
      trackPurchaseFromOrder(order);
    }
  }, [user, order]);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [copiedOtp, setCopiedOtp] = useState(false);
  const [actionError, setActionError] = useState("");

  const handleCopyOtp = (otp: string) => {
    navigator.clipboard.writeText(otp);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (cancelReason.trim().length < 5) {
      setActionError("Please provide a reason with at least 5 characters.");
      return;
    }
    if (cancelReason.trim().length > 500) {
      setActionError("Cancellation reason cannot exceed 500 characters.");
      return;
    }
    setActionError("");

    try {
      await requestCancellationMutation.mutateAsync({
        id: order.id,
        reason: cancelReason.trim(),
      });
      setCancelModalOpen(false);
      setCancelReason("");
      refetch();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to submit cancellation request. Order may have already progressed to packing."
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#354B35]">
            <Loader2 className="w-8 h-8 animate-spin text-[#B99A60]" />
            <p className="text-xs font-semibold">Connecting to kitchen telemetry...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
        <Header />
        <main className="flex-1 py-16 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 border border-[#E5DFC5] text-center max-w-md space-y-4 shadow-xs">
            <AlertTriangle className="w-12 h-12 text-[#B99A60] mx-auto" />
            <h2 className="font-serif text-2xl font-bold text-[#222922]">
              Order Not Found
            </h2>
            <p className="text-xs text-[#6B776A] leading-relaxed">
              We couldn&apos;t locate order #{orderId}. It may belong to another account or the order ID is invalid.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/account"
                className="px-5 py-2.5 rounded-full bg-[#354B35] text-white text-xs font-semibold"
              >
                Go to My Orders
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const currentStageIndex = STAGE_ORDER[order.status] ?? 0;
  const isCancelled = order.status === "CANCELLED";
  const isExpired = order.status === "EXPIRED";
  const cancellationReq = order.cancellationRequest;
  const hasPendingRequest = cancellationReq?.status === "PENDING";
  const isRequestRejected = cancellationReq?.status === "REJECTED";
  const isRequestApproved = cancellationReq?.status === "APPROVED";

  // Eligibility: Allowed if stage < 3 (before PACKED / READY_FOR_PICKUP) and not cancelled or expired
  const canRequestCancellation =
    currentStageIndex < 3 &&
    !isCancelled &&
    !isExpired &&
    !hasPendingRequest;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Breadcrumb & Live Refresh */}
          <div className="flex items-center justify-between">
            <Link
              href="/account"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#354B35] hover:text-[#B99A60] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Account</span>
            </Link>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E5DFC5] text-xs font-medium text-[#354B35] hover:bg-[#F7F3EA] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[#B99A60]" : ""}`}
              />
              <span>{isFetching ? "Refreshing..." : "Live Status"}</span>
            </button>
          </div>

          {/* Top Status Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#F0ECE1]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#B99A60]">
                    Live Kitchen Tracking
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#222922]">
                  Order #{order.orderNumber || order.id}
                </h1>
                <p className="text-xs text-[#6B776A]">
                  Placed on{" "}
                  {new Date(order.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {/* Status Badge & Receipt link */}
              <div className="flex items-center gap-3">
                <span
                  className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    isCancelled
                      ? "bg-red-50 text-red-700 border-red-200"
                      : isExpired
                      ? "bg-gray-100 text-gray-700 border-gray-300"
                      : order.status === "DELIVERED"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-[#EBF0E9] text-[#354B35] border-[#8A9A86]/40"
                  }`}
                >
                  {order.status.replace(/_/g, " ")}
                </span>

                <DownloadReceiptButton
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  variant="pill"
                />
              </div>
            </div>

            {/* Cancelled / Expired Alert */}
            {isCancelled && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-3">
                <XCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">This order has been cancelled.</p>
                  {order.cancellationReason && (
                    <p className="text-red-700">Reason: {order.cancellationReason}</p>
                  )}
                  {order.paymentMethod?.toLowerCase() === "razorpay" || order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED" || order.paymentStatus === "REFUND_PENDING" ? (
                    <div className="pt-1 text-[11px] font-medium">
                      {cancellationReq?.refundStatus === "SUCCESS" || order.paymentStatus === "REFUNDED" ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Refund of ₹{cancellationReq?.refundAmount || order.grandTotal} processed successfully to your original payment method.
                        </span>
                      ) : cancellationReq?.refundStatus === "FAILED" || order.paymentStatus === "REFUND_FAILED" ? (
                        <span className="text-red-700 font-semibold">
                          Refund is flagged for admin resolution. If not credited within 24 hours, our support team will reach out.
                        </span>
                      ) : (
                        <span className="text-amber-800">
                          Automatic refund of ₹{cancellationReq?.refundAmount || order.grandTotal} has been initiated via Razorpay (typically reflects in 5-7 business days).
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-600 text-[11px]">
                      Payment was marked as Cash on Delivery. No refund is required.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pending Cancellation Review Banner */}
            {hasPendingRequest && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <Clock className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Cancellation Request Submitted — Awaiting Kitchen Review</p>
                  <p className="text-amber-800">
                    We received your cancellation request (Reason: &ldquo;{cancellationReq?.reason}&rdquo;). Our kitchen operations team is currently reviewing your order.
                  </p>
                </div>
              </div>
            )}

            {/* Rejected Cancellation Request Banner */}
            {isRequestRejected && !isCancelled && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Cancellation Request Declined by Kitchen</p>
                  <p className="text-red-800">
                    Your cancellation request could not be approved. Reason: &ldquo;{cancellationReq?.rejectionReason || "Meal preparation has already progressed"}&rdquo;. Your order remains active.
                  </p>
                </div>
              </div>
            )}

            {isExpired && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Payment window expired.</p>
                  <p className="text-amber-700">
                    This order was not completed before the payment time window closed. No funds were captured.
                  </p>
                </div>
              </div>
            )}

            {/* Live Progress Stepper */}
            {!isCancelled && !isExpired && (
              <div className="py-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 relative">
                  {TIMELINE_STAGES.map((stage, idx) => {
                    const stageNumber = idx + 1;
                    const isDone = currentStageIndex >= stageNumber;
                    const isCurrent = currentStageIndex === stageNumber;
                    const Icon = stage.icon;

                    return (
                      <div
                        key={stage.key}
                        className={`flex flex-col items-center text-center p-3 rounded-2xl border transition-all ${
                          isCurrent
                            ? "bg-[#354B35] text-white border-[#354B35] shadow-md scale-102"
                            : isDone
                            ? "bg-[#EBF0E9] text-[#354B35] border-[#8A9A86]/30"
                            : "bg-[#F7F3EA]/50 text-[#8A9A86] border-[#E5DFC5]"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                            isCurrent
                              ? "bg-white/20 text-white"
                              : isDone
                              ? "bg-[#354B35] text-white"
                              : "bg-[#E5DFC5] text-[#8A9A86]"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span
                          className={`text-xs font-bold leading-tight ${
                            isCurrent ? "text-white" : isDone ? "text-[#222922]" : "text-[#8A9A86]"
                          }`}
                        >
                          {stage.title}
                        </span>
                        <span
                          className={`text-[10px] mt-1 ${
                            isCurrent ? "text-white/80" : "text-[#8A9A86]"
                          }`}
                        >
                          {stage.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Secure Delivery OTP Box (Shown when PICKED_UP or OUT_FOR_DELIVERY) */}
            {(["PICKED_UP", "OUT_FOR_DELIVERY", "picked_up", "out_for_delivery"].includes(order.status)) && order.deliveryOtp && (
              <div className="p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    <span>Secure Delivery Verification OTP</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Share this 4-digit code with your delivery rider upon receiving your package to verify handover.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl font-extrabold tracking-widest text-[#354B35] bg-white px-5 py-2 rounded-xl border border-amber-300 shadow-xs">
                    {order.deliveryOtp}
                  </span>
                  <button
                    onClick={() => handleCopyOtp(order.deliveryOtp!)}
                    className="p-2.5 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                    title="Copy OTP"
                  >
                    {copiedOtp ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Cancel Action if permitted */}
            {canRequestCancellation && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => {
                    setActionError("");
                    setCancelModalOpen(true);
                  }}
                  className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                >
                  Need to cancel? Request cancellation
                </button>
              </div>
            )}

            {hasPendingRequest && (
              <div className="pt-2 flex justify-end">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-300">
                  <Clock className="w-3.5 h-3.5 animate-pulse text-amber-600" />
                  Cancellation Request Pending Review
                </span>
              </div>
            )}
          </div>

          {/* Details 2-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left Column: Items Snapshot */}
            <div className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-[#E5DFC5] shadow-xs space-y-4">
              <h2 className="font-serif font-bold text-lg text-[#222922] pb-3 border-b border-[#F0ECE1]">
                Items in This Bento
              </h2>

              <div className="divide-y divide-[#F0ECE1]">
                {order.items.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      {item.productImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="w-12 h-12 rounded-xl object-cover border border-[#E5DFC5]"
                        />
                      )}
                      <div>
                        <div className="font-bold text-[#222922]">
                          {item.quantity}x {item.productName}
                        </div>
                        {item.variantName && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 mt-0.5">
                            {item.variantName}
                          </span>
                        )}
                        <div className="text-[11px] text-[#6B776A]">
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

              {/* Price Breakdown */}
              <div className="pt-4 border-t border-[#F0ECE1] space-y-2 text-xs text-[#626F62]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-[#222922]">₹{order.subtotal}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Coupon Discount</span>
                    <span>- ₹{order.discount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Delivery Charge</span>
                  <span>{order.deliveryFee === 0 ? "FREE" : `₹${order.deliveryFee}`}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxes (5% GST)</span>
                  <span>₹{order.tax}</span>
                </div>
                <div className="pt-2 border-t border-[#F0ECE1] flex justify-between font-serif font-bold text-base text-[#354B35]">
                  <span>Total Amount</span>
                  <span>₹{order.total}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Delivery Details & Payment */}
            <div className="md:col-span-5 space-y-6">
              {/* Delivery Destination */}
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-3 text-xs">
                <h3 className="font-serif font-bold text-base text-[#222922] flex items-center gap-2 pb-2 border-b border-[#F0ECE1]">
                  <MapPin className="w-4 h-4 text-[#B99A60]" />
                  <span>Delivery Destination</span>
                </h3>

                <div className="space-y-1 text-[#626F62] leading-relaxed">
                  <p className="font-bold text-[#222922]">
                    {order.deliveryAddress?.name}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-[#354B35]">
                    <Phone className="w-3.5 h-3.5 text-[#B99A60]" />
                    <span>{order.deliveryAddress?.phone}</span>
                  </p>
                  <p className="pt-1">
                    {order.deliveryAddress?.houseNo}, {order.deliveryAddress?.street}
                  </p>
                  {order.deliveryAddress?.landmark && (
                    <p className="text-[11px]">Near {order.deliveryAddress.landmark}</p>
                  )}
                  <p>
                    {order.deliveryAddress?.city}, {order.deliveryAddress?.state} -{" "}
                    <strong>{order.deliveryAddress?.pincode}</strong>
                  </p>
                </div>

                {order.deliverySlot && (
                  <div className="mt-3 pt-3 border-t border-[#F0ECE1] flex items-center gap-2 text-[#354B35]">
                    <Clock className="w-4 h-4 text-[#B99A60]" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-[#8A9A86]">
                        Chosen Slot
                      </span>
                      <span className="font-medium text-xs">
                        {typeof order.deliverySlot === "object" && order.deliverySlot.startTime
                          ? `${order.deliverySlot.startTime} - ${order.deliverySlot.endTime}`
                          : "Scheduled Slot"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              <div className="bg-white rounded-3xl p-6 border border-[#E5DFC5] shadow-xs space-y-3 text-xs">
                <h3 className="font-serif font-bold text-base text-[#222922] flex items-center gap-2 pb-2 border-b border-[#F0ECE1]">
                  <CreditCard className="w-4 h-4 text-[#B99A60]" />
                  <span>Payment Information</span>
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#626F62]">Method:</span>
                    <span className="font-bold text-[#222922] uppercase">
                      {order.paymentMethod === "COD" || order.paymentMethod === "cod"
                        ? "Cash / UPI on Delivery"
                        : "Razorpay Online"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#626F62]">Payment Status:</span>
                    <span
                      className={`font-bold ${
                        order.paymentStatus === "PAID"
                          ? "text-emerald-700"
                          : order.paymentStatus === "REFUNDED"
                          ? "text-purple-700"
                          : "text-amber-700"
                      }`}
                    >
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cancel Order Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 border border-[#E5DFC5] shadow-2xl space-y-4">
            <h3 className="font-serif text-xl font-bold text-[#222922]">
              Request Cancellation
            </h3>
            <p className="text-xs text-[#6B776A] leading-relaxed">
              If your meal has not yet reached the packing stage, our kitchen team will review and approve your cancellation request. For online prepaid orders, a full refund will be automatically triggered via Razorpay upon approval.
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {actionError}
              </div>
            )}

            <form onSubmit={handleCancelOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#222922] mb-1">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  maxLength={500}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please state why you wish to cancel (e.g. Ordered by mistake, wrong delivery address)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
                />
                <div className="flex justify-between items-center text-[10px] text-[#6B776A] mt-1">
                  <span>Minimum 5 characters required</span>
                  <span className={cancelReason.length > 500 ? "text-red-500 font-bold" : ""}>
                    {cancelReason.length} / 500
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancelModalOpen(false);
                    setActionError("");
                  }}
                  className="px-5 py-2 rounded-full border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={cancelReason.trim().length < 5 || requestCancellationMutation.isPending}
                  className="px-5 py-2 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {requestCancellationMutation.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Send Cancellation Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}