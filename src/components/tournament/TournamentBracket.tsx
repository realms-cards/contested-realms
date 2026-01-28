"use client";

import { Trophy } from "lucide-react";
import { useMemo } from "react";

interface Player {
  id: string;
  name: string;
  seed?: number;
}

interface Match {
  id: string;
  players: Player[];
  status: "pending" | "active" | "completed" | "cancelled";
  winnerId?: string | null;
  bye?: boolean;
  invalid?: boolean;
}

interface Round {
  id: string;
  roundNumber: number;
  status: "pending" | "active" | "completed";
  matches: Match[];
  startedAt?: string | null;
  completedAt?: string | null;
}

interface TournamentBracketProps {
  rounds: Round[];
  currentUserId?: string | null;
  isCreator?: boolean;
  onInvalidateMatch?: (
    matchId: string,
    action: "invalid" | "bye",
    winnerId?: string,
  ) => void;
}

export function TournamentBracket({
  rounds,
  currentUserId,
  isCreator = false,
  onInvalidateMatch,
}: TournamentBracketProps) {
  // Sort rounds by round number
  const sortedRounds = useMemo(() => {
    return [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rounds]);

  if (sortedRounds.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="text-center py-8 text-slate-400">
          No rounds started yet.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 overflow-x-auto">
      <div className="flex gap-4 min-w-max">
        {sortedRounds.map((round, roundIndex) => (
          <div key={round.id} className="flex flex-col min-w-[280px]">
            {/* Round Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
              <h3 className="text-sm font-semibold text-slate-300">
                Round {round.roundNumber}
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  round.status === "completed"
                    ? "bg-slate-600 text-slate-200"
                    : round.status === "active"
                      ? "bg-blue-600 text-white"
                      : "bg-amber-600/60 text-amber-100"
                }`}
              >
                {round.status}
              </span>
            </div>

            {/* Matches in this round */}
            <div className="flex flex-col gap-3">
              {round.matches.map((match, matchIndex) => (
                <BracketMatch
                  key={match.id}
                  match={match}
                  matchNumber={
                    matchIndex + 1 + roundIndex * round.matches.length
                  }
                  roundNumber={round.roundNumber}
                  currentUserId={currentUserId}
                  isCreator={isCreator}
                  roundStatus={round.status}
                  onInvalidateMatch={onInvalidateMatch}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BracketMatchProps {
  match: Match;
  matchNumber: number;
  roundNumber: number;
  currentUserId?: string | null;
  isCreator?: boolean;
  roundStatus: "pending" | "active" | "completed";
  onInvalidateMatch?: (
    matchId: string,
    action: "invalid" | "bye",
    winnerId?: string,
  ) => void;
}

function BracketMatch({
  match,
  matchNumber,
  currentUserId,
  isCreator,
  roundStatus,
  onInvalidateMatch,
}: BracketMatchProps) {
  const player1 = match.players[0];
  const player2 = match.players[1];
  const isBye = match.bye || !player2;

  const getPlayerRowClass = (player: Player | undefined, isWinner: boolean) => {
    if (!player) return "bg-slate-700/50 text-slate-500";
    if (isWinner) return "bg-orange-600 text-white";
    if (match.status === "completed" && match.winnerId) {
      return "bg-slate-700 text-slate-400";
    }
    if (player.id === currentUserId) {
      return "bg-emerald-900/40 text-emerald-200 ring-1 ring-emerald-500/30";
    }
    return "bg-slate-700 text-slate-200";
  };

  const isP1Winner = match.winnerId === player1?.id;
  const isP2Winner = match.winnerId === player2?.id;

  return (
    <div className="relative">
      {/* Match number badge */}
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 bg-slate-600 text-slate-300 text-[10px] font-mono px-1.5 py-0.5 rounded">
        {matchNumber}
      </div>

      <div className="ml-4 border border-slate-600 rounded overflow-hidden">
        {/* Player 1 */}
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-slate-600 ${getPlayerRowClass(player1, isP1Winner)}`}
        >
          <div className="flex items-center gap-2">
            {player1?.seed && (
              <span className="text-xs font-mono text-slate-400 w-5">
                {player1.seed}
              </span>
            )}
            <span className="text-sm font-medium truncate max-w-[160px]">
              {player1?.name || "TBD"}
            </span>
          </div>
          {isP1Winner && (
            <Trophy className="w-4 h-4 text-yellow-300 flex-shrink-0" />
          )}
        </div>

        {/* Player 2 */}
        <div
          className={`flex items-center justify-between px-3 py-2 ${getPlayerRowClass(player2, isP2Winner)}`}
        >
          <div className="flex items-center gap-2">
            {player2?.seed && (
              <span className="text-xs font-mono text-slate-400 w-5">
                {player2.seed}
              </span>
            )}
            <span className="text-sm font-medium truncate max-w-[160px]">
              {isBye ? "(bye)" : player2?.name || "TBD"}
            </span>
          </div>
          {isP2Winner && (
            <Trophy className="w-4 h-4 text-yellow-300 flex-shrink-0" />
          )}
        </div>

        {/* Match status indicator */}
        {match.status === "active" && (
          <div className="bg-blue-600/20 border-t border-blue-500/30 px-2 py-1 text-center">
            <span className="text-[10px] uppercase tracking-wide text-blue-300">
              In Progress
            </span>
          </div>
        )}
        {match.invalid && (
          <div className="bg-red-600/20 border-t border-red-500/30 px-2 py-1 text-center">
            <span className="text-[10px] uppercase tracking-wide text-red-300">
              Invalid
            </span>
          </div>
        )}

        {/* Creator actions */}
        {isCreator &&
          roundStatus === "active" &&
          (match.status === "pending" || match.status === "active") &&
          onInvalidateMatch && (
            <div className="bg-slate-900/50 border-t border-slate-600 p-2 flex flex-wrap gap-1">
              <button
                onClick={() => onInvalidateMatch(match.id, "invalid")}
                className="bg-red-700/70 hover:bg-red-600 text-white px-2 py-0.5 rounded text-[10px]"
              >
                Invalidate
              </button>
              {player1 && player2 && (
                <>
                  <button
                    onClick={() =>
                      onInvalidateMatch(match.id, "bye", player1.id)
                    }
                    className="bg-amber-600/80 hover:bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]"
                  >
                    Win: P1
                  </button>
                  <button
                    onClick={() =>
                      onInvalidateMatch(match.id, "bye", player2.id)
                    }
                    className="bg-amber-600/80 hover:bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]"
                  >
                    Win: P2
                  </button>
                </>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

export default TournamentBracket;
