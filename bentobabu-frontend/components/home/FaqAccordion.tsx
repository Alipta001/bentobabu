"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

interface FaqAccordionProps {
  faqs: FaqItem[];
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {faqs.map((faq, idx) => (
        <div
          key={idx}
          className="bg-white rounded-2xl border border-[#E5DFC5] overflow-hidden transition-all duration-200"
        >
          <button
            onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
            className="w-full px-6 py-4.5 text-left flex items-center justify-between gap-4 font-serif font-bold text-[#222922] hover:text-[#354B35] transition-colors cursor-pointer"
            aria-expanded={activeFaq === idx}
          >
            <span className="text-base">{faq.q}</span>
            <ChevronDown
              className={`w-5 h-5 text-[#8A9A86] shrink-0 transition-transform duration-200 ${
                activeFaq === idx ? "rotate-180 text-[#354B35]" : ""
              }`}
            />
          </button>
          {activeFaq === idx && (
            <div className="px-6 pb-5 pt-1 text-xs text-[#4F5B4F] leading-relaxed border-t border-[#F0ECE1]">
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

