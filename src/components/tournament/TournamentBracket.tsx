"use client";

import { useMemo } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";

export interface BracketPlayer {
  id: string;
  name: string;
  seed?: number;
}

export interface BracketMatchData {
  id: string;
  players: BracketPlayer[];
  status: "pending" | "active" | "completed" | "cancelled";
  winnerId?: string | null;
  bye?: boolean;
  invalid?: boolean;
}

export interface BracketRound {
  id: string;
  roundNumber: number;
  status: "pending" | "active" | "completed";
  matches: BracketMatchData[];
  startedAt?: string | null;
  completedAt?: string | null;
}

type Player = BracketPlayer;
type Match = BracketMatchData;
type Round = BracketRound;

/** Badge tone for a round's lifecycle state. */
export function roundStatusTone(
  status: "pending" | "active" | "completed",
): BadgeTone {
  if (status === "completed") return "ok";
  if (status === "active") return "gold";
  return "warn";
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
      <div className="rc-panel p-4">
        <RcEmpty title="No rounds started yet.">
          pairings appear once the first round begins
        </RcEmpty>
      </div>
    );
  }

  return (
    <div className="rc-panel overflow-x-auto p-4">
      <div className="flex min-w-max gap-4">
        {sortedRounds.map((round, roundIndex) => (
          <div key={round.id} className="flex min-w-[280px] flex-col">
            {/* Round Header */}
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-rc-line/22 pb-2">
              <h3 className="rc-eyebrow m-0">Round {round.roundNumber}</h3>
              <Badge tone={roundStatusTone(round.status)}>{round.status}</Badge>
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
    if (!player) return "text-rc-fg-dim";
    if (isWinner) return "bg-rc-accent/10 text-rc-accent-link font-semibold";
    if (match.status === "completed" && match.winnerId) {
      return "text-rc-fg-subtle";
    }
    if (player.id === currentUserId) {
      return "bg-rc-accent/6 text-rc-fg-strong";
    }
    return "text-rc-fg";
  };

  const isP1Winner = match.winnerId === player1?.id;
  const isP2Winner = match.winnerId === player2?.id;

  return (
    <div className="relative">
      {/* Match number badge */}
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 rounded-rc-sm border border-rc-line/18 bg-black/45 px-1.5 py-0.5 font-rc-mono text-[10px] tracking-[0.1em] text-rc-fg-dim">
        {matchNumber}
      </div>

      <div className="ml-4 overflow-hidden rounded-rc-md border border-rc-line/18 bg-rc-panel">
        {/* Player 1 */}
        <div
          className={`flex items-center justify-between gap-2 border-b border-rc-line/22 px-3 py-2 font-rc-mono text-[13px] ${getPlayerRowClass(player1, isP1Winner)}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {player1?.seed && (
              <span className="w-5 shrink-0 text-[11px] text-rc-fg-dim">
                {player1.seed}
              </span>
            )}
            <span className="max-w-[160px] truncate">
              {player1?.name || "TBD"}
            </span>
          </div>
        </div>

        {/* Player 2 */}
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 font-rc-mono text-[13px] ${getPlayerRowClass(player2, isP2Winner)}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {player2?.seed && (
              <span className="w-5 shrink-0 text-[11px] text-rc-fg-dim">
                {player2.seed}
              </span>
            )}
            <span className="max-w-[160px] truncate">
              {isBye ? "(bye)" : player2?.name || "TBD"}
            </span>
          </div>
        </div>

        {/* Match status indicator */}
        {match.status === "active" && (
          <div className="border-t border-rc-line/12 bg-rc-info/12 px-2 py-1 text-center">
            <span className="font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-info">
              In Progress
            </span>
          </div>
        )}
        {match.invalid && (
          <div className="border-t border-rc-line/12 bg-rc-danger/12 px-2 py-1 text-center">
            <span className="font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-danger">
              Invalid
            </span>
          </div>
        )}

        {/* Creator actions */}
        {isCreator &&
          roundStatus === "active" &&
          (match.status === "pending" || match.status === "active") &&
          onInvalidateMatch && (
            <div className="flex flex-wrap gap-1.5 border-t border-rc-line/12 bg-black/30 p-2">
              <RcButton
                variant="destructive"
                size="sm"
                onClick={() => onInvalidateMatch(match.id, "invalid")}
              >
                Invalidate
              </RcButton>
              {player1 && player2 && (
                <>
                  <RcButton
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onInvalidateMatch(match.id, "bye", player1.id)
                    }
                  >
                    Win: P1
                  </RcButton>
                  <RcButton
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onInvalidateMatch(match.id, "bye", player2.id)
                    }
                  >
                    Win: P2
                  </RcButton>
                </>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

export default TournamentBracket;
