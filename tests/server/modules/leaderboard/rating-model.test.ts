import { describe, expect, it } from "vitest";

import {
  applyGame,
  classifyResult,
  clipToPairCap,
  compareRows,
  isInactive,
  isProvisional,
  LADDER,
  replayGames,
  repeatMultiplier,
  summarize,
  type LadderGame,
  type LadderRow,
  type LadderState,
} from "../../../../server/modules/leaderboard/rating-model";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

let seq = 0;
function game(
  overrides: Partial<LadderGame> & { completedAt: number },
): LadderGame {
  seq += 1;
  const winnerId = overrides.winnerId ?? "A";
  const loserId = overrides.loserId ?? "B";
  return {
    matchId: `m${String(seq).padStart(4, "0")}`,
    playerIds: overrides.isDraw
      ? (overrides.playerIds ?? ["A", "B"])
      : [winnerId, loserId],
    winnerId: overrides.isDraw ? null : winnerId,
    loserId: overrides.isDraw ? null : loserId,
    isDraw: false,
    rated: true,
    ratedMode: "full",
    tournamentId: null,
    ...overrides,
  };
}

function rating(state: LadderState, id: string): number {
  return state.get(id)?.rating ?? NaN;
}

describe("rating-model primitives", () => {
  it("repeat multiplier decays with recent games and ignores tournaments", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => repeatMultiplier(n, false))).toEqual([
      1, 1, 0.5, 0.25, 0, 0,
    ]);
    expect(repeatMultiplier(9, true)).toBe(1);
  });

  it("marks players inactive after two months without a rated game", () => {
    expect(LADDER.INACTIVE_AFTER_MS).toBe(60 * DAY);
    expect(isInactive(T0, T0 + 59 * DAY)).toBe(false);
    expect(isInactive(T0, T0 + 60 * DAY)).toBe(false);
    expect(isInactive(T0, T0 + 60 * DAY + 1)).toBe(true);
    expect(isInactive(T0, T0 + 132 * DAY)).toBe(true);
    expect(isInactive(null, T0)).toBe(true);
  });

  it("clips deltas to the pair cap", () => {
    expect(clipToPairCap(16, 0)).toBe(16);
    expect(clipToPairCap(9, 77)).toBe(3);
    expect(clipToPairCap(9, 80)).toBe(0);
    expect(clipToPairCap(-6, -80)).toBe(0);
    expect(clipToPairCap(26, -80)).toBe(26);
  });

  it("gates provisional on both thresholds", () => {
    expect(isProvisional(4, 12)).toBe(true);
    expect(isProvisional(5, 9)).toBe(true);
    expect(isProvisional(5, 10)).toBe(false);
  });
});

