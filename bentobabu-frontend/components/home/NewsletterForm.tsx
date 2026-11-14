"use client";

import React, { useState } from "react";
import { Send } from "lucide-react";

export function NewsletterForm() {
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubmitted, setNewsletterSubmitted] = useState(false);

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setNewsletterSubmitted(true);
      setNewsletterEmail("");
    }
  };

  if (newsletterSubmitted) {
    return (
      <div className="p-4 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm font-medium">
        Thank you for subscribing! Your ₹50 welcome discount code is <strong>HEALTHY50</strong>.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleNewsletterSubmit}
      className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto pt-2"
    >
      <input
        type="email"
        required
        aria-label="Email address for newsletter"
        placeholder="Enter your email address..."
        value={newsletterEmail}
        onChange={(e) => setNewsletterEmail(e.target.value)}
        className="flex-1 px-4 py-3 rounded-full bg-white border border-[#E5DFC5] text-xs text-[#222922] focus:outline-none focus:border-[#354B35]"
      />
      <button
        type="submit"
        className="px-6 py-3 rounded-full bg-[#354B35] text-white text-xs font-semibold hover:bg-[#253525] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
      >
        <span>Subscribe</span>
        <Send className="w-3.5 h-3.5 text-[#DFC89B]" />
      </button>
    </form>
  );
}

