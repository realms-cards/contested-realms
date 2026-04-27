/**
 * Central registry of all custom card resolvers in the game.
 * Used for the "Disable all card resolvers" toolbox toggle.
 *
 * A resolver is custom logic triggered when a specific card is played
 * from the spellbook/atlas - beyond the generic magic flow.
 *
 * NOTE: Avatar abilities are NOT included in this toggle.
 * Only spellbook cards (magic spells) and site cards with automatic resolvers are affected.
 */

export type ResolverCategory =
  | "spell" // Magic spells with custom resolution
  | "minion" // Minions with ETB or triggered abilities
  | "avatar" // Avatar-specific abilities
  | "site" // Sites with special mechanics
  | "artifact"; // Artifacts with unique effects

export type ResolverEntry = {
  id: string;
  cardName: string;
  category: ResolverCategory;
  stateFile: string;
  description: string;
};

/**
 * Complete list of all custom card resolvers.
 * Add new resolvers here when implementing them.
 */
export const RESOLVER_REGISTRY: ResolverEntry[] = [
  // ─── SPELL RESOLVERS ───────────────────────────────────────────────
  {
    id: "browse",
    cardName: "Browse",
    category: "spell",
    stateFile: "browseState.ts",
    description: "Look at 7 spells, put 1 in hand, rest on bottom in any order",
  },
  {
    id: "chaosTwister",
    cardName: "Chaos Twister",
    category: "spell",
    stateFile: "chaosTwisterState.ts",
    description: "Dexterity minigame - blow minion off hand onto board",
  },
  {
    id: "callToWar",
    cardName: "Call to War",
    category: "spell",
    stateFile: "callToWarState.ts",
    description: "Search spellbook for minion, put in hand",
  },
  {
    id: "searingTruth",
    cardName: "Searing Truth",
    category: "spell",
    stateFile: "searingTruthState.ts",
    description: "Reveal opponent hand, deal damage per card type",
  },
  {
    id: "accusation",
    cardName: "Accusation",
    category: "spell",
    stateFile: "accusationState.ts",
    description: "Name a card, opponent reveals if in hand",
  },
  {
    id: "commonSense",
    cardName: "Common Sense",
    category: "spell",
    stateFile: "commonSenseState.ts",
    description: "Search spellbook for Ordinary card, put in hand",
  },
  {
    id: "earthquake",
    cardName: "Earthquake",
    category: "spell",
    stateFile: "earthquakeState.ts",
    description: "Damage all minions based on power",
  },
  {
    id: "blackMass",
    cardName: "Black Mass",
    category: "spell",
    stateFile: "blackMassState.ts",
    description: "Sacrifice minions for effect",
  },
  {
    id: "corpseExplosion",
    cardName: "Corpse Explosion",
    category: "spell",
    stateFile: "corpseExplosionState.ts",
    description:
      "Deal dead minions to 2x2 area sites, deal damage equal to power, banish corpses",
  },
  {
    id: "demonicContract",
    cardName: "Demonic Contract",
    category: "spell",
    stateFile: "demonicContractState.ts",
    description: "Pay life to draw cards",
  },
  {
    id: "dholChants",
    cardName: "Dhol Chants",
    category: "spell",
    stateFile: "dholChantsState.ts",
    description: "Reveal top cards, opponent chooses which you keep",
  },
  {
    id: "atlanteanFate",
    cardName: "Atlantean Fate",
    category: "spell",
    stateFile: "atlanteanFateState.ts",
    description:
      "Aura covering 2x2 area (upper-left corner) - floods non-ordinary sites (only produce water)",
  },
  {
    id: "doomsdayCult",
    cardName: "Doomsday Cult",
    category: "spell",
    stateFile: "doomsdayCultState.ts",
    description: "Sacrifice permanents for power",
  },
  {
    id: "feastForCrows",
    cardName: "Feast for Crows",
    category: "spell",
    stateFile: "feastForCrowsState.ts",
    description:
      "Name a spell, search opponent's hand/spellbook/cemetery for copies, banish them, shuffle",
  },
  {
    id: "betrayal",
    cardName: "Betrayal",
    category: "spell",
    stateFile: "betrayalState.ts",
    description: "Gain control of target enemy minion this turn and untap it",
  },
  {
    id: "infiltrate",
    cardName: "Infiltrate",
    category: "spell",
    stateFile: "infiltrateState.ts",
    description:
      "Target enemy minion gains Stealth and taps. You control it until it no longer has Stealth",
  },
  {
    id: "theFlood",
    cardName: "The Flood",
    category: "spell",
    stateFile: "realmFloodState.ts",
    description: "Permanently floods the entire realm, including future sites",
  },

  // ─── MINION RESOLVERS ──────────────────────────────────────────────
  {
    id: "pithImp",
    cardName: "Pith Imp",
    category: "minion",
    stateFile: "pithImpState.ts",
    description: "Steal cards from opponent's hand",
  },
  {
    id: "highlandPrincess",
    cardName: "Highland Princess",
    category: "minion",
    stateFile: "highlandPrincessState.ts",
    description: "Genesis ability - summon tokens on entry",
  },
  {
    id: "assortedAnimals",
    cardName: "Assorted Animals",
    category: "minion",
    stateFile: "assortedAnimalsState.ts",
    description: "Summon random animal tokens",
  },
  {
    id: "frontierSettlers",
    cardName: "Frontier Settlers",
    category: "minion",
    stateFile: "frontierSettlersState.ts",
    description: "Create settlement tokens",
  },
  {
    id: "pigsOfTheSounder",
    cardName: "Pigs of the Sounder",
    category: "minion",
    stateFile: "pigsOfTheSounderState.ts",
    description: "Summon pig tokens",
  },
  {
    id: "captainBaldassare",
    cardName: "Captain Baldassare",
    category: "minion",
    stateFile: "seaRaiderState.ts",
    description:
      "When attacks a unit or site, defender discards top 3 spells. May cast them this turn ignoring threshold.",
  },
  {
    id: "seaRaider",
    cardName: "Sea Raider",
    category: "minion",
    stateFile: "seaRaiderState.ts",
    description:
      "When attacks and kills an enemy, defender discards top spell. May cast it this turn ignoring threshold.",
  },
  {
    id: "headlessHaunt",
    cardName: "Headless Haunt / Hauntless Head",
    category: "minion",
    stateFile: "headlessHauntState.ts",
    description: "Auto-move to random tile at start of turn",
  },
  {
    id: "greatOldOne",
    cardName: "Great Old One",
    category: "minion",
    stateFile: "realmFloodState.ts",
    description:
      "Genesis permanently floods the entire realm, including future sites",
  },
  {
    id: "lilith",
    cardName: "Lilith",
    category: "minion",
    stateFile: "lilithState.ts",
    description: "Special demon summoning mechanics",
  },
  {
    id: "assimilatorSnail",
    cardName: "Assimilator Snail",
    category: "minion",
    stateFile: "assimilatorSnailState.ts",
    description:
      "Once per turn, banish a dead minion to become a copy of it until next turn",
  },
  {
    id: "hyperparasite",
    cardName: "Hyperparasite",
    category: "minion",
    stateFile: "hyperparasiteState.ts",
    description:
      "Pick up a single minion (disabled), can't move while carrying",
  },

  // ─── AVATAR ABILITY RESOLVERS ──────────────────────────────────────
  {
    id: "necromancer",
    cardName: "Necromancer",
    category: "avatar",
    stateFile: "necromancerState.ts",
    description: "Pay 1 mana to summon Skeleton token at avatar location",
  },
  {
    id: "imposter",
    cardName: "Imposter",
    category: "avatar",
    stateFile: "imposterMaskState.ts",
    description: "Mask as another avatar from collection",
  },
  {
    id: "druid",
    cardName: "Druid",
    category: "avatar",
    stateFile: "druidState.ts",
    description: "Flip to become Bruin (one-way transformation)",
  },
  {
    id: "interrogator",
    cardName: "Interrogator",
    category: "avatar",
    stateFile: "interrogatorState.ts",
    description:
      "Draw spell when ally strikes enemy avatar unless they pay life",
  },
  {
    id: "animist",
    cardName: "Animist",
    category: "avatar",
    stateFile: "animistState.ts",
    description: "Animate sites into creatures",
  },
  {
    id: "harbinger",
    cardName: "Harbinger",
    category: "avatar",
    stateFile: "portalState.ts",
    description: "Roll for portal tile locations at game start",
  },
  {
    id: "seer",
    cardName: "Seer",
    category: "avatar",
    stateFile: "seerState.ts",
    description: "Scry or peek at cards",
  },

  // ─── SITE RESOLVERS ────────────────────────────────────────────────
  {
    id: "valleyOfDelight",
    cardName: "Valley of Delight",
    category: "site",
    stateFile: "specialSiteState.ts",
    description:
      "Genesis: Choose an element (Air/Water/Earth/Fire) - site provides that threshold permanently. Spawns a colored gem on tile.",
  },
  {
    id: "riverGenesis",
    cardName: "Spring River / Summer River / Autumn River / Winter River",
    category: "site",
    stateFile: "riverGenesisState.ts",
    description: "Genesis: Look at next spell, may put on bottom of spellbook",
  },
  {
    id: "shapeshift",
    cardName: "Shapeshift",
    category: "spell",
    stateFile: "shapeshiftState.ts",
    description: "Transform allied minion into a minion from top 5 spells",
  },
  {
    id: "morgana",
    cardName: "Morgana's Sanctum",
    category: "site",
    stateFile: "morganaState.ts",
    description: "Create private hand zone",
  },
  {
    id: "omphalos",
    cardName: "Omphalos",
    category: "site",
    stateFile: "omphalosState.ts",
    description: "Special oracle mechanics",
  },
  {
    id: "motherNature",
    cardName: "Mother Nature",
    category: "site",
    stateFile: "motherNatureState.ts",
    description: "Start of turn site movement",
  },
  {
    id: "specialSites",
    cardName: "Various Special Sites",
    category: "site",
    stateFile: "specialSiteState.ts",
    description: "Troubled Town, Gilman House, etc.",
  },
  {
    id: "observatory",
    cardName: "Observatory",
    category: "site",
    stateFile: "observatoryState.ts",
    description: "Genesis: Look at top 3 spells, put them back in any order",
  },
  {
    id: "kelpCavern",
    cardName: "Kelp Cavern",
    category: "site",
    stateFile: "kelpCavernState.ts",
    description:
      "Genesis: Look at bottom 3 spells, put one on top of spellbook",
  },
  {
    id: "crossroads",
    cardName: "Crossroads",
    category: "site",
    stateFile: "crossroadsState.ts",
    description:
      "Genesis: Look at next 4 sites in atlas, keep 1 on top, put 3 on bottom",
  },
  {
    id: "torshammarTrinket",
    cardName: "Torshammar Trinket",
    category: "artifact",
    stateFile: "torshammarState.ts",
    description: "Bearer has +1 power. After each turn, return to owner's hand",
  },
  {
    id: "islandLeviathan",
    cardName: "Island Leviathan",
    category: "site",
    stateFile: "boardState.ts",
    description:
      "If you have 8 water threshold — May transform into a Monster with 8 strength. Place Rubble underneath.",
  },
  {
    id: "hornsOfBehemoth",
    cardName: "Horns of Behemoth",
    category: "site",
    stateFile: "boardState.ts",
    description:
      "If you have 6 fire threshold — May transform into a Demon with 6 strength. Place Rubble underneath.",
  },
];

