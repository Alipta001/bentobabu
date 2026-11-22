/**
 * PIN Code Normalization and Validation Utilities for BentoBabu
 * Enforces strict separation between Delivery Zone names and 6-digit Indian postal PIN codes.
 *
 * Rules:
 * 1. A PIN code must strictly be a 6-digit Indian postal code (e.g. "700122", range: 100000 - 999999).
 * 2. Delivery zone names (e.g. "Barrackpore") and PIN codes are completely independent entities.
 * 3. The system never generates or accepts composite strings like "barrackpore-700122" as valid PIN codes.
 *    Any incoming formatted string with zone prefixes or delimiters is safely normalized to the 6-digit PIN.
 */

const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * Normalizes an input value into a clean 6-digit Indian PIN code string.
 * Strips away accidental zone name prefixes (e.g. "Barrackpore-700122"), delimiters, or spaces.
 *
 * @param {string|number} input
 * @returns {string|null} 6-digit PIN code string or null if invalid
 */
function normalizePincode(input) {
  if (input === null || input === undefined) {
    return null;
  }

  const str = String(input).trim();
  if (!str) {
    return null;
  }

  // Exact match (standard case)
  if (PINCODE_REGEX.test(str)) {
    return str;
  }

  // Handle strings with spaces between digits (e.g. "700 122" or "700-122")
  const digitsOnly = str.replace(/\D/g, '');
  if (PINCODE_REGEX.test(digitsOnly) && digitsOnly.length === 6) {
    return digitsOnly;
  }

  // Extract 6-digit postal code if prefixed or suffixed with zone names (e.g. "Barrackpore-700122", "barrackpore_700122")
  const match = str.match(/(?:^|\D)([1-9][0-9]{5})(?:\D|$)/);
  if (match && match[1] && PINCODE_REGEX.test(match[1])) {
    return match[1];
  }

  return null;
}

/**
 * Validates whether a string or number is a strictly valid 6-digit Indian PIN code.
 *
 * @param {string|number} input
 * @returns {boolean}
 */
function isValidPincode(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    return false;
  }
  return PINCODE_REGEX.test(String(input).trim());
}

module.exports = {
  PINCODE_REGEX,
  normalizePincode,
  isValidPincode,
};
