import { describe, it, expect } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { PermanentItem } from "@/lib/game/store";

describe("permanentState slices", () => {
  it("setTapPermanent toggles tapped state", () => {
    const store = createGameStore();
    store.setState({
      permanents: {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 1, name: "Test", type: "Unit" },
            tapped: false,
            version: 0,
          } as PermanentItem,
        ],
      },
    });

    store.getState().setTapPermanent("0,0", 0, true);
    expect(store.getState().permanents["0,0"][0].tapped).toBe(true);
  });

  it("applyDamageToPermanent accumulates damage", () => {
    const store = createGameStore();
    store.setState({
      permanents: {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 1, name: "Test", type: "Unit" },
            damage: 1,
            version: 0,
          } as PermanentItem,
        ],
      },
    });

    store.getState().applyDamageToPermanent("0,0", 0, 2);
    expect(store.getState().permanents["0,0"][0].damage).toBe(3);
  });

  it("attachTokenToTopPermanent attaches to latest non-token", () => {
    const store = createGameStore();
    store.setState({
      permanents: {
        "0,0": [
          {
            owner: 1,
            card: { cardId: 1, name: "Unit", type: "Unit" },
            tapped: false,
            version: 0,
          } as PermanentItem,
          {
            owner: 1,
            card: { cardId: 2, name: "Token", type: "Token" },
            version: 0,
          } as PermanentItem,
        ],
      },
    });

    store.getState().attachTokenToTopPermanent("0,0", 1);
    expect(store.getState().permanents["0,0"][1].attachedTo).toEqual({
      at: "0,0",
      index: 0,
    });
  });
});
