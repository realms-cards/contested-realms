"use strict";

/**
 * Pure ladder rating model. No I/O, no Prisma: the same code drives the
 * instant update after a match and the authoritative replay job
 * (`./replay.ts`), so both agree by construction.
 *
 * Rules (see LADDER for the numbers):
 *  - Elo, K=32, base 1200.
 *  - Repeat multiplier: games against the same opponent inside a rolling
 *    window earn less the more often the pair has met recently. Tournament
 *    games skip it (pairings are enforced by the bracket).
 *  - Per-opponent cap: the net rating one player has taken from a single
 *    opponent (lifetime) is clamped to +-PAIR_CAP. Deltas past the cap are
 *    clipped; the W/L record still counts.
 *  - Inactivity: a player with no rated game in INACTIVE_AFTER_MS drops off
 *    the ranked list but keeps their rating untouched. Ratings never decay:
 *    decay only drained points from players above BASE, which made the whole
 *    ladder deflate toward BASE. Playing one rated game puts them back.
 *  - Provisional: fewer than PROVISIONAL_MIN_OPPONENTS distinct rated
 *    opponents or PROVISIONAL_MIN_GAMES rated games sorts below every
 *    ranked player.
 *  - leaver_only games (early concede/leave): only the leaver's rating and
 *    record move. The winner gains nothing, the game does not count as
 *    activity for them, and the pair window still burns, so farming quick
 *    concessions is inert.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type LadderTimeFrame = "all_time" | "monthly" | "weekly";
export const LADDER_TIME_FRAMES: readonly LadderTimeFrame[] = [
  "all_time",
  "monthly",
  "weekly",
];

export const LADDER = {
  K: 32,
  BASE: 1200,
  REPEAT_WINDOW_MS: 7 * DAY_MS,
  /** Index = prior rated games vs the same opponent inside the window. */
  REPEAT_MULTIPLIERS: [1, 1, 0.5, 0.25] as readonly number[],
  PAIR_CAP: 80,
  /**
   * No rated game for this long: hidden from the ranked list, rating kept.
   * Mirrored in src/app/api/leaderboard/route.ts and src/app/admin/ladder/page.tsx
   * (the Next.js build cannot import server/). Keep them in sync.
   */
  INACTIVE_AFTER_MS: 60 * DAY_MS,
  PROVISIONAL_MIN_OPPONENTS: 5,
  PROVISIONAL_MIN_GAMES: 10,
  EARLY_TURN: 5,
  EARLY_DURATION_SEC: 180,
  WINDOW_MS: {
    all_time: null,
    monthly: 30 * DAY_MS,
    weekly: 7 * DAY_MS,
  } as Readonly<Record<LadderTimeFrame, number | null>>,
} as const;

export type RatedMode = "full" | "leaver_only";
export type UnratedReason =
  | "guest"
  | "missing_user"
  | "precon"
  | "same_network"
  | "unverified_result"
  | "early_disconnect"
  | "ladder_excluded"
  | "admin";

export interface ResultClassification {
  rated: boolean;
  ratedMode: RatedMode;
  unratedReason: UnratedReason | null;
}

export interface ClassifyInput {
  /** finalize reason: normal_end, forfeit, concede, leave, disconnect, tiebreaker_*, tie_game */
  reason: string | null;
  /** Game turn at match end; null when unknown (treated as a full-length game). */
  turn: number | null;
  durationSec: number | null;
  hasGuest: boolean;
  sameNetwork: boolean;
  /** False when a client-reported result could not be corroborated by game state. */
  verified: boolean;
  missingUser: boolean;
  /** Whether a loser could be attributed (false for draws / no-result ends). */
  loserKnown: boolean;
  isPrecon: boolean;
}

const LEAVE_REASONS = new Set(["forfeit", "concede", "leave"]);

