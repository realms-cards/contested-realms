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

  it("movePermanentToZone sends attachments to graveyard", () => {
    const store = createGameStore();
    // Set up initial zones
    store.setState({
      zones: {
        p1: {
          hand: [],
          spellbook: [],
          atlas: [],
          graveyard: [],
          banished: [],
          collection: [],
          battlefield: [],
        },
        p2: {
          hand: [],
          spellbook: [],
          atlas: [],
          graveyard: [],
          banished: [],
          collection: [],
          battlefield: [],
        },
      },
      permanents: {
        "0,0": [
          {
            owner: 1,
            card: {
              cardId: 1,
              name: "Knight",
              type: "Unit",
              instanceId: "knight-1",
            },
            instanceId: "knight-1",
            tapped: false,
            version: 0,
          } as PermanentItem,
          {
            owner: 1,
            card: {
              cardId: 2,
              name: "Lance",
              type: "Artifact",
              instanceId: "lance-1",
            },
            instanceId: "lance-1",
            attachedTo: { at: "0,0", index: 0 },
            version: 0,
          } as PermanentItem,
        ],
      },
      board: { size: { w: 5, h: 4 }, sites: {} },
    });

    // Move the knight to hand - the lance should go to graveyard
    store.getState().movePermanentToZone("0,0", 0, "hand");

    const state = store.getState();
    // Board should be empty
    expect(state.permanents["0,0"]).toHaveLength(0);
    // Knight should be in hand
    expect(state.zones.p1.hand).toHaveLength(1);
    expect(state.zones.p1.hand[0].name).toBe("Knight");
    // Lance (artifact attachment) should be in graveyard
    expect(state.zones.p1.graveyard).toHaveLength(1);
    expect(state.zones.p1.graveyard[0].name).toBe("Lance");
  });

  it("movePermanentToZone sends token attachments to banished", () => {
    const store = createGameStore();
    store.setState({
      zones: {
        p1: {
          hand: [],
          spellbook: [],
          atlas: [],
          graveyard: [],
          banished: [],
          collection: [],
          battlefield: [],
        },
        p2: {
          hand: [],
          spellbook: [],
          atlas: [],
          graveyard: [],
          banished: [],
          collection: [],
          battlefield: [],
        },
      },
      permanents: {
        "0,0": [
          {
            owner: 1,
            card: {
              cardId: 1,
              name: "Knight",
              type: "Unit",
              instanceId: "knight-1",
            },
            instanceId: "knight-1",
            tapped: false,
            version: 0,
          } as PermanentItem,
          {
            owner: 1,
            card: {
              cardId: 2,
              name: "Damage Token",
              type: "Token",
              instanceId: "token-1",
            },
            instanceId: "token-1",
            attachedTo: { at: "0,0", index: 0 },
            version: 0,
          } as PermanentItem,
        ],
      },
      board: { size: { w: 5, h: 4 }, sites: {} },
    });

    // Move the knight to graveyard - the token should go to banished
    store.getState().movePermanentToZone("0,0", 0, "graveyard");

    const state = store.getState();
    // Board should be empty
    expect(state.permanents["0,0"]).toHaveLength(0);
    // Knight should be in graveyard
    expect(state.zones.p1.graveyard).toHaveLength(1);
    expect(state.zones.p1.graveyard[0].name).toBe("Knight");
    // Token should be in banished
    expect(state.zones.p1.banished).toHaveLength(1);
    expect(state.zones.p1.banished[0].name).toBe("Damage Token");
  });
});
