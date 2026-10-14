import { createGame } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { actionPaths, narrow } from "./actionPaths";
import { attackRefused } from "@shared/engine/casterActions";
import { enginePrecons, toEngineDeck } from "./decks";
import { unitCell } from "./projection";

/**
 * "Attack here": a minion attacking what shares its square (the engine's empty-path moveAttack)
 * used to need the minion, then its OWN tile — which the minion itself covers — then the target.
 * Each such attack is now also a labelled option right after the minion.
 */
const P0 = 0 as PlayerId;

function board() {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 11, P0);
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === 0)!;
  const at = { x: 2, y: 1, region: "surface" as const };
  const unit = (id: string, name: string, owner: PlayerId) =>
    ({ ...avatar, ...at, id, name, owner, controller: owner, isAvatar: false }) as EngineState["units"][string];
  game.units.mine = unit("mine", "Rimland Nomads", 0);
  game.units.foe = unit("foe", "Sacred Scarabs", 1);
  game.sites.s1 = {
    id: "s1", cardId: "cs1", name: "Spire", owner: 1, controller: 1, x: at.x, y: at.y, tapped: false,
  } as unknown as EngineState["sites"][string];
  const attackFoe: Action = { t: "moveAttack", unitId: "mine", path: [], attack: { unit: "foe" } };
  const attackSite: Action = { t: "moveAttack", unitId: "mine", path: [], attack: { site: "s1" } };
  const move: Action = { t: "moveAttack", unitId: "mine", path: [{ x: 2, y: 2, region: "surface" }] };
  return { game, attackFoe, attackSite, move };
}

describe("attack here", () => {
  it("offers each same-square attack as a labelled option after the minion", () => {
    const { game, attackFoe, attackSite, move } = board();
    const { paths, labels } = actionPaths(game, [move, attackFoe, attackSite]);
    const after = narrow(paths, ["unit:perm:mine"]);
    const options = after.next.filter((t) => t.startsWith("opt:"));
    expect(options.map((t) => labels[t]).sort()).toEqual(["Attack Sacred Scarabs", "Attack Spire"]);
    // the options hang on the minion's own tile, like its abilities
    const tile = unitCell(game.units.mine);
    for (const t of options) expect(t.startsWith(`opt:${tile}:`)).toBe(true);
    const foe = options.find((t) => labels[t] === "Attack Sacred Scarabs")!;
    expect(narrow(paths, ["unit:perm:mine", foe])).toMatchObject({ done: attackFoe, next: [] });
    const site = options.find((t) => labels[t] === "Attack Spire")!;
    expect(narrow(paths, ["unit:perm:mine", site])).toMatchObject({ done: attackSite, next: [] });
  });

  it("keeps the old tile-first paths and moving elsewhere working", () => {
    const { game, attackFoe, move } = board();
    const { paths } = actionPaths(game, [move, attackFoe]);
    const tile = unitCell(game.units.mine);
    const viaTile = narrow(paths, ["unit:perm:mine", tile]);
    // the region and the lone target auto-advance, exactly as before
    expect(viaTile.prefix.at(-1)).toBe("unit:perm:foe");
    expect(viaTile.done).toEqual(attackFoe);
    const all = narrow(paths, ["unit:perm:mine"]);
    const moveTile = paths.find((p) => p.action === move)!.steps[1];
    expect(all.next).toContain(moveTile);
    const end = narrow(paths, paths.find((p) => p.action === move)!.steps);
    expect(end.done).toEqual(move);
  });

  it("says 'Attack here' and picks on the board when two targets share a name", () => {
    const { game, attackFoe } = board();
    game.units.foe2 = { ...game.units.foe, id: "foe2" };
    const attackFoe2: Action = { t: "moveAttack", unitId: "mine", path: [], attack: { unit: "foe2" } };
    const { paths, labels } = actionPaths(game, [attackFoe, attackFoe2]);
    const options = narrow(paths, ["unit:perm:mine"]).next.filter((t) => t.startsWith("opt:"));
    expect(options.map((t) => labels[t])).toEqual(["Attack here"]);
    const pick = narrow(paths, ["unit:perm:mine", options[0]]);
    expect(pick.next.sort()).toEqual(["unit:perm:foe", "unit:perm:foe2"]);
    expect(narrow(paths, [...pick.prefix, "unit:perm:foe2"]).done).toEqual(attackFoe2);
  });

  it("adds nothing for an attack that moves first", () => {
    const { game } = board();
    const charge: Action = { t: "moveAttack", unitId: "mine", path: [{ x: 2, y: 2, region: "surface" }], attack: { unit: "foe" } };
    const { paths, labels } = actionPaths(game, [charge]);
    expect(Object.values(labels).some((l) => /^Attack (here|Sacred)/.test(l))).toBe(false);
    expect(paths).toHaveLength(1);
  });

  it("never offers an attack the engine refuses after tapping (an Airborne target, Stealth)", () => {
    const { game, attackFoe, attackSite } = board();
    // Sacred Scarabs are Airborne; Rimland Nomads are not
    expect(attackRefused(game, attackFoe)).toBe(true);
    expect(attackRefused(game, attackSite)).toBe(false);
    game.units.foe = { ...game.units.foe, name: "Ogre Goons" };
    expect(attackRefused(game, attackFoe)).toBe(false);
    game.units.foe = { ...game.units.foe, stealth: true };
    expect(attackRefused(game, attackFoe)).toBe(true);
  });
});
