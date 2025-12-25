"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import OnlinePageShell from "@/components/online/OnlinePageShell";
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
  lastActive: string;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
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

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return "from-yellow-400 to-yellow-600";
    if (rank === 2) return "from-gray-300 to-gray-500";
    if (rank === 3) return "from-amber-600 to-amber-800";
    if (rank <= 10) return "from-blue-500 to-blue-700";
    return "from-slate-600 to-slate-800";
  };

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        {/* Header */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap sm:gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-50 font-fantaisie">
                Global Leaderboard
              </h1>
              <p className="text-sm text-slate-300/90">
                Compete with players across all game formats
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-wide text-blue-300 hover:text-blue-200 disabled:opacity-50 disabled:hover:text-blue-300"
                onClick={fetchLeaderboard}
                disabled={loading}
              >
                Refresh Data
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 uppercase tracking-wide">
                  Format
                </span>
                {(["constructed", "sealed", "draft"] as const).map((f) => (
                  <button
                    key={f}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-semibold uppercase tracking-wide ${
                      format === f
                        ? "bg-blue-600 text-white shadow-inner"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                    }`}
                    onClick={() => {
                      setFormat(f);
                    }}
                  >
                    {getFormatDisplay(f)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 uppercase tracking-wide">
                  Period
                </span>
                {(["all_time", "monthly", "weekly"] as const).map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-semibold uppercase tracking-wide ${
                      timeFrame === t
                        ? "bg-purple-600 text-white shadow-inner"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
                    }`}
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
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/30 p-4">
            <div className="text-red-200 text-sm">{error}</div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="rounded-xl bg-slate-950/70 ring-1 ring-slate-800/80 p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-100 uppercase tracking-wide">
              {getFormatDisplay(format)} · {getTimeFrameDisplay(timeFrame)}
            </h2>
            {data && (
              <span className="text-sm text-slate-400">
                {data.pagination.total} players
              </span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-400">
              Loading leaderboard...
            </div>
          ) : data && data.leaderboard.length > 0 ? (
            <div className="space-y-3">
              {data.leaderboard.map((entry) => (
                <div
                  key={entry.playerId}
                  className="flex items-center justify-between bg-slate-900/70 border border-slate-800/70 rounded-xl px-4 py-3 hover:bg-slate-900 transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/leaderboard/player/${entry.playerId}`)
                  }
                >
                  <div className="flex items-center gap-4">
                    {/* Rank Badge */}
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${getRankBadgeColor(
                        entry.rank
                      )} flex items-center justify-center text-white text-sm font-bold shadow`}
                    >
                      {entry.rank <= 999 ? entry.rank : "999+"}
                    </div>

                    {/* Player Info */}
                    <div className="flex items-center gap-4">
                      {entry.playerImage ? (
                        <Image
                          src={entry.playerImage}
                          alt={entry.displayName}
                          width={44}
                          height={44}
                          className="rounded-full ring-2 ring-slate-800"
                          unoptimized
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-white text-base font-semibold ring-2 ring-slate-800/80">
                          {entry.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        {(() => {
                          const patronTier = getPatronTier(entry.playerId);
                          const patronStyle = patronTier
                            ? PATRON_COLORS[patronTier]
                            : null;
                          return (
                            <div
                              className={`text-sm font-semibold ${
                                patronStyle?.text ?? "text-slate-50"
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
                            </div>
                          );
                        })()}
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          {entry.tournamentWins > 0 && (
                            <span className="text-amber-300 flex items-center gap-1">
                              <span aria-hidden>🏆</span>
                              {entry.tournamentWins}
                            </span>
                          )}
                          <span>
                            Last active:{" "}
                            {new Date(entry.lastActive).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm text-slate-200">
                    <div className="text-center min-w-[80px]">
                      <div className="text-base font-semibold text-slate-50">
                        {entry.rating}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Rating
                      </div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <div className="text-base font-semibold text-emerald-300">
                        {formatWinRate(entry.winRate)}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Win Rate
                      </div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <div className="text-base font-semibold text-slate-50">
                        {entry.wins}-{entry.losses}
                        {entry.draws > 0 && `-${entry.draws}`}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        W-L{entry.draws > 0 && "-D"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-sm text-slate-400">
              No leaderboard data available. Play some matches to see rankings!
            </div>
          )}

          {/* Pagination Controls */}
          {data && data.pagination.total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-slate-800/50">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-300">
                Page {page + 1} of{" "}
                {Math.ceil(data.pagination.total / PAGE_SIZE)}
              </span>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.pagination.hasMore || loading}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </OnlinePageShell>
  );
}
