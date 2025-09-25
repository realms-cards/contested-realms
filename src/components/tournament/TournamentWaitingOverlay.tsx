"use client";

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

  const myStanding = tournament.standings.find(s => s.playerId === myPlayerId);
  const currentRound = tournament.rounds[tournament.currentRound - 1];
  const myCurrentMatch = myStanding?.currentMatchId;

  const sortedStandings = [...tournament.standings].sort((a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    if (a.gameWinPercentage !== b.gameWinPercentage) return b.gameWinPercentage - a.gameWinPercentage;
    return b.opponentMatchWinPercentage - a.opponentMatchWinPercentage;
  });

  const getStatusMessage = () => {
    switch (tournament.status) {
      case "registering":
        return `Waiting for registration to complete (${tournament.registeredPlayers.length}/${tournament.maxPlayers})`;
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

  const actionButton = tournament.status === "playing" && myCurrentMatch ? (
    <button
      className="rounded bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 px-6 py-3 text-lg font-semibold shadow-lg"
      onClick={() => onMatchReady(myCurrentMatch)}
    >
      Join Match
    </button>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-slate-900/95 rounded-xl shadow-2xl w-full max-w-4xl p-6 ring-1 ring-slate-800">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">{tournament.name}</h1>
          <div className="text-lg text-slate-300 mb-4">
            {getStatusMessage()}
          </div>
          
          {actionButton && (
            <div className="mb-6">
              {actionButton}
            </div>
          )}

          <div className="flex justify-center gap-8 text-sm text-slate-400 mb-6">
            <span>Format: {tournament.format.charAt(0).toUpperCase() + tournament.format.slice(1)}</span>
            <span>Type: {tournament.matchType.charAt(0).toUpperCase() + tournament.matchType.slice(1)}</span>
            <span>Round: {tournament.currentRound}/{tournament.totalRounds}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Standings */}
          <div className="bg-black/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Standings</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sortedStandings.map((standing, index) => (
                <div
                  key={standing.playerId}
                  className={`flex items-center justify-between px-3 py-2 rounded ${
                    standing.playerId === myPlayerId
                      ? "bg-blue-600/20 ring-1 ring-blue-500/30"
                      : standing.isEliminated
                      ? "bg-red-900/20 opacity-60"
                      : "bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-300 w-6">
                      {index + 1}.
                    </span>
                    <span className="font-medium text-white">
                      {standing.displayName}
                      {standing.playerId === myPlayerId && (
                        <span className="text-blue-400 text-sm ml-2">(You)</span>
                      )}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300">
                    {standing.wins}-{standing.losses}
                    {standing.draws > 0 && `-${standing.draws}`}
                    <span className="text-xs ml-2 opacity-70">
                      ({standing.matchPoints} pts)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Round Matches */}
          {currentRound && (
            <div className="bg-black/20 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">
                Round {tournament.currentRound} Matches
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {currentRound.matches.map((matchId, index) => {
                  const isMyMatch = matchId === myCurrentMatch;
                  return (
                    <div
                      key={matchId}
                      className={`px-3 py-2 rounded ${
                        isMyMatch
                          ? "bg-green-600/20 ring-1 ring-green-500/30"
                          : "bg-slate-800/40"
                      }`}
                    >
                      <div className="text-sm">
                        <span className="text-slate-300">Match {index + 1}</span>
                        {isMyMatch && (
                          <span className="text-green-400 text-xs ml-2">(Your match)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {matchId}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tournament Progress */}
        <div className="mt-6 bg-black/20 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Tournament Progress</h3>
          <div className="flex items-center gap-2 mb-2">
            {Array.from({ length: tournament.totalRounds }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded ${
                  i < tournament.currentRound - 1
                    ? "bg-green-500"
                    : i === tournament.currentRound - 1
                    ? "bg-blue-500"
                    : "bg-slate-600"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Round 1</span>
            <span>Round {tournament.totalRounds}</span>
          </div>
        </div>
      </div>
    </div>
  );
}