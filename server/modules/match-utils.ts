type MatchLike = {
  playerIds?: string[] | null;
};

export function getSeatForPlayer(
  match: MatchLike | null | undefined,
  playerId: string | null | undefined
): "p1" | "p2" | null {
  if (!match || !Array.isArray(match.playerIds)) return null;
  if (typeof playerId !== "string" || playerId.length === 0) return null;
  const idx = match.playerIds.indexOf(playerId);
  if (idx === 0) return "p1";
  if (idx === 1) return "p2";
  return null;
}

export function getPlayerIdForSeat(match: MatchLike | null | undefined, seat: "p1" | "p2" | null | undefined): string | null {
  if (!match || !Array.isArray(match.playerIds)) return null;
  if (seat === "p1") return match.playerIds[0] || null;
  if (seat === "p2") return match.playerIds[1] || null;
  return null;
}

export function inferLoserId(match: MatchLike | null | undefined, winnerId: string | null | undefined): string | null {
  if (!match || !Array.isArray(match.playerIds)) return null;
  if (typeof winnerId !== "string" || winnerId.length === 0) return null;
  for (const pid of match.playerIds) {
    if (pid !== winnerId) return pid;
  }
  return null;
}

export function getOpponentSeat(seat: "p1" | "p2" | null | undefined): "p1" | "p2" | null {
  if (seat === "p1") return "p2";
  if (seat === "p2") return "p1";
  return null;
}
