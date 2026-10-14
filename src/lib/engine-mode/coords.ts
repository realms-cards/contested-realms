import { ARROW_STEPS, type ArrowDirection } from "@/lib/game/cpu/fieldTargets";
import type { CellKey } from "@/lib/game/store/types";
import { GRID_H, GRID_W } from "@sorcery/shared";

/**
 * The engine puts seat 0 at y=0; our board puts P1 (the human, seat 0) at the
 * bottom (y=3). Rotate 180° rather than mirror so left/right stay correct.
 * The rotation is its own inverse.
 */
export function engineToBoard(x: number, y: number): { x: number; y: number } {
  return { x: GRID_W - 1 - x, y: GRID_H - 1 - y };
}

export const boardToEngine = engineToBoard;

export function engineCellKey(x: number, y: number): CellKey {
  const p = engineToBoard(x, y);
  return `${p.x},${p.y}`;
}

export function cellKeyToEngine(key: CellKey): { x: number; y: number } {
  const [bx, by] = key.split(",").map(Number);
  return boardToEngine(bx, by);
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
 * Engine n/s/e/w as one of our board arrows. The board is the engine rotated 180°, which
 * negates BOTH axes — but our board's y also grows downward (y=0 is the far row), so the
 * two inversions cancel on the vertical axis: engine north still runs up the screen, while
 * east and west swap. Derived rather than guessed: seat 0's avatar starts at engine (2,0)
 * and `engineToBoard` puts it at board (2,3), the near row.
 */
export const BOARD_DIRECTION: Record<EngineDirection, ArrowDirection> = { n: "N", s: "S", e: "W", w: "E" };

/** The board arrow for an engine step, or null when the step is not a single orthogonal move. */
export function boardArrowForStep(dx: number, dy: number): ArrowDirection | null {
  for (const [dir, [sx, sy]] of Object.entries(ARROW_STEPS) as [ArrowDirection, readonly [number, number]][]) {
    if (sx === dx && sy === dy) return dir;
  }
  return null;
}

/** Our board tile number (1–20, left→right, top→bottom) for an engine square. */
export function engineTileNumber(x: number, y: number): number {
  const p = engineToBoard(x, y);
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

export function localizeEngineText(text: string): string {
  return fixPerson(text)
    .replace(/\bat \((\d+),\s*(\d+)\)/g, (whole, x, y) => {
      const ex = Number(x) - 1;
      const ey = Number(y) - 1;
      if (ex < 0 || ex >= GRID_W || ey < 0 || ey >= GRID_H) return whole;
      return `at tile ${engineTileNumber(ex, ey)}`;
    })
    .replace(/\b([a-e])([1-4])\b/g, (_, col: string, row: string) =>
      `tile ${engineTileNumber(col.charCodeAt(0) - 97, Number(row) - 1)}`,
    );
}
