import { applyAction, createGame, viewFor } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { actionPaths, narrow } from "./actionPaths";
import { legalActionsWithCasters } from "./casterActions";
import { engineCellKey } from "./coords";
import { apiDeckToEngine, enginePrecons, toEngineDeck } from "./decks";
import {
  auraPlacement,
  boardReveal,
  damageSince,
  damageSnapshot,
  harbingerTiles,
  hiddenLayerCounts,
  layerOf,
  projectView,
} from "./projection";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { TILE_SIZE } from "@/lib/game/constants";

const CELL = /^[0-4],[0-3]$/;

function playOut(seed: number, maxActions: number) {
  const [a, b] = [enginePrecons[seed % enginePrecons.length], enginePrecons[(seed + 1) % enginePrecons.length]];
  const game = createGame([toEngineDeck(a), toEngineDeck(b)], ["You", "Computer"], seed, (seed % 2) as PlayerId);
  let actions = 0;
  let ambiguous = 0;
  while (game.phase !== "over" && actions < maxActions) {
    const seat: PlayerId | null = botNeedsToAct(game, 0) ? 0 : botNeedsToAct(game, 1) ? 1 : null;
    if (seat === null) break;
    if (seat === 0 && game.phase === "main" && !game.prompts.length) {
      const legal = legalActionsWithCasters(game, 0);
      const { paths } = actionPaths(game, legal);
      for (const path of paths) {
        const picked = narrow(paths, path.steps);
        if (JSON.stringify(picked.done) !== JSON.stringify(path.action)) ambiguous++;
      }
    }
    const result = applyAction(game, seat, botAction(game, seat));
    if (!result.ok) applyAction(game, seat, game.prompts[0] ? { t: "prompt", promptId: game.prompts[0].id, choice: null } : { t: "endTurn" });
    actions++;

    const view = viewFor(game, 0);
    const projected = projectView(view);
    const below = projectView(view, "subsurface");
    for (const key of [...Object.keys(projected.board.sites), ...Object.keys(projected.permanents)]) {
      expect(key).toMatch(CELL);
    }
    // Carried artifacts attach to their bearer (index -1 = the avatar); statuses become attached tokens.
    const all = Object.values(projected.permanents).flat();
    for (const artifact of Object.values(game.artifacts)) {
      const bearer = artifact.carriedBy ? game.units[artifact.carriedBy] : undefined;
      if (!bearer || layerOf(bearer.region) !== "surface") continue;
      const item = all.find((p) => p.instanceId === artifact.id);
      expect(item?.attachedTo?.index).toEqual(bearer.isAvatar ? -1 : expect.any(Number));
    }
    for (const unit of Object.values(game.units)) {
      if (!unit.isAvatar && layerOf(unit.region) !== "surface") continue;
      for (const flag of ["stealth", "ward", "disabled", "silenced"] as const) {
        const token = all.find((p) => p.instanceId === `${unit.id}:${flag}`);
        expect(Boolean(token?.attachedTo)).toBe(Boolean(unit[flag]));
      }
    }
    // The bot's hand stays hidden; ours is fully named.
    expect(projected.zones.p2.hand.every((c) => c.name === "Unknown")).toBe(true);
    expect(projected.zones.p1.hand.every((c) => c.name !== "Unknown")).toBe(true);
    expect(projected.zones.p1.hand).toHaveLength(game.players[0].hand.length);
    // Every live unit is on the board exactly once, on its rotated square.
    for (const unit of Object.values(game.units)) {
      if (unit.isAvatar) {
        const avatar = projected.avatars[unit.owner === 0 ? "p1" : "p2"];
        expect(avatar.pos && `${avatar.pos[0]},${avatar.pos[1]}`).toBe(engineCellKey(unit.x, unit.y));
      } else {
        // each minion shows on its own layer only, and the other layer's badge counts it
        const key = engineCellKey(unit.x, unit.y);
        const [own, other] = layerOf(unit.region) === "surface" ? [projected, below] : [below, projected];
        expect(own.permanents[key]?.some((p) => p.instanceId === unit.id)).toBe(true);
        expect(other.permanents[key]?.some((p) => p.instanceId === unit.id) ?? false).toBe(false);
        if (!unit.carriedBy) {
          const counts = hiddenLayerCounts(view, layerOf(unit.region) === "surface" ? "subsurface" : "surface")[key];
          expect(counts && counts.surface + counts.underground + counts.underwater).toBeGreaterThan(0);
        }
      }
    }
  }
  return { game, actions, ambiguous };
}

