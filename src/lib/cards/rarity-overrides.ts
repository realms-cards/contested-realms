/**
 * Manual rarity overrides for cards missing rarity data in the API.
 * This is needed for Gothic avatars which don't have rarity defined.
 *
 * Key: card name (case-insensitive matching)
 * Value: rarity string ("Unique" | "Elite" | "Exceptional" | "Ordinary")
 */

export type Rarity = "Unique" | "Elite" | "Exceptional" | "Ordinary";

/**
 * Gothic Avatar Rarities (manually defined since API doesn't provide them)
 */
export const RARITY_OVERRIDES: Record<string, Rarity> = {
  // Unique avatars
  "Realm-Eater": "Unique",
  Magician: "Unique",
  Imposter: "Unique",
  Duplicator: "Unique",

  // Elite avatars
  Animist: "Elite",
  Corruptor: "Elite",
  Interrogator: "Elite",
  Ironclad: "Elite",
  Bladedancer: "Elite",

  // Exceptional avatars
  Harbinger: "Exceptional",
  Necromancer: "Exceptional",
  Persecutor: "Exceptional",
  Savior: "Exceptional",
};

// Build a lowercase lookup map for case-insensitive matching
const RARITY_OVERRIDES_LOWER = new Map<string, Rarity>(
  Object.entries(RARITY_OVERRIDES).map(([name, rarity]) => [
    name.toLowerCase(),
    rarity,
  ])
);

/**
 * Get rarity override for a card name if one exists.
 * Returns null if no override is defined.
 */
export function getRarityOverride(cardName: string): Rarity | null {
  if (!cardName) return null;
  return RARITY_OVERRIDES_LOWER.get(cardName.toLowerCase()) ?? null;
}

/**
 * Apply rarity override if the provided rarity is null/undefined.
 * Returns the original rarity if it exists, otherwise checks for an override.
 */
export function applyRarityOverride(
  cardName: string,
  rarity: string | null | undefined
): string | null {
  if (rarity) return rarity;
  return getRarityOverride(cardName);
}
