import type { MatchPermanents } from "./shared/match-helpers";

/** CPU rules only. Tabletop games retain their existing manual cleanup. */
export function cpuTurnCleanup(game: { permanents?: MatchPermanents | null; avatars?: unknown; board?: unknown }) {
  const permanents: MatchPermanents = {};
  for (const [at, items] of Object.entries(game.permanents || {})) {
    permanents[at] = items.map(item => ({ ...item, damage: null,
      summonedThisTurn: false, cpuTurnEffect: null, version: Number(item.version || 0)+1 }));
  }
  const avatars: Record<string, Record<string, unknown>> = {};
  if (game.avatars && typeof game.avatars === "object") {
    for (const [seat, avatar] of Object.entries(game.avatars)) {
      if (avatar && typeof avatar === "object") avatars[seat] = { ...avatar, cpuTurnEffect: null };
    }
  }
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  const board = isRecord(game.board) ? game.board : null;
  const sites = board && isRecord(board.sites) ? { ...board.sites } : null;
  if (sites) {
    for (const [at,tile] of Object.entries(sites)) {
      if (!isRecord(tile) || !tile.cpuFloodedUntil || !isRecord(tile.card)) continue;
      sites[at] = {...tile,cpuFloodedUntil:null,cpuFloodOriginalThresholds:null,
        card:{...tile.card,thresholds:tile.cpuFloodOriginalThresholds || {}}};
    }
  }
  return { permanents, avatars, ...(board && sites ? {board:{...board,sites}} : {}) };
}
