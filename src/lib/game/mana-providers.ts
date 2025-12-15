// Lowercase names of cards that explicitly state they "provide ①" in rulesText.
// Generated from a scan of data/cards_raw.json; keep small and curated.
// Note: Arthurian Families (Blacksmith, Castle Servants, etc.) provide THRESHOLD only, not mana.
// Note: Back-row-only sites are in BACK_ROW_ONLY_SITES and checked separately.
export const MANA_PROVIDER_BY_NAME = new Set<string>([
  "abundance",
  "amethyst core",
  "aquamarine core",
  "atlantean fate",
  "avalon",
  "drought",
  "finwife",
  "onyx core",
  "ruby core",
  "shrine of the dragonlord",
  "valley of delight",
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

// Sites that should NOT provide mana at all.
export const NON_MANA_SITE_IDENTIFIERS = new Set<string>([
  "rubble",
  "wedding hall", // "Provides no mana, but if Arthur and Guinevere start your turn here, you win."
]);

// Sites that only provide mana/threshold while in the owner's back row.
// These need position-based checking in computeAvailableMana.
export const BACK_ROW_ONLY_SITES = new Set<string>([
  "caerleon-upon-usk",
  "glastonbury tor",
  "joyous garde",
  "tintagel",
]);

// Sites with conditional mana based on board state (need special handling).
// "pristine paradise" - Provides no mana or threshold unless completely empty.
// "the colour out of space" - Provides no mana or threshold if not adjacent to the void.
export const CONDITIONAL_MANA_SITES = new Set<string>([
  "pristine paradise",
  "the colour out of space",
]);

// Artifacts that provide mana while in the void (not on board).
// Ether Core: "Provides (3) while in the void."
export const VOID_MANA_PROVIDERS: Record<string, number> = {
  "ether core": 3,
};
