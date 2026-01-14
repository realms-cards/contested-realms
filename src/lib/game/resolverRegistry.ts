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
    id: "headlessHaunt",
    cardName: "Headless Haunt / Hauntless Head",
    category: "minion",
    stateFile: "headlessHauntState.ts",
    description: "Auto-move to random tile at start of turn",
  },
  {
    id: "lilith",
    cardName: "Lilith",
    category: "minion",
    stateFile: "lilithState.ts",
    description: "Special demon summoning mechanics",
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
  category: ResolverCategory
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
