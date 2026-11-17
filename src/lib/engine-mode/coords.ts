import { ARROW_STEPS, type ArrowDirection } from "@/lib/game/cpu/fieldTargets";
import type { CellKey } from "@/lib/game/store/types";
import { GRID_H, GRID_W } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";

/**
 * The engine seat whose side of the table we are drawing from. Single-player is always seat 0,
 * so every orientation function defaults to it and existing callers are unaffected.
 */
export type ViewerSeat = PlayerId;

/**
 * The engine draws its board the way a seat-0 player sees it: x runs left to right and y runs
 * AWAY from seat 0 (seat 0's avatar starts at engine (2,0)). Its cards rely on that handedness —
 * Southpaw Dyrodor's "left" is -x for seat 0, and the Codex puts East on the first player's right
 * (None Survive the Sun). Our board puts the VIEWER at the bottom (y=3) with y growing DOWN the
 * screen, so a seat-0 viewer only needs y flipped: x passes through and left stays left. A seat-1
 * viewer sits across the table, so their view is that one turned 180°: x flips and the two y
 * flips cancel. (An earlier mapping negated both axes for seat 0; with our downward y that is a
 * left-right MIRROR, which swung Dyrodor's tail the wrong way.)
 * Derived, not guessed: seat 0's avatar starts at engine (2,0) and must land on the near row,
 * board (2,3); seat 1's starts at engine (2,3) and must land on that same near row.
 * Both maps are their own inverse, which is why `boardToEngine` is the very same function.
 */
export function engineToBoard(x: number, y: number, viewer: ViewerSeat = 0): { x: number; y: number } {
  return viewer === 0 ? { x, y: GRID_H - 1 - y } : { x: GRID_W - 1 - x, y };
}

export const boardToEngine = engineToBoard;

export function engineCellKey(x: number, y: number, viewer: ViewerSeat = 0): CellKey {
  const p = engineToBoard(x, y, viewer);
  return `${p.x},${p.y}`;
}

export function cellKeyToEngine(key: CellKey, viewer: ViewerSeat = 0): { x: number; y: number } {
  const [bx, by] = key.split(",").map(Number);
  return boardToEngine(bx, by, viewer);
}

export type EngineDirection = "n" | "s" | "e" | "w";
export const ENGINE_DIRECTIONS: readonly EngineDirection[] = ["n", "s", "e", "w"];
/** The engine's own step per direction (effects.ts directionReach): seat 0 sits at y=0, so
 *  north runs AWAY from the human and y grows with it. */
export const ENGINE_STEPS: Record<EngineDirection, readonly [number, number]> = {
  n: [0, 1],
  s: [0, -1],
  e: [1, 0],
  w: [-1, 0],
};

/**
 * Engine n/s/e/w as one of our board arrows, per viewer.
 *  • Seat-0 viewer: only y flips, and our y grows downward, so the two cancel: engine north runs
 *    up the screen and east stays on the right. The engine's compass reads as printed.
 *  • Seat-1 viewer: the same table turned 180°, so every direction is its opposite.
 * Derived rather than guessed (see engineToBoard), and checked by stepping in engine space and
 * mapping both ends (coords.test.ts).
 */
export const BOARD_DIRECTIONS: Record<ViewerSeat, Record<EngineDirection, ArrowDirection>> = {
  0: { n: "N", s: "S", e: "E", w: "W" },
  1: { n: "S", s: "N", e: "W", w: "E" },
};

/** The seat-0 table on its own, for single-player callers that have no viewer to pass. */
export const BOARD_DIRECTION: Record<EngineDirection, ArrowDirection> = BOARD_DIRECTIONS[0];

/** The board arrow for an engine step, or null when the step is not a single orthogonal move. */
export function boardArrowForStep(dx: number, dy: number): ArrowDirection | null {
  for (const [dir, [sx, sy]] of Object.entries(ARROW_STEPS) as [ArrowDirection, readonly [number, number]][]) {
    if (sx === dx && sy === dy) return dir;
  }
  return null;
}

/** Our board tile number (1–20, left→right, top→bottom) for an engine square. */
export function engineTileNumber(x: number, y: number, viewer: ViewerSeat = 0): number {
  const p = engineToBoard(x, y, viewer);
  return p.y * 5 + p.x + 1;
}

/**
 * Engine text (log lines, prompt titles) names squares in its own space (seat 0's view), in TWO
 * spellings, and they do NOT share a base:
 *   • `squareLabel(x,y)` → "b3": letter is 0-based x, number is 1-based y. (combat, judge…)
 *   • `plays <site> at (x+1,y+1)` → "(2,3)": BOTH 1-based. (casting.ts:207)
 * A bare "(x,y)" elsewhere is raw 0-based (turn.ts orderLabels) and overlaps the 1-based
 * range, so it is deliberately left alone rather than guessed at.
 */
/** The engine writes every line in the third person ("You plays…"), since "You" is just the
 *  seat's name. Fix the verb when a line is about the player. */
function fixPerson(text: string): string {
  // at the start of the line, or after a card's "Name: " ("Thaïs's bargain: You plays this turn…")
  return text
    .replace(/(^|: )You ([a-z]+)\b/, (whole, lead: string, verb: string) => {
      if (/(?:s|sh|ch|x|z)es$/.test(verb)) return `${lead}You ${verb.slice(0, -2)}`; // banishes → banish
      if (/[^aeiou]ies$/.test(verb)) return `${lead}You ${verb.slice(0, -3)}y`; // tries → try
      if (/s$/.test(verb) && !/ss$/.test(verb)) return `${lead}You ${verb.slice(0, -1)}`; // plays → play
      return whole; // not a third-person verb ("You have…")
    })
    .replace(/\b(for|to|from|against) You\b/g, "$1 you");
}

export function localizeEngineText(text: string, viewer: ViewerSeat = 0): string {
  return fixPerson(text)
    .replace(/\bat \((\d+),\s*(\d+)\)/g, (whole, x, y) => {
      const ex = Number(x) - 1;
      const ey = Number(y) - 1;
      if (ex < 0 || ex >= GRID_W || ey < 0 || ey >= GRID_H) return whole;
      return `at tile ${engineTileNumber(ex, ey, viewer)}`;
    })
    .replace(/\b([a-e])([1-4])\b/g, (_, col: string, row: string) =>
      `tile ${engineTileNumber(col.charCodeAt(0) - 97, Number(row) - 1, viewer)}`,
    );
}
