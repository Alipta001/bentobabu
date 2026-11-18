"use client";

import React, { useState } from "react";
import { X, ShieldCheck, AlertCircle, CheckCircle, Lock } from "lucide-react";
import { Order } from "@/types";
import { OtpInput } from "./OtpInput";
import { useVerifyDeliveryOtp, useDeliveryConfig } from "@/hooks/useDeliveryQueries";
import { deliveryApi } from "@/lib/api/delivery.api";
import { toast } from "sonner";

interface OtpVerificationModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (deliveredOrder: Order) => void;
}

export function OtpVerificationModal({
  order,
  isOpen,
  onClose,
  onSuccess,
}: OtpVerificationModalProps) {
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const verifyMutation = useVerifyDeliveryOtp();
  const { data: config } = useDeliveryConfig();

  if (!isOpen || !order) return null;

  // Defaults to true if config is loading or unset
  const otpRequired = config?.otpRequired !== false;

  const orderId = order.id || order._id;
  const isCod = order.paymentMethod === "COD";

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (verifyMutation.isPending) return;

    if (otpRequired && otp.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit delivery OTP.");
      return;
    }

    setErrorMsg(null);

    try {
      const delivered = await verifyMutation.mutateAsync({
        id: orderId,
        ...(otpRequired ? { otp: otp.trim() } : {}),
        note: otpRequired
          ? "Delivery verified via partner app with customer OTP"
          : "Delivery completed by partner upon doorstep handover",
      });

      if (isCod) {
        try {
          await deliveryApi.collectCash(
            orderId,
            otpRequired
              ? "Cash collected by partner upon OTP delivery"
              : "Cash collected by partner upon delivery handover"
          );
        } catch (cashErr: any) {
          console.warn("[CashCollection] Note:", cashErr?.response?.data?.message || cashErr?.message);
        }
      }

      toast.success(
        otpRequired
          ? "Delivery verified and completed successfully!"
          : "Delivery completed successfully!"
      );
      setOtp("");
      onSuccess(delivered);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        (otpRequired
          ? "Invalid OTP. Please check with the customer and try again."
          : "Failed to complete delivery. Please try again.");
      setErrorMsg(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-100 animate-in slide-in-from-bottom-6 duration-300">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#241C1A]">
                {otpRequired ? "Customer Delivery Verification" : "Complete Order Delivery"}
              </h2>
              <div className="text-xs text-gray-500">
                Order #{order.orderNumber}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={verifyMutation.isPending}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification Message */}
        <div className="bg-[#FBF9F6] rounded-2xl p-4 border border-[#EFECE6] space-y-2">
          {otpRequired ? (
            <>
              <p className="text-xs font-semibold text-[#241C1A] leading-relaxed">
                Ask the customer for their <span className="text-[#C86D51] font-bold">6-digit delivery OTP</span> sent to their phone or app.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span>Never share or complete delivery without customer OTP confirmation.</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-[#241C1A] leading-relaxed">
                Customer OTP verification is <span className="text-emerald-700 font-bold">disabled</span> for this environment. Ensure the package is handed over to the customer before confirming.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Package delivery can be confirmed directly by the assigned delivery partner.</span>
              </div>
            </>
          )}
        </div>

        {/* Cash Collection Alert if COD */}
        {isCod && (
          <div className="bg-amber-50 rounded-2xl p-3.5 border border-amber-200 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="font-bold text-amber-900 block">
                Cash on Delivery (COD) Order
              </span>
              <span className="text-amber-700 text-[11px]">
                {otpRequired
                  ? "Collect physical cash before entering OTP."
                  : "Collect physical cash before confirming delivery."}
              </span>
            </div>
            <div className="text-base font-extrabold text-amber-950 font-mono">
              ₹{order.grandTotal}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleVerify} className="space-y-5">
          {otpRequired && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block text-center uppercase tracking-wider">
                Enter 6-Digit Code
              </label>
              <OtpInput
                length={6}
                value={otp}
                onChange={(val) => {
                  setOtp(val);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={verifyMutation.isPending}
              />
            </div>
          )}

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={verifyMutation.isPending}
              onClick={onClose}
              className="py-3 rounded-2xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifyMutation.isPending || (otpRequired && otp.length !== 6)}
              className="py-3.5 rounded-2xl bg-[#C86D51] text-white text-xs font-bold hover:bg-[#B35D42] disabled:opacity-50 shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {verifyMutation.isPending ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{otpRequired ? "Verifying..." : "Completing..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Delivery</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