describe("classifyResult", () => {
  const base = {
    reason: "normal_end",
    turn: 12,
    durationSec: 900,
    hasGuest: false,
    sameNetwork: false,
    verified: true,
    missingUser: false,
    loserKnown: true,
    isPrecon: false,
  };

  it("rates an ordinary finished game in full", () => {
    expect(classifyResult(base)).toEqual({
      rated: true,
      ratedMode: "full",
      unratedReason: null,
    });
  });

  it("follows the unrated precedence order", () => {
    expect(
      classifyResult({
        ...base,
        hasGuest: true,
        missingUser: true,
        sameNetwork: true,
      }).unratedReason,
    ).toBe("guest");
    expect(
      classifyResult({ ...base, missingUser: true, isPrecon: true })
        .unratedReason,
    ).toBe("missing_user");
    expect(
      classifyResult({ ...base, isPrecon: true, sameNetwork: true })
        .unratedReason,
    ).toBe("precon");
    expect(
      classifyResult({ ...base, sameNetwork: true, verified: false })
        .unratedReason,
    ).toBe("same_network");
    expect(classifyResult({ ...base, verified: false }).unratedReason).toBe(
      "unverified_result",
    );
  });

  it("never rates a match against a CPU bot", () => {
    expect(classifyResult({ ...base, hasCpu: true })).toEqual({
      rated: false,
      ratedMode: "full",
      unratedReason: "cpu",
    });
    expect(
      classifyResult({
        ...base,
        hasCpu: true,
        hasGuest: true,
        reason: "forfeit",
        turn: 2,
      }).unratedReason,
    ).toBe("cpu");
  });

  it("treats early disconnects as unrated and early leaves as leaver_only", () => {
    expect(classifyResult({ ...base, reason: "disconnect", turn: 3 })).toEqual({
      rated: false,
      ratedMode: "full",
      unratedReason: "early_disconnect",
    });
    expect(
      classifyResult({ ...base, reason: "disconnect", turn: 8 }).ratedMode,
    ).toBe("full");
    expect(
      classifyResult({ ...base, reason: "forfeit", turn: 2 }).ratedMode,
    ).toBe("leaver_only");
    expect(
      classifyResult({ ...base, reason: "concede", turn: 9, durationSec: 100 })
        .ratedMode,
    ).toBe("leaver_only");
    expect(
      classifyResult({ ...base, reason: "forfeit", turn: 9, durationSec: 600 })
        .ratedMode,
    ).toBe("full");
    // Unknown turn counts as a full-length game.
    expect(
      classifyResult({
        ...base,
        reason: "forfeit",
        turn: null,
        durationSec: null,
      }).ratedMode,
    ).toBe("full");
    // A leave with no attributable loser cannot be leaver_only.
    expect(
      classifyResult({ ...base, reason: "forfeit", turn: 2, loserKnown: false })
        .ratedMode,
    ).toBe("full");
  });
});

