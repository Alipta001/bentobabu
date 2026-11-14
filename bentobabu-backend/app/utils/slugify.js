/**
 * Generates URL-friendly slug from string
 */
const slugify = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // Remove non-word characters (except spaces and hyphens)
    .replace(/[\s_-]+/g, '-')     // Replace spaces, underscores, and multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '');     // Trim leading/trailing hyphens
};

module.exports = { slugify };