describe("engine projection", () => {
  it("rotates the board so seat 0 sits on our bottom row", () => {
    expect(engineCellKey(2, 0)).toBe("2,3");
    expect(engineCellKey(0, 0)).toBe("4,3");
  });

  it.each([1, 2, 3, 4])("stays consistent through a bot-vs-bot game (seed %i)", (seed) => {
    const { actions, ambiguous } = playOut(seed, 400);
    expect(actions).toBeGreaterThan(10);
    // every legal action has its own click path
    expect(ambiguous).toBe(0);
  }, 120_000);

  it("converts our saved decks, taking the avatar out of the spellbook", () => {
    const copies = (name: string, n: number, type: string) => Array.from({ length: n }, () => ({ name, type }));
    const result = apiDeckToEngine(
      {
        name: "Fire",
        spellbook: [...copies("Flamecaller", 1, "Avatar"), ...copies("Lava Salamander", 3, "Minion")],
        atlas: copies("Arid Desert", 4, "Site"),
        collection: copies("Wildfire", 1, "Magic"),
      },
      "fallback",
    );
    expect(result).toEqual({
      ok: true,
      deck: {
        name: "Fire",
        avatar: "Flamecaller",
        spellbook: { "Lava Salamander": 3 },
        atlas: { "Arid Desert": 4 },
        collection: { Wildfire: 1 },
      },
    });
    expect(apiDeckToEngine({ spellbook: copies("Not A Card", 1, "Minion"), atlas: [] }, "x")).toEqual({
      ok: false,
      error: "Unknown cards: Not A Card",
    });
  });

  it("centres a 2x2 aura where its four squares meet", () => {
    // engine squares (1,1)-(2,2) → board cells (2,1)-(3,2); centre (2.5, 1.5)
    const placed = auraPlacement([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], 1);
    expect(placed).not.toBeNull();
    const [ax, ay] = placed!.at.split(",").map(Number);
    expect(ax + placed!.offset[0] / TILE_SIZE).toBeCloseTo(2.5);
    expect(ay + (placed!.offset[1] + getPermanentOwnerBaseZ(1)) / TILE_SIZE).toBeCloseTo(1.5);
    expect(auraPlacement([{ x: 0, y: 0 }], 2)).toEqual({ at: "4,3", offset: [0, -getPermanentOwnerBaseZ(2)] });
  });

  it("maps Harbinger portents onto rotated board tile numbers", () => {
    // engine squares, seat 0: (0,1)→board (4,2)=tile 15, (1,2)→(3,1)=9, (3,1)→(1,2)=12
    const view = { flow: { harbinger: { 0: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 1 }] } } } as unknown as Parameters<typeof harbingerTiles>[0];
    expect(harbingerTiles(view)).toEqual({ p1: [15, 9, 12] });
  });
});