describe("applyGame / replayGames", () => {
  it("moves +16/-16 on the first even game", () => {
    const state = replayGames([game({ completedAt: T0 })]);
    expect(rating(state, "A")).toBe(1216);
    expect(rating(state, "B")).toBe(1184);
    expect(state.get("A")?.wins).toBe(1);
    expect(state.get("B")?.losses).toBe(1);
  });

  it("burns the repeat multiplier on same-day rematches", () => {
    const games = [0, 1, 2, 3, 4].map((h) =>
      game({ completedAt: T0 + h * 60 * 60 * 1000 }),
    );
    const state = replayGames(games);
    expect(rating(state, "A")).toBe(1241);
    expect(rating(state, "B")).toBe(1159);
    expect(state.get("A")?.wins).toBe(5);
    expect(state.get("A")?.ratedGames).toBe(5);
  });

  it("ignores the repeat multiplier for tournament games", () => {
    const games = [0, 1, 2].map((h) =>
      game({ completedAt: T0 + h * 60 * 60 * 1000, tournamentId: "t1" }),
    );
    const state = replayGames(games);
    expect(rating(state, "A")).toBe(1244);
    expect(rating(state, "B")).toBe(1156);
  });

  it("caps the net rating taken from one opponent at +-80", () => {
    const games = Array.from({ length: 20 }, (_, i) =>
      game({ completedAt: T0 + i * 8 * DAY }),
    );
    const state = replayGames(games);
    expect(rating(state, "A")).toBe(1280);
    expect(rating(state, "B")).toBe(1120);
    expect(state.get("A")?.wins).toBe(20);
    expect(state.get("A")?.opponents.size).toBe(1);
  });

  it("mimic: 93-1 against two opponents caps at 1360 and goes unranked when idle", () => {
    const games: LadderGame[] = [];
    let t = T0;
    let wins = 0;
    let n = 0;
    while (wins < 93) {
      const opp = n % 2 === 0 ? "X" : "Y";
      if (n === 40) {
        games.push(game({ completedAt: t, winnerId: opp, loserId: "A" }));
      } else {
        games.push(game({ completedAt: t, winnerId: "A", loserId: opp }));
        wins += 1;
      }
      n += 1;
      t += 4 * DAY; // each pair meets every 8 days
    }
    const state = replayGames(games);
    const a = state.get("A");
    expect(a?.wins).toBe(93);
    expect(a?.losses).toBe(1);
    expect(a?.opponents.size).toBe(2);
    expect(rating(state, "A")).toBe(1360);
    expect(rating(state, "X")).toBe(1120);
    expect(rating(state, "Y")).toBe(1120);

    const lastGame = games[games.length - 1].completedAt;
    const fresh = summarize(state, lastGame, null);
    const freshA = fresh.find((r) => r.playerId === "A");
    expect(freshA?.rating).toBe(1360);
    expect(freshA?.provisional).toBe(true);
    expect(freshA?.inactive).toBe(false);

    // 132 days idle: off the ranked list, but the rating is kept as-is.
    const idle = summarize(state, lastGame + 132 * DAY, null);
    const idleA = idle.find((r) => r.playerId === "A");
    expect(idleA?.rating).toBe(1360);
    expect(idleA?.inactive).toBe(true);
    expect(idleA?.rank).toBe(0);
  });

  it("keeps a rating through a long break", () => {
    // No decay: A's 1216 is still there after 90 idle days and moves normally.
    const state = replayGames([
      game({ completedAt: T0 }),
      game({ completedAt: T0 + 90 * DAY, winnerId: "A", loserId: "C" }),
    ]);
    expect(rating(state, "A")).toBe(1231);
  });

  it("handles draws symmetrically", () => {
    const state: LadderState = new Map();
    applyGame(
      state,
      game({ completedAt: T0, isDraw: true, playerIds: ["A", "B"] }),
    );
    expect(rating(state, "A")).toBe(1200);
    expect(rating(state, "B")).toBe(1200);
    expect(state.get("A")?.draws).toBe(1);
    expect(state.get("B")?.draws).toBe(1);

    const uneven: LadderState = new Map();
    const a = state.get("A");
    const b = state.get("B");
    if (!a || !b) throw new Error("missing state");
    uneven.set("A", {
      ...a,
      rating: 1300,
      pairNet: new Map(),
      pairTimes: new Map(),
      history: [],
    });
    uneven.set("B", {
      ...b,
      rating: 1200,
      pairNet: new Map(),
      pairTimes: new Map(),
      history: [],
    });
    applyGame(
      uneven,
      game({ completedAt: T0 + DAY, isDraw: true, playerIds: ["A", "B"] }),
    );
    expect(rating(uneven, "A")).toBe(1296);
    expect(rating(uneven, "B")).toBe(1204);
  });

  it("leaver_only moves the leaver only but burns the pair window", () => {
    const state = replayGames([
      game({ completedAt: T0, ratedMode: "leaver_only" }),
    ]);
    const a = state.get("A");
    const b = state.get("B");
    if (!a || !b) throw new Error("missing state");
    expect(b.rating).toBe(1184);
    expect(b.losses).toBe(1);
    expect(b.opponents.has("A")).toBe(true);
    expect(a.rating).toBe(1200);
    expect(a.wins).toBe(0);
    expect(a.ratedGames).toBe(0);
    expect(a.opponents.size).toBe(0);
    // Not activity for the winner: otherwise a friend could concede on turn 1
    // every few weeks to keep an idle player on the ranked list.
    expect(a.lastRatedAt).toBeNull();
    expect(a.pairTimes.get("B")).toEqual([T0]);

    // The window is burnt: the next two real games are the pair's 2nd and 3rd meeting.
    applyGame(state, game({ completedAt: T0 + 60_000 }));
    applyGame(state, game({ completedAt: T0 + 120_000 }));
    expect(a.wins).toBe(2);
    // 2nd meeting: full K (+16 vs 1184 -> 1216... actually E>0.5 so +15), 3rd: half K.
    expect(a.rating).toBeLessThan(1200 + 16 + 15);
  });

  it("skips unrated or malformed games", () => {
    const state: LadderState = new Map();
    expect(applyGame(state, game({ completedAt: T0, rated: false }))).toBeNull();
    expect(
      applyGame(state, game({ completedAt: T0, winnerId: "A", loserId: "A" })),
    ).toBeNull();
    expect(applyGame(state, game({ completedAt: T0, winnerId: null }))).toBeNull();
    expect(state.size).toBe(0);
  });

  it("is deterministic regardless of input order", () => {
    const games = Array.from({ length: 30 }, (_, i) =>
      game({
        completedAt: T0 + i * 3 * DAY,
        winnerId: i % 3 === 0 ? "B" : "A",
        loserId: i % 3 === 0 ? "A" : i % 2 === 0 ? "B" : "C",
      }),
    );
    const forward = summarize(replayGames(games), T0 + 100 * DAY, null);
    const shuffled = summarize(
      replayGames([...games].reverse()),
      T0 + 100 * DAY,
      null,
    );
    expect(shuffled).toEqual(forward);
  });
});

