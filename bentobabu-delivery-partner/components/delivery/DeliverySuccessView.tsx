"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Sparkles, ArrowRight, Home, IndianRupee } from "lucide-react";
import { Order } from "@/types";

interface DeliverySuccessViewProps {
  order: Order;
  onReset?: () => void;
}

export function DeliverySuccessView({ order, onReset }: DeliverySuccessViewProps) {
  const earnedAmount = (order.deliveryCharge || 50) + 10;

  return (
    <div className="max-w-md mx-auto p-6 sm:p-8 bg-white rounded-3xl border border-[#EFECE6] shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-200">
      {/* Icon Badge */}
      <div className="relative w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
        <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
        <span className="absolute -top-1 -right-1 p-1.5 rounded-full bg-[#C86D51] text-white">
          <Sparkles className="w-4 h-4" />
        </span>
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#C86D51]">
          Delivery Successful
        </span>
        <h2 className="font-bold text-2xl text-[#241C1A]">
          Order #{order.orderNumber}
        </h2>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">
          Customer OTP verified. The order status has been updated to DELIVERED.
        </p>
      </div>

      {/* Earnings Credited Box */}
      <div className="bg-[#FBF9F6] rounded-2xl p-4 border border-[#EFECE6] space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Earnings Credited
        </span>
        <div className="text-3xl font-extrabold text-[#C86D51] flex items-center justify-center">
          <span>+₹{earnedAmount}</span>
        </div>
        <div className="text-[11px] text-gray-500 font-medium">
          Base fee (₹{order.deliveryCharge || 50}) + Incentive (₹10)
        </div>
      </div>

      {/* Order Summary Snapshot */}
      <div className="text-left text-xs space-y-2 border-t border-gray-100 pt-4">
        <div className="flex justify-between text-gray-600">
          <span>Customer:</span>
          <span className="font-bold text-[#241C1A]">
            {order.deliveryAddress?.fullName}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Payment:</span>
          <span className="font-bold text-[#241C1A]">
            {order.paymentMethod === "COD" ? "Cash on Delivery (Collected)" : "Prepaid Online"}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Completed At:</span>
          <span className="font-medium text-[#241C1A]">
            {new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div className="space-y-2 pt-2">
        <Link
          href="/"
          onClick={onReset}
          className="w-full py-3.5 rounded-2xl bg-[#241C1A] text-white font-bold text-xs hover:bg-[#382c29] transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Home className="w-4 h-4" />
          <span>Back to Home Dashboard</span>
        </Link>
        <Link
          href="/requests"
          className="w-full py-3 rounded-2xl border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Find Next Assignment</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
