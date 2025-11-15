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

  it("addThreshold clamps at zero and logs the change", () => {
    const { store, cleanup } = createStoreInstance();
    store.setState((prev: GameState) => ({
      players: {
        ...prev.players,
        p1: {
          ...prev.players.p1,
          thresholds: { ...prev.players.p1.thresholds, air: 2 },
        },
      },
    }));
    const state = store.getState();
    const patchSpy = vi.spyOn(state, "trySendPatch").mockReturnValue(true);
    const logSpy = vi.spyOn(state, "log");

    state.addThreshold("p1", "air", -5);

    expect(store.getState().players.p1.thresholds.air).toBe(0);
    expect(patchSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/P1.*loses/i)
    );
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
    const manaPermanent: PermanentItem = {
      owner: 1,
      card: {
        cardId: 99,
        name: "Amethyst Core",
        type: "Artifact",
      },
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
        "0,0": [manaPermanent],
      },
      players: {
        ...prev.players,
        p1: { ...prev.players.p1, mana: 2 },
      },
    }));

    const state = store.getState();
    const ownedSites = state.getPlayerSites("p1");

    expect(ownedSites).toHaveLength(2);
    expect(state.getUntappedSitesCount("p1")).toBe(1);
    expect(state.getAvailableMana("p1")).toBe(4);

    const thresholds = state.getThresholdTotals("p1");
    expect(thresholds.air).toBeGreaterThanOrEqual(1);
    const cached = state.getThresholdTotals("p1");
    expect(cached).toBe(thresholds); // cached result should be reused
    cleanup();
  });
});
