"use strict";

import type { AnyRecord, MatchPatch } from "../types";

type PlayerKey = "p1" | "p2";

interface TurnTracking {
  p1: number;
  p2: number;
}

interface Avatar {
  card: unknown;
  tapped?: boolean;
}

interface Avatars {
  p1: Avatar;
  p2: Avatar;
}

interface Resource {
  spentThisTurn?: number;
}

interface Resources {
  p1?: Resource;
  p2?: Resource;
}

interface Permanent {
  owner: 1 | 2;
  tapped?: boolean;
  summonedThisTurn?: boolean;
}

interface Permanents {
  [cellKey: string]: Permanent[];
}

interface GameState {
  currentPlayer?: number;
  turn?: number;
  turnTracking?: TurnTracking;
  permanents?: Permanents;
  avatars?: Avatars;
  resources?: Resources;
}

/**
 * Compute a patch to apply at the start of the turn for the current player in `game`.
 * Untaps sites, permanents, and avatar of the current player.
 * Clears summoning sickness (summonedThisTurn) for permanents owned by current player.
 * @param game - current or simulated next game state (must contain currentPlayer)
 * @returns partial patch to merge, or null if none
 */
export function applyTurnStart(game: AnyRecord): MatchPatch | null {
  try {
    const g = game as GameState;
    const cp = Number(g?.currentPlayer);
    if (!(cp === 1 || cp === 2)) return null;

    // Track turn numbers per player to detect actual turn changes
    // CRITICAL FIX: Only untap when the turn actually increments for this player
    const turnTracking: TurnTracking = g.turnTracking || { p1: 0, p2: 0 };
    const playerKey: PlayerKey = cp === 1 ? "p1" : "p2";
    const currentTurn = g.turn || 1;
    const lastTurnForPlayer = turnTracking[playerKey] || 0;

    // If this player's turn number hasn't increased, don't untap
    // This prevents untapping on every single patch (which was breaking tap state)
    if (currentTurn <= lastTurnForPlayer) {
      return null;
    }

    // Turn has incremented for this player - proceed with untap
    const updatedTurnTracking: TurnTracking = {
      ...turnTracking,
      [playerKey]: currentTurn,
    };

    // Untap permanents owned by current player AND clear summoning sickness
    const permsPrev = g.permanents || {};
    const permanents: Record<string, unknown[]> = {};
    for (const cellKey of Object.keys(permsPrev)) {
      const arr = Array.isArray(permsPrev[cellKey]) ? permsPrev[cellKey] : [];
      permanents[cellKey] = arr.map((p) => {
        try {
          if (Number((p as Permanent).owner) === cp) {
            // Untap and clear summoning sickness flag
            const updated = { ...p, tapped: false } as Record<string, unknown>;
            // Remove summonedThisTurn flag (if present)
            delete updated.summonedThisTurn;
            return updated;
          }
          return p;
        } catch {
          return p;
        }
      });
    }

    // Untap avatar of current player
    const avatarsPrev: Avatars = g.avatars || {
      p1: { card: null },
      p2: { card: null },
    };
    const avatars: Avatars = { ...avatarsPrev };
    const nextKey: PlayerKey = cp === 1 ? "p1" : "p2";
    avatars[nextKey] = { ...(avatars[nextKey] || {}), tapped: false };

    // Reset per-turn spend for current player (sites do not tap in Sorcery)
    const resPrev: Resources = g.resources || {};
    const meKey: PlayerKey = cp === 1 ? "p1" : "p2";
    const meResPrev = resPrev[meKey] || {};
    const meRes = { ...meResPrev, spentThisTurn: 0 };
    const resources: Resources = { ...resPrev, [meKey]: meRes };

    // Do not modify board.sites at turn start (sites do not tap)
    return {
      permanents,
      avatars,
      resources,
      turnTracking: updatedTurnTracking,
    } as MatchPatch;
  } catch {
    return null;
  }
}
