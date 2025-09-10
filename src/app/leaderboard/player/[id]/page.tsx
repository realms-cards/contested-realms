"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface PlayerStats {
  player: {
    id: string;
    name: string;
    image?: string;
    memberSince: string;
  };
  overallStats: {
    totalWins: number;
    totalLosses: number;
    totalDraws: number;
    totalGames: number;
    overallWinRate: number;
    tournamentWins: number;
  };
  leaderboardRankings: Array<{
    format: string;
    timeFrame: string;
    rank: number;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    tournamentWins: number;
    lastActive: string;
  }>;
  recentMatches: Array<{
    id: string;
    matchId: string;
    lobbyName?: string;
    format: string;
    isWin: boolean;
    isDraw: boolean;
    opponent?: {
      id: string;
      name: string;
    };
    tournamentId?: string;
    completedAt: string;
  }>;
  tournamentHistory: Array<{
    tournament: {
      id: string;
      name: string;
      format: string;
      status: string;
    };
    wins: number;
    losses: number;
    draws: number;
    matchPoints: number;
    finalRank: number;
    isEliminated: boolean;
  }>;
}

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setPlayerId(resolvedParams.id);
    };
    getParams();
  }, [params]);

  useEffect(() => {
    if (!playerId) return;

    const fetchPlayerStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/leaderboard/player/${playerId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch player stats');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerStats();
  }, [playerId]);

  const formatWinRate = (winRate: number) => `${(winRate * 100).toFixed(1)}%`;

  const getFormatDisplay = (format: string) => {
    return format.charAt(0).toUpperCase() + format.slice(1);
  };

  const getTimeFrameDisplay = (timeFrame: string) => {
    switch (timeFrame) {
      case 'all_time': return 'All Time';
      case 'monthly': return 'This Month';
      case 'weekly': return 'This Week';
      default: return timeFrame;
    }
  };

  const getMatchResultColor = (isWin: boolean, isDraw: boolean) => {
    if (isDraw) return 'text-yellow-400';
    return isWin ? 'text-green-400' : 'text-red-400';
  };

  const getMatchResultText = (isWin: boolean, isDraw: boolean) => {
    if (isDraw) return 'Draw';
    return isWin ? 'Win' : 'Loss';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8 text-sm text-slate-400">
          Loading player statistics...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/30 p-4">
          <div className="text-red-200 text-sm">{error || 'Player not found'}</div>
        </div>
        <button
          className="rounded bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm"
          onClick={() => router.back()}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <div className="flex items-center gap-4">
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
            onClick={() => router.back()}
          >
            ← Back
          </button>
          <div className="flex items-center gap-4">
            {data.player.image ? (
              <img 
                src={data.player.image} 
                alt={data.player.name}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center text-white text-xl font-bold">
                {data.player.name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{data.player.name}</h1>
              <p className="text-sm text-slate-300">
                Member since {new Date(data.player.memberSince).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Overall Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{data.overallStats.totalGames}</div>
            <div className="text-sm text-slate-400">Total Games</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{formatWinRate(data.overallStats.overallWinRate)}</div>
            <div className="text-sm text-slate-400">Overall Win Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {data.overallStats.totalWins}-{data.overallStats.totalLosses}
              {data.overallStats.totalDraws > 0 && `-${data.overallStats.totalDraws}`}
            </div>
            <div className="text-sm text-slate-400">W-L{data.overallStats.totalDraws > 0 && '-D'}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{data.overallStats.tournamentWins}</div>
            <div className="text-sm text-slate-400">Tournament Wins</div>
          </div>
        </div>
      </div>

      {/* Format Rankings */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Format Rankings</h2>
        <div className="space-y-3">
          {data.leaderboardRankings.map((ranking) => (
            <div
              key={`${ranking.format}-${ranking.timeFrame}`}
              className="flex items-center justify-between bg-black/20 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <div className="text-sm">
                  <div className="font-semibold text-white">
                    {getFormatDisplay(ranking.format)} - {getTimeFrameDisplay(ranking.timeFrame)}
                  </div>
                  <div className="text-xs text-slate-400">
                    Rank #{ranking.rank}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="font-bold text-white">{ranking.rating}</div>
                  <div className="text-xs text-slate-400">Rating</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-white">{formatWinRate(ranking.winRate)}</div>
                  <div className="text-xs text-slate-400">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-white">
                    {ranking.wins}-{ranking.losses}
                    {ranking.draws > 0 && `-${ranking.draws}`}
                  </div>
                  <div className="text-xs text-slate-400">W-L{ranking.draws > 0 && '-D'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Matches */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Matches</h2>
        <div className="space-y-2">
          {data.recentMatches.length > 0 ? (
            data.recentMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between bg-black/20 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getMatchResultColor(match.isWin, match.isDraw).replace('text-', 'bg-')}`} />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {match.lobbyName || `Match ${match.matchId.slice(-6)}`}
                    </div>
                    <div className="text-xs text-slate-400">
                      {getFormatDisplay(match.format)} • {new Date(match.completedAt).toLocaleDateString()}
                      {match.opponent && ` • vs ${match.opponent.name}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${getMatchResultColor(match.isWin, match.isDraw)}`}>
                    {getMatchResultText(match.isWin, match.isDraw)}
                  </div>
                  {match.tournamentId && (
                    <div className="text-xs text-yellow-400">Tournament</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-sm text-slate-400">
              No recent matches found
            </div>
          )}
        </div>
      </div>

      {/* Tournament History */}
      {data.tournamentHistory.length > 0 && (
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
          <h2 className="text-lg font-semibold text-white mb-4">Tournament History</h2>
          <div className="space-y-2">
            {data.tournamentHistory.map((tournament, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-black/20 rounded-lg p-3"
              >
                <div>
                  <div className="font-semibold text-white">{tournament.tournament.name}</div>
                  <div className="text-xs text-slate-400">
                    {getFormatDisplay(tournament.tournament.format)} • {tournament.tournament.status}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold text-white">Rank #{tournament.finalRank}</div>
                  <div className="text-xs text-slate-400">
                    {tournament.wins}-{tournament.losses}
                    {tournament.draws > 0 && `-${tournament.draws}`} • {tournament.matchPoints} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}