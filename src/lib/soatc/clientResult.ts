/**
 * SOATC League Match Result Generation (Client-side)
 * Creates result objects for league match display (without server-side signing)
 */

import type { LeagueMatchResult, LeagueMatchResultPlayer } from "./types";

interface GenerateClientResultParams {
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  player1: LeagueMatchResultPlayer;
  player2: LeagueMatchResultPlayer;
  winnerPlayerKey: "p1" | "p2" | null; // Which player won (p1/p2) or null for draw
  isDraw: boolean;
  format: "constructed" | "sealed" | "draft";
  startedAt: Date;
  completedAt: Date;
  replayId?: string | null;
}

/**
 * Generate a league match result object for client-side display
 * Note: This doesn't include a cryptographic signature - that should be done server-side
 */
export function generateClientLeagueMatchResult(
  params: GenerateClientResultParams
): LeagueMatchResult {
  const {
    matchId,
    tournamentId,
    tournamentName,
    player1,
    player2,
    winnerPlayerKey,
    isDraw,
    format,
    startedAt,
    completedAt,
    replayId,
  } = params;

  // Calculate duration
  const durationSeconds = Math.floor(
    (completedAt.getTime() - startedAt.getTime()) / 1000
  );

  // Determine winner/loser based on player key
  let winnerId: string | null = null;
  let loserId: string | null = null;

  if (!isDraw && winnerPlayerKey) {
    const winnerPlayer = winnerPlayerKey === "p1" ? player1 : player2;
    const loserPlayer = winnerPlayerKey === "p1" ? player2 : player1;
    winnerId = winnerPlayer.soatcUuid || winnerPlayer.realmsUserId;
    loserId = loserPlayer.soatcUuid || loserPlayer.realmsUserId;
  }

  return {
    matchId,
    tournamentId,
    tournamentName,
    player1,
    player2,
    winnerId,
    loserId,
    isDraw,
    format,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds,
    replayId: replayId || null,
    replayUrl: replayId ? `https://realms.cards/replay/${replayId}` : null,
    timestamp: new Date().toISOString(),
    signature: "client-generated-no-signature", // Placeholder for client-side
  };
}
