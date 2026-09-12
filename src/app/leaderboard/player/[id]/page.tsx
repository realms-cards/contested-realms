"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import AppShell from "@/components/ui/AppShell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import { PATRON_COLORS, type PatronData } from "@/lib/patrons";

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
    uniqueOpponents: number;
    ratedGames: number;
    provisional: boolean;
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
      name: string | null;
    } | null;
    tournamentId?: string | null;
    rated: boolean;
    ratedMode: string;
    unratedReason?: string | null;
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

/** One stat tile in the overall-statistics grid. */
function StatTile({ label, value, tone }: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rc-panel px-4 py-3 text-center">
      <div className={`rc-stat text-2xl ${tone ?? ""}`}>{value}</div>
      <div className="rc-eyebrow mt-1">{label}</div>
    </div>
  );
}

export default function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  // Fetch patron data on mount
  useEffect(() => {
    fetch("/api/patrons")
      .then((res) => res.json())
      .then((data) => setPatrons(data))
      .catch(() => {});
  }, []);

  // Helper to get patron tier for a player
  const getPatronTier = (id: string) => {
    if (!patrons) return null;
    if (patrons.kingofthe?.some((p) => p.id === id)) return "kingofthe";
    if (patrons.grandmaster.some((p) => p.id === id)) return "grandmaster";
    if (patrons.apprentice.some((p) => p.id === id)) return "apprentice";
    return null;
  };

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
          throw new Error("Failed to fetch player stats");
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
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

  const getMatchResultTone = (isWin: boolean, isDraw: boolean): BadgeTone => {
    if (isDraw) return "warn";
    return isWin ? "ok" : "default";
  };

  const getMatchResultText = (isWin: boolean, isDraw: boolean) => {
    if (isDraw) return "Draw";
    return isWin ? "Win" : "Loss";
  };

  const UNRATED_LABELS: Record<string, string> = {
    guest: "Guest opponent",
    same_network: "Same network",
    unverified_result: "Unverified result",
    early_disconnect: "Early disconnect",
    missing_user: "Deleted account",
    precon: "Precon match",
    admin: "Voided by admin",
    ladder_excluded: "Excluded player",
  };

  const getLadderNote = (match: {
    rated: boolean;
    ratedMode: string;
    unratedReason?: string | null;
    isWin: boolean;
  }) => {
    if (!match.rated) {
      const why = match.unratedReason
        ? UNRATED_LABELS[match.unratedReason] ?? match.unratedReason
        : "Not counted";
      return `Unrated · ${why}`;
    }
    if (match.ratedMode === "leaver_only") {
      return match.isWin ? "Opponent left early · no rating gain" : "Left early";
    }
    return null;
  };

  if (loading) {
    return (
      <AppShell width="wide">
        <div className="rc-hint py-6 text-center">
          loading player statistics…
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell width="wide">
        <div className="rc-alert" data-tone="danger">
          {error || "Player not found"}
        </div>
        <div>
          <RcButton variant="outline" onClick={() => router.back()}>
            Go Back
          </RcButton>
        </div>
      </AppShell>
    );
  }

  const patronTier = playerId ? getPatronTier(playerId) : null;
  const patronStyle = patronTier ? PATRON_COLORS[patronTier] : null;

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow="player"
        title={
          <span className="flex items-center gap-4">
            {data.player.image ? (
              <Image
                src={data.player.image}
                alt={data.player.name}
                width={56}
                height={56}
                className="rounded-rc-md border border-rc-line/18"
                unoptimized
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-rc-md border border-rc-line/18 bg-black/40 font-rc-mono text-xl text-rc-fg-muted">
                {data.player.name?.charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <span
              className={patronStyle?.text ?? undefined}
              style={
                patronStyle ? { textShadow: patronStyle.textShadow } : undefined
              }
            >
              {data.player.name}
            </span>
          </span>
        }
        description={`Member since ${new Date(
          data.player.memberSince
        ).toLocaleDateString()}`}
        actions={
          <RcButton variant="outline" size="sm" onClick={() => router.back()}>
            Back
          </RcButton>
        }
      />

      {/* Overall Stats */}
      <section className="rc-panel">
        <PanelHeader title="Overall Statistics" />
        <div className="grid grid-cols-2 gap-3 px-[18px] py-3.5 md:grid-cols-4">
          <StatTile
            label="Total Games"
            value={String(data.overallStats.totalGames)}
          />
          <StatTile
            label="Overall Win Rate"
            value={formatWinRate(data.overallStats.overallWinRate)}
            tone="text-rc-success"
          />
          <StatTile
            label={`W-L${data.overallStats.totalDraws > 0 ? "-D" : ""}`}
            value={`${data.overallStats.totalWins}-${
              data.overallStats.totalLosses
            }${
              data.overallStats.totalDraws > 0
                ? `-${data.overallStats.totalDraws}`
                : ""
            }`}
          />
          <StatTile
            label="Tournament Wins"
            value={String(data.overallStats.tournamentWins)}
            tone="text-rc-accent-link"
          />
        </div>
      </section>

      {/* Format Rankings */}
      <section className="rc-panel">
        <PanelHeader
          title="Format Rankings"
          meta={`${data.leaderboardRankings.length} entries`}
        />
        {data.leaderboardRankings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">Format</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Win Rate</th>
                  <th scope="col">W-L-D</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboardRankings.map((ranking) => (
                  <tr key={`${ranking.format}-${ranking.timeFrame}`}>
                    <td>
                      <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {getFormatDisplay(ranking.format)}
                      </div>
                      <div className="rc-hint mt-0.5">
                        {getTimeFrameDisplay(ranking.timeFrame)} ·{" "}
                        {ranking.uniqueOpponents} opp · {ranking.ratedGames}{" "}
                        rated
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rc-stat">
                          {ranking.rank > 0 ? `#${ranking.rank}` : "Unranked"}
                        </span>
                        {ranking.provisional && (
                          <Badge
                            tone="warn"
                            title="Needs 5 different opponents and 10 rated games to be ranked"
                          >
                            Provisional
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="rc-stat">{ranking.rating}</span>
                    </td>
                    <td>
                      <span className="rc-stat">
                        {formatWinRate(ranking.winRate)}
                      </span>
                    </td>
                    <td>
                      <span className="rc-stat">
                        {ranking.wins}-{ranking.losses}
                        {ranking.draws > 0 && `-${ranking.draws}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-[18px] py-3.5">
            <RcEmpty title="No ranked formats yet.">
              play a rated match to get placed
            </RcEmpty>
          </div>
        )}
      </section>

      {/* Recent Matches */}
      <section className="rc-panel">
        <PanelHeader
          title="Recent Matches"
          meta={`${data.recentMatches.length} matches`}
        />
        {data.recentMatches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">Match</th>
                  <th scope="col">Format</th>
                  <th scope="col">Date</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.recentMatches.map((match) => {
                  const ladderNote = getLadderNote(match);
                  return (
                    <tr
                      key={match.id}
                      className={match.rated ? undefined : "opacity-60"}
                    >
                      <td>
                        <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                          {match.lobbyName || `Match ${match.matchId.slice(-6)}`}
                        </div>
                        {match.opponent && (
                          <div className="rc-hint mt-0.5">
                            vs {match.opponent.name ?? "Unknown"}
                          </div>
                        )}
                      </td>
                      <td>{getFormatDisplay(match.format)}</td>
                      <td>
                        {new Date(match.completedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={getMatchResultTone(match.isWin, match.isDraw)}
                          >
                            {getMatchResultText(match.isWin, match.isDraw)}
                          </Badge>
                          {match.tournamentId && (
                            <Badge tone="gold">Tournament</Badge>
                          )}
                        </div>
                        {ladderNote && (
                          <div className="rc-hint mt-1">{ladderNote}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-[18px] py-3.5">
            <RcEmpty title="No recent matches found.">
              completed matches show up here
            </RcEmpty>
          </div>
        )}
      </section>

      {/* Tournament History */}
      {data.tournamentHistory.length > 0 && (
        <section className="rc-panel">
          <PanelHeader
            title="Tournament History"
            meta={`${data.tournamentHistory.length} events`}
          />
          <div className="overflow-x-auto">
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">Tournament</th>
                  <th scope="col">Status</th>
                  <th scope="col">Rank</th>
                  <th scope="col">W-L-D</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.tournamentHistory.map((tournament, index) => (
                  <tr key={index}>
                    <td>
                      <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {tournament.tournament.name}
                      </div>
                      <div className="rc-hint mt-0.5">
                        {getFormatDisplay(tournament.tournament.format)}
                      </div>
                    </td>
                    <td>
                      <Badge>{tournament.tournament.status}</Badge>
                    </td>
                    <td>
                      <span className="rc-stat">
                        #{tournament.finalRank}
                      </span>
                    </td>
                    <td>
                      <span className="rc-stat">
                        {tournament.wins}-{tournament.losses}
                        {tournament.draws > 0 && `-${tournament.draws}`}
                      </span>
                    </td>
                    <td>
                      <span className="rc-stat">{tournament.matchPoints}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
