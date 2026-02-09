/**
 * Boudicca — Passive Aura
 *
 * "Other allies have +3 power while successfully attacking sites."
 *
 * This is a combat modifier, not an interactive resolver.
 * When Boudicca is on the board and an ally (same owner, NOT Boudicca herself)
 * attacks a site, that ally gets +3 power for the combat.
 */

import type { CellKey, Permanents } from "./types";

export const BOUDICCA_POWER_BONUS = 3;

/**
 * Check if a card name is Boudicca (case-insensitive exact match).
 */
export function isBoudicca(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.toLowerCase().trim() === "boudicca";
}

/**
 * Check if a permanent at (cellKey, index) has a Silenced or Disabled attachment.
 * Used to determine if Boudicca's aura is suppressed.
 */
export function isPermanentSilenced(
  permanents: Permanents,
  cellKey: CellKey,
  index: number,
): boolean {
  const list = permanents[cellKey];
  if (!list) return false;
  for (const p of list) {
    if (
      p.attachedTo &&
      p.attachedTo.at === cellKey &&
      p.attachedTo.index === index
    ) {
      const nm = (p.card?.name || "").toLowerCase();
      if (nm === "silenced" || nm === "disabled") return true;
    }
  }
  return false;
}

/**
 * Scan the board for a Boudicca permanent owned by `attackerOwner`.
 * Returns true if at least one Boudicca exists on the board for that owner,
 * excluding the permanent at (attackerAt, attackerIndex) — Boudicca
 * does not buff herself.
 */
export function hasBoudiccaAlly(
  permanents: Permanents,
  attackerOwner: 1 | 2,
  attackerAt: CellKey,
  attackerIndex: number,
): boolean {
  for (const cellKey of Object.keys(permanents)) {
    const list = permanents[cellKey as CellKey];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const perm = list[i];
      if (perm.owner !== attackerOwner) continue;
      // Skip the attacker itself
      if (cellKey === attackerAt && i === attackerIndex) continue;
      // Skip attachments (artifacts attached to something)
      if (perm.attachedTo) continue;
      if (isBoudicca(perm.card?.name)) {
        // Skip if this Boudicca is silenced/disabled
        if (isPermanentSilenced(permanents, cellKey as CellKey, i)) continue;
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute the Boudicca power bonus for an attacker.
 *
 * Returns BOUDICCA_POWER_BONUS (+3) if:
 *   1. The attack targets a site (isAttackingSite = true)
 *   2. The attacker is NOT Boudicca herself
 *   3. A friendly Boudicca exists on the board
 *   4. Resolvers are not disabled
 *
 * Otherwise returns 0.
 */
export function getBoudiccaBonus(opts: {
  permanents: Permanents;
  attackerOwner: 1 | 2;
  attackerAt: CellKey;
  attackerIndex: number;
  attackerName: string | null | undefined;
  isAttackingSite: boolean;
  resolversDisabled: boolean;
}): number {
  if (opts.resolversDisabled) return 0;
  if (!opts.isAttackingSite) return 0;
  // Boudicca doesn't buff herself
  if (isBoudicca(opts.attackerName)) return 0;
  if (
    hasBoudiccaAlly(
      opts.permanents,
      opts.attackerOwner,
      opts.attackerAt,
      opts.attackerIndex,
    )
  ) {
    return BOUDICCA_POWER_BONUS;
  }
  return 0;
}

/**
 * Variant for avatar attackers (avatars are not in permanents array).
 * Checks if Boudicca is on the board for the avatar's owner.
 */
export function getBoudiccaBonusForAvatar(opts: {
  permanents: Permanents;
  avatarOwner: 1 | 2;
  isAttackingSite: boolean;
  resolversDisabled: boolean;
}): number {
  if (opts.resolversDisabled) return 0;
  if (!opts.isAttackingSite) return 0;
  // Scan all permanents for a Boudicca owned by this player
  for (const cellKey of Object.keys(opts.permanents)) {
    const list = opts.permanents[cellKey as CellKey];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const perm = list[i];
      if (perm.owner !== opts.avatarOwner) continue;
      if (perm.attachedTo) continue;
      if (isBoudicca(perm.card?.name)) {
        // Skip if this Boudicca is silenced/disabled
        if (isPermanentSilenced(opts.permanents, cellKey as CellKey, i))
          continue;
        return BOUDICCA_POWER_BONUS;
      }
    }
  }
  return 0;
}

/**
 * Determine if the current combat is targeting a site.
 * Considers both explicit site targets and implicit site-at-tile fallbacks.
 */
export function isTargetingSite(
  target:
    | { kind: string; at: CellKey; index: number | null }
    | null
    | undefined,
  siteAtTile: { card?: unknown } | null | undefined,
  defendersLength: number,
): boolean {
  // Explicit site target
  if (target?.kind === "site") return true;
  // Implicit: no target but there's a site at the tile with no defenders
  if (
    !target &&
    siteAtTile &&
    (siteAtTile as { card?: unknown }).card &&
    defendersLength === 0
  ) {
    return true;
  }
  return false;
}
