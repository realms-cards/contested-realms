"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import { PATRON_COLORS, type PatronData } from "@/lib/patrons";

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  playerImage?: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  rating: number;
  tournamentWins: number;
  uniqueOpponents: number;
  ratedGames: number;
  provisional: boolean;
  lastRatedAt: string | null;
  inactive: boolean;
  lastActive: string;
}

interface CurrentUserRank {
  rank: number | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  uniqueOpponents: number;
  ratedGames: number;
  provisional: boolean;
  lastRatedAt: string | null;
  inactive: boolean;
}

const PROVISIONAL_HINT =
  "Provisional: needs 5 different opponents and 10 rated games to be ranked";
const INACTIVE_HINT =
  "No rated game in 14+ days: rating above 1200 decays 2 points per day";

function ProvisionalPill() {
  return (
    <Badge tone="warn" title={PROVISIONAL_HINT}>
      Provisional
    </Badge>
  );
}

function InactiveHint() {
  return (
    <span className="rc-hint" title={INACTIVE_HINT}>
      · decaying
    </span>
  );
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  currentUser: CurrentUserRank | null;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  filters: {
    format: string;
    timeFrame: string;
  };
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"constructed" | "sealed" | "draft">(
    "constructed"
  );
  const [timeFrame, setTimeFrame] = useState<"all_time" | "monthly" | "weekly">(
    "all_time"
  );
  const [page, setPage] = useState(0);
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  const PAGE_SIZE = 25;

  // Fetch patron data on mount
  useEffect(() => {
    fetch("/api/patrons")
      .then((res) => res.json())
      .then((data) => setPatrons(data))
      .catch(() => {});
  }, []);

  // Helper to get patron tier for a player
  const getPatronTier = (playerId: string) => {
    if (!patrons) return null;
    if (patrons.kingofthe?.some((p) => p.id === playerId)) return "kingofthe";
    if (patrons.grandmaster.some((p) => p.id === playerId))
      return "grandmaster";
    if (patrons.apprentice.some((p) => p.id === playerId)) return "apprentice";
    return null;
  };

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/leaderboard?format=${format}&timeFrame=${timeFrame}&limit=${PAGE_SIZE}&offset=${
          page * PAGE_SIZE
        }`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch leaderboard");
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [format, timeFrame, page]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [format, timeFrame]);

  const formatWinRate = (winRate: number) => `${(winRate * 100).toFixed(1)}%`;

  const getTimeFrameDisplay = (timeFrame: string) => {
    switch (timeFrame) {
      case "all_time":
        return "All Time";
      case "monthly":
        return "This Month";
      case "weekly":
        return "This Week";
      default:
        return timeFrame;
    }
  };

  const getFormatDisplay = (format: string) => {
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  return (
    <OnlinePageShell>
      <PageHeader
        eyebrow="ranked"
        title="Global Leaderboard"
        description="Compete with players across all game formats"
        actions={
          <RcButton
            variant="outline"
            size="sm"
            onClick={fetchLeaderboard}
            disabled={loading}
          >
            Refresh Data
          </RcButton>
        }
      />

      {/* Filters */}
      <section className="rc-panel">
        <div className="flex flex-col gap-4 px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rc-eyebrow">Format</span>
            <div className="rc-segment">
              {(["constructed", "sealed", "draft"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => {
                    setFormat(f);
                  }}
                >
                  {getFormatDisplay(f)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rc-eyebrow">Period</span>
            <div className="rc-segment">
              {(["all_time", "monthly", "weekly"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={timeFrame === t}
                  onClick={() => {
                    setTimeFrame(t);
                  }}
                >
                  {getTimeFrameDisplay(t)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Error display */}
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}

      {/* Leaderboard */}
      <section className="rc-panel">
        <PanelHeader
          title={`${getFormatDisplay(format)} · ${getTimeFrameDisplay(
            timeFrame
          )}`}
          meta={data ? `${data.pagination.total} players` : undefined}
        />

        {/* Current User's Rank */}
        {data?.currentUser && (
          <div className="px-[18px] pt-3.5">
            <div className="rc-panel flex flex-wrap items-center justify-between gap-4 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rc-eyebrow">Your Rank</span>
                <span className="rc-stat text-2xl">
                  {data.currentUser.rank !== null
                    ? `#${data.currentUser.rank}`
                    : "—"}
                </span>
                <span className="rc-hint">of {data.pagination.total}</span>
                {data.currentUser.provisional && <ProvisionalPill />}
                {data.currentUser.inactive && <InactiveHint />}
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="text-center">
                  <div className="rc-stat text-base">
                    {data.currentUser.rating}
                  </div>
                  <div className="rc-hint">Rating</div>
                </div>
                <div className="text-center">
                  <div className="rc-stat text-base text-rc-success">
                    {formatWinRate(data.currentUser.winRate)}
                  </div>
                  <div className="rc-hint">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="rc-stat text-base">
                    {data.currentUser.wins}-{data.currentUser.losses}
                    {data.currentUser.draws > 0 && `-${data.currentUser.draws}`}
                  </div>
                  <div className="rc-hint">
                    W-L{data.currentUser.draws > 0 && "-D"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="rc-stat text-base text-rc-info">
                    {data.currentUser.uniqueOpponents}
                  </div>
                  <div className="rc-hint">Opponents</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rc-hint py-6 text-center">loading leaderboard…</div>
        ) : data && data.leaderboard.length > 0 ? (
          <div className="mt-3.5 overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Rating</th>
                  <th scope="col">W-L-D</th>
                  <th scope="col">Win Rate</th>
                  <th scope="col">Opponents</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((entry) => {
                  const patronTier = getPatronTier(entry.playerId);
                  const patronStyle = patronTier
                    ? PATRON_COLORS[patronTier]
                    : null;
                  return (
                    <tr
                      key={entry.playerId}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(`/leaderboard/player/${entry.playerId}`)
                      }
                    >
                      <td>
                        <span
                          className={`rc-stat ${
                            entry.rank <= 3
                              ? "text-rc-accent-link"
                              : "text-rc-fg-muted"
                          }`}
                        >
                          {entry.rank <= 999 ? entry.rank : "999+"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          {entry.playerImage ? (
                            <Image
                              src={entry.playerImage}
                              alt={entry.displayName}
                              width={28}
                              height={28}
                              className="rounded-rc-md border border-rc-line/18"
                              unoptimized
                            />
                          ) : (
                            <div className="grid h-7 w-7 place-items-center rounded-rc-md border border-rc-line/18 bg-black/40 font-rc-mono text-xs text-rc-fg-muted">
                              {entry.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-rc-display text-[19px] leading-[1.1] ${
                                  patronStyle?.text ?? "text-rc-fg-strong"
                                }`}
                                style={
                                  patronStyle
                                    ? {
                                        textShadow: patronStyle.textShadowMinimal,
                                      }
                                    : undefined
                                }
                              >
                                {entry.displayName}
                              </span>
                              {entry.provisional && <ProvisionalPill />}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              {entry.tournamentWins > 0 && (
                                <Badge tone="gold" title="Tournament wins">
                                  {entry.tournamentWins} titles
                                </Badge>
                              )}
                              <span className="rc-hint">
                                Last active:{" "}
                                {new Date(
                                  entry.lastActive
                                ).toLocaleDateString()}
                                {entry.inactive && (
                                  <>
                                    {" "}
                                    <InactiveHint />
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="rc-stat">{entry.rating}</span>
                      </td>
                      <td>
                        <span className="rc-stat">
                          {entry.wins}-{entry.losses}
                          {entry.draws > 0 && `-${entry.draws}`}
                        </span>
                      </td>
                      <td>
                        <span className="rc-stat text-rc-success">
                          {formatWinRate(entry.winRate)}
                        </span>
                      </td>
                      <td>
                        <span className="rc-stat text-rc-info">
                          {entry.uniqueOpponents}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-[18px] py-3.5">
            <RcEmpty title="No leaderboard data available.">
              play some matches to see rankings
            </RcEmpty>
          </div>
        )}

        {/* Pagination Controls */}
        {data && data.pagination.total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-4 border-t border-rc-line/12 px-[18px] py-3.5">
            <RcButton
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Previous
            </RcButton>
            <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
              Page {page + 1} of {Math.ceil(data.pagination.total / PAGE_SIZE)}
            </span>
            <RcButton
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.pagination.hasMore || loading}
            >
              Next
            </RcButton>
          </div>
        )}
      </section>
    </OnlinePageShell>
  );
}
