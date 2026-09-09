// Typed view over data/mana-providers.json, the single source of truth for
// which cards provide mana and threshold and under which conditions.
// The server (server/modules/rules-resources.ts) and the bot engine
// (bots/engine/index.js) read the same JSON so all three stay in sync.
import providerData from "../../../data/mana-providers.json";

// Element type for special sites
export type ElementChoice = "air" | "water" | "earth" | "fire";

export type PartialThresholds = Partial<Record<ElementChoice, number>>;

export type ConditionalSiteCondition = "empty" | "adjacent_to_void";

type ProviderData = {
  manaProviders: string[];
  perNearbyEnemyAvatarProviders: Record<string, number>;
  siteEnhancerArtifacts: Record<
    string,
    { mana: number; thresholds: PartialThresholds }
  >;
  auraSiteModifiers: Record<
    string,
    { extraMana?: number; noWaterThreshold?: boolean; multiplier?: number }
  >;
  siteNoThresholdOccupants: string[];
  adjacentSilencerNoThreshold: string[];
  opponentManaSites: Record<
    string,
    { requiredElement: ElementChoice; opponentMana: number }
  >;
  elementChoiceSites: string[];
  sharedManaSites: string[];
  cityBonusSites: Record<
    string,
    { requiredElement: ElementChoice; extraMana: number }
  >;
  genesisBloomSites: Record<string, PartialThresholds>;
  genesisManaSites: Record<string, number>;
  towerGenesisSites: string[];
  beaconGenesisSites: string[];
  breakWardsGenesisSites: string[];
  conditionalThresholdSites: Record<
    string,
    { condition: string; thresholds: PartialThresholds }
  >;
  cemeteryManaSites: Record<string, { perUnique: number }>;
  activatedManaSites: string[];
  templeOfMolochGain: number;
  thresholdGrants: Record<string, PartialThresholds>;
  nonManaSites: string[];
  backRowOnlySites: string[];
  multiThresholdSites: Record<string, PartialThresholds>;
  conditionalManaSites: Record<string, { condition: ConditionalSiteCondition }>;
  voidManaProviders: Record<string, number>;
  ordinarySiteNames: string[];
};

const data = providerData as ProviderData;

// Lowercase names of permanents that "provide ①" to their controller.
// Artifacts in this list only provide while carried (attached to a unit).
export const MANA_PROVIDER_BY_NAME = new Set<string>(data.manaProviders);

// Minions whose mana scales with nearby enemy Avatars.
// "Finwife" - Provides (2) for each nearby enemy Avatar.
export const PER_NEARBY_ENEMY_AVATAR_PROVIDERS: Record<string, number> =
  data.perNearbyEnemyAvatarProviders;

// Artifacts that sit on a site (unattached) and make THAT site provide extra.
// "Shrine of the Dragonlord" - This site provides an additional (1) and (E)(F)(W)(A).
export const SITE_ENHANCER_ARTIFACTS: Record<
  string,
  { mana: number; thresholds: PartialThresholds }
> = data.siteEnhancerArtifacts;

// Auras that modify the site they sit on.
// "Abundance" - Each affected site provides one additional mana.
// "Drought" - Affected sites aren't water sites, and provide no water threshold.
// "Sow the Earth" - This site provides double mana and threshold.
export const AURA_SITE_MODIFIERS: Record<
  string,
  { extraMana?: number; noWaterThreshold?: boolean; multiplier?: number }
> = data.auraSiteModifiers;

// Minions that stop the site they stand on from providing threshold.
// "Granary Rats" - This site doesn't provide threshold.
export const SITE_NO_THRESHOLD_OCCUPANTS = new Set<string>(
  data.siteNoThresholdOccupants,
);

// Minions whose Genesis silences an adjacent site so it provides no threshold.
// "Sinterfee" - the silenced site provides no threshold while Sinterfee is in the realm.
// Modelled as: a site carrying a Silenced token that is adjacent to a Sinterfee.
export const ADJACENT_SILENCER_NO_THRESHOLD = new Set<string>(
  data.adjacentSilencerNoThreshold,
);

// Sites that also give the OPPONENT mana when their bonus is active.
// "City of Plenty" - (W) Provides (2) instead but also provides (1) for your opponent.
export const OPPONENT_MANA_SITES: Record<
  string,
  { requiredElement: ElementChoice; opponentMana: number }
