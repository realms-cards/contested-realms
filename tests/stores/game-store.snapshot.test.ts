import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";

describe("Game store snapshot hardening", () => {
  beforeEach(() => {
    const state = useGameStore.getState();
    state.resetGameState();
  });

  it("normalizes partial zone data in snapshot patches", () => {
    const { applyServerPatch } = useGameStore.getState();

    const card: CardRef = {
      cardId: 1,
      name: "Test Spell",
      type: "Spell",
      slug: "test-spell",
    };

    applyServerPatch({
      __replaceKeys: ["zones"],
      zones: {
        p1: {
          hand: [card],
        },
      },
    });

    const state = useGameStore.getState();
    expect(state.zones.p1.hand).toHaveLength(1);
    expect(state.zones.p1.spellbook).toEqual([]);
    expect(state.zones.p1.atlas).toEqual([]);
    expect(state.zones.p2.hand).toEqual([]);
    expect(state.zones.p2.spellbook).toEqual([]);
  });

  it("fills avatars and player positions when snapshot omits seats", () => {
    const { applyServerPatch } = useGameStore.getState();

    applyServerPatch({
      __replaceKeys: ["avatars", "playerPositions"],
      avatars: {
        p1: {
          pos: [2, 3],
        },
      },
      playerPositions: {
        p2: {
          position: { x: 5, z: -3 },
        },
      },
    });

    const state = useGameStore.getState();
    expect(state.avatars.p1.pos).toEqual([2, 3]);
    expect(state.avatars.p1.tapped).toBe(false);
    expect(state.avatars.p2.card).toBeNull();
    expect(state.avatars.p2.pos).toBeNull();

    expect(state.playerPositions.p1.playerId).toBe(1);
    expect(state.playerPositions.p1.position).toEqual({ x: 0, z: 0 });
    expect(state.playerPositions.p2.playerId).toBe(2);
    expect(state.playerPositions.p2.position).toEqual({ x: 5, z: -3 });
  });
});
