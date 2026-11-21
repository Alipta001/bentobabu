const crypto = require('crypto');

/**
 * Basic HTML escaping to prevent stored XSS attacks in ticket messages and subjects
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Generates human-readable, unique ticket numbers: e.g. TKT-2026-A8F2K
 */
function generateTicketNumber() {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${year}-${randomHex}`;
}

const { sanitizeProductDescription, stripHtmlTags } = require('./sanitizeHtml');

module.exports = {
  sanitizeText,
  generateTicketNumber,
  sanitizeProductDescription,
  stripHtmlTags,
};
