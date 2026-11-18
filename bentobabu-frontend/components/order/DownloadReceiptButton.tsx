"use client";

import React, { useState } from "react";
import { FileText, Loader2, Download } from "lucide-react";
import { orderService } from "@/services/orderService";

interface DownloadReceiptButtonProps {
  orderId: string;
  orderNumber?: string;
  className?: string;
  variant?: "pill" | "outline" | "solid";
}

export function DownloadReceiptButton({
  orderId,
  orderNumber,
  className = "",
  variant = "pill",
}: DownloadReceiptButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDownloading) return;

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      const blob = await orderService.downloadReceipt(orderId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const displayRef = orderNumber || orderId;
      link.download = `BentoBabu-Receipt-${displayRef}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("[DownloadReceiptButton] Error:", err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Could not generate PDF receipt. Please try again.";
      setErrorMessage(msg);
      // Auto clear error message after 5 seconds
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsDownloading(false);
    }
  };

  let baseStyle =
    "inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 ";

  if (variant === "pill") {
    baseStyle +=
      "px-3.5 py-1.5 rounded-full border border-[#E5DFC5] text-[#354B35] bg-white hover:bg-[#F7F3EA] shadow-2xs";
  } else if (variant === "solid") {
    baseStyle +=
      "px-6 py-3 rounded-full bg-[#354B35] text-[#F7F3EA] hover:bg-[#253525] shadow-xs";
  } else {
    baseStyle +=
      "px-4 py-2 rounded-xl border border-[#D5CDBE] text-[#1E2B1E] hover:bg-gray-50";
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={`${baseStyle} ${className}`}
        title="Download Official PDF Receipt"
      >
        {isDownloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B99A60]" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-[#B99A60]" />
        )}
        <span>{isDownloading ? "Downloading Receipt..." : "Download Receipt"}</span>
      </button>

      {errorMessage && (
        <span className="text-[11px] text-rose-600 font-medium animate-in fade-in">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