describe("summarize / compareRows", () => {
  const row = (
    partial: Partial<LadderRow> & { playerId: string },
  ): LadderRow => ({
    rating: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    ratedGames: 0,
    uniqueOpponents: 0,
    provisional: false,
    inactive: false,
    lastRatedAt: null,
    lastActive: null,
    rank: 0,
    ...partial,
  });

  it("sorts inactive below everyone, then provisional, then by rating/winRate/wins", () => {
    const rows = [
      row({ playerId: "p1", rating: 1250, winRate: 0.6 }),
      row({ playerId: "p2", rating: 1400, provisional: true }),
      row({ playerId: "p3", rating: 1250, winRate: 0.7 }),
      row({ playerId: "p4", rating: 1500, inactive: true }),
    ].sort(compareRows);
    expect(rows.map((r) => r.playerId)).toEqual(["p3", "p1", "p2", "p4"]);
  });

  it("keeps inactive players' ratings but ranks only active players, without gaps", () => {
    const now = T0 + 200 * DAY;
    const state = replayGames([
      // A and B last played 70 days ago: inactive.
      game({ completedAt: now - 70 * DAY, winnerId: "A", loserId: "B" }),
      // C and D played two days ago: active.
      game({ completedAt: now - 2 * DAY, winnerId: "C", loserId: "D" }),
    ]);
    const rows = summarize(state, now, null);
    expect(rows.map((r) => [r.playerId, r.rank, r.inactive])).toEqual([
      ["C", 1, false],
      ["D", 2, false],
      ["A", 0, true],
      ["B", 0, true],
    ]);
    expect(rows.find((r) => r.playerId === "A")?.rating).toBe(1216);
    expect(rows.find((r) => r.playerId === "B")?.rating).toBe(1184);
  });

  it("windows W-L-D and drops players without games in the window", () => {
    const now = T0 + 50 * DAY;
    const state = replayGames([
      game({ completedAt: now - 40 * DAY, winnerId: "A", loserId: "B" }),
      game({ completedAt: now - 2 * DAY, winnerId: "A", loserId: "C" }),
    ]);
    const allTime = summarize(state, now, LADDER.WINDOW_MS.all_time);
    const monthly = summarize(state, now, LADDER.WINDOW_MS.monthly);
    const weekly = summarize(state, now, LADDER.WINDOW_MS.weekly);

    expect(allTime.find((r) => r.playerId === "A")?.wins).toBe(2);
    expect(monthly.find((r) => r.playerId === "A")?.wins).toBe(1);
    expect(weekly.find((r) => r.playerId === "A")?.wins).toBe(1);
    expect(allTime.map((r) => r.playerId).sort()).toEqual(["A", "B", "C"]);
    expect(monthly.map((r) => r.playerId).sort()).toEqual(["A", "C"]);
    expect(weekly.map((r) => r.playerId).sort()).toEqual(["A", "C"]);
    expect(weekly[0].rank).toBe(1);
    expect(weekly[1].rank).toBe(2);
  });
});
