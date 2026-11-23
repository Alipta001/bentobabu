/**
 * BentoBabu Cloudinary & Media Delivery Helper
 * Provides fixed Cloudinary delivery presets (thumbnail: 320, card: 960, detail: 1600)
 * with limit-cropping (c_limit) to prevent transformation quota sprawl while eliminating
 * unnecessary lossy quality degradation (no q_auto re-encoding over pre-compressed WebP)
 * and avoiding multiple stacked transformations.
 */

/**
 * Checks whether an image URL is hosted on Cloudinary
 */
export function isCloudinaryUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  return url.includes("res.cloudinary.com");
}

/**
 * Strips any existing transformation segments from a Cloudinary delivery URL,
 * recovering the clean canonical asset URL.
 * Handles single or stacked transformations such as:
 * - /upload/c_limit,q_auto,w_640/...
 * - /upload/w_640,c_limit,q_auto/...
 * - /upload/w_1200,c_limit,q_auto/c_limit,q_auto,w_640/...
 */
export function cleanCloudinaryUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  if (!isCloudinaryUrl(url)) return url;

  const uploadIndex = url.indexOf("/upload/");
  if (uploadIndex === -1) return url;

  const prefix = url.substring(0, uploadIndex + 8); // includes "/upload/"
  const afterUpload = url.substring(uploadIndex + 8);

  const segments = afterUpload.split("/");
  const versionIdx = segments.findIndex((seg) => /^v\d+$/.test(seg));

  const cleanSegments = segments.filter((seg, idx) => {
    // If a version tag exists, any segment at or after the version tag is part of the asset path
    if (versionIdx !== -1 && idx >= versionIdx) return true;

    // Check if segment is a transformation:
    // 1. Multi-param transformation with comma (e.g. c_limit,w_640 or w_960,q_auto)
    if (seg.includes(",")) return false;

    // 2. Starts with a known Cloudinary transformation parameter prefix (w_, h_, c_, q_, f_, etc.)
    if (/^(?:[whcqfbeogrzu]|dpr|ar|co|fl|pg|cs|bo|so|eo|t)_[a-zA-Z0-9_:-]+$/i.test(seg)) {
      return false;
    }

    return true; // part of folder / public_id
  });

  return prefix + cleanSegments.join("/");
}

export type ImagePreset = "thumbnail" | "card" | "detail" | "original";

export const PRESET_WIDTHS: Record<Exclude<ImagePreset, "original">, number> = {
  thumbnail: 320, // 80px containers at up to 4x pixel density
  card: 960,      // Grid cards (1-col mobile 360-400px @ 2.5-3x DPR; desktop 300px @ 2.5x)
  detail: 1600,   // Hero view (50vw desktop @ 2.5x; 100vw mobile/tablet @ 2.5-3x)
};

/**
 * Injects a single, non-degrading fixed Cloudinary transformation preset.
 * - Strips any previously applied transformations to prevent transformation stacking or trapped small thumbnails.
 * - Uses c_limit so images are never artificially upscaled beyond their native resolution.
 * - Omits q_auto so the pre-compressed Sharp WebP (quality 84) is not subjected to an aggressive second lossy re-encoding.
 */
export function getOptimizedImageUrl(
  url?: string | null,
  preset: ImagePreset = "card"
): string {
  if (!url || typeof url !== "string") {
    return "/images/placeholder.png";
  }

  // Non-Cloudinary URLs returned as-is (with fallback to placeholder if empty)
  if (!isCloudinaryUrl(url)) {
    return url.trim() || "/images/placeholder.png";
  }

  const cleanUrl = cleanCloudinaryUrl(url);

  if (preset === "original") {
    return cleanUrl;
  }

  const width = PRESET_WIDTHS[preset] || PRESET_WIDTHS.card;
  return cleanUrl.replace("/upload/", `/upload/c_limit,w_${width}/`);
}
