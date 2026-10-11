import { applyAction, createGame, viewFor } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { actionPaths, narrow } from "./actionPaths";
import { legalActionsWithCasters } from "./casterActions";
import { engineCellKey } from "./coords";
import { apiDeckToEngine, enginePrecons, toEngineDeck } from "./decks";
import { auraPlacement, boardReveal, harbingerTiles, hiddenLayerCounts, layerOf, projectView } from "./projection";
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

  it("rotates damaged squares into board cells and sums repeats", () => {
    const reveal = boardReveal(
      viewWith({
        seq: 3,
        // engine (2,0) is our bottom centre (tile 18); hit twice by one volley
        cells: [
          { x: 2, y: 0, dmg: 2 },
          { x: 2, y: 0, dmg: 1 },
          { x: 0, y: 3, dmg: 4 },
        ],
        redSites: [],
        name: "Flame Wave",
      }),
      0,
    );
    expect(reveal).not.toBeNull();
    expect(reveal?.name).toBe("Flame Wave");
    const hits = Object.fromEntries((reveal?.hits ?? []).map((h) => [h.at, h.dmg]));
    expect(hits).toEqual({ [engineCellKey(2, 0)]: 3, [engineCellKey(0, 3)]: 4 });
  });

  it("only fires once per engine seq", () => {
    const area = { seq: 5, cells: [{ x: 1, y: 1, dmg: 1 }], redSites: [], name: "Zap" };
    expect(boardReveal(viewWith(area), 4)).not.toBeNull();
    // a cosmetic re-project at the same seq must not replay the animation
    expect(boardReveal(viewWith(area), 5)).toBeNull();
    expect(boardReveal(viewWith(area), 9)).toBeNull();
  });

  it("does not glow a square that already shows a damage number", () => {
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
    expect(reveal?.hits).toHaveLength(1);
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
