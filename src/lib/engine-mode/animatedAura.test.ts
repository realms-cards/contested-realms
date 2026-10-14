import { applyAction, createGame, killUnit, occupiedSquares, viewFor } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { fieldTargets } from "@/lib/game/cpu/fieldTargets";
import { actionPaths, narrow, pathAreas, tokenForEngineId } from "./actionPaths";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { projectView, unitCell } from "./projection";

/**
 * Enchantress: "you may animate target aura until your next turn. It's an aura minion."
 *
 * The engine keeps that as TWO records sharing one card: the aura stays in `state.auras` (its area
 * keeps working and follows the minion) and a new unit carries `counters.animatedAura`. The board
 * must draw ONE card for it — the minion, centred over its body — and anything that targets the
 * aura by id has to land on that card.
 */
const P0 = 0 as PlayerId;
const SQUARE_2X2 = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];

function animate(auraSquares: { x: number; y: number }[], anchor?: { x: number; y: number }) {
  const deck = { ...toEngineDeck(enginePrecons[0]), avatar: "Enchantress" };
  const game = createGame([deck, deck], ["You", "Computer"], 7, P0);
  const enchantress = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
  // a site under every covered square, so the aura minion stands on the surface legally
  for (const sq of auraSquares) {
    if (Object.values(game.sites).some((site) => site.x === sq.x && site.y === sq.y)) continue;
    const id = `sTest${sq.x}${sq.y}`;
    game.cards[`c${id}`] = { id: `c${id}`, name: "Spire", owner: 0 };
    game.sites[id] = {
      id, cardId: `c${id}`, name: "Spire", owner: 0, controller: 0, x: sq.x, y: sq.y, tapped: false,
    } as unknown as EngineState["sites"][string];
  }
  game.cards.cAura = { id: "cAura", name: "Crusade", owner: 0 };
  game.auras.r1 = {
    id: "r1", cardId: "cAura", name: "Crusade", controller: 0, squares: auraSquares,
    ...(anchor ? { anchor } : {}), enteredTurn: -1,
  };
  // the real continuation Enchantress's trigger raises, answered with the aura
  game.prompts = [{
    id: "pTest", player: P0, kind: "chooseTargets", title: "animate",
    data: { candidates: ["r1"], count: 1, upTo: true, kind: "aura" },
    cont: "script:Enchantress:animate",
    ctx: { sourceId: enchantress.id, controller: 0, targets: [] },
  }];
  expect(applyAction(game, P0, { t: "prompt", promptId: "pTest", choice: ["r1"] })).toEqual({ ok: true });
  const minion = Object.values(game.units).find((u) => String(u.counters?.animatedAura ?? "") === "r1")!;
  expect(minion, "the aura became a minion").toBeTruthy();
  return { game, minion };
}

/** Every Crusade card on the board, by tile. */
function crusades(game: EngineState) {
  const projected = projectView(viewFor(game, P0));
  return Object.entries(projected.permanents).flatMap(([at, items]) =>
    items.filter((p) => p.card.name === "Crusade").map((p) => ({ at, id: p.instanceId, offset: p.offset })),
  );
}

