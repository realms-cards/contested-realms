// Lowercase names of cards that explicitly state they "provide ①" in rulesText.
// Generated from a scan of data/cards_raw.json; keep small and curated.
// Note: Arthurian Families (Blacksmith, Castle Servants, etc.) provide THRESHOLD only, not mana.
export const MANA_PROVIDER_BY_NAME = new Set<string>([
  "abundance",
  "amethyst core",
  "aquamarine core",
  "atlantean fate",
  "avalon",
  "caerleon-upon-usk",
  "drought",
  "finwife",
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

// Permanents that grant element thresholds.
// Cores provide both threshold AND mana (via MANA_PROVIDER_BY_NAME).
// Arthurian Families provide threshold ONLY (no mana).
export const THRESHOLD_GRANT_BY_NAME: Record<
  string,
  Partial<{ air: number; water: number; earth: number; fire: number }>
> = {
  // Cores (Artifact) - provide threshold + mana
  "amethyst core": { air: 1 },
  "aquamarine core": { water: 1 },
  "onyx core": { earth: 1 },
  "ruby core": { fire: 1 },
  // Arthurian Families (Minion) - provide threshold only
  "blacksmith family": { fire: 1 },
  "castle servants": { air: 1 },
  "common cottagers": { earth: 1 },
  "fisherman's family": { water: 1 },
};

// Sites that should NOT provide 1 mana per turn (rare exceptions).
// Keep lowercase names/slugs here; empty until we catalog specific cards.
export const NON_MANA_SITE_IDENTIFIERS = new Set<string>([
  // e.g., "some_site_name", "set_slug_for_site"
]);
