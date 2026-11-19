"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Navigation,
  Phone,
  Package,
  ShieldCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { DeliveryWorkflowStepper } from "@/components/delivery/DeliveryWorkflowStepper";
import { OtpVerificationModal } from "@/components/delivery/OtpVerificationModal";
import { DeliverySuccessView } from "@/components/delivery/DeliverySuccessView";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DetailSkeleton } from "@/components/ui/LoadingSkeleton";
import { CENTRAL_KITCHEN_DETAILS } from "@/lib/api/delivery.api";
import {
  useOrderDetails,
  useAcceptOrder,
  useConfirmPickup,
  useDeliveryConfig,
} from "@/hooks/useDeliveryQueries";
import { Order } from "@/types";
import { toast } from "sonner";

export default function OrderExecutionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id || "";

  const { data: order, isLoading, error, refetch } = useOrderDetails(id);
  const acceptMutation = useAcceptOrder();
  const pickupMutation = useConfirmPickup();
  const { data: deliveryConfig } = useDeliveryConfig();
  const otpRequired = deliveryConfig?.otpRequired !== false;

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  if (isLoading) {
    return (
      <AppShell>
        <DetailSkeleton />
      </AppShell>
    );
  }

  if (error || !order) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="font-bold text-lg text-[#241C1A]">
            Order Not Found or Access Denied
          </h2>
          <p className="text-xs text-gray-500">
            This order could not be retrieved. It may be assigned to another agent or cancelled.
          </p>
          <Link
            href="/requests"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#C86D51] text-white text-xs font-bold"
          >
            Back to Requests
          </Link>
        </div>
      </AppShell>
    );
  }

  const isCod = order.paymentMethod === "COD";
  const customerAddr = order.deliveryAddress;
  const isReady = order.orderStatus === "READY_FOR_PICKUP" || order.orderStatus === "READY_FOR_DISPATCH";
  const isAccepted = order.orderStatus === "RIDER_ACCEPTED";
  const isOut = order.orderStatus === "PICKED_UP" || order.orderStatus === "OUT_FOR_DELIVERY";
  const isDelivered = order.orderStatus === "DELIVERED";

  const handleAcceptRequest = async () => {
    try {
      await acceptMutation.mutateAsync({
        id: order.id || order._id,
        note: "Delivery partner accepted delivery request",
      });
      toast.success("Order accepted! Please head to the kitchen for pickup.");
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to accept order.");
    }
  };

  const handleConfirmPickup = async () => {
    try {
      await pickupMutation.mutateAsync({
        id: order.id || order._id,
        note: "Order confirmed pickup by delivery partner",
      });
      toast.success("Pickup confirmed! Order is now out for delivery.");
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to confirm pickup.");
    }
  };

  const handleOpenKitchenRoute = () => {
    const kitchen = deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS;
    if (kitchen.googleMapsDirectionsUrl) {
      window.open(kitchen.googleMapsDirectionsUrl, "_blank");
    } else {
      const dest = `${kitchen.latitude},${kitchen.longitude}`;
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, "_blank");
    }
  };

  const handleOpenCustomerRoute = () => {
    const q = encodeURIComponent(
      `${customerAddr.addressLine}, ${customerAddr.landmark ? customerAddr.landmark + ", " : ""}${customerAddr.city} ${customerAddr.pincode}`
    );
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, "_blank");
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Celebration view on delivery success */}
        {completedOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <DeliverySuccessView
              order={completedOrder}
              onReset={() => {
                setCompletedOrder(null);
                router.push("/");
              }}
            />
          </div>
        )}

        {/* Back Link & Order Title */}
        <div className="flex items-center justify-between">
          <Link
            href="/active"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-[#C86D51] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Active List</span>
          </Link>
          <StatusBadge status={order.orderStatus} />
        </div>

        {/* Stepper Progress */}
        <DeliveryWorkflowStepper status={order.orderStatus} />

        {/* STEP 2: Kitchen Pickup Info */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#EFECE6] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h2 className="font-bold text-sm text-[#241C1A]">
                Pickup: Central Kitchen
              </h2>
            </div>

            <button
              type="button"
              onClick={handleOpenKitchenRoute}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#C86D51] hover:underline cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Navigate</span>
            </button>
          </div>

          <div className="space-y-1 text-xs text-gray-600">
            <div className="font-bold text-[#241C1A] text-sm">
              {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).name}
            </div>
            {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).landmark && (
              <div className="text-amber-800 font-medium text-[11px]">
                Landmark: {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).landmark}
              </div>
            )}
            <p>
              {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).address} - {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).pincode}
            </p>
            {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).phone && (
              <p className="text-gray-500">
                Kitchen Helpline: {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).phone}
              </p>
            )}
          </div>

          {/* Accept Request Action if READY_FOR_PICKUP */}
          {isReady && (
            <div className="pt-2">
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={handleAcceptRequest}
                className="w-full py-3.5 rounded-2xl bg-[#C86D51] text-white text-xs sm:text-sm font-bold hover:bg-[#B35D42] transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {acceptMutation.isPending ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    <span>Accept Delivery Request</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Confirm Pickup Action if RIDER_ACCEPTED */}
          {isAccepted && (
            <div className="pt-2">
              <button
                type="button"
                disabled={pickupMutation.isPending}
                onClick={handleConfirmPickup}
                className="w-full py-3.5 rounded-2xl bg-[#C86D51] text-white text-xs sm:text-sm font-bold hover:bg-[#B35D42] transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {pickupMutation.isPending ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    <span>Confirm Order Pickup & Start Delivery</span>
                  </>
                )}
              </button>
            </div>
          )}

          {isOut && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Package confirmed picked up from kitchen. In transit to customer.</span>
            </div>
          )}
        </div>

        {/* STEP 3: Customer Delivery Details */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#EFECE6] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                2
              </span>
              <h2 className="font-bold text-sm text-[#241C1A]">
                Customer Destination
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`tel:${customerAddr?.phone}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Call</span>
              </a>
              <button
                type="button"
                onClick={handleOpenCustomerRoute}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] transition-colors shadow-xs cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Maps Route</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                Customer Name & Phone
              </div>
              <div className="font-bold text-sm text-[#241C1A]">
                {customerAddr?.fullName} • {customerAddr?.phone}
              </div>
            </div>

            <div>
              <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                Full Delivery Address
              </div>
              <p className="text-gray-700 leading-relaxed font-medium">
                {customerAddr?.addressLine}
                {customerAddr?.landmark ? `, Landmark: ${customerAddr.landmark}` : ""}
                <br />
                {customerAddr?.city}, {customerAddr?.state} - {customerAddr?.pincode}
              </p>
            </div>
          </div>

          {/* Payment Collection Warning if COD */}
          {isCod && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
              <div>
                <span className="font-bold block">Cash on Delivery Order</span>
                <span className="text-[11px] text-amber-700">
                  Collect cash from customer before entering OTP.
                </span>
              </div>
              <div className="text-base font-extrabold font-mono text-amber-950">
                ₹{order.grandTotal}
              </div>
            </div>
          )}

          {/* STEP 4 & 5: Complete Delivery Button (Only when OUT_FOR_DELIVERY) */}
          {isOut && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setOtpModalOpen(true)}
                className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5" />
                <span>
                  {otpRequired
                    ? "Ask Customer for OTP & Complete Delivery"
                    : "Complete Order Delivery"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Items Snapshot Card */}
        <div className="bg-white rounded-3xl p-5 border border-[#EFECE6] shadow-sm space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">
            Packed Meal Contents ({order.items?.length || 0})
          </div>
          <div className="divide-y divide-gray-100">
            {order.items?.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-[#FBF9F6] border border-gray-200 text-[10px] font-bold flex items-center justify-center">
                    {item.quantity}x
                  </span>
                  <span className="font-bold text-[#241C1A]">
                    {item.productName}
                  </span>
                </div>
                <span className="font-mono text-gray-600">
                  ₹{item.subtotal}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        order={order}
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        onSuccess={(delivered) => {
          setOtpModalOpen(false);
          setCompletedOrder(delivered);
        }}
      />
    </AppShell>
  );
}
