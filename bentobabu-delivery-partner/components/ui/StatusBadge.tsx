import React from "react";
import { OrderStatus } from "@/types";

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  let label = status as string;
  let bgClasses = "bg-gray-100 text-gray-800 border-gray-200";

  switch (status) {
    case "READY_FOR_PICKUP":
      label = "Ready for Pickup";
      bgClasses = "bg-amber-50 text-amber-800 border-amber-200";
      break;
    case "OUT_FOR_DELIVERY":
      label = "Out for Delivery";
      bgClasses = "bg-blue-50 text-blue-800 border-blue-200 animate-pulse";
      break;
    case "DELIVERED":
      label = "Delivered";
      bgClasses = "bg-emerald-50 text-emerald-800 border-emerald-200";
      break;
    case "CONFIRMED":
      label = "Confirmed";
      bgClasses = "bg-sky-50 text-sky-800 border-sky-200";
      break;
    case "PREPARING":
      label = "Preparing in Kitchen";
      bgClasses = "bg-orange-50 text-orange-800 border-orange-200";
      break;
    case "CANCELLED":
      label = "Cancelled";
      bgClasses = "bg-red-50 text-red-800 border-red-200";
      break;
    case "PENDING":
      label = "Pending";
      bgClasses = "bg-zinc-50 text-zinc-700 border-zinc-200";
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide uppercase ${bgClasses} ${className}`}
    >
      {label}
    </span>
  );
}
