"use client";

import React, { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { isHtmlContent, sanitizeClientHtml } from "@/utils/textFormat";

interface ProductDescriptionProps {
  content?: string | null;
  className?: string;
  showSectionHeader?: boolean;
}

export function ProductDescription({
  content,
  className = "",
  showSectionHeader = false,
}: ProductDescriptionProps) {
  const rawText = content || "";

  const isHtml = useMemo(() => isHtmlContent(rawText), [rawText]);

  const sanitizedHtml = useMemo(() => {
    if (!isHtml) return "";
    return sanitizeClientHtml(rawText);
  }, [rawText, isHtml]);

  if (!rawText.trim()) {
    return (
      <p className="text-xs sm:text-sm text-[#8A9A86] italic">
        Chef&apos;s description coming soon. Freshly prepared daily with wholesome ingredients.
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {showSectionHeader && (
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#354B35]">
          <Sparkles className="w-3.5 h-3.5 text-[#B99A60]" />
          <span>About This Dish</span>
        </div>
      )}

      {isHtml ? (
        <div
          className="bento-product-description text-xs sm:text-sm text-[#4A584A] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : (
        <div className="space-y-2 text-xs sm:text-sm text-[#4A584A] leading-relaxed">
          {rawText.split(/\n\n|\n/).map((paragraph, index) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return null;
            return <p key={index}>{trimmed}</p>;
          })}
        </div>
      )}

      <style jsx global>{`
        .bento-product-description h2 {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: #354B35;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #F0ECE1;
          letter-spacing: -0.01em;
        }
        .bento-product-description h2:first-child {
          margin-top: 0;
        }
        .bento-product-description h3 {
          font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
          font-size: 1rem;
          font-weight: 700;
          color: #222922;
          margin-top: 0.85rem;
          margin-bottom: 0.35rem;
        }
        .bento-product-description h3:first-child {
          margin-top: 0;
        }
        .bento-product-description p {
          margin-bottom: 0.65rem;
          line-height: 1.6;
          color: #4A584A;
        }
        .bento-product-description p:last-child {
          margin-bottom: 0;
        }
        .bento-product-description ul {
          margin-top: 0.5rem;
          margin-bottom: 0.75rem;
          padding-left: 0.25rem;
          list-style: none;
        }
        .bento-product-description ul > li {
          position: relative;
          padding-left: 1.35rem;
          margin-bottom: 0.35rem;
          line-height: 1.55;
          color: #4A584A;
        }
        .bento-product-description ul > li::before {
          content: "";
          position: absolute;
          left: 0.25rem;
          top: 0.55rem;
          width: 0.35rem;
          height: 0.35rem;
          border-radius: 9999px;
          background-color: #B99A60;
        }
        .bento-product-description ol {
          margin-top: 0.5rem;
          margin-bottom: 0.75rem;
          padding-left: 1.25rem;
          list-style-type: decimal;
        }
        .bento-product-description ol > li {
          margin-bottom: 0.35rem;
          line-height: 1.55;
          color: #4A584A;
        }
        .bento-product-description strong,
        .bento-product-description b {
          font-weight: 700;
          color: #222922;
        }
        .bento-product-description em,
        .bento-product-description i {
          font-style: italic;
          color: #354B35;
        }
        .bento-product-description u {
          text-decoration: underline;
          text-decoration-color: #B99A60;
          text-decoration-thickness: 2px;
          text-underline-offset: 3px;
        }
        .bento-product-description mark,
        .bento-product-description mark.bento-highlight-gold,
        .bento-product-description .bento-highlight-gold {
          background-color: #FAF4E6;
          color: #7A612A;
          border: 1px solid #EADBBD;
          padding: 0.1rem 0.35rem;
          border-radius: 0.35rem;
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .bento-product-description mark.bento-highlight-green,
        .bento-product-description .bento-highlight-green {
          background-color: #EAF1EA;
          color: #253525;
          border: 1px solid #C5D8C5;
          padding: 0.1rem 0.35rem;
          border-radius: 0.35rem;
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .bento-product-description mark.bento-highlight-amber,
        .bento-product-description .bento-highlight-amber {
          background-color: #FEF3C7;
          color: #92400E;
          border: 1px solid #FDE68A;
          padding: 0.1rem 0.35rem;
          border-radius: 0.35rem;
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
      `}</style>
    </div>
  );
}
