/**
 * Avatar Abilities Detection
 *
 * Detects avatar-specific abilities by name matching.
 * This allows abilities to work before cards exist in the database.
 */

import type { PlayerKey, AvatarState } from "./store/types";

/**
 * Known avatar ability types
 */
export type AvatarAbility =
  | "harbinger"
  | "dragonlord"
  | "elementalist"
  | "magician"
  | "duplicator"
  | "imposter"
  | "necromancer"
  | "druid"
  | "templar"
  | "animist"
  | "interrogator"
  | "mephistopheles"
  | "pathfinder"
  | "savior"
  | "geomancer"
  | null;

/**
 * Check if an avatar name indicates Harbinger (Gothic expansion)
 * Uses case-insensitive matching
 */
export function isHarbinger(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("harbinger");
}

/**
 * Check if an avatar name indicates Dragonlord
 * Uses case-insensitive matching
 */
export function isDragonlord(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("dragonlord");
}

/**
 * Check if an avatar name indicates Elementalist
 * Uses case-insensitive matching
 * Elementalist grants +1 to each threshold (air, water, earth, fire)
 */
export function isElementalist(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("elementalist");
}

/**
 * Check if an avatar name indicates Magician
 * Uses case-insensitive matching
 * Magician: No atlas, spellbook may contain sites, starts with 7 cards
 */
export function isMagician(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("magician");
}

/**
 * Check if an avatar name indicates Duplicator
 * Uses case-insensitive matching
 * Duplicator: Spellbook and atlas can only contain matching pairs of Uniques
 * Starts with 2 spells and 2 sites in hand
 */
export function isDuplicator(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("duplicator");
}

/**
 * Check if an avatar name indicates Imposter
 * Uses case-insensitive matching
 * Imposter: Can "mask" by banishing an Avatar from collection to gain their abilities.
 * Collection may contain extra avatars for masking.
 */
export function isImposter(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("imposter");
}

/**
 * Check if an avatar name indicates Necromancer
 * Uses case-insensitive matching
 * Necromancer: Once on your turn, you may pay (1) to summon a Skeleton token here.
 */
export function isNecromancer(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("necromancer");
}

/**
 * Check if an avatar name indicates Druid (Arthurian Legends)
 * Uses case-insensitive matching
 * Druid: Tap → Flip this card. Bruin comes to board here. Cannot flip back.
 */
export function isDruid(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("druid");
}

export function isTemplar(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("templar");
}

/**
 * Check if an avatar name indicates Animist (Gothic expansion)
 * Uses case-insensitive matching
 * Animist: Can cast any magic as a spirit with its mana cost for power.
 */
export function isAnimist(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("animist");
}

/**
 * Check if an avatar name indicates Interrogator (Gothic expansion)
 * Uses case-insensitive matching
 * Interrogator: Whenever an ally strikes an enemy Avatar, draw a spell unless they pay 3 life.
 */
export function isInterrogator(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("interrogator");
}

/**
 * Check if an avatar name indicates Mephistopheles (Gothic expansion)
 * Uses case-insensitive matching
 * Mephistopheles: Cast to Avatar's location to replace them. Once per turn, summon Evil minion to adjacent site.
 */
export function isMephistopheles(
  avatarName: string | null | undefined,
): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("mephistopheles");
}

/**
 * Check if an avatar name indicates Pathfinder
 * Uses case-insensitive matching
 * Pathfinder: Atlas can't contain duplicates. Draw no sites during setup.
 * Tap → Reveal and play the topmost site of your atlas to an adjacent void or Rubble and move there.
 */
export function isPathfinder(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("pathfinder");
}

/**
 * Check if an avatar name indicates Geomancer
 * Uses case-insensitive matching
 * Geomancer: Tap → Play or draw a site. If you played an earth site, fill a void adjacent to you with Rubble.
 * Tap → Replace an adjacent Rubble with the topmost site of your atlas.
 */
export function isGeomancer(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("geomancer");
}

