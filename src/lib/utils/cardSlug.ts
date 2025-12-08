/**
 * Card slug utilities for image loading.
 *
 * The /api/images/[slug] route expects hyphen format: set-cardname-b-s
 * It normalizes to underscore format internally for file lookup.
 */

/**
 * Map set name to 3-letter prefix for image slugs.
 */
export function getSetPrefix(setName: string | null | undefined): string {
  const lower = (setName || "").toLowerCase();
  if (lower.startsWith("alpha")) return "alp";
  if (lower.startsWith("beta")) return "bet";
  if (lower.startsWith("arthurian")) return "art";
  if (lower.startsWith("dragon")) return "dra";
  if (lower.startsWith("gothic")) return "got";
  if (lower.startsWith("promo") || lower.includes("organized")) return "pro";
  // Default to beta if unknown
  return "bet";
}

/**
 * Build a card image slug from card name and set.
 * Returns hyphen format expected by /api/images: set-cardname-b-s
 *
 * @param cardName - The card name (e.g., "Abundance", "King Arthur")
 * @param setName - The set name (e.g., "Alpha", "Beta", "Gothic")
 * @param product - Product code (default "b" for booster)
 * @param finish - Finish code (default "s" for standard)
 */
export function buildCardSlug(
  cardName: string,
  setName?: string | null,
  product: string = "b",
  finish: string = "s"
): string {
  const setPrefix = getSetPrefix(setName);
  // Card names use underscores for spaces
  const cardPart = cardName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  // Return hyphen format: alp-cardname-b-s
  return `${setPrefix}-${cardPart}-${product}-${finish}`;
}

/**
 * Get image slug, preferring variant slug if available.
 * Falls back to building slug from card name and set.
 */
export function getImageSlug(
  variantSlug: string | null | undefined,
  cardName: string,
  setName?: string | null
): string {
  // Use variant slug if available (already in correct format)
  if (variantSlug) return variantSlug;
  // Build fallback slug
  return buildCardSlug(cardName, setName);
}
