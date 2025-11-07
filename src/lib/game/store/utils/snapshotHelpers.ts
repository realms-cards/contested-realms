import type { GameState } from "../types";

const snapshotsStorageKey = (matchId: string | null): string =>
  matchId && String(matchId).length > 0
    ? `cr_snapshots:${String(matchId)}`
    : "cr_snapshots";

export function loadSnapshotsFromStorageFor(
  matchId: string | null
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
  snaps: GameState["snapshots"]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      snapshotsStorageKey(matchId),
      JSON.stringify(snaps ?? [])
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
