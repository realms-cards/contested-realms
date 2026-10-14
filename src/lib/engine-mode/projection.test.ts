import { applyAction, createGame, getCard, isDisabled, viewFor } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it, vi } from "vitest";
import { actionPaths, narrow } from "./actionPaths";
import { loadCardIndex } from "./cardIndex";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { engineCellKey } from "./coords";
import { apiDeckToEngine, enginePrecons, toEngineDeck } from "./decks";
import {
  arrangeableCell,
  auraPlacement,
  boardReveal,
  clampToTile,
  damageSince,
  damageSnapshot,
  disabledUnits,
  harbingerTiles,
  hiddenLayerCounts,
  layerOf,
  projectView,
  pruneArrangement,
  unitCell,
  unitPower,
} from "./projection";
import type { Arrangement } from "./projection";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { CARD_LONG, CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";

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
    const disabled = disabledUnits(game);
    const projected = projectView(view, "surface", true, {}, disabled);
    const below = projectView(view, "subsurface", true, {}, disabled);
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
        // a disable is shown whether the flag is raw or derived (Babbling Brook, Basilisk…)
        const on = flag === "disabled" ? Boolean(unit.disabled) || (!unit.isAvatar && isDisabled(game, unit)) : Boolean(unit[flag]);
        expect(Boolean(token?.attachedTo)).toBe(on);
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
        // Each minion is solid on its own layer. A SUBSURFACE minion also appears on the
        // surface view as a dimmed hint tucked under the site; a surface minion never leaks
        // down into the subsurface view, which stays a clean view of that layer alone.
        // a multi-square body is drawn on the cell nearest its centre, everything else on its square
        const key = unitCell(unit);
        const onSurface = layerOf(unit.region) === "surface";
        const [own, other] = onSurface ? [projected, below] : [below, projected];
        const mine = own.permanents[key]?.find((p) => p.instanceId === unit.id);
        expect(Boolean(mine)).toBe(true);
        expect(mine?.faded).toBeUndefined();
        const echo = other.permanents[key]?.find((p) => p.instanceId === unit.id);
        if (onSurface) {
          expect(echo).toBeUndefined();
        } else {
          // the hint: present, dimmed, and placed under the site by the shared board
          expect(echo?.faded).toBe(true);
          expect(projected.permanentPositions[unit.id]?.state).toMatch(/burrowed|submerged/);
        }
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

describe("subsurface hint", () => {
  /** Put one unit underground and one underwater, both under a site, and look at the surface. */
  const withHidden = () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 17, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.units["uDig"] = { ...avatar, id: "uDig", isAvatar: false, name: "Digger", region: "underground" };
    game.units["uSwim"] = { ...avatar, id: "uSwim", isAvatar: false, name: "Swimmer", region: "underwater" };
    return game;
  };

  it("shows other-layer units under the site, dimmed, while viewing the surface", () => {
    const projected = projectView(viewFor(withHidden(), 0), "surface");
    const all = Object.values(projected.permanents).flat();
    const dig = all.find((p) => p.instanceId === "uDig");
    const swim = all.find((p) => p.instanceId === "uSwim");

    expect(dig?.faded).toBe(true);
    expect(swim?.faded).toBe(true);
    // the shared board tucks these under the site via permanentPositions
    expect(projected.permanentPositions["uDig"]?.state).toBe("burrowed");
    expect(projected.permanentPositions["uSwim"]?.state).toBe("submerged");
  });

  it("leaves surface units solid and unpositioned", () => {
    const game = withHidden();
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.units["uTop"] = { ...avatar, id: "uTop", isAvatar: false, name: "Walker", region: "surface" };
    const projected = projectView(viewFor(game, 0), "surface");
    const top = Object.values(projected.permanents).flat().find((p) => p.instanceId === "uTop");
    expect(top?.faded).toBeUndefined();
    expect(projected.permanentPositions["uTop"]).toBeUndefined();
  });

  it("keeps the subsurface view a clean view of that layer alone", () => {
    const projected = projectView(viewFor(withHidden(), 0), "subsurface");
    const ids = Object.values(projected.permanents).flat().map((p) => p.instanceId);
    expect(ids).toContain("uDig");
    expect(ids).toContain("uSwim");
    // no surface minions leaking upward into the hint slot
    expect(Object.values(projected.permanentPositions)).toHaveLength(0);
  });
});

