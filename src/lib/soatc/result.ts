/**
 * SOATC League Match Result Generation
 * Creates signed result objects for league match submissions
 */

import crypto from "crypto";
import type { LeagueMatchResult, LeagueMatchResultPlayer } from "./types";

/**
 * Get the shared secret for HMAC signing
 */
function getSharedSecret(): string {
  const secret = process.env.SOATC_SHARED_SECRET;
  if (!secret) {
    // Use a placeholder for Phase 1 if not configured
    console.warn("SOATC_SHARED_SECRET not configured, using placeholder");
    return "placeholder-secret-for-phase1";
  }
  return secret;
}

/**
 * Generate HMAC-SHA256 signature for a result object
 */
export function signResult(
  payload: Omit<LeagueMatchResult, "signature">
): string {
  const secret = getSharedSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Verify a result signature (for testing purposes)
 */
export function verifySignature(result: LeagueMatchResult): boolean {
  const { signature, ...payload } = result;
  const expectedSignature = signResult(payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

interface GenerateResultParams {
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  player1: LeagueMatchResultPlayer;
  player2: LeagueMatchResultPlayer;
  winnerId: string | null; // SOATC UUID of winner
  isDraw: boolean;
  format: "constructed" | "sealed" | "draft";
  startedAt: Date;
  completedAt: Date;
  replayId?: string | null;
}

/**
 * Generate a complete signed league match result object
 */
export function generateLeagueMatchResult(
  params: GenerateResultParams
): LeagueMatchResult {
  const {
    matchId,
    tournamentId,
    tournamentName,
    player1,
    player2,
    winnerId,
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

  // Determine loser ID
  let loserId: string | null = null;
  if (!isDraw && winnerId) {
    loserId =
      winnerId === player1.soatcUuid ? player2.soatcUuid : player1.soatcUuid;
  }

  // Build the payload without signature
  const payload: Omit<LeagueMatchResult, "signature"> = {
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
  };

  // Sign and return complete result
  const signature = signResult(payload);

  return {
    ...payload,
    signature,
  };
}

/**
 * Format a result object as pretty-printed JSON for display
 */
export function formatResultJson(result: LeagueMatchResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Create a filename for downloading the result
 */
export function getResultFilename(matchId: string): string {
  return `soatc-result-${matchId}.json`;
}
