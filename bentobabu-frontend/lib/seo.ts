/**
 * Resolves the canonical production site URL (`https://www.bentobabu.com`).
 * Normalizes apex `bentobabu.com` values to `www.bentobabu.com` so sitemaps,
 * robots.txt, and canonical tags never emit redirecting apex URLs.
 */
export function getCanonicalSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.bentobabu.com")
    .trim()
    .replace(/\/+$/, "");

  if (raw === "https://bentobabu.com" || raw === "http://bentobabu.com") {
    return "https://www.bentobabu.com";
  }

  return raw;
}

export const SITE_URL = getCanonicalSiteUrl();
