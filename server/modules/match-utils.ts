// @ts-nocheck

export function getSeatForPlayer(match, playerId) {
  if (!match || !Array.isArray(match.playerIds)) return null;
  const idx = match.playerIds.indexOf(playerId);
  if (idx === 0) return "p1";
  if (idx === 1) return "p2";
  return null;
}

export function getPlayerIdForSeat(match, seat) {
  if (!match || !Array.isArray(match.playerIds)) return null;
  if (seat === "p1") return match.playerIds[0] || null;
  if (seat === "p2") return match.playerIds[1] || null;
  return null;
}

export function inferLoserId(match, winnerId) {
  if (!match || !Array.isArray(match.playerIds)) return null;
  if (!winnerId) return null;
  for (const pid of match.playerIds) {
    if (pid !== winnerId) return pid;
  }
  return null;
}

export function getOpponentSeat(seat) {
  if (seat === "p1") return "p2";
  if (seat === "p2") return "p1";
  return null;
}