describe("aura placement on the board", () => {
  /**
   * Through projectView, not auraPlacement alone: the tile layout used to run over auras too and
   * overwrite the centred offset with a rim slot, while a test of auraPlacement kept passing.
   * The rendered spot is tile + [offX, ownerBaseZ + offZ] (PermanentStack), in TILE units here.
   */
  type Sq = { x: number; y: number };
  const SHAPES: Record<string, Sq[]> = {
    "2x2 middle": [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    "2x2 corner": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    "1x1": [{ x: 3, y: 1 }],
    "1x3 row": [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    "3x3": [0, 1, 2].flatMap((dx) => [0, 1, 2].map((dy) => ({ x: 1 + dx, y: dy }))),
    cross: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
  };
  const freshGame = () => {
    const deck = toEngineDeck(enginePrecons[0]);
    return createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  };
  const addAura = (game: ReturnType<typeof freshGame>, squares: Sq[], controller: PlayerId) => {
    const id = `rTest${controller}`;
    game.auras[id] = { id, cardId: Object.keys(game.cards)[0], name: "Test", controller, squares, enteredTurn: -1 };
    return id;
  };
  const rendered = (projected: ReturnType<typeof projectView>, id: string) => {
    for (const [at, items] of Object.entries(projected.permanents)) {
      const item = items.find((p) => p.instanceId === id);
      if (!item) continue;
      const [ax, ay] = at.split(",").map(Number);
      const [ox, oz] = item.offset ?? [0, 0];
      return { at, item, x: ax + ox / TILE_SIZE, y: ay + (getPermanentOwnerBaseZ(item.owner) + oz) / TILE_SIZE };
    }
    return null;
  };
  const centroid = (squares: Sq[]) => ({
    x: squares.reduce((sum, sq) => sum + (4 - sq.x), 0) / squares.length,
    y: squares.reduce((sum, sq) => sum + (3 - sq.y), 0) / squares.length,
  });

  for (const controller of [0, 1] as PlayerId[]) {
    for (const [name, squares] of Object.entries(SHAPES)) {
      it(`centres a ${name} aura over its area (seat ${controller})`, () => {
        const game = freshGame();
        const id = addAura(game, squares, controller);
        const got = rendered(projectView(viewFor(game, 0)), id);
        const want = centroid(squares);
        expect(got, "the aura is on the board").not.toBeNull();
        expect(got!.x).toBeCloseTo(want.x, 3);
        expect(got!.y).toBeCloseTo(want.y, 3);
        // smaller than a lone card, so it clears the rows of the tiles it reaches over
        expect(got!.item.scale).toBeLessThan(0.88);
      });
    }
  }

  it("leaves the anchor tile's own cards exactly where they would be without it", () => {
    const squares = SHAPES["2x2 middle"];
    const game = freshGame();
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    // the 2x2 middle aura is anchored on board cell 3,2 = engine (1,1)
    game.units.uAnchor = { ...avatar, id: "uAnchor", isAvatar: false, name: "Anchor", region: "surface", x: 1, y: 1 };
    const before = rendered(projectView(viewFor(game, 0)), "uAnchor")!;
    const id = addAura(game, squares, 0);
    const after = projectView(viewFor(game, 0));
    const aura = rendered(after, id)!;
    expect(aura.at, "they share the anchor tile").toBe(before.at);
    const unit = rendered(after, "uAnchor")!;
    expect(unit.item.offset).toEqual(before.item.offset);
    expect(unit.item.scale).toBe(before.item.scale);
    // the aura is still centred, and drawn above the tile's own cards
    expect(aura.x).toBeCloseTo(centroid(squares).x, 3);
    expect(aura.y).toBeCloseTo(centroid(squares).y, 3);
    const stack = after.permanents[aura.at];
    expect(stack[stack.length - 1].instanceId).toBe(id);
  });

  it("centres a 2x2 body over its four squares and keeps its status tokens on it", () => {
    const game = freshGame();
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 1)!;
    // pushed first, so lifting it to the top of its tile has to re-point its Ward token
    game.units.uBig = { ...avatar, id: "uBig", isAvatar: false, name: "Big", region: "surface", x: 1, y: 1, size: "2x2", ward: true };
    game.units.uSmall = { ...avatar, id: "uSmall", isAvatar: false, name: "Small", region: "surface", x: 1, y: 1 };
    const projected = projectView(viewFor(game, 0));
    const big = rendered(projected, "uBig")!;
    expect(big.x).toBeCloseTo(centroid(SHAPES["2x2 middle"]).x, 3);
    expect(big.y).toBeCloseTo(centroid(SHAPES["2x2 middle"]).y, 3);
    expect(unitCell(game.units.uBig)).toBe(big.at);
    const stack = projected.permanents[big.at];
    const token = stack.find((p) => p.instanceId === "uBig:ward")!;
    expect(stack[token.attachedTo!.index].instanceId).toBe("uBig");
    expect(stack.filter((p) => !p.attachedTo).map((p) => p.instanceId)).toEqual(["uSmall", "uBig"]);
    // the 1x1 sharing its corner square is laid out as the tile's only card (a shared tile caps at 0.78)
    expect(rendered(projected, "uSmall")!.item.scale).toBeGreaterThan(0.78);
  });
});

describe("tile layout", () => {
  /**
   * `n` units on one square. They are placed AWAY from the avatar on purpose: the avatar takes
   * a slot in the tile layout like anything else, so putting the crowd under it would be
   * measuring a tile with n+1 occupants.
   */
  const crowd = (n: number, onAvatarSquare = false) => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 23, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const spot = onAvatarSquare ? { x: avatar.x, y: avatar.y } : { x: 0, y: 2 };
    expect(onAvatarSquare || spot.x !== avatar.x || spot.y !== avatar.y, "crowd is clear of the avatar").toBe(true);
    for (let i = 0; i < n; i++) {
      game.units[`uX${i}`] = {
        ...avatar,
        id: `uX${i}`,
        isAvatar: false,
        name: `Crowd ${i}`,
        region: "surface",
        x: spot.x,
        y: spot.y,
      };
    }
    return projectView(viewFor(game, 0), "surface");
  };

  it("pushes even a lone card to its owner's edge, a little under full size", () => {
    // Nothing sits centred any more: a card parked in the middle of a tile covers the site
    // it is standing on, and the site is what tells you where you are.
    const at = Object.values(crowd(1).permanents).find((items) => items.some((p) => p.instanceId === "uX0"))!;
    const only = at.filter((p) => !p.attachedTo);
    expect(only).toHaveLength(1);
    expect(only[0].offset, "it took an edge slot").not.toBeNull();
    expect(only[0].scale!).toBeLessThan(1);
    expect(only[0].scale!).toBeGreaterThan(0.5);
  });

  it("sends each side's cards to its own edge, never the same one", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 23, 0 as PlayerId);
    const mine = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const theirs = Object.values(game.units).find((u) => u.isAvatar && u.owner === 1)!;
    // one unit from each player on the SAME square, well clear of both avatars
    for (const [i, src] of [mine, theirs].entries()) {
      game.units[`uS${i}`] = { ...src, id: `uS${i}`, isAvatar: false, name: `Side ${i}`, region: "surface", x: 1, y: 2 };
    }
    const projected = projectView(viewFor(game, 0), "surface");
    const here = Object.values(projected.permanents).flat();
    const p1 = here.find((p) => p.instanceId === "uS0")!;
    const p2 = here.find((p) => p.instanceId === "uS1")!;
    // final Z is the board's own owner nudge plus the offset; the two must end up opposed
    const worldZ = (card: typeof p1) => getPermanentOwnerBaseZ(card.owner) + card.offset![1];
    expect(Math.sign(worldZ(p1)), "ours toward our edge").toBe(1);
    expect(Math.sign(worldZ(p2)), "theirs toward theirs").toBe(-1);
    // and neither leaves its tile
    for (const card of [p1, p2]) expect(Math.abs(worldZ(card))).toBeLessThan(TILE_SIZE / 2);
  });

  it("gives the avatar a slot of its own rather than letting a card sit on it", () => {
    // The avatar is the most-read thing on the board; a card dropped on its square used to
    // land exactly on top of it, hiding each from the other.
    const projected = crowd(1, true);
    const avatar = projected.avatars.p1;
    const at = `${avatar.pos![0]},${avatar.pos![1]}`;
    const card = projected.permanents[at]?.find((p) => p.instanceId === "uX0");
    expect(card, "the card is on the avatar's square").toBeTruthy();
    expect(avatar.offset, "the avatar stepped aside").not.toBeNull();
    expect(card!.offset, "and the card took its own slot").not.toBeNull();
    const apart = Math.hypot(avatar.offset![0] - card!.offset![0], avatar.offset![1] - card!.offset![1]);
    expect(apart, "they are not in the same place").toBeGreaterThan(0);
  });

  it("stands an avatar at its own edge even with its square to itself", () => {
    const projected = crowd(1); // the crowd is elsewhere, so the avatar's square is its own
    const offset = projected.avatars.p1.offset;
    expect(offset, "the avatar hugs its edge too, so its home site reads").not.toBeNull();
    expect(Math.sign(offset![1])).toBe(1);
    expect(Math.abs(offset![1])).toBeLessThan(TILE_SIZE / 2);
  });

  it("gives every card on a crowded tile its own spot", () => {
    const projected = crowd(5);
    const items = Object.values(projected.permanents)
      .flat()
      .filter((p) => p.instanceId?.startsWith("uX") && !p.attachedTo);
    expect(items.length).toBeGreaterThanOrEqual(5);
    const spots = new Set(items.map((p) => `${p.offset?.[0]?.toFixed(3)},${p.offset?.[1]?.toFixed(3)}`));
    // no two cards share a position any more
    expect(spots.size).toBe(items.length);
  });

  it("shrinks the cards so the row still fits inside the tile", () => {
    const items = Object.values(crowd(5).permanents)
      .flat()
      .filter((p) => p.instanceId?.startsWith("uX") && !p.attachedTo);
    const scale = items[0].scale ?? 1;
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.3);
    const widest = Math.max(...items.map((p) => Math.abs(p.offset?.[0] ?? 0)));
    expect(widest + (CARD_SHORT * scale) / 2).toBeLessThanOrEqual(TILE_SIZE / 2);
  });
});