> = data.opponentManaSites;

// Sites that require player choice for element (Genesis trigger)
// "Valley of Delight" - Choose one: (A), (E), (F), (W). This site provides that permanently.
export const ELEMENT_CHOICE_SITES = new Set<string>(data.elementChoiceSites);

// Sites that provide all 4 elements to BOTH players (shared mana)
// "Avalon" - Provides mana and threshold for everyone.
export const SHARED_MANA_SITES = new Set<string>(data.sharedManaSites);

// Sites that provide +1 extra mana when you have a specific threshold
export const CITY_BONUS_SITES: Record<
  string,
  { requiredElement: ElementChoice; extraMana: number }
> = data.cityBonusSites;

// Genesis bloom sites - provide temporary threshold boost on the turn they're played
export const GENESIS_BLOOM_SITES: Record<string, PartialThresholds> =
  data.genesisBloomSites;

// Genesis sites that provide temporary mana boost
export const GENESIS_MANA_SITES: Record<string, number> = data.genesisManaSites;

// Tower sites that provide +1 mana on genesis if you control only one copy
// Genesis → If you control only one [Tower Name], gain (1) this turn.
export const TOWER_GENESIS_SITES = new Set<string>(data.towerGenesisSites);

// "Beacon" - Genesis → Gain (1) for each nearby site with an enemy atop it.
export const BEACON_GENESIS_SITES = new Set<string>(data.beaconGenesisSites);

// Sites whose Genesis breaks nearby Wards (runs through auto-resolve confirmation)
export const BREAK_WARDS_GENESIS_SITES = new Set<string>(
  data.breakWardsGenesisSites,
);

// Sites with conditional threshold based on nearby units/state
// "The Empyrean" - Provides (A)(E)(F)(W) if you control a nearby Angel or Ward.
export const CONDITIONAL_THRESHOLD_SITES: Record<
  string,
  { condition: string; thresholds: PartialThresholds }
> = data.conditionalThresholdSites;

// "Myrrh's Trophy Room" - Provides an additional (1) for each Unique minion in opponent's cemetery.
export const CEMETERY_MANA_SITES: Record<string, { perUnique: number }> =
  data.cemeteryManaSites;

// Activated ability sites (pay cost to gain mana/threshold this turn)
// "Annual Fair" - (1) → Gain (A), (E), (F), or (W) this turn.
// "Temple of Moloch" - Once on each player's turn, sacrifice a minion here to gain (2).
export const ACTIVATED_MANA_SITES = new Set<string>(data.activatedManaSites);
export const TEMPLE_OF_MOLOCH_GAIN = data.templeOfMolochGain;

// Permanents that grant element thresholds.
// Cores provide both threshold AND mana (via MANA_PROVIDER_BY_NAME) but ONLY when carried (attached).
// Arthurian Families provide threshold ONLY (no mana).
export const THRESHOLD_GRANT_BY_NAME: Record<string, PartialThresholds> =
  data.thresholdGrants;

// Sites that should NOT provide mana at all (they may still provide threshold).
export const NON_MANA_SITE_IDENTIFIERS = new Set<string>(data.nonManaSites);

// Sites that only provide mana/threshold while in the owner's back row.
export const BACK_ROW_ONLY_SITES = new Set<string>(data.backRowOnlySites);

// Multi-threshold sites - override the standard single-threshold calculation
export const MULTI_THRESHOLD_SITES: Record<string, PartialThresholds> =
  data.multiThresholdSites;

// Sites with conditional mana based on board state (need special handling).
export const CONDITIONAL_MANA_SITES: Record<
  string,
  { condition: ConditionalSiteCondition }
> = data.conditionalManaSites;

// Artifacts that provide mana while in the void (not on a site).
// Ether Core: "Provides (3) while in the void."
export const VOID_MANA_PROVIDERS: Record<string, number> =
  data.voidManaProviders;

// Ordinary-rarity site names (fallback when a CardRef carries no rarity).
// Used by Atlantean Fate flooding, which only affects non-Ordinary sites.
export const ORDINARY_SITE_NAME_SET = new Set<string>(data.ordinarySiteNames);

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
