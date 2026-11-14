"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  action?: {
    label: string;
    href: string;
  };
}

interface ToastContextType {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastMessage = { ...toast, id };
      setToasts((prev) => [...prev.slice(-3), newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast container floating at bottom right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-bottom-5 ${
              toast.type === "success"
                ? "bg-[#354B35] text-[#F7F3EA] border-[#4A654A]"
                : toast.type === "error"
                ? "bg-red-900 text-white border-red-700"
                : "bg-white text-[#222922] border-[#E5DFC5]"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-[#B99A60] shrink-0 mt-0.5" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-[#354B35] shrink-0 mt-0.5" />
            )}

            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
              {toast.message && (
                <p className="text-[11px] opacity-80 leading-relaxed">
                  {toast.message}
                </p>
              )}
              {toast.action && (
                <Link
                  href={toast.action.href}
                  className="inline-block text-[11px] font-bold text-[#B99A60] underline hover:text-white pt-1"
                >
                  {toast.action.label}
                </Link>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="opacity-70 hover:opacity-100 p-1 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

