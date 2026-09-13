import { describe, it, expect } from "vitest";
import { createGameStore } from "@/lib/game/store";
import type { PermanentItem } from "@/lib/game/store";
import type { SiteTile } from "@/lib/game/store/types";
import { normalizePermanentItem } from "@/lib/game/store/utils/permanentHelpers";

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

describe("transformed sites (Island Leviathan, Horns of Behemoth)", () => {
  const emptyZones = () => ({
    hand: [],
    spellbook: [],
    atlas: [],
    graveyard: [],
    banished: [],
    collection: [],
    battlefield: [],
  });

  it("transformSite places a real Minion so attach and copy effects see it", () => {
    const store = createGameStore();
    store.setState({
      board: {
        size: { w: 5, h: 4 },
        sites: {
          "2,3": {
            owner: 1,
            tapped: false,
            card: {
              cardId: 9,
              name: "Island Leviathan",
              type: "Site",
              subTypes: "",
              thresholds: { water: 1 },
              instanceId: "leviathan-1",
            },
          } as SiteTile,
        },
      },
      permanents: {},
    });

    store.getState().transformSite(2, 3);

    const state = store.getState();
    expect(state.board.sites["2,3"]).toBeUndefined();
    const stack = state.permanents["2,3"];
    expect(stack).toHaveLength(2);
    expect(stack[0].card.type).toBe("Token");
    expect(stack[1].card).toMatchObject({
      name: "Island Leviathan",
      type: "Minion",
      subTypes: "Monster",
      attack: 8,
      defence: 8,
    });
    // No mana cost: the transform must not be charged as a summon
    expect(stack[1].card.cost ?? null).toBeNull();
  });

  it("movePermanentToZone sends a transformed site to the cemetery as its Site card", () => {
    const store = createGameStore();
    store.setState({
      zones: { p1: emptyZones(), p2: emptyZones() },
      permanents: {
        "2,0": [
          {
            owner: 2,
            card: {
              cardId: 10,
              name: "Horns of Behemoth",
              type: "Minion",
              subTypes: "Demon",
              attack: 6,
              defence: 6,
              instanceId: "horns-1",
            },
            instanceId: "horns-1",
            version: 0,
          } as PermanentItem,
        ],
      },
      board: { size: { w: 5, h: 4 }, sites: {} },
    });

    store.getState().movePermanentToZone("2,0", 0, "graveyard");

    const graveyard = store.getState().zones.p2.graveyard;
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0]).toMatchObject({
      name: "Horns of Behemoth",
      type: "Site",
      subTypes: "",
    });
  });

  it("normalizePermanentItem upgrades legacy Site-typed transformed permanents only", () => {
    const legacy = normalizePermanentItem({
      owner: 1,
      card: {
        cardId: 9,
        name: "Island Leviathan",
        type: "Site",
        instanceId: "leviathan-1",
      },
      instanceId: "leviathan-1",
      version: 0,
    } as PermanentItem);
    expect(legacy?.card).toMatchObject({
      type: "Minion",
      subTypes: "Monster",
      attack: 8,
      defence: 8,
    });

    const otherSite = normalizePermanentItem({
      owner: 1,
      card: { cardId: 11, name: "Spire", type: "Site", instanceId: "spire-1" },
      instanceId: "spire-1",
      version: 0,
    } as PermanentItem);
    expect(otherSite?.card.type).toBe("Site");
  });
});
