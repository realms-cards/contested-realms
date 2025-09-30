const DEFAULT_FALLBACK_SUFFIX = "0000";

function fallbackDisplayName(playerId) {
  const source = playerId == null ? "" : String(playerId);
  const suffix = source.slice(-4) || DEFAULT_FALLBACK_SUFFIX;
  return `Player ${suffix}`;
}

function ensurePlayerEntry(playersMap, ensurePlayerCached, playerId) {
  if (playersMap.has(playerId)) return playersMap.get(playerId);
  const entry = {
    id: playerId,
    displayName: fallbackDisplayName(playerId),
    socketId: null,
    lobbyId: null,
    matchId: null,
  };
  playersMap.set(playerId, entry);
  if (typeof ensurePlayerCached === "function") {
    try {
      const maybePromise = ensurePlayerCached(playerId);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch(() => undefined);
      }
    } catch {
      // ignore hydration errors; fallback entry already recorded locally
    }
  }
  return entry;
}

function buildMatchInfo(match, options) {
  const playersMap = options?.playersMap ?? new Map();
  const ensurePlayerCached = options?.ensurePlayerCached;

  const orderedPlayers = [];
  if (Array.isArray(match?.playerIds)) {
    for (const pid of match.playerIds) {
      if (!pid) continue;
      const existing =
        playersMap.get(pid) || ensurePlayerEntry(playersMap, ensurePlayerCached, pid);
      if (existing && typeof existing === "object") {
        orderedPlayers.push({ id: existing.id, displayName: existing.displayName });
      } else {
        orderedPlayers.push({ id: pid, displayName: fallbackDisplayName(pid) });
      }
    }
  }

  return {
    id: match.id,
    lobbyId: match.lobbyId || undefined,
    lobbyName: match.lobbyName || undefined,
    players: orderedPlayers,
    playerIds: Array.isArray(match?.playerIds) ? [...match.playerIds] : [],
    status: match.status,
    seed: match.seed,
    turn: match.turn,
    winnerId: match.winnerId ?? null,
    matchType: match.matchType || "constructed",
    sealedConfig: match.sealedConfig,
    draftConfig: match.draftConfig,
    deckSubmissions: match.playerDecks
      ? Array.from(match.playerDecks.keys())
      : [],
    playerDecks: match.playerDecks
      ? Object.fromEntries(match.playerDecks)
      : undefined,
    sealedPacks: match.sealedPacks || undefined,
    draftState: match.draftState || undefined,
  };
}

module.exports = {
  fallbackDisplayName,
  ensurePlayerEntry,
  buildMatchInfo,
};