describe("engine event reveal", () => {
  /** A minimal PlayerView-shaped stub: boardReveal reads only `flow`, `units` and `sites`. */
  const viewWith = (areaReveal: unknown, units: Record<string, unknown> = {}) =>
    ({ flow: { areaReveal }, units, sites: {} }) as unknown as Parameters<typeof boardReveal>[0];

  it("leaves damage numbers to the unit diff and keeps the caption", () => {
    // areaReveal.cells is NOT the damage channel any more: the same hit also shows up in the
    // unit diff, which is the only one that sees combat too. boardReveal keeps the storytelling.
    const reveal = boardReveal(
      viewWith({
        seq: 3,
        cells: [
          { x: 2, y: 0, dmg: 2 },
          { x: 0, y: 3, dmg: 4 },
        ],
        redSites: [],
        name: "Flame Wave",
      }),
      0,
    );
    expect(reveal).not.toBeNull();
    expect(reveal?.name).toBe("Flame Wave");
    expect(reveal?.hits).toEqual([]);
  });

  it("only fires once per engine seq", () => {
    const area = { seq: 5, cells: [{ x: 1, y: 1, dmg: 1 }], redSites: [], name: "Zap" };
    expect(boardReveal(viewWith(area), 4)).not.toBeNull();
    // a cosmetic re-project at the same seq must not replay the animation
    expect(boardReveal(viewWith(area), 5)).toBeNull();
    expect(boardReveal(viewWith(area), 9)).toBeNull();
  });

  it("does not glow a square that will already show a damage number", () => {
    const reveal = boardReveal(
      viewWith({
        seq: 1,
        cells: [{ x: 3, y: 2, dmg: 2 }],
        redSites: [
          { x: 3, y: 2 },
          { x: 4, y: 2 },
        ],
        name: "",
      }),
      0,
    );
    // the damaged square is left to its number; only the untouched one glows
    expect(reveal?.sites).toEqual([engineCellKey(4, 2)]);
  });

  it("places the caster from the unit the engine named", () => {
    const reveal = boardReveal(
      viewWith({ seq: 2, cells: [], redSites: [{ x: 0, y: 0 }], casterId: "u9", name: "Cherubim shoots!" }, { u9: { x: 4, y: 3 } }),
      0,
    );
    expect(reveal?.caster).toBe(engineCellKey(4, 3));
  });

  it("returns null for an empty reveal rather than blanking a running animation", () => {
    expect(boardReveal(viewWith({ seq: 7, cells: [], redSites: [], name: "" }), 0)).toBeNull();
    expect(boardReveal(viewWith(undefined), 0)).toBeNull();
  });
});

describe("damage diff (every source, not just spells)", () => {
  const viewOf = (units: Record<string, unknown>) => ({ units, sites: {}, flow: {} }) as unknown as Parameters<typeof damageSnapshot>[0];

  it("floats a number wherever a minion's damage counter went up", () => {
    // combat never touches flow.areaReveal, which is why the diff exists
    const before = damageSnapshot(viewOf({ u1: { id: "u1", x: 2, y: 1, damage: 0 } }));
    const after = viewOf({ u1: { id: "u1", x: 2, y: 1, damage: 3 } });
    expect(damageSince(before, after)).toEqual([{ at: engineCellKey(2, 1), dmg: 3 }]);
  });

  it("reads an avatar's loss off its life, not a damage counter", () => {
    const before = damageSnapshot(viewOf({ a: { id: "a", x: 0, y: 0, isAvatar: true, life: 20 } }));
    const after = viewOf({ a: { id: "a", x: 0, y: 0, isAvatar: true, life: 16 } });
    expect(damageSince(before, after)).toEqual([{ at: engineCellKey(0, 0), dmg: 4 }]);
  });

  it("sums everything that was hurt on one square", () => {
    const before = damageSnapshot(
      viewOf({ u1: { id: "u1", x: 3, y: 2, damage: 1 }, u2: { id: "u2", x: 3, y: 2, damage: 0 } }),
    );
    const after = viewOf({ u1: { id: "u1", x: 3, y: 2, damage: 3 }, u2: { id: "u2", x: 3, y: 2, damage: 2 } });
    expect(damageSince(before, after)).toEqual([{ at: engineCellKey(3, 2), dmg: 4 }]);
  });

  it("stays silent for healing, undo, movement and newly arrived units", () => {
    const before = damageSnapshot(viewOf({ u1: { id: "u1", x: 1, y: 1, damage: 4 } }));
    // healed / rewound
    expect(damageSince(before, viewOf({ u1: { id: "u1", x: 1, y: 1, damage: 1 } }))).toEqual([]);
    // merely moved
    expect(damageSince(before, viewOf({ u1: { id: "u1", x: 2, y: 1, damage: 4 } }))).toEqual([]);
    // a unit we have never seen before cannot have "taken" damage this step
    expect(damageSince(before, viewOf({ u1: { id: "u1", x: 1, y: 1, damage: 4 }, u9: { id: "u9", x: 0, y: 0, damage: 2 } }))).toEqual([]);
    // no previous snapshot at all (fresh match)
    expect(damageSince(null, viewOf({ u1: { id: "u1", x: 1, y: 1, damage: 9 } }))).toEqual([]);
  });

  it("reports damage at the square the unit is on now", () => {
    const before = damageSnapshot(viewOf({ u1: { id: "u1", x: 0, y: 0, damage: 0 } }));
    const after = viewOf({ u1: { id: "u1", x: 4, y: 3, damage: 2 } });
    expect(damageSince(before, after)).toEqual([{ at: engineCellKey(4, 3), dmg: 2 }]);
  });
});

