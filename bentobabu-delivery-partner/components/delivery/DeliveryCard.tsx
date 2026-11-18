"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Phone,
  Navigation,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  IndianRupee,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Order } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CENTRAL_KITCHEN_DETAILS } from "@/lib/api/delivery.api";
import { useAcceptAndPickupOrder, useDeliveryConfig } from "@/hooks/useDeliveryQueries";
import { toast } from "sonner";

interface DeliveryCardProps {
  order: Order;
  variant?: "REQUEST" | "ACTIVE" | "COMPLETED";
  onVerifyOtpClick?: (order: Order) => void;
}

export function DeliveryCard({
  order,
  variant = "REQUEST",
  onVerifyOtpClick,
}: DeliveryCardProps) {
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const acceptMutation = useAcceptAndPickupOrder();
  const { data: deliveryConfig } = useDeliveryConfig();

  const otpRequired = deliveryConfig?.otpRequired !== false;

  const orderId = order.id || order._id;
  const isCod = order.paymentMethod === "COD";
  const itemsCount = order.items?.reduce((acc, i) => acc + i.quantity, 0) || 0;

  // Earnings estimation for delivery agent
  const estimatedEarnings = (order.deliveryCharge || 50) + 10;

  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync({ id: orderId });
      toast.success(`Order #${order.orderNumber} accepted! Assigned to you.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to accept order.");
    }
  };

  const handleOpenCustomerMaps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const addr = order.deliveryAddress;
    const query = encodeURIComponent(
      `${addr.addressLine}, ${addr.landmark ? addr.landmark + ", " : ""}${addr.city} ${addr.pincode}`
    );
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, "_blank");
  };

  const handleOpenKitchenMaps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const kitchen = deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS;
    if (kitchen.googleMapsDirectionsUrl) {
      window.open(kitchen.googleMapsDirectionsUrl, "_blank");
    } else {
      const dest = `${kitchen.latitude},${kitchen.longitude}`;
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, "_blank");
    }
  };

  return (
    <>
      <article className="bg-white rounded-3xl p-5 border border-[#EFECE6] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-4">
        {/* Header: Order ID & Status */}
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-[#241C1A]">
              #{order.orderNumber}
            </span>
            <span className="text-[11px] text-gray-500 font-medium">
              • {itemsCount} {itemsCount === 1 ? "item" : "items"}
            </span>
          </div>
          <StatusBadge status={order.orderStatus} />
        </div>

        {/* Addresses Section */}
        <div className="space-y-3 text-xs">
          {/* Pickup: Kitchen */}
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
              P
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[#241C1A] flex items-center justify-between">
                <span>{(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).name}</span>
                {variant === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={handleOpenKitchenMaps}
                    className="text-[#C86D51] font-semibold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>Route</span>
                  </button>
                )}
              </div>
              <p className="text-gray-500 text-[11px] truncate">
                {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).landmark ? `${(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).landmark} • ` : ""}
                {(deliveryConfig?.centralKitchen || CENTRAL_KITCHEN_DETAILS).address}
              </p>
            </div>
          </div>

          {/* Delivery: Customer */}
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
              D
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[#241C1A] flex items-center justify-between">
                <span>{order.deliveryAddress?.fullName || "Customer"}</span>
                <span className="font-mono text-[11px] text-gray-500">
                  PIN: {order.deliveryAddress?.pincode}
                </span>
              </div>
              <p className="text-gray-600 text-[11px] line-clamp-1">
                {order.deliveryAddress?.addressLine}
                {order.deliveryAddress?.landmark ? `, Near ${order.deliveryAddress.landmark}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Items Summary & Payment Info */}
        <div className="bg-[#FBF9F6] rounded-2xl p-3 flex items-center justify-between text-xs">
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
              Payment & Total
            </div>
            <div className="font-bold text-[#241C1A] flex items-center gap-1.5 mt-0.5">
              <span>₹{order.grandTotal}</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${
                  isCod ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isCod ? "Cash on Delivery" : "Paid Online"}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
              Your Earnings
            </div>
            <div className="font-extrabold text-[#C86D51] text-sm mt-0.5">
              +₹{estimatedEarnings}
            </div>
          </div>
        </div>

        {/* Action Buttons based on variant */}
        <div className="pt-2 border-t border-gray-100">
          {variant === "REQUEST" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(true)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-bold text-xs hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={acceptMutation.isPending}
                onClick={handleAccept}
                className="flex-2 py-3 rounded-2xl bg-[#C86D51] text-white font-bold text-xs hover:bg-[#B35D42] transition-colors shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {acceptMutation.isPending ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Accept & Pickup</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {variant === "ACTIVE" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`tel:${order.deliveryAddress?.phone}`}
                  className="py-2.5 rounded-2xl border border-[#C86D51]/30 text-[#C86D51] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#C86D51]/5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call Customer</span>
                </a>
                <button
                  type="button"
                  onClick={handleOpenCustomerMaps}
                  className="py-2.5 rounded-2xl border border-gray-300 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Maps Route</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/orders/${orderId}`}
                  className="flex-1 py-3 rounded-2xl border border-gray-300 text-gray-700 font-bold text-xs text-center hover:bg-gray-50 transition-colors"
                >
                  View Details
                </Link>
                <button
                  type="button"
                  onClick={() => onVerifyOtpClick?.(order)}
                  className="flex-2 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{otpRequired ? "Deliver & Verify OTP" : "Complete Delivery"}</span>
                </button>
              </div>
            </div>
          )}

          {variant === "COMPLETED" && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Successfully Delivered</span>
              </span>
              <Link
                href={`/orders/${orderId}`}
                className="text-xs font-bold text-[#C86D51] hover:underline"
              >
                View Summary →
              </Link>
            </div>
          )}
        </div>
      </article>

      {/* Reject Confirmation Dialog */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-gray-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-[#241C1A]">
                Decline Delivery Assignment?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Declining this order will return it to the central dispatch queue for another delivery partner.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="py-2.5 rounded-2xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectModalOpen(false);
                  toast.info("Order declined. It has been returned to the queue.");
                }}
                className="py-2.5 rounded-2xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