describe("card arrangement (display only)", () => {
  /** three of our units on engine (0,2), clear of both avatars */
  const setup = () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 23, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    for (let i = 0; i < 3; i++) {
      game.units[`uA${i}`] = { ...avatar, id: `uA${i}`, isAvatar: false, name: `Arranged ${i}`, region: "surface", x: 0, y: 2 };
    }
    return { game, at: engineCellKey(0, 2), avatar };
  };
  const project = (game: ReturnType<typeof setup>["game"], arrangement: Arrangement) =>
    projectView(viewFor(game, 0), "surface", true, {}, new Set(), arrangement);
  /** where the card's centre is drawn, from its tile's centre (PermanentStack adds the owner nudge) */
  const centreOf = (projected: ReturnType<typeof projectView>, at: string, id: string) => {
    const item = projected.permanents[at].find((p) => p.instanceId === id)!;
    return { x: item.offset![0], z: getPermanentOwnerBaseZ(item.owner) + item.offset![1], item };
  };
  const ids = (projected: ReturnType<typeof projectView>, at: string) =>
    projected.permanents[at].filter((p) => !p.attachedTo).map((p) => p.instanceId);

  it("clamps an axis so the card stays inside its tile", () => {
    expect(clampToTile(0.1, 0.2, 0.5)).toBe(0.1);
    expect(clampToTile(0.9, 0.2, 0.5)).toBeCloseTo(0.3);
    expect(clampToTile(-0.9, 0.2, 0.5)).toBeCloseTo(-0.3);
    // a card wider than the tile stays centred
    expect(clampToTile(0.4, 0.7, 0.5)).toBe(0);
  });

  it("puts an arranged card where the player left it and leaves its neighbours alone", () => {
    const { game, at } = setup();
    const plain = project(game, {});
    const arranged = project(game, { uA0: { at, x: 0.1, y: -0.05, seq: 1 } });
    const got = centreOf(arranged, at, "uA0");
    expect(got.x).toBeCloseTo(0.1 * TILE_SIZE, 5);
    expect(got.z).toBeCloseTo(-0.05 * TILE_SIZE, 5);
    for (const id of ["uA1", "uA2"]) {
      expect(centreOf(arranged, at, id).item.offset).toEqual(centreOf(plain, at, id).item.offset);
    }
  });

  it("keeps a card dragged to the tile's edge inside it", () => {
    const { game, at } = setup();
    const projected = project(game, { uA1: { at, x: 0.5, y: 0.5, seq: 1 } });
    const { x, z, item } = centreOf(projected, at, "uA1");
    const scale = item.scale ?? 1;
    expect(x + (CARD_SHORT * scale) / 2).toBeLessThanOrEqual(TILE_SIZE / 2 + 1e-9);
    expect(z + (CARD_LONG * scale) / 2).toBeLessThanOrEqual(TILE_SIZE / 2 + 1e-9);
    expect(x).toBeGreaterThan(0);
  });

  it("draws the latest arranged card on top of its tile", () => {
    const { game, at } = setup();
    expect(ids(project(game, {}), at)).toEqual(["uA0", "uA1", "uA2"]);
    const once = project(game, { uA0: { at, x: 0, y: 0, seq: 1 } });
    expect(ids(once, at)).toEqual(["uA1", "uA2", "uA0"]);
    const twice = project(game, { uA0: { at, x: 0, y: 0, seq: 3 }, uA1: { at, x: 0, y: 0, seq: 2 } });
    expect(ids(twice, at)).toEqual(["uA2", "uA1", "uA0"]);
  });

  it("re-points a lifted card's status tokens at its new stack index", () => {
    const { game, at } = setup();
    game.units.uA0.ward = true;
    const projected = project(game, { uA0: { at, x: 0, y: 0, seq: 1 } });
    const stack = projected.permanents[at];
    const ward = stack.find((p) => p.instanceId === "uA0:ward")!;
    expect(stack[ward.attachedTo!.index].instanceId).toBe("uA0");
  });

  it("ignores an override from another tile and never moves a pinned card", () => {
    const { game, at } = setup();
    const plain = project(game, {});
    const elsewhere = project(game, { uA0: { at: "0,0", x: 0.3, y: 0.3, seq: 1 } });
    expect(centreOf(elsewhere, at, "uA0").item.offset).toEqual(centreOf(plain, at, "uA0").item.offset);
    const owner = Object.values(game.units).find((u) => u.isAvatar && u.owner === 1)!;
    game.units.uBig = { ...owner, id: "uBig", isAvatar: false, name: "Big", region: "surface", x: 1, y: 1, size: "2x2" };
    const bigAt = unitCell(game.units.uBig);
    const before = project(game, {}).permanents[bigAt].find((p) => p.instanceId === "uBig")!;
    const after = project(game, { uBig: { at: bigAt, x: 0.3, y: 0.3, seq: 1 } }).permanents[bigAt].find((p) => p.instanceId === "uBig")!;
    expect(after.offset).toEqual(before.offset);
  });

  it("arranges an avatar too, keyed by its unit id", () => {
    const { game, avatar } = setup();
    const at = engineCellKey(avatar.x, avatar.y);
    const projected = project(game, { [avatar.id]: { at, x: -0.1, y: 0.05, seq: 1 } });
    expect(projected.avatars.p1.offset![0]).toBeCloseTo(-0.1 * TILE_SIZE, 5);
    expect(projected.avatars.p1.offset![1]).toBeCloseTo(0.05 * TILE_SIZE, 5);
  });

  it("drops the override of a card that left its tile, and keeps the rest", () => {
    const { game, at } = setup();
    const arrangement: Arrangement = { uA0: { at, x: 0.1, y: 0, seq: 1 }, uA1: { at, x: -0.1, y: 0, seq: 2 } };
    expect(pruneArrangement(arrangement, game), "nothing moved: the same object").toBe(arrangement);
    game.units.uA0.x = 1; // moved to the next square
    delete game.units.uA1; // left the board
    expect(pruneArrangement(arrangement, game)).toEqual({});
    game.units.uA0.x = 0;
    expect(pruneArrangement(arrangement, game)).toEqual({ uA0: arrangement.uA0 });
  });

  it("only arranges cards that stand on one tile of their own", () => {
    const { game, at, avatar } = setup();
    expect(arrangeableCell(game, "uA0")).toBe(at);
    expect(arrangeableCell(game, avatar.id)).toBe(engineCellKey(avatar.x, avatar.y));
    expect(arrangeableCell(game, "nope")).toBeNull();
    game.units.uA2.size = "2x2";
    expect(arrangeableCell(game, "uA2"), "a multi-square body is pinned").toBeNull();
    game.artifacts.aX = { id: "aX", cardId: "c", name: "Thing", conjuredBy: 0, x: 0, y: 2, region: "surface", carriedBy: null, tapped: false };
    expect(arrangeableCell(game, "aX")).toBe(at);
    game.artifacts.aX.carriedBy = "uA0";
    expect(arrangeableCell(game, "aX"), "a carried artifact rides on its bearer").toBeNull();
  });
});

