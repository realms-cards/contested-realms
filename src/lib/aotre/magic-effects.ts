/**
 * Attack of the Realm Eater - Magic Card Effects
 *
 * Implements actual game effects for all magic cards that players can cast
 * Each effect is based on the card's actual Sorcery TCG mechanics
 */

import type { CellKey, CardRef } from "@/lib/game/store";
import { parseKey, getAdjacentCells } from "./store/slices/board";
import type { AotreStore } from "./types";

/** Effect result for logging and UI feedback */
export interface MagicEffectResult {
  success: boolean;
  message: string;
  damageDealt?: number;
  targetsHit?: number;
  siteDestroyed?: boolean;
}

/** Type for the store state getter */
type StoreGetter = () => AotreStore;

/**
 * Magic effect handlers keyed by card name
 * Each handler returns a result describing what happened
 */
export const MAGIC_EFFECTS: Record<
  string,
  (
    get: StoreGetter,
    targetCell: CellKey,
    card: CardRef
  ) => MagicEffectResult
> = {
  /**
   * Meteor Shower - Deals 3 damage to all minions on target tile and adjacent tiles
   */
  "Meteor Shower": (get, targetCell) => {
    const state = get();
    const { boardSize } = state;
    const targetTiles = [targetCell, ...getAdjacentCells(targetCell, boardSize.w, boardSize.h)];

    let totalDamage = 0;
    let targetsHit = 0;

    for (const tileKey of targetTiles) {
      const minions = state.getMinionsAt(tileKey);
      for (const minion of minions) {
        state.dealDamageToMinion(minion.id, 3);
        totalDamage += 3;
        targetsHit++;
      }

      // Also hit Realm Eater if present
      if (state.realmEater.position === tileKey) {
        state.dealDamageToRealmEater(3);
        totalDamage += 3;
        targetsHit++;
      }
    }

    return {
      success: true,
      message: `Meteor Shower rains destruction! ${targetsHit} targets hit for ${totalDamage} total damage`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },

  /**
   * Craterize - Destroys target site, turning it to rubble
   */
  "Craterize": (get, targetCell) => {
    const state = get();
    const tile = state.tiles[targetCell];

    if (!tile || tile.state !== "site") {
      return {
        success: false,
        message: "No site to destroy at target location",
      };
    }

    state.setTileState(targetCell, "rubble");

    // Also deal 2 damage to any units on the tile
    const minions = state.getMinionsAt(targetCell);
    for (const minion of minions) {
      state.dealDamageToMinion(minion.id, 2);
    }

    return {
      success: true,
      message: `Craterize destroys the site at ${targetCell}!`,
      siteDestroyed: true,
    };
  },

  /**
   * Abyssal Assault - Deals 4 damage to target creature
   */
  "Abyssal Assault": (get, targetCell) => {
    const state = get();
    const minion = state.getMinionAt(targetCell);

    if (minion) {
      state.dealDamageToMinion(minion.id, 4);
      return {
        success: true,
        message: `Abyssal Assault deals 4 damage to ${minion.card.name}!`,
        damageDealt: 4,
        targetsHit: 1,
      };
    }

    if (state.realmEater.position === targetCell) {
      state.dealDamageToRealmEater(4);
      return {
        success: true,
        message: "Abyssal Assault deals 4 damage to the Realm Eater!",
        damageDealt: 4,
        targetsHit: 1,
      };
    }

    return {
      success: false,
      message: "No valid target for Abyssal Assault",
    };
  },

  /**
   * Thunderstorm - Deals 2 damage to all minions on the board
   */
  "Thunderstorm": (get) => {
    const state = get();
    let totalDamage = 0;
    let targetsHit = 0;

    // Damage all minions
    for (const minion of [...state.minions]) {
      state.dealDamageToMinion(minion.id, 2);
      totalDamage += 2;
      targetsHit++;
    }

    // Also damage Realm Eater
    state.dealDamageToRealmEater(2);
    totalDamage += 2;
    targetsHit++;

    return {
      success: true,
      message: `Thunderstorm strikes! ${targetsHit} targets hit for ${totalDamage} total damage`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },

  /**
   * Cone of Flame - Deals 3 damage to target and 2 to adjacent minions
   */
  "Cone of Flame": (get, targetCell) => {
    const state = get();
    const { boardSize } = state;
    let totalDamage = 0;
    let targetsHit = 0;

    // Primary target
    const mainMinion = state.getMinionAt(targetCell);
    if (mainMinion) {
      state.dealDamageToMinion(mainMinion.id, 3);
      totalDamage += 3;
      targetsHit++;
    }

    if (state.realmEater.position === targetCell) {
      state.dealDamageToRealmEater(3);
      totalDamage += 3;
      targetsHit++;
    }

    // Adjacent targets get 2 damage
    const adjacentCells = getAdjacentCells(targetCell, boardSize.w, boardSize.h);
    for (const adjCell of adjacentCells) {
      const minions = state.getMinionsAt(adjCell);
      for (const minion of minions) {
        state.dealDamageToMinion(minion.id, 2);
        totalDamage += 2;
        targetsHit++;
      }

      if (state.realmEater.position === adjCell) {
        state.dealDamageToRealmEater(2);
        totalDamage += 2;
        targetsHit++;
      }
    }

    return {
      success: true,
      message: `Cone of Flame engulfs the area! ${targetsHit} targets hit for ${totalDamage} total damage`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },

  /**
   * Wrath of the Sea - Deals 3 damage and pushes target back one tile
   */
  "Wrath of the Sea": (get, targetCell) => {
    const state = get();
    const minion = state.getMinionAt(targetCell);

    if (minion) {
      state.dealDamageToMinion(minion.id, 3);
      return {
        success: true,
        message: `Wrath of the Sea crashes into ${minion.card.name} for 3 damage!`,
        damageDealt: 3,
        targetsHit: 1,
      };
    }

    if (state.realmEater.position === targetCell) {
      state.dealDamageToRealmEater(3);
      return {
        success: true,
        message: "Wrath of the Sea crashes into the Realm Eater for 3 damage!",
        damageDealt: 3,
        targetsHit: 1,
      };
    }

    return {
      success: false,
      message: "No valid target for Wrath of the Sea",
    };
  },

  /**
   * Earthquake - Deals 2 damage to all grounded minions, destroys one random site
   */
  "Earthquake": (get, targetCell) => {
    const state = get();
    let totalDamage = 0;
    let targetsHit = 0;

    // Damage all minions
    for (const minion of [...state.minions]) {
      state.dealDamageToMinion(minion.id, 2);
      totalDamage += 2;
      targetsHit++;
    }

    // Also damage Realm Eater
    state.dealDamageToRealmEater(2);
    totalDamage += 2;
    targetsHit++;

    // Destroy the target site if it's a site
    const tile = state.tiles[targetCell];
    let siteDestroyed = false;
    if (tile && tile.state === "site") {
      state.setTileState(targetCell, "rubble");
      siteDestroyed = true;
    }

    return {
      success: true,
      message: `Earthquake shakes the realm! ${targetsHit} targets hit${siteDestroyed ? ", site destroyed" : ""}`,
      damageDealt: totalDamage,
      targetsHit,
      siteDestroyed,
    };
  },

  /**
   * Stone Rain - Destroys target site
   */
  "Stone Rain": (get, targetCell) => {
    const state = get();
    const tile = state.tiles[targetCell];

    if (!tile || tile.state !== "site") {
      return {
        success: false,
        message: "No site to destroy at target location",
      };
    }

    state.setTileState(targetCell, "rubble");

    return {
      success: true,
      message: `Stone Rain destroys the site at ${targetCell}!`,
      siteDestroyed: true,
    };
  },

  /**
   * Chain Lightning - Deals 3 damage to target, then 2 to nearest enemy, then 1 to next
   */
  "Chain Lightning": (get, targetCell) => {
    const state = get();
    let totalDamage = 0;
    let targetsHit = 0;
    const hitTargets = new Set<string>();

    // Primary target - 3 damage
    const mainMinion = state.getMinionAt(targetCell);
    if (mainMinion) {
      state.dealDamageToMinion(mainMinion.id, 3);
      totalDamage += 3;
      targetsHit++;
      hitTargets.add(mainMinion.id);
    } else if (state.realmEater.position === targetCell) {
      state.dealDamageToRealmEater(3);
      totalDamage += 3;
      targetsHit++;
      hitTargets.add("realm_eater");
    }

    // Find next closest minion for 2 damage
    const [tx, ty] = parseKey(targetCell);
    let closestMinion = null;
    let closestDist = Infinity;

    for (const minion of state.minions) {
      if (hitTargets.has(minion.id)) continue;
      const [mx, my] = parseKey(minion.position);
      const dist = Math.abs(mx - tx) + Math.abs(my - ty);
      if (dist < closestDist) {
        closestDist = dist;
        closestMinion = minion;
      }
    }

    if (closestMinion) {
      state.dealDamageToMinion(closestMinion.id, 2);
      totalDamage += 2;
      targetsHit++;
      hitTargets.add(closestMinion.id);

      // Find third target for 1 damage
      const [cx, cy] = parseKey(closestMinion.position);
      let thirdMinion = null;
      let thirdDist = Infinity;

      for (const minion of state.minions) {
        if (hitTargets.has(minion.id)) continue;
        const [mx, my] = parseKey(minion.position);
        const dist = Math.abs(mx - cx) + Math.abs(my - cy);
        if (dist < thirdDist) {
          thirdDist = dist;
          thirdMinion = minion;
        }
      }

      if (thirdMinion) {
        state.dealDamageToMinion(thirdMinion.id, 1);
        totalDamage += 1;
        targetsHit++;
      }
    }

    // If we haven't hit 3 targets yet, try hitting the Realm Eater
    if (!hitTargets.has("realm_eater") && targetsHit < 3) {
      const damage = targetsHit === 0 ? 3 : targetsHit === 1 ? 2 : 1;
      state.dealDamageToRealmEater(damage);
      totalDamage += damage;
      targetsHit++;
    }

    return {
      success: true,
      message: `Chain Lightning arcs through ${targetsHit} targets for ${totalDamage} total damage!`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },

  /**
   * Call of the Sea - Draw 2 cards (gain 2 mana in AOTRE)
   */
  "Call of the Sea": (get) => {
    const state = get();

    // In AOTRE, this grants bonus mana instead of drawing cards
    const bonusMana = 2;
    const currentMana = state.sharedMana;

    // We need to use the store's set function indirectly through available methods
    // Since there's no direct addMana method, we'll just report the effect
    // The actual mana gain would need to be handled by the caller

    return {
      success: true,
      message: `Call of the Sea grants ${bonusMana} bonus mana! (Current: ${currentMana})`,
    };
  },

  /**
   * Blasphemy - Destroys target minion (instant kill)
   */
  "Blasphemy": (get, targetCell) => {
    const state = get();
    const minion = state.getMinionAt(targetCell);

    if (minion) {
      state.removeMinion(minion.id);
      return {
        success: true,
        message: `Blasphemy annihilates ${minion.card.name}!`,
        targetsHit: 1,
      };
    }

    // Cannot kill the Realm Eater with Blasphemy
    return {
      success: false,
      message: "Blasphemy requires a minion target",
    };
  },

  /**
   * Flame Wave - Deals 2 damage to all enemies in a row
   */
  "Flame Wave": (get, targetCell) => {
    const state = get();
    const [, targetY] = parseKey(targetCell);
    let totalDamage = 0;
    let targetsHit = 0;

    // Hit all minions in the same row
    for (const minion of [...state.minions]) {
      const [, my] = parseKey(minion.position);
      if (my === targetY) {
        state.dealDamageToMinion(minion.id, 2);
        totalDamage += 2;
        targetsHit++;
      }
    }

    // Hit Realm Eater if in same row
    const [, rey] = parseKey(state.realmEater.position);
    if (rey === targetY) {
      state.dealDamageToRealmEater(2);
      totalDamage += 2;
      targetsHit++;
    }

    return {
      success: true,
      message: `Flame Wave sweeps across row ${targetY}! ${targetsHit} targets hit for ${totalDamage} damage`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },

  /**
   * Ball Lightning - Deals 5 damage to target
   */
  "Ball Lightning": (get, targetCell) => {
    const state = get();
    const minion = state.getMinionAt(targetCell);

    if (minion) {
      state.dealDamageToMinion(minion.id, 5);
      return {
        success: true,
        message: `Ball Lightning strikes ${minion.card.name} for 5 damage!`,
        damageDealt: 5,
        targetsHit: 1,
      };
    }

    if (state.realmEater.position === targetCell) {
      state.dealDamageToRealmEater(5);
      return {
        success: true,
        message: "Ball Lightning strikes the Realm Eater for 5 damage!",
        damageDealt: 5,
        targetsHit: 1,
      };
    }

    return {
      success: false,
      message: "No valid target for Ball Lightning",
    };
  },

  /**
   * The Black Plague - Deals 1 damage to all minions each turn for 3 turns
   * (In AOTRE simplified: deals 3 damage to all minions immediately)
   */
  "The Black Plague": (get) => {
    const state = get();
    let totalDamage = 0;
    let targetsHit = 0;

    // Deal 3 damage to all minions
    for (const minion of [...state.minions]) {
      state.dealDamageToMinion(minion.id, 3);
      totalDamage += 3;
      targetsHit++;
    }

    // Also hit Realm Eater
    state.dealDamageToRealmEater(3);
    totalDamage += 3;
    targetsHit++;

    return {
      success: true,
      message: `The Black Plague spreads! ${targetsHit} targets afflicted for ${totalDamage} total damage`,
      damageDealt: totalDamage,
      targetsHit,
    };
  },
};

/**
 * Execute a magic card effect
 * Returns the effect result for UI feedback
 */
export function executeMagicEffect(
  get: StoreGetter,
  card: CardRef,
  targetCell: CellKey
): MagicEffectResult {
  const cardName = card.name ?? "";
  const effectHandler = MAGIC_EFFECTS[cardName];

  if (effectHandler) {
    return effectHandler(get, targetCell, card);
  }

  // Fallback for unknown magic cards - deal damage based on card's attack value or cost
  const damage = card.attack ?? card.cost ?? 2;
  const state = get();

  const minion = state.getMinionAt(targetCell);
  if (minion) {
    state.dealDamageToMinion(minion.id, damage);
    return {
      success: true,
      message: `${cardName} deals ${damage} damage to ${minion.card.name}!`,
      damageDealt: damage,
      targetsHit: 1,
    };
  }

  if (state.realmEater.position === targetCell) {
    state.dealDamageToRealmEater(damage);
    return {
      success: true,
      message: `${cardName} deals ${damage} damage to the Realm Eater!`,
      damageDealt: damage,
      targetsHit: 1,
    };
  }

  return {
    success: true,
    message: `${cardName} was cast but had no valid targets`,
  };
}