/**
 * Get all resolver IDs as a simple array.
 */
export function getAllResolverIds(): string[] {
  return RESOLVER_REGISTRY.map((r) => r.id);
}

/**
 * Get resolvers by category.
 */
export function getResolversByCategory(
  category: ResolverCategory,
): ResolverEntry[] {
  return RESOLVER_REGISTRY.filter((r) => r.category === category);
}

/**
 * Check if a resolver exists by ID.
 */
export function hasResolver(id: string): boolean {
  return RESOLVER_REGISTRY.some((r) => r.id === id);
}

/**
 * Get resolver count for display.
 */
export function getResolverCount(): number {
  return RESOLVER_REGISTRY.length;
}

/**
 * Check if a card name has a custom resolver.
 * Used to suppress magic guides for cards with special resolution UI.
 */
export function hasCustomResolver(
  cardName: string | null | undefined,
): boolean {
  if (!cardName) return false;
  const nameLower = cardName.toLowerCase();
  return RESOLVER_REGISTRY.some((r) => {
    // Handle multi-name entries like "Headless Haunt / Hauntless Head"
    const names = r.cardName.toLowerCase().split(/\s*\/\s*/);
    return names.some((n) => nameLower.includes(n) || n.includes(nameLower));
  });
}

/**
 * Get list of card names that have custom resolvers (for spell/minion categories only).
 * Avatar abilities are excluded as they don't go through magic cast flow.
 */
export function getSpellAndMinionResolverNames(): string[] {
  return RESOLVER_REGISTRY.filter(
    (r) => r.category === "spell" || r.category === "minion",
  ).map((r) => r.cardName);
}
