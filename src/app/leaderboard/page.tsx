"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

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
  const [format, setFormat] = useState<'constructed' | 'sealed' | 'draft'>('constructed');
  const [timeFrame, setTimeFrame] = useState<'all_time' | 'monthly' | 'weekly'>('all_time');

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/leaderboard?format=${format}&timeFrame=${timeFrame}&limit=50`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [format, timeFrame]);

  const formatWinRate = (winRate: number) => `${(winRate * 100).toFixed(1)}%`;

  const getTimeFrameDisplay = (timeFrame: string) => {
    switch (timeFrame) {
      case 'all_time': return 'All Time';
      case 'monthly': return 'This Month';
      case 'weekly': return 'This Week';
      default: return timeFrame;
    }
  };

  const getFormatDisplay = (format: string) => {
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-yellow-600';
    if (rank === 2) return 'from-gray-300 to-gray-500';
    if (rank === 3) return 'from-amber-600 to-amber-800';
    if (rank <= 10) return 'from-blue-500 to-blue-700';
    return 'from-slate-600 to-slate-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Global Leaderboard</h1>
            <p className="text-sm text-slate-300">
              Compete with players across all game formats
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
              onClick={fetchLeaderboard}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">Format:</span>
              {(['constructed', 'sealed', 'draft'] as const).map((f) => (
                <button
                  key={f}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    format === f
                      ? 'bg-blue-600/80 text-white'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'
                  }`}
                  onClick={() => setFormat(f)}
                >
                  {getFormatDisplay(f)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">Period:</span>
              {(['all_time', 'monthly', 'weekly'] as const).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    timeFrame === t
                      ? 'bg-purple-600/80 text-white'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'
                  }`}
                  onClick={() => setTimeFrame(t)}
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
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {getFormatDisplay(format)} - {getTimeFrameDisplay(timeFrame)}
          </h2>
          {data && (
            <span className="text-sm text-slate-400">
              {data.pagination.total} players
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm text-slate-400">
            Loading leaderboard...
          </div>
        ) : data && data.leaderboard.length > 0 ? (
          <div className="space-y-2">
            {data.leaderboard.map((entry) => (
              <div
                key={entry.playerId}
                className="flex items-center justify-between bg-black/20 rounded-lg p-3 hover:bg-black/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/leaderboard/player/${entry.playerId}`)}
              >
                <div className="flex items-center gap-3">
                  {/* Rank Badge */}
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getRankBadgeColor(entry.rank)} flex items-center justify-center text-white text-sm font-bold`}>
                    {entry.rank <= 999 ? entry.rank : '999+'}
                  </div>
                  
                  {/* Player Info */}
                  <div className="flex items-center gap-3">
                    {entry.playerImage ? (
                      <img 
                        src={entry.playerImage} 
                        alt={entry.displayName}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-medium">
                        {entry.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-white">{entry.displayName}</div>
                      <div className="text-xs text-slate-400">
                        {entry.tournamentWins > 0 && (
                          <span className="text-yellow-400">🏆 {entry.tournamentWins} </span>
                        )}
                        Last active: {new Date(entry.lastActive).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-bold text-white">{entry.rating}</div>
                    <div className="text-xs text-slate-400">Rating</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-white">{formatWinRate(entry.winRate)}</div>
                    <div className="text-xs text-slate-400">Win Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-white">
                      {entry.wins}-{entry.losses}
                      {entry.draws > 0 && `-${entry.draws}`}
                    </div>
                    <div className="text-xs text-slate-400">W-L{entry.draws > 0 && '-D'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-slate-400">
            No leaderboard data available. Play some matches to see rankings!
          </div>
        )}
      </div>
    </div>
  );
}