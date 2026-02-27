"use client";

import { Trophy, Skull, Users } from "lucide-react";
import { createPortal } from "react-dom";
import { LeagueReportStatus } from "@/components/game/LeagueReportStatus";
import { SoatcLeagueResultCard } from "@/components/game/SoatcLeagueResultCard";
import type { PlayerKey } from "@/lib/game/store";
import type { LeagueMatchResult } from "@/lib/soatc/types";

interface MatchEndOverlayProps {
  isVisible: boolean;
  winner: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  myPlayerKey: PlayerKey | null;
  onClose: () => void;
  onLeave?: () => void;
  onLeaveLobby?: () => void;
  leaveLabel?: string;
  allowContinue?: boolean;
  reason?: string;
  winnerId?: string | null;
  myPlayerId?: string | null;
  matchId?: string | null;
  rated?: boolean;
  soatcLeagueResult?: LeagueMatchResult | null;
  viewerSoatcUuid?: string;
}

export default function MatchEndOverlay({
  isVisible,
  winner,
  playerNames,
  myPlayerKey,
  onClose,
  onLeave,
  onLeaveLobby,
  leaveLabel,
  allowContinue = true,
  reason,
  winnerId,
  myPlayerId,
  matchId,
  rated,
  soatcLeagueResult,
  viewerSoatcUuid,
}: MatchEndOverlayProps) {
  if (!isVisible) return null;

  const winnerName = winner ? playerNames[winner] : null;
  const isSpectator = !myPlayerKey;
  const didIWinSeat = !isSpectator && winner === myPlayerKey;
  const didIWinById =
    typeof winnerId === "string" &&
    typeof myPlayerId === "string" &&
    winnerId === myPlayerId;
  // "forfeit" = explicit player action (always rated), "disconnect" = player didn't reconnect
  const isForfeit = reason === "forfeit";
  const isDisconnect = reason === "disconnect";
  const isForfeitOrDisconnect = isForfeit || isDisconnect;
  // isAbandonment is true for both forfeits and disconnects - opponent left the match
  const isAbandonment = isForfeitOrDisconnect;
  // Use ID-based check for forfeits/disconnects, but fall back to seat-based if winnerId unavailable.
  // This handles race conditions where statePatch arrives before matchEnded event.
  const hasWinnerId = typeof winnerId === "string" && winnerId.length > 0;
  const didIWin = isForfeitOrDisconnect
    ? hasWinnerId
      ? didIWinById
      : didIWinSeat // Fallback to seat-based when winnerId not yet available
    : didIWinSeat;
  // Early disconnect = opponent disconnected before turn 5, no winner declared
  const isEarlyForfeit = isDisconnect && !winnerId && rated === false;
  // A draw only occurs when both players died simultaneously (winner is null AND no winnerId AND not a forfeit/disconnect)
  const isDraw = winner === null && !winnerId && !isForfeitOrDisconnect;
  const isRatedForfeit = isForfeitOrDisconnect ? rated !== false : false;

  const handleLeaveMatch = () => {
    if (onLeave) {
      onLeave();
    }
    if (onLeaveLobby) {
      onLeaveLobby();
    }
  };

  const canContinue = allowContinue && typeof onClose === "function";

  // Title text
  const titleText = isDraw
    ? "Draw!"
    : isEarlyForfeit
      ? "Match Ended Early"
      : isForfeitOrDisconnect
        ? isSpectator
          ? winnerName
            ? isRatedForfeit
              ? `${winnerName} wins by forfeit`
              : `${winnerName} left early`
            : isRatedForfeit
              ? "Match ended by forfeit"
              : "Match ended early"
          : didIWin
            ? isRatedForfeit
              ? "Opponent forfeited"
              : "Opponent left"
            : isRatedForfeit
              ? "You forfeited the match"
              : "You left early"
        : isSpectator
          ? winnerName
            ? `${winnerName} wins!`
            : "Match Over"
          : didIWin
            ? "Victory!"
            : `${winnerName ?? "Opponent"} wins`;

  const content = (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur flex items-center justify-center"
      onClick={canContinue ? onClose : undefined}
    >
      <div
        className="bg-zinc-900/95 text-white rounded-2xl sm:rounded-3xl ring-1 ring-white/20 shadow-2xl p-4 sm:p-8 text-center max-w-md w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mb-3 sm:mb-6 flex justify-center">
          {isDraw || isEarlyForfeit ? (
            <Users className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400" />
          ) : isSpectator ? (
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400" />
          ) : didIWin ? (
            isRatedForfeit || (!isForfeit && !isAbandonment) ? (
              <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400" />
            ) : (
              <Users className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400" />
            )
          ) : (
            <Skull className="w-12 h-12 sm:w-16 sm:h-16 text-red-400" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-4">
          {titleText}
        </h1>

        {/* Result Description */}
        <div className="text-base sm:text-lg opacity-90 mb-4 sm:mb-6">
          {isDraw ? (
            <p>Both players died simultaneously.</p>
          ) : isEarlyForfeit ? (
            <p>A player left before turn 5. No winner recorded.</p>
          ) : isForfeit || isAbandonment ? (
            isSpectator ? (
              isRatedForfeit ? (
                <p>Match ended by forfeit.</p>
              ) : (
                <p>
                  Match ended early and will not be recorded for global scores.
                </p>
              )
            ) : didIWin ? (
              isRatedForfeit ? (
                <p>
                  <span className="font-semibold text-green-400">
                    Your opponent
                  </span>
                  {" forfeited. You win."}
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-yellow-400">
                    Your opponent
                  </span>
                  {
                    " left the match. This match will not be recorded for global scores."
                  }
                </p>
              )
            ) : isRatedForfeit ? (
              <p>You forfeited the match.</p>
            ) : (
              <p>
                You left the match early. This match will not be recorded for
                global scores.
              </p>
            )
          ) : isSpectator ? (
            <p>
              <span className="font-semibold text-green-400">
                {winnerName ?? "A player"}
              </span>
              {" wins the match."}
            </p>
          ) : didIWin ? (
            <p>
              <span className="font-semibold text-green-400">You</span>
              {" won the match!"}
            </p>
          ) : (
            <p>
              <span className="font-semibold text-red-400">
                You were defeated.
              </span>
              {winnerName ? ` ${winnerName} wins the match.` : ""}
            </p>
          )}
        </div>

        {/* Match Summary */}
        {isForfeit || isAbandonment ? (
          <div className="bg-black/30 rounded-xl p-4 mb-6 text-sm">
            <div className="text-xs opacity-70 mb-2">Final Result</div>
            <div className="space-y-1">
              <div
                className={`flex justify-between ${
                  didIWin
                    ? isRatedForfeit
                      ? "text-green-400"
                      : "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                <span>{didIWin ? "You" : "Opponent"}</span>
                <span>
                  {isRatedForfeit
                    ? didIWin
                      ? "Winner (forfeit)"
                      : "Forfeited"
                    : "Match abandoned"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-black/30 rounded-xl p-4 mb-6 text-sm">
            <div className="text-xs opacity-70 mb-2">Final Result</div>
            <div className="space-y-1">
              <div
                className={`flex justify-between ${
                  winner === "p1"
                    ? "text-green-400"
                    : winner === null
                      ? "text-yellow-400"
                      : "text-red-400"
                }`}
              >
                <span>
                  {playerNames.p1}
                  {myPlayerKey === "p1" ? " (You)" : ""}
                </span>
                <span>
                  {winner === null
                    ? "Draw"
                    : winner === "p1"
                      ? "Winner"
                      : "Loser"}
                </span>
              </div>
              <div
                className={`flex justify-between ${
                  winner === "p2"
                    ? "text-green-400"
                    : winner === null
                      ? "text-yellow-400"
                      : "text-red-400"
                }`}
              >
                <span>
                  {playerNames.p2}
                  {myPlayerKey === "p2" ? " (You)" : ""}
                </span>
                <span>
                  {winner === null
                    ? "Draw"
                    : winner === "p2"
                      ? "Winner"
                      : "Loser"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SOATC League Result Card */}
        {soatcLeagueResult && (
          <div className="mb-6">
            <SoatcLeagueResultCard
              result={soatcLeagueResult}
              isWinner={didIWin}
              viewerSoatcUuid={viewerSoatcUuid}
            />
          </div>
        )}

        {/* League Match Reports */}
        {matchId && (
          <div className="mb-6">
            <LeagueReportStatus matchId={matchId} />
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 sm:space-y-3">
          {canContinue && (
            <button
              onClick={onClose}
              className="w-full bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 text-white rounded-lg sm:rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-medium transition-colors"
            >
              Continue Examining Board
            </button>
          )}

          {onLeave && (
            <button
              onClick={handleLeaveMatch}
              className="w-full bg-red-700 hover:bg-red-600 active:bg-red-500 text-white rounded-lg sm:rounded-xl px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-medium transition-colors"
            >
              {leaveLabel || "Leave Match"}
            </button>
          )}
        </div>

        <div className="mt-3 sm:mt-4 text-[10px] sm:text-xs opacity-60">
          {canContinue
            ? "The match has ended. Players can still examine the board."
            : "The match has ended. Please return to continue your event."}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
