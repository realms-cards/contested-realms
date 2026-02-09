import type { GameState, PlayerKey, SerializedGame } from "../types";

// ---------------------------------------------------------------------------
// Undo-history persistence (sessionStorage – tab-scoped, survives reload)
// ---------------------------------------------------------------------------

const historyStorageKey = (matchId: string | null): string =>
  matchId && String(matchId).length > 0
    ? `cr_history:${String(matchId)}`
    : "cr_history";

type PersistedHistory = {
  history: SerializedGame[];
  historyByPlayer: Record<PlayerKey, SerializedGame[]>;
};

export function loadHistoryFromStorage(
  matchId: string | null,
): PersistedHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(historyStorageKey(matchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedHistory;
    if (
      !parsed ||
      !Array.isArray(parsed.history) ||
      typeof parsed.historyByPlayer !== "object"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

let _historyFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function saveHistoryToStorage(
  matchId: string | null,
  data: PersistedHistory,
): void {
  if (typeof window === "undefined") return;
  // Debounce writes – pushHistory fires on every action; coalesce to at most
  // one write per 500 ms to keep the main thread responsive.
  if (_historyFlushTimer) clearTimeout(_historyFlushTimer);
  _historyFlushTimer = setTimeout(() => {
    _historyFlushTimer = null;
    try {
      window.sessionStorage.setItem(
        historyStorageKey(matchId),
        JSON.stringify(data),
      );
    } catch {
      // quota exceeded – silently drop; history is best-effort
    }
  }, 500);
}

export function clearHistoryStorage(matchId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(historyStorageKey(matchId));
  } catch {}
}

// ---------------------------------------------------------------------------
// Turn-level snapshot persistence (localStorage – survives across sessions)
// ---------------------------------------------------------------------------

const snapshotsStorageKey = (matchId: string | null): string =>
  matchId && String(matchId).length > 0
    ? `cr_snapshots:${String(matchId)}`
    : "cr_snapshots";

export function loadSnapshotsFromStorageFor(
  matchId: string | null,
): GameState["snapshots"] {
  if (typeof window === "undefined")
    return [] as unknown as GameState["snapshots"];
  try {
    const raw = window.localStorage.getItem(snapshotsStorageKey(matchId));
    if (!raw) return [] as unknown as GameState["snapshots"];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as GameState["snapshots"])
      : ([] as unknown as GameState["snapshots"]);
  } catch {
    return [] as unknown as GameState["snapshots"];
  }
}

export function saveSnapshotsToStorageFor(
  matchId: string | null,
  snaps: GameState["snapshots"],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      snapshotsStorageKey(matchId),
      JSON.stringify(snaps ?? []),
    );
  } catch {
    // ignore quota errors
  }
}

export function clearSnapshotsStorageFor(matchId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(snapshotsStorageKey(matchId));
  } catch {
    // ignore quota errors
  }
}
