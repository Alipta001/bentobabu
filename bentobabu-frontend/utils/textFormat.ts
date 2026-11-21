/**
 * BentoBabu Frontend Text & HTML Formatting Utilities
 */

/**
 * Strips all HTML tags and unescapes standard entities for plain text previews (e.g., cards, search, meta tags).
 */
export function stripHtmlTags(str?: string | null): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether a given string contains HTML tags.
 */
export function isHtmlContent(str?: string | null): boolean {
  if (!str || typeof str !== "string") return false;
  return /<[a-z][\s\S]*>/i.test(str);
}

const ALLOWED_TAGS = new Set([
  "h2",
  "h3",
  "p",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "mark",
  "span",
  "ul",
  "ol",
  "li",
  "br",
]);

const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "base",
];

/**
 * Client-side defense-in-depth HTML sanitizer for product descriptions.
 */
export function sanitizeClientHtml(dirty?: string | null): string {
  if (!dirty || typeof dirty !== "string") return "";

  let clean = dirty.trim();
  if (!clean) return "";

  // Remove comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");

  // Strip dangerous tags and content
  for (const tag of DANGEROUS_TAGS) {
    const tagRegex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, "gi");
    clean = clean.replace(tagRegex, "");
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    clean = clean.replace(selfClosingRegex, "");
  }

  // Strip img tags
  clean = clean.replace(/<img\b[^>]*>/gi, "");

  // Sanitize allowed tags and attributes
  clean = clean.replace(/<(\/)?([a-zA-Z0-9]+)([^>]*)>/g, (match, isClosing, rawTagName, rawAttrs) => {
    const tagName = rawTagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      return "";
    }
    if (isClosing) {
      return `</${tagName}>`;
    }
    if (tagName === "br") {
      return "<br>";
    }

    let safeAttrs = "";
    if (rawAttrs && rawAttrs.trim()) {
      // Safe class
      const classMatch = rawAttrs.match(/\bclass=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (classMatch) {
        const rawClass = classMatch[1] || classMatch[2] || classMatch[3] || "";
        if (/^[a-zA-Z0-9_\-\s]+$/.test(rawClass)) {
          safeAttrs += ` class="${rawClass}"`;
        }
      }

      // Safe style
      const styleMatch = rawAttrs.match(/\bstyle=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (styleMatch) {
        const rawStyle = styleMatch[1] || styleMatch[2] || styleMatch[3] || "";
        if (!/(?:url|expression|javascript|@import|[<>\(\)"'])/i.test(rawStyle)) {
          safeAttrs += ` style="${rawStyle}"`;
        }
      }
    }

    return `<${tagName}${safeAttrs}>`;
  });

  return clean.trim();
}
