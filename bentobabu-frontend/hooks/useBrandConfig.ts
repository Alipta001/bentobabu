"use client";

import { useQuery } from "@tanstack/react-query";
import { BrandConfig, brandConfig } from "@/config/brand";
import { brandService } from "@/services/brandService";

export const BRAND_QUERY_KEY = ["brand", "config"] as const;

/**
 * Custom hook to access dynamic brand, contact, operating hours, and social settings.
 * Seeded with brandConfig as initialData to prevent hydration mismatch and SSR layout shift.
 */
export function useBrandConfig(): BrandConfig {
  const { data } = useQuery({
    queryKey: BRAND_QUERY_KEY,
    queryFn: () => brandService.getBrandConfig(),
    initialData: brandConfig,
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return data || brandConfig;
}
