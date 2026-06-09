/**
 * Shared client-side helper for joining a tournament match.
 *
 * Verifies the match is actually joinable before navigating and writes the
 * bootstrap payload the online play page needs. Both the tournament detail
 * page banner and the global match-assignment toast use this so the join
 * flow behaves identically everywhere.
 */

interface TournamentDetail {
  name?: string;
  format?: string;
  settings?: {
    sealedConfig?: unknown;
    draftConfig?: unknown;
  };
}

interface TournamentMatch {
  id: string;
  status?: string;
  players?: Array<{ id: string }>;
}

export type JoinMatchPreparation =
  | { ok: true }
  | { ok: false; reason: string };

const SETUP_PENDING_REASON =
  "Your match is still being set up — try again in a few seconds.";

export async function prepareTournamentMatchBootstrap(
  tournamentId: string,
  matchId: string,
): Promise<JoinMatchPreparation> {
  let detail: TournamentDetail | null = null;
  try {
    const res = await fetch(
      `/api/tournaments/${encodeURIComponent(tournamentId)}`,
    );
    if (res.ok) detail = (await res.json()) as TournamentDetail;
  } catch {
    // Detail is best-effort; the match lookup below decides joinability
  }

  let match: TournamentMatch | null = null;
  try {
    const res = await fetch(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/matches`,
    );
    if (!res.ok) {
      return { ok: false, reason: SETUP_PENDING_REASON };
    }
    const data = (await res.json()) as { matches?: TournamentMatch[] };
    match = Array.isArray(data.matches)
      ? (data.matches.find((m) => m.id === matchId) ?? null)
      : null;
  } catch {
    return {
      ok: false,
      reason: "Could not load match data — check your connection and retry.",
    };
  }

  if (!match || !Array.isArray(match.players) || match.players.length === 0) {
    return { ok: false, reason: SETUP_PENDING_REASON };
  }
  if (match.status === "completed" || match.status === "cancelled") {
    return { ok: false, reason: "This match has already ended." };
  }

  const format = detail?.format || "constructed";
  const matchType = format === "sealed" ? "sealed" : "constructed";
  let sealedConfig = detail?.settings?.sealedConfig ?? null;
  const draftConfig = detail?.settings?.draftConfig ?? null;
  if (format === "sealed" && !sealedConfig) {
    sealedConfig = {
      packCounts: { Beta: 6 },
      timeLimit: 40,
      replaceAvatars: false,
      freeAvatars: false,
    };
  }

  const payload = {
    players: match.players.map((p) => p.id),
    matchType,
    lobbyName: detail?.name || "Tournament Match",
    sealedConfig,
    draftConfig,
    tournamentId,
  };
  try {
    localStorage.setItem(
      `tournamentMatchBootstrap_${matchId}`,
      JSON.stringify(payload),
    );
  } catch {
    // localStorage may be unavailable; play page falls back to server state
  }

  return { ok: true };
}
