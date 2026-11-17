import { describe, expect, it } from "vitest";
import { clockReading, formatClock } from "./clock";

describe("engine chess clock display", () => {
  it("reads like a chess clock, tenths in the last minute", () => {
    expect(formatClock(12 * 60_000 + 5_000)).toBe("12:05");
    expect(formatClock(42_300)).toBe("0:42.3");
    expect(formatClock(-5)).toBe("0:00.0");
  });

  it("counts down only the seat the game is waiting on", () => {
    const game = { clock: { base: 60_000, inc: 0, remaining: [50_000, 40_000] as [number, number] }, phase: "main" as const, prompts: [], activePlayer: 1 as const, interject: null, flow: {} };
    const reading = clockReading(game, 1_000, 4_000)!;
    expect(reading.running).toBe(1);
    expect(reading.remaining).toEqual([50_000, 37_000]);
    expect(clockReading({ ...game, clock: undefined }, 0, 1)).toBeNull();
  });
});
