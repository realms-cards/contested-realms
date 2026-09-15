"use client";

import { Trophy, Skull, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LeagueReportStatus } from "@/components/game/LeagueReportStatus";
import { SoatcLeagueResultCard } from "@/components/game/SoatcLeagueResultCard";
import { RcButton } from "@/components/ui/rc-button";
import { soundManager } from "@/lib/audio/soundManager";
import type { PlayerKey } from "@/lib/game/store";
import type { LeagueMatchResult } from "@/lib/soatc/types";

interface MatchEndOverlayProps {
  isVisible: boolean;
  winner: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  myPlayerKey: PlayerKey | null;
  onClose: () => void;
  onLeave?: () => void;
  onTestAgain?: () => void;
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
  isTournament?: boolean;
  /** Rematch handshake state + actions; omitted when a rematch is unavailable */
  rematch?: {
    requestedByMe: boolean;
    requestedByOpponent: boolean;
    declined: boolean;
    error?: string | null;
    onRequest: () => void;
    onDecline: () => void;
  };
}

export default function MatchEndOverlay({
  isVisible,
  winner,
  playerNames,
  myPlayerKey,
  onClose,
  onLeave,
  onTestAgain,
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
  rematch,
}: MatchEndOverlayProps) {
  // One result sound per opening. A null winner can be transient while the
  // result is still arriving, so wait for a concrete outcome before playing.
  const playedResultSoundRef = useRef(false);
  useEffect(() => {
    if (!isVisible) {
      playedResultSoundRef.current = false;
      return;
    }
    if (playedResultSoundRef.current || !myPlayerKey) return;
    const opponentLeft = reason === "forfeit" || reason === "disconnect";
    const knownWinnerId = typeof winnerId === "string" && winnerId.length > 0;
    if (!winner && !knownWinnerId && !opponentLeft) return;
    playedResultSoundRef.current = true;
    const won =
      opponentLeft && knownWinnerId && typeof myPlayerId === "string"
        ? winnerId === myPlayerId
        : winner === myPlayerKey;
    if (opponentLeft && (won || !knownWinnerId)) soundManager.play("playerLeft");
    else soundManager.play(won ? "victory" : "defeat");
  }, [isVisible, myPlayerKey, myPlayerId, reason, winner, winnerId]);

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
      className="fixed inset-0 z-[9999] bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px] flex items-center justify-center"
      onClick={canContinue ? onClose : undefined}
    >
      <div
        className="thin-scrollbar rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg shadow-rc-panel sm:rounded-rc-lg p-4 sm:p-8 text-center max-w-md w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mb-3 sm:mb-6 flex justify-center">
          {isDraw || isEarlyForfeit ? (
            <Users className="w-12 h-12 sm:w-16 sm:h-16 text-rc-warning" />
          ) : isSpectator ? (
            <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-rc-accent" />
          ) : didIWin ? (
            isRatedForfeit || (!isForfeit && !isAbandonment) ? (
              <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-rc-accent" />
            ) : (
              <Users className="w-12 h-12 sm:w-16 sm:h-16 text-rc-warning" />
            )
          ) : (
            <Skull className="w-12 h-12 sm:w-16 sm:h-16 text-rc-danger" />
          )}
        </div>

        {/* Title */}
        <h1 className="mb-2 font-rc-display text-[26px] leading-none text-rc-fg-strong sm:mb-4 sm:text-[32px]">
          {titleText}
        </h1>

        {/* Result Description */}
        <div className="font-rc-sans text-base sm:text-lg text-rc-fg mb-4 sm:mb-6">
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
                  <span className="font-semibold text-rc-success">
                    Your opponent
                  </span>
                  {" forfeited. You win."}
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-rc-warning">
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
              <span className="font-semibold text-rc-success">
                {winnerName ?? "A player"}
              </span>
              {" wins the match."}
            </p>
          ) : didIWin ? (
            <p>
              <span className="font-semibold text-rc-success">You</span>
              {" won the match!"}
            </p>
          ) : (
            <p>
              <span className="font-semibold text-rc-danger">
                You were defeated.
              </span>
              {winnerName ? ` ${winnerName} wins the match.` : ""}
            </p>
          )}
        </div>

        {/* Match Summary */}
        {isForfeit || isAbandonment ? (
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4 mb-6 font-rc-sans text-sm">
            <div className="rc-eyebrow mb-2">Final Result</div>
            <div className="space-y-1">
              <div
                className={`flex justify-between ${
                  didIWin
                    ? isRatedForfeit
                      ? "text-rc-success"
                      : "text-rc-warning"
                    : "text-rc-danger"
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
          <div className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4 mb-6 font-rc-sans text-sm">
            <div className="rc-eyebrow mb-2">Final Result</div>
            <div className="space-y-1">
              <div
                className={`flex justify-between ${
                  winner === "p1"
                    ? "text-rc-success"
                    : winner === null
                      ? "text-rc-warning"
                      : "text-rc-danger"
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
                    ? "text-rc-success"
                    : winner === null
                      ? "text-rc-warning"
                      : "text-rc-danger"
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

        {/* Rematch */}
        {rematch && (
          <div className="mb-3 sm:mb-4 space-y-2">
            {rematch.error ? (
              <p className="rc-alert" data-tone="danger">{rematch.error}</p>
            ) : rematch.declined ? (
              <p className="font-rc-sans text-sm text-rc-fg-muted">Rematch declined.</p>
            ) : rematch.requestedByOpponent && !rematch.requestedByMe ? (
              <>
                <p className="font-rc-sans text-sm font-medium text-rc-success">
                  Your opponent wants a rematch!
                </p>
                <div className="flex gap-2">
                  <RcButton
                    variant={soatcLeagueResult ? "outline" : "default"}
                    onClick={rematch.onRequest}
                    className="flex-1 sm:h-[46px] sm:px-6 sm:text-base"
                  >
                    Accept Rematch
                  </RcButton>
                  <RcButton
                    variant="outline"
                    onClick={rematch.onDecline}
                    className="flex-1 sm:h-[46px] sm:px-6 sm:text-base"
                  >
                    Decline
                  </RcButton>
                </div>
              </>
            ) : rematch.requestedByMe ? (
              <>
                <RcButton
                  variant="quiet"
                  disabled
                  className="h-auto w-full cursor-wait px-4 py-2.5 font-rc-mono text-sm tracking-[0.08em] disabled:opacity-100 sm:px-6 sm:py-3"
                >
                  Waiting for opponent…
                </RcButton>
                <button
                  onClick={rematch.onDecline}
                  className="cursor-pointer font-rc-sans text-xs text-rc-fg-subtle hover:text-rc-fg transition-colors"
                >
                  Cancel rematch request
                </button>
              </>
            ) : (
              <RcButton
                variant={soatcLeagueResult ? "outline" : "default"}
                onClick={rematch.onRequest}
                className="w-full sm:h-[46px] sm:px-6 sm:text-base"
              >
                Request Rematch
              </RcButton>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 sm:space-y-3">
          {onTestAgain && !isSpectator && <RcButton size="lg" onClick={onTestAgain} className="w-full">Test again in Goldfish</RcButton>}
          {canContinue && (
            <RcButton
              variant="outline"
              onClick={onClose}
              className="w-full sm:h-[46px] sm:px-6 sm:text-base"
            >
              Continue Examining Board
            </RcButton>
          )}

          {onLeave && (
            <RcButton
              variant="destructive"
              onClick={handleLeaveMatch}
              className="w-full sm:h-[46px] sm:px-6 sm:text-base"
            >
              {leaveLabel || "Leave Match"}
            </RcButton>
          )}
        </div>

        {matchId && (
          <div className="mt-3 sm:mt-4">
            <Link
              href={`/replay/${matchId}`}
              className="rc-link inline-flex items-center gap-1.5 font-rc-sans text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M8 5v14l11-7-11-7z" />
              </svg>
              Watch replay
            </Link>
          </div>
        )}

        <div className="mt-2 sm:mt-3 font-rc-sans text-[10px] sm:text-xs text-rc-fg-subtle">
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
