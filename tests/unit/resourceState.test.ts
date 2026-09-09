import { describe, it, expect, vi } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { GameState, PermanentItem } from "@/lib/game/store/types";

const createStoreInstance = () => {
  const store = createGameStore();
  const cleanup = () => {
    store.destroy?.();
  };
  return { store, cleanup };
};

describe("resourceState slice", () => {
  it("addMana adjusts mana and sends a patch", () => {
    const { store, cleanup } = createStoreInstance();
    const state = store.getState();
    const patchSpy = vi.spyOn(state, "trySendPatch").mockReturnValue(true);

    state.addMana("p1", 3);

    expect(store.getState().players.p1.mana).toBe(3);
    expect(patchSpy).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("derives mana and thresholds from board, permanents, and player mana", () => {
    const { store, cleanup } = createStoreInstance();
    const manaSiteCard = {
      cardId: 1,
      name: "Sanctum of Light",
      type: "Site",
    };
    const tappedSiteCard = {
      cardId: 2,
      name: "Ruined Keep",
      type: "Site",
    };
    const otherSeatSiteCard = {
      cardId: 3,
      name: "Opposing Fort",
      type: "Site",
    };
    const bearer: PermanentItem = {
      owner: 1,
      card: {
        cardId: 98,
        name: "Knight",
        type: "Minion",
      },
    };
    const manaPermanent: PermanentItem = {
      owner: 1,
      card: {
        cardId: 99,
        name: "Amethyst Core",
        type: "Artifact",
      },
      instanceId: "core-1",
      attachedTo: { at: "0,0", index: 0 },
      enteredOnTurn: 1,
    };

    store.setState((prev: GameState) => ({
      board: {
        ...prev.board,
        sites: {
          "0,0": { owner: 1, tapped: false, card: manaSiteCard },
          "1,0": { owner: 1, tapped: true, card: tappedSiteCard },
          "2,0": { owner: 2, tapped: false, card: otherSeatSiteCard },
        },
      },
      permanents: {
        "0,0": [bearer, manaPermanent],
      },
      turn: 1,
      players: {
        ...prev.players,
        p1: { ...prev.players.p1, mana: 2 },
      },
    }));

    const state = store.getState();
    const ownedSites = state.getPlayerSites("p1");

    expect(ownedSites).toHaveLength(2);
    // Sites never tap in Sorcery: both owned sites count, plus the carried
    // core summoned this turn, plus the +2 ledger offset.
    expect(state.getAvailableMana("p1")).toBe(5);

    const thresholds = state.getThresholdTotals("p1");
    expect(thresholds.air).toBeGreaterThanOrEqual(1);
    const cached = state.getThresholdTotals("p1");
    expect(cached).toBe(thresholds); // cached result should be reused
    cleanup();
  });
});
