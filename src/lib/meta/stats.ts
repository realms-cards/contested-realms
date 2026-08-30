/**
 * Pure statistics helpers for meta analysis.
 *
 * NOTE: server/modules/meta-stats-compute.ts carries a private mirror of
 * wilsonLowerBound because the server build (server/tsconfig.json,
 * rootDir: ".") cannot import from src/. Keep the implementations in sync.
 */

/**
 * Lower bound of the Wilson score interval for a binomial proportion.
 *
 * Used to order cards by win rate without letting tiny samples dominate:
 * 2 wins in 2 games scores ~0.34, while 58% over 300 games scores ~0.52,
 * so proven performers rank above lucky one-offs. z = 1.96 is a 95% interval.
 */
export function wilsonLowerBound(
  wins: number,
  losses: number,
  z = 1.96
): number {
  const n = wins + losses;
  if (n <= 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

/** Calendar-month bucket key, e.g. "2026-08" (UTC; zero-padded so strings sort) */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * The `months` most recent period keys, current month included, newest first.
 * periodsBack(3) in 2026-08 -> ["2026-08", "2026-07", "2026-06"]
 */
export function periodsBack(months: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < months; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

/** Time windows the meta endpoints can serve. "all" reads the all-time counters. */
export type MetaWindow = "all" | "month" | "3m";

export const META_WINDOWS: readonly MetaWindow[] = ["all", "month", "3m"];

export function parseMetaWindow(raw: string | null): MetaWindow {
  if (raw === "month" || raw === "3m") return raw;
  return "all";
}

/** How many calendar months a window spans (0 = all-time, no period filter) */
export function windowMonths(window: MetaWindow): number {
  if (window === "month") return 1;
  if (window === "3m") return 3;
  return 0;
}

export interface CardCounters {
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  inDeck: number;
  inDeckWins: number;
  inDeckLosses: number;
}

export interface CardRates {
  /** wins / (wins + losses) among matches where the card was played */
  winRate: number;
  /** Wilson lower bound of winRate - the sort key for win-rate leaderboards */
  winRateLB: number;
  /** plays / inDeck - how often the card hits the board when brought */
  playRate: number | null;
  /** win rate over matches where the card sat in the maindeck, played or not */
  winRateInDeck: number | null;
}

export function deriveCardRates(c: CardCounters): CardRates {
  const playedDenom = c.wins + c.losses;
  const deckDenom = c.inDeckWins + c.inDeckLosses;
  return {
    winRate: playedDenom > 0 ? c.wins / playedDenom : 0,
    winRateLB: wilsonLowerBound(c.wins, c.losses),
    playRate: c.inDeck > 0 ? Math.min(1, c.plays / c.inDeck) : null,
    winRateInDeck: deckDenom > 0 ? c.inDeckWins / deckDenom : null,
  };
}
