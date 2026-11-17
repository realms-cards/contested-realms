import { describe, expect, it } from "vitest";
import { applyAction, createGame, getScript, makeCtx } from "@sorcery/shared";
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { actionPaths, narrow } from "./actionPaths";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";
import { chartedMoves } from "./routes";

const YOU = 0 as PlayerId;

/**
 * Your main phase on a board of your own sites: a runner at engine (2,1), two sturdy allies
 * standing by at (1,1) and (3,1), and the runner given Blaze (Movement +2, a trail of fire).
 */
function blazeRunner(blazed = true): GameState {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 11, YOU);
  game.phase = "main";
  game.prompts = [];
  game.activePlayer = YOU;
  game.turn = 5;
  let n = 0;
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 4; y++) {
      const id = `s${90 + n++}`;
      game.cards[`c${id}`] = { id: `c${id}`, name: "Spire", owner: YOU } as GameState["cards"][string];
      game.sites[id] = { id, cardId: `c${id}`, name: "Spire", x, y, owner: YOU, controller: YOU, isRubble: false, tapped: false } as GameState["sites"][string];
    }
  }
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === YOU)!;
  const base = { ...avatar, isAvatar: false, tapped: false, damage: 0, enteredTurn: 1, counters: {}, modifiers: [], carrying: [], carryingUnits: [], region: "surface" as const };
  for (const [id, x] of [["uRunner", 2], ["uWest", 1], ["uEast", 3]] as const) {
    game.cards[`c${id}`] = { id: `c${id}`, name: "Southpaw Dyrodor", owner: YOU } as GameState["cards"][string];
    game.units[id] = { ...base, id, cardId: `c${id}`, name: "Southpaw Dyrodor", x, y: 1 };
  }
  if (blazed) {
    game.cards.cBlaze = { id: "cBlaze", name: "Blaze", owner: YOU } as GameState["cards"][string];
    getScript("Blaze")!.onCast!(makeCtx(game, "cBlaze", YOU, [{ unit: "uRunner" }]));
  }
  return game;
}

/** Click through `tokens` the way the board does: each click extends the auto-advanced prefix. */
function clickThrough(paths: ReturnType<typeof actionPaths>["paths"], tokens: string[]) {
  let state = narrow(paths, []);
  for (const token of tokens) {
    expect(state.next, `${token} is offered`).toContain(token);
    state = narrow(paths, [...state.prefix, token]);
  }
  return state;
}

describe("charting a route", () => {
  it("offers nothing to chart for a unit that can only take one step", () => {
    const game = blazeRunner(false);
    expect(chartedMoves(game, legalActionsWithCasters(game, YOU), "uRunner")).toEqual([]);
  });

  it("lets a Blaze runner choose where its trail of fire goes", () => {
    const game = blazeRunner();
    const legal = legalActionsWithCasters(game, YOU);
    const runner = "unit:perm:uRunner";
    // the plain click on a destination keeps the engine's single shortest route
    const plain = actionPaths(game, legal, YOU, 0);
    expect(plain.paths.some((p) => p.steps.some((s) => s.endsWith(":route")))).toBe(false);

    const { paths, labels } = actionPaths(game, legal, YOU, 0, runner);
    const chart = Object.keys(labels).find((t) => t.endsWith(":route"))!;
    expect(labels[chart]).toBe("Choose the route");
    // up past the west ally, across, and down onto the square above where it started
    const via = [engineCellKey(1, 1), engineCellKey(1, 2), engineCellKey(2, 2)];
    // a stop part-way offers "End the move here" beside the squares it could go on to
    const midway = clickThrough(paths, [runner, chart, via[0]]);
    const stop = midway.next.find((t) => t.endsWith(":route-end"))!;
    expect(labels[stop]).toBe("End the move here");
    expect(midway.next).toContain(via[1]);
    // its third step spends the last of its movement, so the walk ends there by itself
    const walk = clickThrough(paths, [runner, chart, ...via]);
    expect(walk.next).toEqual([]);
    const done = walk.done as Extract<Action, { t: "moveAttack" }>;
    expect(done.path.map((s) => [s.x, s.y])).toEqual([[1, 1], [1, 2], [2, 2]]);

    expect(applyAction(game, YOU, done).ok).toBe(true);
    expect([game.units.uRunner.x, game.units.uRunner.y]).toEqual([2, 2]);
    // the runner departed (2,1), (1,1) and (1,2): the ally it passed burns, the other does not
    expect(game.units.uWest.damage).toBe(2);
    expect(game.units.uEast.damage).toBe(0);
  });

  it("can step out and back to stand where it started", () => {
    const game = blazeRunner();
    const legal = legalActionsWithCasters(game, YOU);
    const charted = chartedMoves(game, legal, "uRunner");
    const loop = charted.find((a) => !a.attack && a.path.length === 2 && a.path[1].x === 2 && a.path[1].y === 1 && a.path[0].x === 3);
    expect(loop).toBeDefined();
    expect(applyAction(game, YOU, loop!).ok).toBe(true);
    expect([game.units.uRunner.x, game.units.uRunner.y]).toEqual([2, 1]);
    // it departed (2,1) and (3,1): the east ally burns this time
    expect(game.units.uEast.damage).toBe(2);
    expect(game.units.uWest.damage).toBe(0);
  });
});
