export interface IdentifiableProduct {
  id?: string;
  _id?: string;
}

/**
 * Returns the canonical product identifier (preferring `id`, falling back to `_id`).
 */
export function getCanonicalProductId(product: IdentifiableProduct): string {
  return String(product.id || product._id || "").trim();
}

/**
 * Deduplicates a product list by canonical product ID while preserving order.
 * Products with similar names but distinct IDs are kept as separate items.
 */
export function deduplicateProductsById<T extends IdentifiableProduct>(products: T[]): T[] {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const product of products) {
    const canonicalId = getCanonicalProductId(product);
    if (!canonicalId) {
      deduplicated.push(product);
      continue;
    }
    if (seen.has(canonicalId)) {
      continue;
    }
    seen.add(canonicalId);
    deduplicated.push(product);
  }

  return deduplicated;
}