/**
 * Kept last in the file on purpose: loading the printing index is module-global, and earlier
 * tests assert on refs built WITHOUT it.
 */
describe("the cast card on the table", () => {
  const viewWith = (areaReveal: unknown) =>
    ({ flow: { areaReveal }, units: {}, sites: {} }) as unknown as Parameters<typeof boardReveal>[0];

  it("carries the card for a magic cast and nothing for an ability", async () => {
    // cardRefFor can only name art once the printing index is in (the session loads it at
    // match start); one entry only, so every other name in this file still resolves to null.
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        json: () => Promise.resolve({ entries: [[412, 7, 0, "Chain Lightning", "alp-chain_lightning-b-s", "", false, false]] }),
      }),
    );
    await loadCardIndex();

    const spell = boardReveal(
      viewWith({ seq: 1, cells: [], redSites: [{ x: 1, y: 1 }], name: "Chain Lightning", spell: true }),
      0,
    );
    expect(spell?.card?.name).toBe("Chain Lightning");
    expect(spell?.card?.slug).toBe("alp-chain_lightning-b-s");

    // an activated ability's caption is a sentence, and its source is already on the board —
    // laying a card down for it would both misread and duplicate the permanent
    const ability = boardReveal(
      viewWith({ seq: 2, cells: [], redSites: [{ x: 1, y: 1 }], name: "Cherubim shoots!" }),
      1,
    );
    expect(ability?.card).toBeNull();

    // a magic we hold no printing for must not put a blank rectangle on the board
    const unknown = boardReveal(viewWith({ seq: 3, cells: [], redSites: [{ x: 1, y: 1 }], name: "Dark Tower", spell: true }), 2);
    expect(unknown?.card).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("modified power and life", () => {
  it("says nothing about a unit standing at its printed numbers", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 11, 0 as PlayerId);
    // every unit is untouched, so there is nothing to report — the card art already says it
    expect(unitPower(game)).toEqual({});
  });

  it("reports the current numbers once a modifier is on the unit", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 11, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const unit = { ...avatar, id: "uBuff", isAvatar: false, name: "Ogre Goons", region: "surface" as const };
    game.units.uBuff = unit;
    const printed = getCard("Ogre Goons");
    expect(unitPower(game).uBuff, "unmodified to begin with").toBeUndefined();

    game.units.uBuff.modifiers = [{ kind: "power", amount: 2, duration: "permanent", turn: 0, sourcePlayer: 0 }];
    const after = unitPower(game).uBuff;
    expect(after, "a modified unit is reported").toBeTruthy();
    expect(after.atk).toBe((printed.attack ?? 0) + 2);
    expect(after.def).toBe((printed.defence ?? printed.attack ?? 0) + 2);
  });

  it("reports a debuff too, and never a negative number", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 11, 0 as PlayerId);
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    game.units.uWeak = { ...avatar, id: "uWeak", isAvatar: false, name: "Ogre Goons", region: "surface" };
    game.units.uWeak.modifiers = [{ kind: "power", amount: -99, duration: "permanent", turn: 0, sourcePlayer: 1 }];
    const after = unitPower(game).uWeak;
    expect(after.atk, "the engine floors power at zero").toBe(0);
    expect(after.def).toBe(0);
  });
});

