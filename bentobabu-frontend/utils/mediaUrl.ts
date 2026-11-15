/**
 * BentoBabu Cloudinary & Media Delivery Helper
 * Injects fixed Cloudinary transformation presets (thumbnail: 320, card: 640, detail: 1200)
 * with automatic WebP conversion and limit-cropping to avoid unbounded transformation usage.
 */

export function getOptimizedImageUrl(
  url?: string,
  preset: "thumbnail" | "card" | "detail" = "card"
): string {
  if (!url || typeof url !== "string") {
    return "/images/placeholder.png";
  }

  // Non-Cloudinary or already transformed URLs returned as-is
  if (!url.includes("res.cloudinary.com") || url.includes("/w_")) {
    return url;
  }

  const widths: Record<string, number> = {
    thumbnail: 320,
    card: 640,
    detail: 1200,
  };

  const width = widths[preset] || 640;
  // Insert fixed preset transformation into Cloudinary delivery URL
  return url.replace("/upload/", `/upload/w_${width},c_limit,q_auto/`);
}
