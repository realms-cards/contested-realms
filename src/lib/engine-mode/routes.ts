import { enumeratePaths, loopRoutes } from "@sorcery/shared";
import type { Action, GameState as EngineState, Step } from "@sorcery/shared";

/**
 * Routes a player charts for a move. The engine's legal list holds ONE path per destination (its
 * shortest, from reachableWithPaths), but it walks whatever legal path it is handed, step by step,
 * and some effects care which squares were crossed: Blaze sets fire to every square the runner
 * departs, departed-square triggers (Giant Shark, Root Spider), a site stepped through. The engine
 * ships the enumerators its own client uses to offer routes (movement.ts enumeratePaths /
 * loopRoutes); this turns them into whole Move & Attack actions, one per route.
 */

export type MoveAction = Extract<Action, { t: "moveAttack" }>;

/** Routes kept per destination: the engine caps its own search too; this keeps the click tree small. */
const ROUTES_PER_DEST = 24;
/** A board dense with free-step sites can make enumeration slow; stop adding destinations past this. */
const BUDGET_MS = 300;

const stepKey = (s: Step): string => `${s.x},${s.y},${s.region}`;
const routeKey = (path: readonly Step[]): string => path.map(stepKey).join(">");

/**
 * Every charted variant of `unitId`'s legal moves and attacks: the same destination and attack,
 * by each route there (overshoot-and-return included), plus stepping out and back to stand where
 * it started (a Blaze runner can burn a neighbour and stay put). Empty when no destination can be
 * reached more than one way: nothing to chart. Multi-square bodies are left out, as the engine's
 * own loop routes leave them out: a footprint's path is a different problem.
 */
export function chartedMoves(game: EngineState, actions: readonly Action[], unitId: string): MoveAction[] {
  const unit = game.units[unitId];
  if (!unit || unit.size === "2x2" || (unit.extraSquares?.length ?? 0) > 0) return [];
  const moves = actions.filter((a): a is MoveAction => a.t === "moveAttack" && a.unitId === unitId);
  if (!moves.length) return [];
  const start: Step = { x: unit.x, y: unit.y, region: unit.region };
  const startKey = stepKey(start);

  const byDest = new Map<string, { dest: Step; moves: MoveAction[] }>();
  for (const move of moves) {
    const dest = move.path[move.path.length - 1] ?? start;
    const key = stepKey(dest);
    const entry = byDest.get(key) ?? { dest, moves: [] };
    entry.moves.push(move);
    byDest.set(key, entry);
  }

  let loops: Step[][] = [];
  try {
    loops = loopRoutes(game, unit);
  } catch {
    // a script that cannot answer here leaves the unit without loops; its moves still stand
  }
  const routes = new Map<string, Step[][]>();
  const began = Date.now();
  for (const [key, { dest, moves: list }] of byDest) {
    if (key === startKey) {
      routes.set(key, loops);
      continue;
    }
    let found: Step[][] = [];
    if (Date.now() - began < BUDGET_MS) {
      try {
        found = enumeratePaths(game, unit, dest, ROUTES_PER_DEST, { allLengths: true });
      } catch {
        found = [];
      }
    }
    // the engine's own path always stays on offer, whatever the search found in time
    const unique = new Map<string, Step[]>();
    for (const path of [list[0].path, ...found]) if (path.length) unique.set(routeKey(path), path);
    routes.set(key, [...unique.values()]);
  }

  const choice = loops.length > 0 || [...routes.entries()].some(([key, list]) => key !== startKey && list.length > 1);
  if (!choice) return [];

  const out: MoveAction[] = [];
  for (const [key, { moves: list }] of byDest) {
    for (const path of routes.get(key) ?? []) {
      for (const move of list) out.push({ ...move, path: path.map((s) => ({ ...s })) });
    }
  }
  // standing where it started after the loop: a plain move the legal list never holds
  for (const loop of loops) out.push({ t: "moveAttack", unitId, path: loop.map((s) => ({ ...s })) });
  return out;
}
