import { runningSeat } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";

/**
 * Chess clocks for rules-engine games. The engine holds the numbers (`state.clock`: each seat's
 * remaining milliseconds and the per-turn increment) and charges time only when the authority asks
 * it to (engine/clock.ts settleClock / flagFall): our session in single player, the server online.
 * This module is the client side of that: the presets offered when a game is set up, and what a
 * clock should read right now between two settlements.
 */

export interface EngineClockConfig {
  /** starting time per player, ms */
  base: number;
  /** added to a player's clock when they end their turn, ms */
  inc: number;
}

export const ENGINE_CLOCK_PRESETS: readonly { id: string; label: string; clock: EngineClockConfig | null }[] = [
  { id: "off", label: "Untimed", clock: null },
  { id: "10+5", label: "10 min + 5 s per turn", clock: { base: 10 * 60_000, inc: 5_000 } },
  { id: "20+10", label: "20 min + 10 s per turn", clock: { base: 20 * 60_000, inc: 10_000 } },
  { id: "30+15", label: "30 min + 15 s per turn", clock: { base: 30 * 60_000, inc: 15_000 } },
  { id: "45+20", label: "45 min + 20 s per turn", clock: { base: 45 * 60_000, inc: 20_000 } },
];

export function clockPreset(id: string): EngineClockConfig | null {
  return ENGINE_CLOCK_PRESETS.find((p) => p.id === id)?.clock ?? null;
}

/** "12:05", or "0:42.3" under a minute, the way a chess clock reads. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  if (minutes >= 1) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `0:${String(seconds).padStart(2, "0")}.${Math.floor((clamped % 1000) / 100)}`;
}

/** The time ladder a player may give their opponent (the engine's `addTime` action). */
export const CLOCK_GIFTS: readonly { label: string; ms: number }[] = [
  { label: "+30 s", ms: 30_000 },
  { label: "+1 min", ms: 60_000 },
  { label: "+2 min", ms: 120_000 },
  { label: "+5 min", ms: 300_000 },
];

export interface ClockReading {
  /** each seat's time left, ms, counted down to `now` */
  remaining: [number, number];
  /** whose clock is running, or null (no clock running: mulligan, game over) */
  running: PlayerId | null;
}

/**
 * What the clocks read at `now`, given the state as it was at `settledAt` (when the authority last
 * charged it: the session's last settlement, or the moment the server's view arrived). Only the
 * running seat's time moves in between.
 */
export function clockReading(game: Pick<EngineState, "clock" | "phase" | "prompts" | "activePlayer" | "interject" | "flow">, settledAt: number, now: number): ClockReading | null {
  const clock = game.clock;
  if (!clock) return null;
  const running = runningSeat(game as EngineState);
  const elapsed = running === null ? 0 : Math.max(0, now - settledAt);
  const remaining: [number, number] = [clock.remaining[0], clock.remaining[1]];
  if (running !== null) remaining[running] = Math.max(0, remaining[running] - elapsed);
  return { remaining, running };
}
