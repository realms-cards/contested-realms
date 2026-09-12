"use client";

import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import type { TournamentInfo } from "@/lib/net/protocol";

interface TournamentWaitingOverlayProps {
  tournament: TournamentInfo;
  myPlayerId: string;
  onMatchReady: (matchId: string) => void;
}

export default function TournamentWaitingOverlay({
  tournament,
  myPlayerId,
  onMatchReady,
}: TournamentWaitingOverlayProps) {
  const myStanding = tournament.standings.find(
    (s) => s.playerId === myPlayerId
  );
  const currentRound = tournament.rounds[tournament.currentRound - 1];
  const myCurrentMatch = myStanding?.currentMatchId;
  const activeCount = tournament.registeredPlayers.filter(
    (player) => player.seatStatus !== "vacant"
  ).length;
  const vacantCount = tournament.registeredPlayers.length - activeCount;

  const sortedStandings = [...tournament.standings].sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    if (a.gameWinPercentage !== b.gameWinPercentage)
      return b.gameWinPercentage - a.gameWinPercentage;
    return b.opponentMatchWinPercentage - a.opponentMatchWinPercentage;
  });

  const getStatusMessage = () => {
    switch (tournament.status) {
      case "registering":
        if (vacantCount > 0 || activeCount > tournament.maxPlayers) {
          return `Registration open (${activeCount} active${
            vacantCount > 0 ? `, ${vacantCount} vacant` : ""
          })`;
        }
        return `Waiting for registration to complete (${activeCount}/${tournament.maxPlayers})`;
      case "draft_phase":
        return "Draft phase in progress...";
      case "sealed_phase":
        return "Sealed deck construction phase...";
      case "playing":
        if (myCurrentMatch) {
          return `Round ${tournament.currentRound}: Your match is ready!`;
        }
        if (currentRound?.status === "pending") {
          return `Round ${tournament.currentRound}: Pairings being generated...`;
        }
        if (currentRound?.status === "in_progress") {
          if (myStanding?.isEliminated) {
            return "You have been eliminated. Watching remaining matches...";
          }
          return `Round ${tournament.currentRound}: Waiting for other matches to complete...`;
        }
        return "Waiting for next round...";
      case "completed":
        return "Tournament completed!";
      default:
        return "Waiting...";
    }
  };

  const actionButton =
    tournament.status === "playing" && myCurrentMatch ? (
      <RcButton size="lg" onClick={() => onMatchReady(myCurrentMatch)}>
        Join Match
      </RcButton>
    ) : null;

  return (
    <RcDialog title={tournament.name} eyebrow="tournament" size="xl">
      <div className="mb-6 text-center">
        <div className="mb-4 font-rc-sans text-base text-rc-fg">
          {getStatusMessage()}
        </div>

        {actionButton && <div className="mb-6">{actionButton}</div>}

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
          <span>
            Format:{" "}
            {tournament.format.charAt(0).toUpperCase() +
              tournament.format.slice(1)}
          </span>
          <span>
            Type:{" "}
            {tournament.matchType.charAt(0).toUpperCase() +
              tournament.matchType.slice(1)}
          </span>
          <span>
            Round: {tournament.currentRound}/{tournament.totalRounds}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Standings */}
        <div className="rounded-rc-md border border-rc-line/18 bg-black/30 p-4">
          <h3 className="rc-eyebrow m-0 mb-3">Standings</h3>
          <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto">
            {sortedStandings.map((standing, index) => (
              <div
                key={standing.playerId}
                className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 font-rc-mono text-[13px] ${
                  standing.playerId === myPlayerId
                    ? "bg-rc-accent/10 text-rc-fg-strong"
                    : standing.isEliminated
                      ? "text-rc-fg-dim opacity-70"
                      : "text-rc-fg"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 tabular-nums text-rc-fg-dim">
                    {index + 1}.
                  </span>
                  <span className="truncate font-semibold">
                    {standing.displayName}
                    {standing.playerId === myPlayerId && (
                      <span className="ml-2 text-rc-accent-link">(You)</span>
                    )}
                  </span>
                </div>
                <div className="shrink-0 tabular-nums text-rc-fg-muted">
                  {standing.wins}-{standing.losses}
                  {standing.draws > 0 && `-${standing.draws}`}
                  <span className="ml-2 text-[11px] text-rc-fg-dim">
                    ({standing.matchPoints} pts)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current Round Matches */}
        {currentRound && (
          <div className="rounded-rc-md border border-rc-line/18 bg-black/30 p-4">
            <h3 className="rc-eyebrow m-0 mb-3">
              Round {tournament.currentRound} Matches
            </h3>
            <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto">
              {currentRound.matches.map((matchId, index) => {
                const isMyMatch = matchId === myCurrentMatch;
                return (
                  <div
                    key={matchId}
                    className={`rounded-rc-md px-3 py-2 ${
                      isMyMatch ? "bg-rc-accent/10" : ""
                    }`}
                  >
                    <div className="font-rc-mono text-[13px] text-rc-fg">
                      <span>Match {index + 1}</span>
                      {isMyMatch && (
                        <span className="ml-2 text-[11px] text-rc-accent-link">
                          (Your match)
                        </span>
                      )}
                    </div>
                    <div className="rc-hint truncate">{matchId}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tournament Progress */}
      <div className="mt-6 rounded-rc-md border border-rc-line/18 bg-black/30 p-4">
        <h3 className="rc-eyebrow m-0 mb-3">Tournament Progress</h3>
        <div className="mb-2 flex items-center gap-2">
          {Array.from({ length: tournament.totalRounds }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < tournament.currentRound - 1
                  ? "bg-rc-success"
                  : i === tournament.currentRound - 1
                    ? "bg-rc-accent"
                    : "bg-rc-line/12"
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
          <span>Round 1</span>
          <span>Round {tournament.totalRounds}</span>
        </div>
      </div>
    </RcDialog>
  );
}
