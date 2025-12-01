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
export type AvatarAbility = "harbinger" | "dragonlord" | null;

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
 * Get the primary ability type for an avatar by name
 * Returns null if no special ability detected
 */
export function getAvatarAbility(
  avatarName: string | null | undefined
): AvatarAbility {
  if (!avatarName) return null;
  const name = avatarName.toLowerCase();

  if (name.includes("harbinger")) return "harbinger";
  if (name.includes("dragonlord")) return "dragonlord";

  return null;
}

/**
 * Get the ability type from an avatar state object
 */
export function getAvatarAbilityFromState(
  avatarState: AvatarState | null | undefined
): AvatarAbility {
  return getAvatarAbility(avatarState?.card?.name);
}

/**
 * Check if an avatar state represents a Harbinger
 */
export function isAvatarHarbinger(
  avatarState: AvatarState | null | undefined
): boolean {
  return isHarbinger(avatarState?.card?.name);
}

/**
 * Detect which players have Harbinger avatars
 * Returns array of PlayerKeys for players with Harbinger
 */
export function detectHarbingerSeats(
  avatars: Record<PlayerKey, AvatarState>
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
  avatars: Record<PlayerKey, AvatarState>
): boolean {
  return detectHarbingerSeats(avatars).length > 0;
}

/**
 * Get avatar display info for ability UI
 */
export function getAvatarAbilityInfo(
  avatarState: AvatarState | null | undefined
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
    // Harbinger has special setup (portal rolls)
    hasSpecialSetup: ability === "harbinger",
  };
}
