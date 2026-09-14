import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diffGameSfx,
  installGameSfx,
  withSfxSource,
  type SfxCue,
  type SfxState,
} from "@/lib/audio/gameSfx";
import { soundManager } from "@/lib/audio/soundManager";
import type {
  CardRef,
  GameState,
  PermanentItem,
  Zones,
} from "@/lib/game/store/types";

const card = (name: string, instanceId: string | null, type: string | null = "Minion"): CardRef => ({
  cardId: name.length,
  name,
  type,
  instanceId,
});

const emptyZones = (): Zones => ({
  spellbook: [],
  atlas: [],
  hand: [],
  graveyard: [],
  battlefield: [],
  collection: [],
  banished: [],
});

const permanent = (c: CardRef, extra: Partial<PermanentItem> = {}): PermanentItem => ({
  owner: 1,
  card: c,
  instanceId: c.instanceId,
  ...extra,
});

function baseState(): SfxState {
  return {
    matchId: "match-1",
    actorKey: "p1",
    zones: { p1: emptyZones(), p2: emptyZones() },
    permanents: {},
    board: { size: { w: 5, h: 4 }, sites: {} },
    avatars: { p1: { card: null, pos: [2, 3] }, p2: { card: null, pos: [2, 0] } },
    players: {
      p1: { life: 20, lifeState: "alive", mana: 0 },
      p2: { life: 20, lifeState: "alive", mana: 0 },
    },
    currentPlayer: 1,
    phase: "Main",
    pendingCombat: null,
    lastCombatSummary: null,
    pendingMagic: null,
    gemTokens: [],
    matchEnded: false,
  };
}

const ids = (cues: SfxCue[]) => cues.map((cue) => cue.id).sort();

describe("diffGameSfx", () => {
  it("plays the draw sound when a card moves from the spellbook to the hand", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.zones = { ...prev.zones, p1: { ...emptyZones(), spellbook: [goblin] } };
    const next = { ...prev, zones: { ...prev.zones, p1: { ...emptyZones(), hand: [goblin] } } };

    const cues = diffGameSfx(prev, next, "local");
    expect(cues).toEqual([{ id: "draw", actor: "me" }]);
  });

  it("voices server patches as the opponent", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.zones = { ...prev.zones, p2: { ...emptyZones(), spellbook: [goblin] } };
    const next = { ...prev, zones: { ...prev.zones, p2: { ...emptyZones(), hand: [goblin] } } };

    expect(diffGameSfx(prev, next, "remote")).toEqual([{ id: "draw", actor: "opponent" }]);
  });

  it("recognises a draw into a hidden hand that carries no card identities", () => {
    const prev = baseState();
    prev.zones = { ...prev.zones, p2: { ...emptyZones(), atlas: [card("Valley", null, "Site")] } };
    const next = {
      ...prev,
      zones: { ...prev.zones, p2: { ...emptyZones(), hand: [card("Hidden", null, null)] } },
    };

    expect(ids(diffGameSfx(prev, next, "remote"))).toEqual(["draw"]);
  });

  it("treats a card appearing in the opponent's hand from a hidden pile as a draw", () => {
    const prev = baseState();
    const next = {
      ...prev,
      zones: { ...prev.zones, p2: { ...emptyZones(), hand: [card("Imp", "i1")] } },
    };

    expect(diffGameSfx(prev, next, "remote")).toEqual([{ id: "draw", actor: "opponent" }]);
  });

  it("keeps the token sound for tokens added to a hand", () => {
    const prev = baseState();
    const next = {
      ...prev,
      zones: { ...prev.zones, p1: { ...emptyZones(), hand: [card("Skeleton", "t1", "Token")] } },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["token"]);
  });

  it("plays a minion entering and the placement thud when a minion leaves the hand for the board", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.zones = { ...prev.zones, p1: { ...emptyZones(), hand: [goblin] } };
    const next = {
      ...prev,
      zones: { ...prev.zones, p1: emptyZones() },
      permanents: { "2,2": [permanent(goblin)] },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["cardPlay", "minionEnters"]);
  });

  it("gives sites their own sound", () => {
    const valley = card("Valley", "s1", "Site");
    const prev = baseState();
    prev.zones = { ...prev.zones, p1: { ...emptyZones(), hand: [valley] } };
    const next = {
      ...prev,
      zones: { ...prev.zones, p1: emptyZones() },
      board: { ...prev.board, sites: { "2,3": { owner: 1 as const, card: valley } } },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["cardPlay", "sitePlaced"]);
  });

  it.each([
    ["graveyard", "toCemetery"],
    ["banished", "banish"],
    ["hand", "returnToHand"],
  ] as const)("plays the right sound when a permanent goes to the %s", (pile, expected) => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.permanents = { "2,2": [permanent(goblin)] };
    const next = {
      ...prev,
      permanents: { "2,2": [] },
      zones: { ...prev.zones, p1: { ...emptyZones(), [pile]: [goblin] } },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual([expected]);
  });

  it("plays a step when a permanent moves between tiles", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.permanents = { "2,2": [permanent(goblin)] };
    const next = { ...prev, permanents: { "2,2": [], "2,1": [permanent(goblin)] } };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["move"]);
  });

  it("marks the end of my turn instead of voicing the untap step", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.permanents = { "2,2": [permanent(goblin, { tapped: true })] };
    const next = {
      ...prev,
      currentPlayer: 2 as const,
      phase: "Start" as const,
      permanents: { "2,2": [permanent(goblin, { tapped: false })] },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["endTurn"]);
  });

  it("stays quiet when the turn passes to me, where the turn overlay plays its gong", () => {
    const prev = { ...baseState(), currentPlayer: 2 as const };
    const next = { ...prev, currentPlayer: 1 as const, phase: "Start" as const };

    expect(diffGameSfx(prev, next, "remote")).toEqual([]);
  });

  it("climbs a pitch ladder for counters", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    prev.permanents = { "2,2": [permanent(goblin, { counters: 1 })] };
    const next = { ...prev, permanents: { "2,2": [permanent(goblin, { counters: 2 })] } };

    expect(diffGameSfx(prev, next, "local")).toEqual([
      { id: "counterUp", actor: "me", ladder: { key: "counterUp", step: 1 } },
    ]);
  });

  it("tolls for Death's Door", () => {
    const prev = baseState();
    const next = {
      ...prev,
      players: { ...prev.players, p2: { life: 0, lifeState: "dd" as const, mana: 0 } },
    };

    expect(ids(diffGameSfx(prev, next, "remote"))).toEqual(["deathsDoor"]);
  });

  it("asks for attention when an attack needs my defenders", () => {
    const prev = baseState();
    const next: SfxState = {
      ...prev,
      pendingCombat: {
        id: "cmb_1",
        tile: { x: 2, y: 2 },
        attacker: { at: "2,1", index: 0, owner: 2 },
        target: null,
        defenderSeat: "p1",
        defenders: [],
        status: "defending",
        createdAt: 1,
      },
    };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["attack", "consent"]);
  });

  it("plays the kill sting when combat destroys a unit", () => {
    const prev = baseState();
    const next = {
      ...prev,
      lastCombatSummary: { id: "sum_1", text: "Goblin destroys Knight", ts: 1 },
    };

    expect(ids(diffGameSfx(prev, next, "remote"))).toEqual(["kill"]);
  });

  it("hears a shuffle when a pile keeps its cards but changes order", () => {
    const a = card("A", "a");
    const b = card("B", "b");
    const prev = baseState();
    prev.zones = { ...prev.zones, p1: { ...emptyZones(), spellbook: [a, b] } };
    const next = { ...prev, zones: { ...prev.zones, p1: { ...emptyZones(), spellbook: [b, a] } } };

    expect(ids(diffGameSfx(prev, next, "local"))).toEqual(["cardShuffle"]);
  });

  it("stays silent for loads and resets that move a whole deck at once", () => {
    const prev = baseState();
    const deck = Array.from({ length: 30 }, (_, i) => card(`Card ${i}`, `d${i}`));
    const next = { ...prev, zones: { ...prev.zones, p1: { ...emptyZones(), spellbook: deck } } };

    expect(diffGameSfx(prev, next, "remote")).toEqual([]);
  });

  it("stays silent when a different match loads", () => {
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    const next = { ...prev, matchId: "match-2", permanents: { "2,2": [permanent(goblin)] } };

    expect(diffGameSfx(prev, next, "remote")).toEqual([]);
  });

  it("caps one change at four sounds, most important first", () => {
    const goblin = card("Goblin", "c1");
    const knight = card("Knight", "c2");
    const prev = baseState();
    prev.permanents = { "2,2": [permanent(goblin)], "1,1": [permanent(knight, { counters: 0 })] };
    const next: SfxState = {
      ...prev,
      permanents: { "2,2": [], "1,1": [permanent(knight, { counters: 1, tapped: true })] },
      zones: { ...prev.zones, p2: { ...emptyZones(), graveyard: [goblin] } },
      players: { ...prev.players, p2: { life: 0, lifeState: "dd", mana: 0 } },
      lastCombatSummary: { id: "sum_2", text: "Knight destroys Goblin", ts: 2 },
    };

    const cues = diffGameSfx(prev, next, "local");
    expect(cues.map((cue) => cue.id)).toEqual(["deathsDoor", "kill", "toCemetery", "counterUp"]);
  });
});

