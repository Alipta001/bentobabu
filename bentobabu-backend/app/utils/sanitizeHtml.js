/**
 * BentoBabu Production HTML Sanitizer for Rich Text Product Descriptions
 * 
 * Strict sanitization enforcing:
 * - Allowed tags whitelist: h2, h3, p, strong, b, em, i, u, mark, span, ul, ol, li, br
 * - Complete removal of dangerous tags (script, style, iframe, object, embed, svg, form, input, button, img, etc.)
 * - Event handler stripping (onclick, onerror, onload, onmouseover, etc.)
 * - Controlled attribute whitelist (class with safe tokens, style restricted to safe color/background-color)
 * - Safe handling of legacy plain-text descriptions
 */

const ALLOWED_TAGS = new Set([
  'h2',
  'h3',
  'p',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'mark',
  'span',
  'ul',
  'ol',
  'li',
  'br',
]);

const DANGEROUS_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'canvas',
  'audio',
  'video',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'frame',
  'frameset',
  'head',
  'html',
  'body',
];

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-weight',
  'text-decoration',
]);

/**
 * Sanitizes inline CSS styles to prevent javascript: or url() injection
 */
function sanitizeStyle(styleValue) {
  if (!styleValue || typeof styleValue !== 'string') return '';
  
  // Reject dangerous tokens immediately
  if (/(?:url|expression|javascript|vbscript|behavior|@import|[<>\(\)"'])/i.test(styleValue)) {
    return '';
  }

  const declarations = styleValue.split(';');
  const safeDeclarations = [];

  for (const decl of declarations) {
    const colonIndex = decl.indexOf(':');
    if (colonIndex === -1) continue;

    const prop = decl.substring(0, colonIndex).trim().toLowerCase();
    const val = decl.substring(colonIndex + 1).trim();

    if (!ALLOWED_STYLE_PROPERTIES.has(prop)) continue;

    // Validate safe values: hex colors, named colors, rgb/rgba, font-weight, underline/none
    const isSafeColor = /^(?:#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+\s*)?\)|hsla?\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+\s*)?\)|[a-zA-Z]+)$/.test(val);
    const isSafeWeightOrDec = /^(?:normal|bold|bolder|lighter|[1-9]00|underline|none)$/i.test(val);

    if (isSafeColor || isSafeWeightOrDec) {
      safeDeclarations.push(`${prop}: ${val}`);
    }
  }

  return safeDeclarations.join('; ');
}

/**
 * Strips all HTML tags and unescapes common entities, returning plain text.
 */
function stripHtmlTags(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strictly sanitizes HTML description string for safe storage and rendering.
 * Disallows executable scripts, event handlers, and unknown tags.
 * Preserves semantic markup for headings, lists, highlights, and formatting.
 */
function sanitizeProductDescription(dirty) {
  if (dirty === null || dirty === undefined) return '';
  if (typeof dirty !== 'string') return String(dirty);

  let clean = dirty.trim();
  if (!clean) return '';

  // 1. Remove HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Strip dangerous tags and their complete inner content
  for (const tag of DANGEROUS_TAGS) {
    const tagRegex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    clean = clean.replace(tagRegex, '');
    // Also handle self-closing dangerous tags (e.g. <img ...>, <input ...>)
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    clean = clean.replace(selfClosingRegex, '');
  }

  // Also remove standalone <img> tags or other self-closing tags not in whitelist
  clean = clean.replace(/<img\b[^>]*>/gi, '');

  // 3. Process remaining tags
  clean = clean.replace(/<(\/)?([a-zA-Z0-9]+)([^>]*)>/g, (match, isClosing, rawTagName, rawAttrs) => {
    const tagName = rawTagName.toLowerCase();

    // If tag is not allowed, strip the tag but keep inner text
    if (!ALLOWED_TAGS.has(tagName)) {
      return '';
    }

    // Closing tag: no attributes allowed
    if (isClosing) {
      return `</${tagName}>`;
    }

    // Self-closing <br>
    if (tagName === 'br') {
      return '<br>';
    }

    // Parse and sanitize attributes for allowed opening tags
    let safeAttrs = '';
    if (rawAttrs && rawAttrs.trim()) {
      // Extract class attribute if present
      const classMatch = rawAttrs.match(/\bclass=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (classMatch) {
        const rawClass = classMatch[1] || classMatch[2] || classMatch[3] || '';
        // Only allow safe alphanumeric, dash, underscore, space tokens
        if (/^[a-zA-Z0-9_\-\s]+$/.test(rawClass)) {
          const safeClasses = rawClass
            .split(/\s+/)
            .filter((c) => /^[a-zA-Z0-9_\-]+$/.test(c))
            .join(' ');
          if (safeClasses) {
            safeAttrs += ` class="${safeClasses}"`;
          }
        }
      }

      // Extract style attribute if present
      const styleMatch = rawAttrs.match(/\bstyle=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (styleMatch) {
        const rawStyle = styleMatch[1] || styleMatch[2] || styleMatch[3] || '';
        const safeStyle = sanitizeStyle(rawStyle);
        if (safeStyle) {
          safeAttrs += ` style="${safeStyle}"`;
        }
      }
    }

    return `<${tagName}${safeAttrs}>`;
  });

  return clean.trim();
}

module.exports = {
  sanitizeProductDescription,
  stripHtmlTags,
  sanitizeStyle,
  ALLOWED_TAGS: Array.from(ALLOWED_TAGS),
};
