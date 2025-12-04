/**
 * Maps set names to their booster pack image filenames.
 * Centralized to avoid duplication across components.
 */
export function getBoosterAssetName(
  setName: string | null | undefined
): string {
  const s = (setName || "").toLowerCase();

  if (s.includes("dragonlord")) return "dragonlord-booster.png";
  if (s.includes("arthur")) return "arthurian-booster.png";
  if (s.includes("alpha")) return "alphabeta-booster.png";
  if (s.includes("beta")) return "alphabeta-booster.png";
  if (s === "cube") return "alphabeta-booster.png";

  // Default fallback
  return "alphabeta-booster.png";
}

/**
 * List of booster asset filenames for preloading/caching.
 */
export const BOOSTER_ASSET_FILES = [
  "beta-booster.png",
  "alpha-booster.png",
  "arthurian-legends-booster.png",
  "dragonlord-booster.png",
  "alphabeta-booster.png",
  "arthurian-booster.png",
];
