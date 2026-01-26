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

// Element type for special sites
export type ElementChoice = "air" | "water" | "earth" | "fire";

// Sites that require player choice for element (Genesis trigger)
// "Valley of Delight" - Choose one: (A), (E), (F), (W). This site provides that permanently.
export const ELEMENT_CHOICE_SITES = new Set<string>(["valley of delight"]);

// Sites that provide all 4 elements to BOTH players (shared mana)
// "Avalon" - Provides mana and threshold for everyone.
export const SHARED_MANA_SITES = new Set<string>(["avalon"]);

// Sites that provide +1 extra mana when you have a specific threshold
// Format: { siteName: { requiredElement, extraMana } }
export const CITY_BONUS_SITES: Record<
  string,
  { requiredElement: ElementChoice; extraMana: number }
> = {
  "city of glass": { requiredElement: "air", extraMana: 1 },
  "city of plenty": { requiredElement: "water", extraMana: 1 },
  "city of souls": { requiredElement: "earth", extraMana: 1 },
  "city of traitors": { requiredElement: "fire", extraMana: 1 },
};

// Genesis bloom sites - provide temporary threshold boost on the turn they're played
// Format: { siteName: { thresholds to add this turn } }
export const GENESIS_BLOOM_SITES: Record<
  string,
  Partial<{ air: number; water: number; earth: number; fire: number }>
> = {
  "twilight bloom": { earth: 1, fire: 1, water: 1 }, // (E)(F)(W) this turn
  "algae bloom": { air: 1, earth: 1, fire: 1 }, // (A)(E)(F) this turn
  "autumn bloom": { air: 1, fire: 1, water: 1 }, // (A)(F)(W) this turn
  "desert bloom": { air: 1, earth: 1, water: 1 }, // (A)(E)(W) this turn
};

// Genesis sites that provide temporary mana boost
export const GENESIS_MANA_SITES: Record<string, number> = {
  "ghost town": 1, // Genesis → Gain (1) this turn
};

// Tower sites that provide +1 mana on genesis if you control only one copy
// "Dark Tower", "Lone Tower", "Gothic Tower", "Accursed Tower"
// Genesis → If you control only one [Tower Name], gain (1) this turn.
export const TOWER_GENESIS_SITES = new Set<string>([
  "dark tower",
  "lone tower",
  "gothic tower",
  "accursed tower",
]);

// Sites with genesis effects that depend on nearby enemy units
// "Beacon" - Genesis → Gain (1) for each nearby site with an enemy atop it.
export const BEACON_GENESIS_SITES = new Set<string>(["beacon"]);

// Sites with conditional threshold based on nearby units/state
// These need special runtime checks
export const CONDITIONAL_THRESHOLD_SITES = {
  // "The Empyrean" - Provides (A)(E)(F)(W) if you control a nearby Angel or Ward.
  "the empyrean": {
    condition: "nearby_angel_or_ward",
    thresholds: { air: 1, earth: 1, fire: 1, water: 1 },
  },
} as const;

// Sites with conditional mana based on cemetery state
export const CEMETERY_MANA_SITES: Record<string, { perUnique: number }> = {
  // "Myrrh's Trophy Room" - Provides an additional (1) for each Unique minion in opponent's cemetery.
  "myrrh's trophy room": { perUnique: 1 },
};

// Activated ability sites (pay cost to gain mana/threshold this turn)
// "Annual Fair" - (1) → Gain (A), (E), (F), or (W) this turn.
// "Temple of Moloch" - Once per turn, sacrifice minion here to gain (2).
export const ACTIVATED_MANA_SITES = new Set<string>([
  "annual fair",
  "temple of moloch",
]);

// Permanents that grant element thresholds.
// Cores provide both threshold AND mana (via MANA_PROVIDER_BY_NAME).
// Arthurian Families provide threshold ONLY (no mana).
export const THRESHOLD_GRANT_BY_NAME: Record<
  string,
  Partial<{ air: number; water: number; earth: number; fire: number }>