/**
 * Check if an avatar name indicates Savior (Gothic expansion)
 * Uses case-insensitive matching
 * Savior: Pay (1) to ward a minion that entered the realm this turn.
 */
export function isSavior(avatarName: string | null | undefined): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("savior");
}

/**
 * Check if an avatar has the "Tap → Play or draw a site" ability.
 * Most avatars have this standard ability, but some special avatars do not:
 * - Magician: No atlas (all cards in spellbook, including sites)
 * - Pathfinder: Has a unique "Tap → Play site and move there" ability instead
 */
export function hasTapToDrawSite(
  avatarName: string | null | undefined,
): boolean {
  if (!avatarName) return false;
  // Magician doesn't have atlas - sites are in spellbook
  if (isMagician(avatarName)) return false;
  // Pathfinder has a unique ability: Tap → Play topmost site to adjacent void/Rubble and move there
  if (isPathfinder(avatarName)) return false;
  // All other avatars have the standard tap-to-draw-site ability
  return true;
}

/**
 * Get the primary ability type for an avatar by name
 * Returns null if no special ability detected
 */
export function getAvatarAbility(
  avatarName: string | null | undefined,
): AvatarAbility {
  if (!avatarName) return null;
  const name = avatarName.toLowerCase();

  if (name.includes("harbinger")) return "harbinger";
  if (name.includes("dragonlord")) return "dragonlord";
  if (name.includes("elementalist")) return "elementalist";
  if (name.includes("magician")) return "magician";
  if (name.includes("duplicator")) return "duplicator";
  if (name.includes("imposter")) return "imposter";
  if (name.includes("necromancer")) return "necromancer";
  if (name.includes("druid")) return "druid";
  if (name.includes("templar")) return "templar";
  if (name.includes("animist")) return "animist";
  if (name.includes("interrogator")) return "interrogator";
  if (name.includes("mephistopheles")) return "mephistopheles";
  if (name.includes("pathfinder")) return "pathfinder";
  if (name.includes("geomancer")) return "geomancer";
  if (name.includes("savior")) return "savior";

  return null;
}

/**
 * Get the ability type from an avatar state object
 */
export function getAvatarAbilityFromState(
  avatarState: AvatarState | null | undefined,
): AvatarAbility {
  return getAvatarAbility(avatarState?.card?.name);
}

/**
 * Check if an avatar state represents a Harbinger
 */
export function isAvatarHarbinger(
  avatarState: AvatarState | null | undefined,
): boolean {
  return isHarbinger(avatarState?.card?.name);
}

/**
 * Detect which players have Harbinger avatars
 * Returns array of PlayerKeys for players with Harbinger
 */
export function detectHarbingerSeats(
  avatars: Record<PlayerKey, AvatarState>,
): PlayerKey[] {
  const harbingerSeats: PlayerKey[] = [];

  if (isAvatarHarbinger(avatars.p1)) {
    harbingerSeats.push("p1");
  }
  if (isAvatarHarbinger(avatars.p2)) {
    harbingerSeats.push("p2");
  }

  return harbingerSeats;
}

/**
 * Check if any player has a Harbinger avatar
 */
export function hasAnyHarbinger(
  avatars: Record<PlayerKey, AvatarState>,
): boolean {
  return detectHarbingerSeats(avatars).length > 0;
}

/**
 * Get avatar display info for ability UI
 */
export function getAvatarAbilityInfo(
  avatarState: AvatarState | null | undefined,
): {
  name: string;
  ability: AvatarAbility;
  hasSpecialSetup: boolean;
} {
  const name = avatarState?.card?.name ?? "Unknown Avatar";
  const ability = getAvatarAbilityFromState(avatarState);

  return {
    name,
    ability,
    // These avatars have special setup requirements
    hasSpecialSetup:
      ability === "harbinger" ||
      ability === "magician" ||
      ability === "duplicator" ||
      ability === "imposter",
  };
}
