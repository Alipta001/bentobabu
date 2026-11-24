"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useBrandConfig } from "@/hooks/useBrandConfig";

interface BrandContactCardProps {
  labelWidth?: string;
  showWebsite?: boolean;
  showPrivacyPolicy?: boolean;
}

export function BrandContactCard({
  labelWidth = "w-28",
  showWebsite = true,
  showPrivacyPolicy = false,
}: BrandContactCardProps) {
  const brand = useBrandConfig();

  return (
    <div className="p-5 rounded-xl bg-[#F7F3EA] border border-[#E5DFC5] space-y-3 text-xs sm:text-sm text-[#4A554A]">
      <div className="flex items-center gap-3">
        <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Business Name:</div>
        <div className="font-medium text-[#222922]">{brand.name}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Support Email:</div>
        <a
          href={`mailto:${brand.contact.email}`}
          className="text-[#354B35] font-semibold underline"
        >
          {brand.contact.email}
        </a>
      </div>
      <div className="flex items-center gap-3">
        <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Support Phone:</div>
        <a
          href={`tel:${brand.contact.phone.replace(/[^0-9+]/g, "")}`}
          className="text-[#354B35] font-medium"
        >
          {brand.contact.phone}
        </a>
      </div>
      <div className="flex items-start gap-3">
        <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Operating Address:</div>
        <div>{brand.contact.address}</div>
      </div>
      {showWebsite && (
        <div className="flex items-center gap-3">
          <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Official Website:</div>
          <a
            href={brand.websiteUrl || "https://bentobabu.com"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#354B35] font-semibold underline inline-flex items-center gap-1"
          >
            {brand.websiteUrl || "https://bentobabu.com"}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
      {showPrivacyPolicy && (
        <div className="flex items-center gap-3">
          <div className={`font-semibold text-[#222922] ${labelWidth} shrink-0`}>Privacy Policy:</div>
          <Link
            href="/google-privacy-policy"
            className="text-[#354B35] font-semibold underline inline-flex items-center gap-1"
          >
            https://bentobabu.com/google-privacy-policy
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function BrandSupportHelplineText() {
  const brand = useBrandConfig();
  return (
    <span className="font-semibold text-[#222922]">
      {brand.contact.phone} / {brand.contact.email}
    </span>
  );
}

export function BrandSupportEmailLink({ subject }: { subject?: string }) {
  const brand = useBrandConfig();
  const href = subject
    ? `mailto:${brand.contact.email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${brand.contact.email}`;

  return (
    <a href={href} className="text-[#354B35] font-semibold underline">
      {brand.contact.email}
    </a>
  );
}
