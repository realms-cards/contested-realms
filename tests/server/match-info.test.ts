import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildMatchInfo, fallbackDisplayName, ensurePlayerEntry } = require("../../server/matchInfo");

describe("matchInfo helpers", () => {
  it("returns ordered players using existing cache entries", () => {
    const playersMap = new Map([
      ["p1", { id: "p1", displayName: "Alice" }],
      ["p2", { id: "p2", displayName: "Bob" }],
    ]);
    const match = {
      id: "match1",
      playerIds: ["p2", "p1"],
      status: "waiting",
      seed: "seed123",
    };

    const result = buildMatchInfo(match, {
      playersMap,
      ensurePlayerCached: () => {},
    });

    expect(result.players).toEqual([
      { id: "p2", displayName: "Bob" },
      { id: "p1", displayName: "Alice" },
    ]);
    expect(result.playerIds).toEqual(["p2", "p1"]);
  });

  it("creates fallback entries for uncached players and triggers hydration", () => {
    const playersMap = new Map();
    const ensurePlayerCached = vi.fn().mockResolvedValue(undefined);

    const match = {
      id: "matchX",
      playerIds: ["p9"],
      status: "waiting",
      seed: "seed",
    };

    const result = buildMatchInfo(match, {
      playersMap,
      ensurePlayerCached,
    });

    expect(result.players).toEqual([
      { id: "p9", displayName: fallbackDisplayName("p9") },
    ]);
    expect(playersMap.get("p9")).toEqual({
      id: "p9",
      displayName: fallbackDisplayName("p9"),
      socketId: null,
      lobbyId: null,
      matchId: null,
    });
    expect(ensurePlayerCached).toHaveBeenCalledWith("p9");
  });

  it("ensurePlayerEntry reuses existing entries", () => {
    const playersMap = new Map([
      ["p5", { id: "p5", displayName: "Player 5", socketId: "s1", lobbyId: null, matchId: null }],
    ]);
    const ensureFn = vi.fn();
    const entry = ensurePlayerEntry(playersMap, ensureFn, "p5");
    expect(entry.displayName).toBe("Player 5");
    expect(ensureFn).not.toHaveBeenCalled();
  });
});
