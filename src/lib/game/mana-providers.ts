// Lowercase names of cards that explicitly state they "provide ①" in rulesText.
// Generated from a scan of data/cards_raw.json; keep small and curated.
export const MANA_PROVIDER_BY_NAME = new Set<string>([
  "abundance",
  "amethyst core",
  "aquamarine core",
  "atlantean fate",
  "avalon",
  "blacksmith family",
  "caerleon-upon-usk",
  "castle servants",
  "common cottagers",
  "drought",
  "finwife",
  "fisherman's family",
  "glastonbury tor",
  "joyous garde",
  "onyx core",
  "pristine paradise",
  "ruby core",
  "shrine of the dragonlord",
  "the colour out of space",
  "tintagel",
  "valley of delight",
  "wedding hall",
  "älvalinne dryads",
]);

// Subset of permanents that also grant element thresholds (e.g., Cores provide (A/W/E/F)).
export const THRESHOLD_GRANT_BY_NAME: Record<
  string,
  Partial<{ air: number; water: number; earth: number; fire: number }>
> = {
  "amethyst core": { air: 1 },
  "aquamarine core": { water: 1 },
  "onyx core": { earth: 1 },
  "ruby core": { fire: 1 },
};

// Sites that should NOT provide 1 mana per turn (rare exceptions).
// Keep lowercase names/slugs here; empty until we catalog specific cards.
export const NON_MANA_SITE_IDENTIFIERS = new Set<string>([
  // e.g., "some_site_name", "set_slug_for_site"
]);