export function classifyResult(input: ClassifyInput): ResultClassification {
  const unrated = (reason: UnratedReason): ResultClassification => ({
    rated: false,
    ratedMode: "full",
    unratedReason: reason,
  });
  if (input.hasGuest) return unrated("guest");
  if (input.missingUser) return unrated("missing_user");
  if (input.isPrecon) return unrated("precon");
  if (input.sameNetwork) return unrated("same_network");
  if (!input.verified) return unrated("unverified_result");

  const turnKnown =
    typeof input.turn === "number" && Number.isFinite(input.turn);
  const earlyTurn = turnKnown && (input.turn as number) < LADDER.EARLY_TURN;
  const earlyDuration =
    typeof input.durationSec === "number" &&
    Number.isFinite(input.durationSec) &&
    input.durationSec < LADDER.EARLY_DURATION_SEC;

  if (input.reason === "disconnect" && earlyTurn) {
    return unrated("early_disconnect");
  }
  if (
    input.reason !== null &&
    LEAVE_REASONS.has(input.reason) &&
    input.loserKnown &&
    (earlyTurn || earlyDuration)
  ) {
    return { rated: true, ratedMode: "leaver_only", unratedReason: null };
  }
  return { rated: true, ratedMode: "full", unratedReason: null };
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function repeatMultiplier(
  priorGamesInWindow: number,
  isTournament: boolean,
): number {
  if (isTournament) return 1;
  const n = Math.max(0, Math.floor(priorGamesInWindow));
  return n < LADDER.REPEAT_MULTIPLIERS.length
    ? LADDER.REPEAT_MULTIPLIERS[n]
    : 0;
}

/**
 * Whether a player is off the ranked list as of `now`. A player with no rated
 * game on record counts as inactive; their rating is never changed by this.
 */
export function isInactive(lastRatedAt: number | null, now: number): boolean {
  if (lastRatedAt === null || !Number.isFinite(lastRatedAt)) return true;
  return now - lastRatedAt > LADDER.INACTIVE_AFTER_MS;
}

/** Clamp `delta` so the pair's net stays within +-PAIR_CAP after applying it. */
export function clipToPairCap(delta: number, currentNet: number): number {
  const lo = -LADDER.PAIR_CAP - currentNet;
  const hi = LADDER.PAIR_CAP - currentNet;
  return Math.min(hi, Math.max(lo, delta));
}

export function isProvisional(
  uniqueOpponents: number,
  ratedGames: number,
): boolean {
  return (
    uniqueOpponents < LADDER.PROVISIONAL_MIN_OPPONENTS ||
    ratedGames < LADDER.PROVISIONAL_MIN_GAMES
  );
}

export interface LadderGame {
  matchId: string;
  /** Epoch ms */
  completedAt: number;
  /** Both participants (used for draws and the pair window). */
  playerIds: string[];
  winnerId: string | null;
  loserId: string | null;
  isDraw: boolean;
  rated: boolean;
  ratedMode: RatedMode;
  tournamentId: string | null;
}

export type GameOutcome = "w" | "l" | "d";

export interface PlayerLadderState {
  rating: number;
  lastRatedAt: number | null;
  wins: number;
  losses: number;
  draws: number;
  ratedGames: number;
  opponents: Set<string>;
  /** opponentId -> net rating gained from that opponent (this side). */
  pairNet: Map<string, number>;
  /** opponentId -> completedAt of prior rated games, pruned to the window. */
  pairTimes: Map<string, number[]>;
  history: Array<{ t: number; opp: string; r: GameOutcome }>;
}

export type LadderState = Map<string, PlayerLadderState>;

export function createPlayerState(): PlayerLadderState {
  return {
    rating: LADDER.BASE,
    lastRatedAt: null,
    wins: 0,
    losses: 0,
    draws: 0,
    ratedGames: 0,
    opponents: new Set(),
    pairNet: new Map(),
    pairTimes: new Map(),
    history: [],
  };
}

function ensure(state: LadderState, id: string): PlayerLadderState {
  let s = state.get(id);
  if (!s) {
    s = createPlayerState();
    state.set(id, s);
  }
  return s;
}

function priorGamesInWindow(
  s: PlayerLadderState,
  opp: string,
  t: number,
): number {
  const times = s.pairTimes.get(opp);
  if (!times) return 0;
  const cutoff = t - LADDER.REPEAT_WINDOW_MS;
  let i = 0;
  while (i < times.length && times[i] <= cutoff) i++;
  if (i > 0) times.splice(0, i);
  return times.length;
}

function pushPairTime(s: PlayerLadderState, opp: string, t: number): void {
  const times = s.pairTimes.get(opp);
  if (times) times.push(t);
  else s.pairTimes.set(opp, [t]);
}

interface Side {
  id: string;
  s: PlayerLadderState;
  score: number;
  outcome: GameOutcome;
  /** Whether this side's rating/record move (false for a leaver_only winner). */
  moves: boolean;
}

export interface AppliedGame {
  deltas: Record<string, number>;
}

/**
 * Apply one game to the state (mutating). Returns null when the game is
 * skipped (unrated, malformed).
 */
export function applyGame(
  state: LadderState,
  game: LadderGame,
): AppliedGame | null {
  if (!game.rated) return null;
  const t = game.completedAt;
  if (!Number.isFinite(t)) return null;

  let sides: [Side, Side];
  if (game.isDraw) {
    const ids = Array.from(new Set(game.playerIds)).filter(Boolean);
    if (ids.length !== 2) return null;
    sides = [
      { id: ids[0], s: ensure(state, ids[0]), score: 0.5, outcome: "d", moves: true },
      { id: ids[1], s: ensure(state, ids[1]), score: 0.5, outcome: "d", moves: true },
    ];
  } else {
    if (!game.winnerId || !game.loserId || game.winnerId === game.loserId) {
      return null;
    }
    const leaverOnly = game.ratedMode === "leaver_only";
    sides = [
      {
        id: game.winnerId,
        s: ensure(state, game.winnerId),
        score: 1,
        outcome: "w",
        moves: !leaverOnly,
      },
      {
        id: game.loserId,
        s: ensure(state, game.loserId),
        score: 0,
        outcome: "l",
        moves: true,
      },
    ];
  }

  const [a, b] = sides;
  const prior = priorGamesInWindow(a.s, b.id, t);
  priorGamesInWindow(b.s, a.id, t);
  const mult = repeatMultiplier(prior, game.tournamentId !== null);

  const deltas: Record<string, number> = {};
  const ratingA = a.s.rating;
  const ratingB = b.s.rating;
  const pairs: Array<[Side, Side, number, number]> = [
    [a, b, ratingA, ratingB],
    [b, a, ratingB, ratingA],
  ];
  for (const [side, opp, own, other] of pairs) {
    // The pair window burns for both sides, so repeated instant concessions
    // cannot be recycled into full-weight rating later.
    pushPairTime(side.s, opp.id, t);
    if (!side.moves) {
      // Deliberately no lastRatedAt bump: a leaver_only win is not a played
      // game for the winner, so a friend conceding on turn 1 cannot keep an
      // idle player on the ranked list.
      deltas[side.id] = 0;
      continue;
    }
    side.s.lastRatedAt = t;
    const raw = Math.round(
      LADDER.K * mult * (side.score - expectedScore(own, other)),
    );
    const net = side.s.pairNet.get(opp.id) ?? 0;
    const applied = clipToPairCap(raw, net);
    side.s.pairNet.set(opp.id, net + applied);
    side.s.rating += applied;
    deltas[side.id] = applied;
    side.s.ratedGames += 1;
    side.s.opponents.add(opp.id);
    side.s.history.push({ t, opp: opp.id, r: side.outcome });
    if (side.outcome === "w") side.s.wins += 1;
    else if (side.outcome === "l") side.s.losses += 1;
    else side.s.draws += 1;
  }
  return { deltas };
}

export function compareGames(a: LadderGame, b: LadderGame): number {
  if (a.completedAt !== b.completedAt) return a.completedAt - b.completedAt;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** Replay games in chronological order into a fresh state. */
export function replayGames(games: LadderGame[]): LadderState {
  const state: LadderState = new Map();
  const ordered = [...games].sort(compareGames);
  for (const game of ordered) applyGame(state, game);
  return state;
}

export interface LadderRow {
  playerId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  ratedGames: number;
  uniqueOpponents: number;
  provisional: boolean;
  /** No rated game within INACTIVE_AFTER_MS: kept, but unranked (rank 0). */
  inactive: boolean;
  lastRatedAt: number | null;
  lastActive: number | null;
  rank: number;
}

export function compareRows(a: LadderRow, b: LadderRow): number {
  if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
  if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
  if (a.rating !== b.rating) return b.rating - a.rating;
  if (a.winRate !== b.winRate) return b.winRate - a.winRate;
  if (a.wins !== b.wins) return b.wins - a.wins;
  return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
}

/**
 * Rank the state as of `now`. With a window, W/L/D and opponents come from
 * games inside it and players without a game in the window are dropped;
 * `provisional` always uses all-time counts. Inactive players are still
 * returned (so their stored rating survives) but sort last with rank 0, and
 * active players are ranked 1..n without gaps.
 */
export function summarize(
  state: LadderState,
  now: number,
  windowMs: number | null,
): LadderRow[] {
  const rows: LadderRow[] = [];
  const cutoff = windowMs === null ? null : now - windowMs;
  for (const [playerId, s] of state) {
    if (s.history.length === 0) continue;
    let wins = s.wins;
    let losses = s.losses;
    let draws = s.draws;
    let uniqueOpponents = s.opponents.size;
    let ratedGames = s.ratedGames;
    if (cutoff !== null) {
      const recent = s.history.filter((h) => h.t >= cutoff);
      if (recent.length === 0) continue;
      wins = recent.filter((h) => h.r === "w").length;
      losses = recent.filter((h) => h.r === "l").length;
      draws = recent.filter((h) => h.r === "d").length;
      uniqueOpponents = new Set(recent.map((h) => h.opp)).size;
      ratedGames = recent.length;
    }
    const games = wins + losses + draws;
    const lastGame = s.history[s.history.length - 1].t;
    rows.push({
      playerId,
      rating: s.rating,
      wins,
      losses,
      draws,
      winRate: games > 0 ? wins / games : 0,
      ratedGames,
      uniqueOpponents,
      provisional: isProvisional(s.opponents.size, s.ratedGames),
      inactive: isInactive(s.lastRatedAt, now),
      lastRatedAt: s.lastRatedAt,
      lastActive: Math.max(lastGame, s.lastRatedAt ?? lastGame),
      rank: 0,
    });
  }
  rows.sort(compareRows);
  let rank = 0;
  for (const row of rows) {
    row.rank = row.inactive ? 0 : ++rank;
  }
  return rows;
}