describe("caster-locked and sealed hand cards", () => {
  /** projectView needs a fuller view than the reveal stubs, so drive a real game. */
  const realView = () => {
    const [a, b] = [enginePrecons[0], enginePrecons[1]];
    const game = createGame([toEngineDeck(a), toEngineDeck(b)], ["You", "Computer"], 7, 0 as PlayerId);
    return { game, view: viewFor(game, 0) };
  };

  it("marks a card Morgana/an Omphalos bonded, naming the caster", () => {
    const { game } = realView();
    const held = game.players[0].hand[0];
    expect(held).toBeTruthy();
    game.flow = { ...(game.flow ?? {}), lockedCards: [{ cardId: held, casterId: "u1", casterName: "Morgana le Fay" }] };
    const hand = projectView(viewFor(game, 0)).zones.p1.hand;
    const marked = hand.filter((c) => c.lockedTo);
    expect(marked).toHaveLength(1);
    expect(marked[0].lockedTo).toBe("Morgana le Fay");
    // everything else in hand is untouched
    expect(hand.filter((c) => c.sealedBy)).toHaveLength(0);
  });

  it("seals a stolen card only while the thief is still in the realm", () => {
    const { game } = realView();
    const held = game.players[0].hand[1];
    const thief = Object.values(game.units).find((u) => u.isAvatar);
    expect(thief).toBeTruthy();

    game.flow = { ...(game.flow ?? {}), stolen: [{ cardId: held, unitId: thief!.id }] };
    const sealed = projectView(viewFor(game, 0)).zones.p1.hand.filter((c) => c.sealedBy);
    expect(sealed).toHaveLength(1);
    expect(sealed[0].sealedBy).toBe(thief!.name);

    // the thief leaves: casting.ts:358 stops sealing, and so must the badge
    game.flow = { ...(game.flow ?? {}), stolen: [{ cardId: held, unitId: "gone" }] };
    expect(projectView(viewFor(game, 0)).zones.p1.hand.filter((c) => c.sealedBy)).toHaveLength(0);
  });
});

describe("token cards", () => {
  /** Two Skeletons on the board must not share a cardId: it keys React and the physics body. */
  it("gives same-type tokens distinct, stable ids", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 11, 0 as PlayerId);
    // two token cards of the same kind, as summonToken would create them
    game.cards["cT1"] = { id: "cT1", name: "Skeleton", owner: 0, isToken: true } as (typeof game.cards)[string];
    game.cards["cT2"] = { id: "cT2", name: "Skeleton", owner: 0, isToken: true } as (typeof game.cards)[string];

    const first = projectView(viewFor(game, 0)).zones.p1;
    game.players[0].cemetery.push("cT1", "cT2");
    const withTokens = projectView(viewFor(game, 0)).zones.p1.graveyard.filter((c) => c.name === "Skeleton");
    expect(withTokens).toHaveLength(2);
    expect(withTokens[0].cardId).not.toBe(withTokens[1].cardId);
    // both still use our token art
    expect(withTokens[0].slug).toBe(withTokens[1].slug);
    expect(withTokens[0].type).toBe("Token");

    // and the ids are stable across re-projections, or every token would remount each frame
    const again = projectView(viewFor(game, 0)).zones.p1.graveyard.filter((c) => c.name === "Skeleton");
    expect(again.map((c) => c.cardId)).toEqual(withTokens.map((c) => c.cardId));
    expect(first.graveyard.filter((c) => c.name === "Skeleton")).toHaveLength(0);
  });
});