describe("an Enchantress-animated aura", () => {
  it("is one card on the board, not two (2x2 aura)", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    expect(game.auras.r1, "the engine keeps the aura record").toBeDefined();
    const cards = crusades(game);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(minion.id);
  });

  it("is one card on the board, not two (1x1 aura)", () => {
    const { game, minion } = animate([{ x: 2, y: 2 }]);
    expect(crusades(game).map((c) => c.id)).toEqual([minion.id]);
  });

  it("draws the 2x2 minion centred over its body, not on the engine anchor's corner", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    expect(minion.size).toBe("2x2");
    const [card] = crusades(game);
    // engine (1,1)-(2,2) is board cells (2,1)-(3,2); the engine anchor (1,1) is board 3,2
    expect(card.at).toBe(unitCell(minion));
    expect(card.offset, "pinned at the body's centre").not.toBeNull();
  });

  it("lifts the pinned card above crowded neighbours; a lone 1x1 card gets no lift", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const items = Object.values(projectView(viewFor(game, P0)).permanents).flat();
    expect(items.find((p) => p.instanceId === minion.id)?.lift).toBeGreaterThan(0);
    for (const item of items) if (!item.offset) expect(item.lift, String(item.instanceId)).toBeUndefined();
  });

  it("shows the aura again, exactly once, when the animation expires", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    // how enchantress.ts startOfTurn dissolves it: the unit goes, the aura stays
    delete game.units[minion.id];
    expect(crusades(game).map((c) => c.id)).toEqual(["r1"]);
  });

  it("leaves nothing when the minion dies (the aura dies with it)", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    killUnit(game, minion.id);
    expect(game.auras.r1).toBeUndefined();
    expect(crusades(game)).toHaveLength(0);
  });

  it("routes a click on the aura to the minion's card", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    expect(tokenForEngineId(game, "r1")).toBe(`unit:perm:${minion.id}`);
  });

  it("tells a target on the minion from a target on its aura when both are offered", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const source = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const at = (targets: string[]): Action => ({ t: "activate", sourceId: source.id, ability: "zap", targets });
    const actions = [at([minion.id]), at(["r1"])];
    const { paths, labels } = actionPaths(game, actions);
    // every action still has a click path of its own
    for (const path of paths) expect(narrow(paths, path.steps).done).toEqual(path.action);
    // clicking the card asks which of the two is meant
    const card = `unit:perm:${minion.id}`;
    const prefix = paths[0].steps.slice(0, paths[0].steps.indexOf(card) + 1);
    const choice = narrow(paths, prefix);
    expect(choice.done).toBeNull();
    expect(choice.next).toHaveLength(2);
    expect(choice.next.map((t) => labels[t]).sort()).toEqual(["Crusade as a minion", "Crusade as an aura"]);
  });

  it("draws the aura-or-minion choice as an option row on the card's tile", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const source = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const at = (targets: string[]): Action => ({ t: "activate", sourceId: source.id, ability: "zap", targets });
    const { paths, labels } = actionPaths(game, [at([minion.id]), at(["r1"])]);
    const card = `unit:perm:${minion.id}`;
    const choice = narrow(paths, paths[0].steps.slice(0, paths[0].steps.indexOf(card) + 1));
    const field = fieldTargets({ tiles: choice.next, glow: [], sources: [], selected: null, labels });
    expect(field.rows).toHaveLength(1);
    expect(field.rows[0].at).toBe(unitCell(minion));
    expect(field.rows[0].options.map((o) => o.label).sort()).toEqual(["Crusade as a minion", "Crusade as an aura"]);
  });

  it("asks nothing extra when two DIFFERENT sources split the minion and its aura", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const source = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const actions: Action[] = [
      { t: "activate", sourceId: source.id, ability: "zap", targets: [minion.id] },
      { t: "activate", sourceId: source.id, ability: "bless", targets: ["r1"] },
    ];
    const { paths } = actionPaths(game, actions);
    for (const path of paths) expect(path.steps.at(-1)).toBe(`unit:perm:${minion.id}`);
  });

  it("asks nothing extra when only the aura is a target", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const source = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const { paths } = actionPaths(game, [{ t: "activate", sourceId: source.id, ability: "zap", targets: ["r1"] }]);
    expect(paths[0].steps.at(-1)).toBe(`unit:perm:${minion.id}`);
  });
});

describe("moving a multi-square body", () => {
  /** The four one-step shifts of the 2x2 minion, as the engine would list them. */
  const shifts = (game: EngineState, unitId: string): Action[] => {
    const unit = game.units[unitId];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
      .filter((sq) => sq.x >= 0 && sq.y >= 0 && sq.x <= 3 && sq.y <= 2)
      .map((sq) => ({ t: "moveAttack", unitId, path: [{ ...sq, region: "surface" as const }] }));
  };

  it("keys each destination on the footprint it would cover and previews all of it", () => {
    const { game, minion } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const actions = shifts(game, minion.id);
    expect(actions).toHaveLength(4);
    const { paths } = actionPaths(game, actions);
    const first = narrow(paths, [`unit:perm:${minion.id}`]);
    expect(first.next).toHaveLength(4);
    const areas = pathAreas(first.matching, first.prefix.length);
    expect(Object.keys(areas).sort()).toEqual([...first.next].sort());
    const here = unitCell(minion);
    for (const action of actions) {
      if (action.t !== "moveAttack") continue;
      const dest = action.path[0];
      const footprint = occupiedSquares({ ...minion, x: dest.x, y: dest.y }).map((sq) => engineCellKey(sq.x, sq.y));
      const token = paths.find((p) => p.action === action)!.steps[1];
      // the token is a cell of the destination footprint, and its area is that whole footprint
      expect(footprint).toContain(token);
      expect([...areas[token]].sort()).toEqual([...footprint].sort());
      // ...never the cell the body is drawn on right now, which would read as "stay put"
      expect(token).not.toBe(here);
    }
  });

  it("leaves 1x1 moves as plain tiles with no area", () => {
    const { game } = animate(SQUARE_2X2, { x: 1, y: 1 });
    const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
    const move: Action = { t: "moveAttack", unitId: avatar.id, path: [{ x: avatar.x, y: avatar.y + 1, region: "surface" }] };
    const { paths } = actionPaths(game, [move]);
    expect(paths[0].steps[1]).toBe(engineCellKey(avatar.x, avatar.y + 1));
    expect(paths[0].areas).toBeUndefined();
  });
});
