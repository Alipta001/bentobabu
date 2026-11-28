"use client";

import { useEffect, useRef } from "react";
import { Product } from "@/types";
import { trackViewItemList } from "@/lib/analytics";
import { useAnalyticsConsent } from "./useAnalyticsConsent";

interface CategoryListTrackerProps {
  listId: string;
  listName: string;
  products: Product[];
}

export function CategoryListTracker({
  listId,
  listName,
  products,
}: CategoryListTrackerProps) {
  const consentGranted = useAnalyticsConsent();
  const lastTrackedKeyRef = useRef<string>("");

  useEffect(() => {
    if (!consentGranted || !Array.isArray(products) || products.length === 0) return;
    const key = `${listId}:${products.map((p) => p.id).join(",")}`;
    if (lastTrackedKeyRef.current === key) return;
    lastTrackedKeyRef.current = key;
    trackViewItemList(listId, listName, products);
  }, [consentGranted, listId, listName, products]);

  return null;
}
