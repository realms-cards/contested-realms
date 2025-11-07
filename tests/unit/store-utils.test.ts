import { describe, it, expect, beforeEach } from "vitest";
import {
  ensureCardInstanceId,
  normalizeCardRefEntry,
  prepareCardForSeat,
} from "@/lib/game/store/utils/cardHelpers";
import {
  createEmptyPlayerZones,
  createZonesPatchFor,
  removeCardInstanceFromAllZones,
} from "@/lib/game/store/utils/zoneHelpers";
import {
  movePermanentCore,
  normalizePermanentsRecord,
} from "@/lib/game/store/utils/permanentHelpers";
import {
  createPermanentDeltaPatch,
  deepMergeReplaceArrays,
} from "@/lib/game/store/utils/patchHelpers";
import {
  computeThresholdTotals,
  computeAvailableMana,
} from "@/lib/game/store/utils/resourceHelpers";
import {
  clearSnapshotsStorageFor,
  loadSnapshotsFromStorageFor,
  saveSnapshotsToStorageFor,
} from "@/lib/game/store/utils/snapshotHelpers";
import type {
  BoardState,
  CardRef,
  GameState,
  Permanents,
  PlayerKey,
  ServerPatchT,
  Thresholds,
} from "@/lib/game/store/types";

const baseCard = (overrides: Partial<CardRef> = {}): CardRef => ({
  cardId: 1,
  name: "Test Card",
  type: null,
  slug: null,
  thresholds: null,
  owner: null,
  instanceId: undefined,
  ...overrides,
});