describe("installGameSfx", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeStore() {
    let listener: ((state: GameState, prev: GameState) => void) | null = null;
    return {
      subscribe: (fn: (state: GameState, prev: GameState) => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
      emit: (next: SfxState, prev: SfxState) => {
        listener?.(next as GameState, prev as GameState);
      },
    };
  }

  it("plays one undo sound instead of voicing everything the undo restores", () => {
    const play = vi.spyOn(soundManager, "play").mockImplementation(() => {});
    const store = fakeStore();
    const unsubscribe = installGameSfx(store);
    const goblin = card("Goblin", "c1");
    const prev = baseState();
    const next = { ...prev, permanents: { "2,2": [permanent(goblin)] } };

    withSfxSource("undo", () => store.emit(next, prev));

    expect(play.mock.calls).toEqual([["returnToHand"]]);
    unsubscribe();
  });

  it("folds a death into the kill sting that caused it", () => {
    const play = vi.spyOn(soundManager, "play").mockImplementation(() => {});
    const store = fakeStore();
    const unsubscribe = installGameSfx(store);
    const goblin = card("Goblin", "c1");

    const start = baseState();
    start.permanents = { "2,2": [permanent(goblin)] };
    const afterSummary = { ...start, lastCombatSummary: { id: "sum_3", text: "Knight destroys Goblin", ts: 3 } };
    const afterDeath = {
      ...afterSummary,
      permanents: { "2,2": [] },
      zones: { ...afterSummary.zones, p1: { ...emptyZones(), graveyard: [goblin] } },
    };

    withSfxSource("remote", () => {
      store.emit(afterSummary, start);
      store.emit(afterDeath, afterSummary);
    });

    expect(play.mock.calls.map(([id]) => id)).toEqual(["kill"]);
    unsubscribe();
  });
});