> = {
  // Cores (Artifact) - provide threshold + mana while in play (no attachment required)
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

// Artifacts that provide mana/threshold while "in the realm" (on board), without needing attachment.
// These follow the "Provides X to its controller" pattern - they work as long as they're in play.
// Other artifacts typically require being attached/carried to provide benefits.
export const IN_PLAY_ARTIFACT_PROVIDERS = new Set<string>([
  "amethyst core",
  "aquamarine core",
  "onyx core",
  "ruby core",
]);

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

// Multi-threshold sites - sites that provide multiple element thresholds
// These override the standard single-threshold calculation
export const MULTI_THRESHOLD_SITES: Record<
  string,
  Partial<{ air: number; water: number; earth: number; fire: number }>
> = {
  // Arthurian back-row sites (only work in back row - checked via BACK_ROW_ONLY_SITES)
  tintagel: { air: 1, earth: 1, water: 1 }, // (A)(E)(W)
  "caerleon-upon-usk": { earth: 1, fire: 1, water: 1 }, // (E)(F)(W)
  "glastonbury tor": { air: 1, earth: 1, fire: 1 }, // (A)(E)(F)
  "joyous garde": { air: 1, fire: 1, water: 1 }, // (A)(F)(W)
  // Avalon provides all 4 elements to everyone (also in SHARED_MANA_SITES)
  avalon: { air: 1, earth: 1, fire: 1, water: 1 }, // (A)(E)(F)(W)
  // Colour Out of Space - provides all 4 elements when adjacent to void (conditional check applied first)
  "the colour out of space": { air: 1, earth: 1, fire: 1, water: 1 }, // (A)(E)(F)(W)
};

// Sites with conditional mana based on board state (need special handling).
// These MUST pass their condition check to provide mana/threshold.
export const CONDITIONAL_MANA_SITES = {
  // "pristine paradise" - Provides no mana or threshold unless completely empty.
  "pristine paradise": { condition: "empty" as const },
  // "the colour out of space" - Provides no mana or threshold if not adjacent to the void.
  "the colour out of space": { condition: "adjacent_to_void" as const },
};

export type ConditionalSiteCondition = "empty" | "adjacent_to_void";

// Artifacts that provide mana while in the void (not on board).
// Ether Core: "Provides (3) while in the void."
export const VOID_MANA_PROVIDERS: Record<string, number> = {
  "ether core": 3,
};

// Helper to check if a site name is a special site
export const isSpecialSite = (name: string | null | undefined): boolean => {
  if (!name) return false;
  const lc = name.toLowerCase();
  return (
    ELEMENT_CHOICE_SITES.has(lc) ||
    SHARED_MANA_SITES.has(lc) ||
    lc in CITY_BONUS_SITES ||
    lc in GENESIS_BLOOM_SITES ||
    lc in GENESIS_MANA_SITES ||
    lc in CONDITIONAL_THRESHOLD_SITES ||
    lc in CEMETERY_MANA_SITES ||
    lc in CONDITIONAL_MANA_SITES ||
    ACTIVATED_MANA_SITES.has(lc)
  );
};

// Helper to get all special site names for a given category
export const getSpecialSiteCategory = (
  name: string | null | undefined,
):
  | "element_choice"
  | "shared"
  | "city_bonus"
  | "bloom"
  | "genesis_mana"
  | "conditional_threshold"
  | "cemetery_mana"
  | "conditional_mana"
  | "activated"
  | null => {
  if (!name) return null;
  const lc = name.toLowerCase();
  if (ELEMENT_CHOICE_SITES.has(lc)) return "element_choice";
  if (SHARED_MANA_SITES.has(lc)) return "shared";
  if (lc in CITY_BONUS_SITES) return "city_bonus";
  if (lc in GENESIS_BLOOM_SITES) return "bloom";
  if (lc in GENESIS_MANA_SITES) return "genesis_mana";
  if (lc in CONDITIONAL_THRESHOLD_SITES) return "conditional_threshold";
  if (lc in CEMETERY_MANA_SITES) return "cemetery_mana";
  if (lc in CONDITIONAL_MANA_SITES) return "conditional_mana";
  if (ACTIVATED_MANA_SITES.has(lc)) return "activated";
  return null;
};
