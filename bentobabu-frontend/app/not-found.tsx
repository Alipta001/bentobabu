import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <Header />

      <main className="flex-1 py-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 text-center space-y-6">
          <div className="w-20 h-20 rounded-3xl bg-[#354B35] text-[#B99A60] font-serif text-3xl font-bold flex items-center justify-center mx-auto shadow-md">
            404
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-bold text-[#222922]">
              Page Not Found
            </h1>
            <p className="text-xs text-[#6B776A] leading-relaxed">
              We couldn&apos;t locate the nutritional page or dish you were looking for.
              Let&apos;s get you back to the fresh kitchen.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#354B35] text-[#F7F3EA] text-xs font-bold shadow-md hover:bg-[#253525] transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-[#B99A60]" />
              <span>Return to Homepage</span>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
