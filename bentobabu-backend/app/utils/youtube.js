/**
 * YouTube URL Parser, Validator and Asset Formatter for BentoBabu
 * Validates YouTube URLs, extracts 11-char video IDs, generates privacy-enhanced embed URLs,
 * and formats default high-quality thumbnails without requiring YouTube API keys.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/**
 * Validates a YouTube URL and extracts its 11-character video ID.
 * @param {string} rawUrl - The user-provided YouTube URL
 * @returns {{ isValid: boolean, videoId?: string, error?: string, cleanUrl?: string }}
 */
function parseAndValidateYouTubeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'YouTube URL must be a non-empty string.' };
  }

  const trimmed = rawUrl.trim();

  // Basic sanity check to avoid protocol-less or malformed strings
  let urlObj;
  try {
    urlObj = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.' };
  }

  // Enforce HTTP / HTTPS protocol only
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    return { isValid: false, error: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  // Validate hostname against trusted YouTube domain list
  const hostname = urlObj.hostname.toLowerCase();
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    return {
      isValid: false,
      error: `Invalid domain "${hostname}". Only official YouTube domains (youtube.com, youtu.be) are accepted.`,
    };
  }

  let extractedId = null;

  // Pattern 1: youtu.be/<id>
  if (hostname.includes('youtu.be')) {
    const pathnameParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathnameParts.length >= 1) {
      extractedId = pathnameParts[0];
    }
  }

  // Pattern 2: youtube.com/watch?v=<id>
  else if (urlObj.pathname === '/watch' || urlObj.pathname === '/watch/') {
    extractedId = urlObj.searchParams.get('v');
  }

  // Pattern 3: youtube.com/shorts/<id>
  else if (urlObj.pathname.startsWith('/shorts/')) {
    const parts = urlObj.pathname.split('/shorts/')[1]?.split('/').filter(Boolean);
    extractedId = parts?.[0];
  }

  // Pattern 4: youtube.com/embed/<id>
  else if (urlObj.pathname.startsWith('/embed/')) {
    const parts = urlObj.pathname.split('/embed/')[1]?.split('/').filter(Boolean);
    extractedId = parts?.[0];
  }

  // Pattern 5: youtube.com/v/<id>
  else if (urlObj.pathname.startsWith('/v/')) {
    const parts = urlObj.pathname.split('/v/')[1]?.split('/').filter(Boolean);
    extractedId = parts?.[0];
  }

  if (!extractedId) {
    return {
      isValid: false,
      error: 'Could not extract a YouTube video ID from the provided URL.',
    };
  }

  // Clean any trailing query parameters or fragments that might have leaked into extractedId
  extractedId = extractedId.split('?')[0].split('&')[0].split('#')[0];

  // Validate exact 11-character YouTube video ID format
  if (!YOUTUBE_ID_REGEX.test(extractedId)) {
    return {
      isValid: false,
      error: `Invalid YouTube video ID format "${extractedId}". Video IDs must be exactly 11 alphanumeric characters.`,
    };
  }

  return {
    isValid: true,
    videoId: extractedId,
    cleanUrl: `https://www.youtube.com/watch?v=${extractedId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${extractedId}`,
    defaultThumbnailUrl: `https://i.ytimg.com/vi/${extractedId}/hqdefault.jpg`,
    maxResThumbnailUrl: `https://i.ytimg.com/vi/${extractedId}/maxresdefault.jpg`,
  };
}

/**
 * Validates an optional custom thumbnail URL
 * @param {string} url - Custom thumbnail image URL
 * @returns {boolean}
 */
function isValidCustomThumbnailUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;

    // Allowed image host patterns
    const host = parsed.hostname.toLowerCase();
    const allowed = [
      'res.cloudinary.com',
      'media.bentobabu.com',
      'images.unsplash.com',
      'i.ytimg.com',
      'img.youtube.com',
    ];

    return allowed.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
}

module.exports = {
  YOUTUBE_ID_REGEX,
  parseAndValidateYouTubeUrl,
  isValidCustomThumbnailUrl,
};