describe("projecting for the seat-1 viewer", () => {
  // Online, either seat may be looking. Whoever is looking has to be P1 at the bottom of the
  // board, so the projection takes the viewer's seat and everything seat-shaped follows it.
  const freshGame = () => {
    const [a, b] = [enginePrecons[0], enginePrecons[1]];
    return createGame([toEngineDeck(a), toEngineDeck(b)], ["You", "Computer"], 23, 0 as PlayerId);
  };

  it("seats the viewer at the bottom and the opponent at the top", () => {
    const game = freshGame();
    const seen = projectView(viewFor(game, 1), "surface", true, {}, new Set(), {}, 1);
    for (const unit of Object.values(game.units)) {
      if (!unit.isAvatar) continue;
      const avatar = seen.avatars[unit.owner === 1 ? "p1" : "p2"];
      expect(avatar.pos && `${avatar.pos[0]},${avatar.pos[1]}`).toBe(engineCellKey(unit.x, unit.y, 1));
    }
    // seat 1's avatar starts at engine (2,3), which for this viewer is the near row
    expect(seen.avatars.p1.pos).toEqual([2, 3]);
    expect(seen.avatars.p2.pos).toEqual([2, 0]);
  });

  it("shows the viewer their own hand and hides the opponent's", () => {
    const game = freshGame();
    const seen = projectView(viewFor(game, 1), "surface", true, {}, new Set(), {}, 1);
    expect(seen.zones.p1.hand).toHaveLength(game.players[1].hand.length);
    expect(seen.zones.p1.hand.every((c) => c.name !== "Unknown")).toBe(true);
    expect(seen.zones.p2.hand.every((c) => c.name === "Unknown")).toBe(true);
  });

  it("is the seat-0 projection turned around, not mirrored", () => {
    const game = freshGame();
    // same engine state, both viewpoints: a square one viewer calls (x,y) the other calls
    // (4-x,3-y) — a left-right mirror would agree on x
    const mine = projectView(viewFor(game, 0), "surface", true, {}, new Set(), {}, 0);
    const theirs = projectView(viewFor(game, 1), "surface", true, {}, new Set(), {}, 1);
    const site = Object.values(game.sites).find((s) => !s.isRubble);
    if (site) {
      expect(mine.board.sites[engineCellKey(site.x, site.y, 0)]).toBeTruthy();
      expect(theirs.board.sites[engineCellKey(site.x, site.y, 1)]).toBeTruthy();
      const [mx, my] = engineCellKey(site.x, site.y, 0).split(",").map(Number);
      const [tx, ty] = engineCellKey(site.x, site.y, 1).split(",").map(Number);
      expect({ x: tx, y: ty }).toEqual({ x: 4 - mx, y: 3 - my });
    }
    // and each viewer's own seat owns the P1 side of every seat-derived field
    expect(mine.currentPlayer).toBe(game.activePlayer === 0 ? 1 : 2);
    expect(theirs.currentPlayer).toBe(game.activePlayer === 1 ? 1 : 2);
  });

  it("still defaults to seat 0 when no viewer is given", () => {
    const game = freshGame();
    const view = viewFor(game, 0);
    expect(projectView(view)).toEqual(projectView(view, "surface", true, {}, new Set(), {}, 0));
    expect(harbingerTiles(view)).toEqual(harbingerTiles(view, 0));
  });
});
