import React from "react";
import { DietaryType } from "@/types";

interface DietaryBadgeProps {
  type: DietaryType;
  showText?: boolean;
  className?: string;
}

export function DietaryBadge({
  type,
  showText = true,
  className = "",
}: DietaryBadgeProps) {
  if (type === "vegetarian") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 ${className}`}
        title="100% Vegetarian"
      >
        <span className="w-2.5 h-2.5 border border-emerald-600 flex items-center justify-center p-0.5 rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
        </span>
        {showText && <span>Veg</span>}
      </span>
    );
  }

  if (type === "non-vegetarian") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 ${className}`}
        title="Non-Vegetarian"
      >
        <span className="w-2.5 h-2.5 border border-amber-700 flex items-center justify-center p-0.5 rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-700"></span>
        </span>
        {showText && <span>Non-Veg</span>}
      </span>
    );
  }

  if (type === "vegan") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200 ${className}`}
        title="Plant-based 100% Vegan"
      >
        <span className="w-2 h-2 rounded-full bg-teal-600"></span>
        {showText && <span>Vegan</span>}
      </span>
    );
  }

  // Egg
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800 border border-yellow-200 ${className}`}
      title="Contains Egg"
    >
      <span className="w-2 h-2 rounded-full bg-yellow-600"></span>
      {showText && <span>Egg</span>}
    </span>
  );
}

