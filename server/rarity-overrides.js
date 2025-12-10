/**
 * Manual rarity overrides for cards missing rarity data in the API.
 * This is needed for Gothic avatars which don't have rarity defined.
 *
 * Key: card name (case-insensitive matching)
 * Value: rarity string ("Unique" | "Elite" | "Exceptional" | "Ordinary")
 */

const RARITY_OVERRIDES = {
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
const RARITY_OVERRIDES_LOWER = new Map(
  Object.entries(RARITY_OVERRIDES).map(([name, rarity]) => [
    name.toLowerCase(),
    rarity,
  ])
);

/**
 * Get rarity override for a card name if one exists.
 * Returns null if no override is defined.
 */
function getRarityOverride(cardName) {
  if (!cardName) return null;
  return RARITY_OVERRIDES_LOWER.get(cardName.toLowerCase()) ?? null;
}

/**
 * Apply rarity override if the provided rarity is null/undefined.
 * Returns the original rarity if it exists, otherwise checks for an override.
 */
function applyRarityOverride(cardName, rarity) {
  if (rarity) return rarity;
  return getRarityOverride(cardName);
}

module.exports = {
  RARITY_OVERRIDES,
  getRarityOverride,
  applyRarityOverride,
};