describe("cardHelpers", () => {
  it("preserves existing instance ids and owners", () => {
    const card = baseCard({ instanceId: "card-1", owner: "p1" });
    const ensured = ensureCardInstanceId(card);
    expect(ensured.instanceId).toBe("card-1");
    expect(ensureCardInstanceId(card)).toBe(card);
    expect(prepareCardForSeat(card, "p1")).toBe(card);
  });

  it("assigns ids/owners during normalization", () => {
    const normalized = normalizeCardRefEntry({
      cardId: "42",
      name: "Ruby Core",
      thresholds: { fire: 1 },
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.cardId).toBe(42);
    expect(normalized?.thresholds?.fire).toBe(1);

    const prepared = prepareCardForSeat(baseCard(), "p2");
    expect(prepared.owner).toBe("p2");
    expect(typeof prepared.instanceId).toBe("string");
  });
});

describe("zoneHelpers", () => {
  it("removes card instances across both seats", () => {
    const zones: GameState["zones"] = {
      p1: {
        ...createEmptyPlayerZones(),
        hand: [{ ...baseCard({ instanceId: "hand-1" }) }],
      },
      p2: {
        ...createEmptyPlayerZones(),
        graveyard: [{ ...baseCard({ instanceId: "hand-1" }) }],
      },
    };
    const removal = removeCardInstanceFromAllZones(zones, "hand-1");
    expect(removal).not.toBeNull();
    expect(removal?.seats).toEqual(["p1", "p2"]);
    expect(removal?.zones.p1.hand).toHaveLength(0);
    expect(removal?.zones.p2.graveyard).toHaveLength(0);
  });

  it("clones zone payloads with seat ownership for patches", () => {
    const zones: GameState["zones"] = {
      p1: {
        ...createEmptyPlayerZones(),
        hand: [{ ...baseCard({ owner: null }) }],
      },
      p2: createEmptyPlayerZones(),
    };
    const patch = createZonesPatchFor(zones, "p1");
    expect(patch?.zones?.p1?.hand?.[0]?.owner).toBe("p1");
    expect(patch?.zones?.p1?.hand?.[0]).not.toBe(zones.p1.hand[0]);
  });
});

describe("permanentHelpers", () => {
  const makePermanent = (
    id: string,
    owner: 1 | 2,
    extra: Partial<Permanents[string][number]> = {}
  ) => ({
    owner,
    card: baseCard({ cardId: owner, name: `Card ${owner}`, instanceId: `card-${id}` }),
    instanceId: id,
    tapVersion: 0,
    version: 0,
    ...extra,
  });

  it("moves attachments with the permanent and updates metadata", () => {
    const from = "0,0";
    const to = "1,1";
    const permanents: Permanents = {
      [from]: [
        makePermanent("main", 1),
        makePermanent("token", 1, {
          attachedTo: { at: from, index: 0 },
        }),
      ],
    };
    const result = movePermanentCore(permanents, from, 0, to, null);
    expect(result.per[from]).toHaveLength(0);
    expect(result.per[to]).toHaveLength(2);
    const movedToken = result.per[to][1];
    expect(movedToken.attachedTo).toEqual({ at: to, index: 0 });
    expect(result.removed).toHaveLength(2);
    expect(result.added).toHaveLength(2);
  });

  it("normalizes permanents to ensure instance ids", () => {
    const normalized = normalizePermanentsRecord({
      "0,0": [
        {
          owner: 1,
          card: baseCard({ instanceId: undefined }),
        } as any,
      ],
    });
    const entry = normalized?.["0,0"]?.[0];
    expect(entry?.instanceId).toBeTruthy();
    expect(entry?.card.instanceId).toBe(entry?.instanceId);
  });
});

describe("patchHelpers", () => {
  it("merges permanents by instance id but replaces zone arrays", () => {
    const base = {
      permanents: { cell: [{ instanceId: "perm-1", value: "base" }] },
      zones: { p1: { hand: [{ instanceId: "card-a", cardId: 1 }] } },
    };
    const patch = {
      permanents: { cell: [{ instanceId: "perm-1", value: "patch" }] },
      zones: { p1: { hand: [{ instanceId: "card-b", cardId: 2 }] } },
    };
    const merged = deepMergeReplaceArrays(base, patch);
    expect(merged.permanents.cell[0].value).toBe("patch");
    expect(merged.zones.p1.hand).toHaveLength(1);
    expect(merged.zones.p1.hand[0].instanceId).toBe("card-b");
  });

  it("builds delta patches for removals and additions", () => {
    const patch = createPermanentDeltaPatch([
      { at: "a", entry: { instanceId: "perm-1" }, remove: true },
      {
        at: "b",
        entry: {
          instanceId: "perm-2",
          owner: 1,
          card: baseCard({ instanceId: "perm-2" }),
        },
      },
    ]);
    expect(patch?.permanents?.a?.[0]?.__remove).toBe(true);
    expect(patch?.permanents?.b?.[0]?.instanceId).toBe("perm-2");
  });
});

describe("resourceHelpers", () => {
  const makeSite = (owner: PlayerKey, thresholds: Partial<Thresholds>) => ({
    owner: owner === "p1" ? 1 : 2,
    card: baseCard({ thresholds }),
  });

  it("aggregates thresholds from board and permanents", () => {
    const board: BoardState = {
      size: { w: 2, h: 2 },
      sites: {
        "0,0": makeSite("p1", { air: 1 }),
      },
    };
    const permanents: Permanents = {
      "0,0": [
        {
          owner: 1,
          card: baseCard({ name: "Ruby Core" }),
          instanceId: "perm-ruby",
        },
      ],
    };
    const totals = computeThresholdTotals(board, permanents, "p1");
    expect(totals.air).toBe(1);
    expect(totals.fire).toBe(1); // Ruby Core grant
  });

  it("counts available mana from sites and permanents", () => {
    const board: BoardState = {
      size: { w: 1, h: 1 },
      sites: {
        "0,0": {
          owner: 1,
          card: baseCard({ name: "Abundance" }),
        },
      },
    };
    const permanents: Permanents = {
      "0,0": [
        {
          owner: 1,
          card: baseCard({ name: "Amethyst Core" }),
          instanceId: "perm-core",
        },
      ],
    };
    expect(computeAvailableMana(board, permanents, "p1")).toBe(2);
  });
});

describe("snapshotHelpers", () => {
  const storageKey = "cr_snapshots:match-1";
  type Snapshot = GameState["snapshots"][number];

  beforeEach(() => {
    const backing = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => backing.clear(),
      key: (index: number) => Array.from(backing.keys())[index] ?? null,
      get length() {
        return backing.size;
      },
    } as Storage;
    Object.defineProperty(window, "localStorage", {
      value: localStorage,
      configurable: true,
    });
  });

  it("persists and restores snapshots per match id", () => {
    const snapshot: Snapshot = {
      id: "snap-1",
      title: "Manual snapshot",
      ts: 123,
      includePrivate: false,
      kind: "manual",
      turn: 3,
      actor: "p1",
      payload: { phase: "Main" } as ServerPatchT,
    };
    saveSnapshotsToStorageFor("match-1", [snapshot]);
    const restored = loadSnapshotsFromStorageFor("match-1");
    expect(window.localStorage.getItem(storageKey)).not.toBeNull();
    expect(restored).toEqual([snapshot]);
    clearSnapshotsStorageFor("match-1");
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });
});
