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
 * The engine puts seat 0 at y=0; our board puts the VIEWER at the bottom (y=3). For a seat-0
 * viewer that is a 180° rotation — a rotation rather than a mirror, so left/right stay correct.
 * A seat-1 viewer sits on the far side of the same table, so their view is the seat-0 view
 * turned another 180°, and two half-turns compose to the identity: engine squares pass through
 * untouched. Derived, not guessed: seat 0's avatar starts at engine (2,0) and must land on the
 * near row, board (2,3) — the rotation puts it there; seat 1's starts at engine (2,3) and must
 * land on that same near row — the identity puts it there.
 * Both maps are their own inverse, which is why `boardToEngine` is the very same function.
 */
export function engineToBoard(x: number, y: number, viewer: ViewerSeat = 0): { x: number; y: number } {
  return viewer === 0 ? { x: GRID_W - 1 - x, y: GRID_H - 1 - y } : { x, y };
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
 * Engine n/s/e/w as one of our board arrows, per viewer. The two viewers differ in WHICH axis
 * flips, not in sign, so seat 1 is emphatically not seat 0 negated:
 *  • Seat-0 viewer: the board is the engine rotated 180°, which negates BOTH axes — but our
 *    board's y also grows downward (y=0 is the far row), so the two inversions cancel on the
 *    vertical axis. Engine north still runs up the screen; only east and west swap.
 *  • Seat-1 viewer: no rotation, so x passes through and east stays east — but the downward y
 *    now inverts on its own, so north and south swap instead.
 * Derived rather than guessed: seat 0's avatar starts at engine (2,0) and `engineToBoard` puts
 * it at board (2,3), the near row; seat 1's starts at engine (2,3) and lands on that same row.
 */
export const BOARD_DIRECTIONS: Record<ViewerSeat, Record<EngineDirection, ArrowDirection>> = {
  0: { n: "N", s: "S", e: "W", w: "E" },
  1: { n: "S", s: "N", e: "E", w: "W" },
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
 * Engine text (log lines, prompt titles) names squares in its own rotated space, in TWO
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
