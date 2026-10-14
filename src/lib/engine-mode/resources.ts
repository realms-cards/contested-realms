import { affinity } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";

export type ThresholdElement = "air" | "water" | "earth" | "fire";

/** Same element order, icons and hues as the regular PlayerResourcePanels / Threshold3D. */
export const THRESHOLD_ELEMENTS: readonly { key: ThresholdElement; icon: string; color: string }[] = [
  { key: "air", icon: "/air.png", color: "#93c5fd" },
  { key: "water", icon: "/water.png", color: "#67e8f9" },
  { key: "earth", icon: "/earth.png", color: "#f59e0b" },
  { key: "fire", icon: "/fire.png", color: "#f87171" },
];

/** One seat's public resources, straight from the rules engine. */
export interface EngineSeatResources {
  /** mana still in the pool */
  mana: number;
  /** pool plus what was spent this turn: the "a/b" readout's b */
  total: number;
  thresholds: Record<ThresholdElement, number>;
  handCount: number;
  spellbook: number;
  atlas: number;
  cemetery: number;
}

/**
 * Mana, thresholds and pile sizes for a seat. `affinity()` is the same function casting checks
 * use and mana is the engine's own pool (plus flow.manaSpent for the total), so what you see is
 * exactly what you can pay — our computeThresholdTotals misses Drought/Avalon/unit bonuses.
 */
export function engineSeatResources(game: EngineState, seat: PlayerId): EngineSeatResources {
  const player = game.players[seat];
  const thresholds = affinity(game, seat);
  const spent = (game.flow as { manaSpent?: Record<number, number> } | undefined)?.manaSpent?.[seat] ?? 0;
  return {
    mana: player.mana,
    total: player.mana + spent,
    thresholds: {
      air: thresholds.air ?? 0,
      water: thresholds.water ?? 0,
      earth: thresholds.earth ?? 0,
      fire: thresholds.fire ?? 0,
    },
    handCount: player.hand.length,
    spellbook: player.spellbook.length,
    atlas: player.atlas.length,
    cemetery: player.cemetery.length,
  };
}

/** The mana readout's colour: red when empty, amber once some is spent, parchment when full. */
export function manaColor({ mana, total }: Pick<EngineSeatResources, "mana" | "total">): string {
  return mana === 0 ? "#ef4444" : mana < total ? "#fbbf24" : "#fbf6e8";
}
