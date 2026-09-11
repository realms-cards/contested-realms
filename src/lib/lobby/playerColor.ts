/**
 * Deterministic per-player accent colour for chat usernames and lobby hosts.
 * Drawn only from the design-system palette: info, accent-link, success,
 * ember, moonlight. Hash of the user id over that list; unknown ids fall
 * back to the muted foreground.
 */
const PLAYER_PALETTE = [
  "#6f8bb3", // --info
  "#e3ba55", // --accent-link
  "#7a9d52", // --success
  "#c97c3d", // --ember
  "#c9d6ea", // --moonlight
] as const;

export const PLAYER_FALLBACK_COLOR = "#b9b4a2"; // --fg-muted

export function playerColor(id: string | null | undefined): string {
  if (!id) return PLAYER_FALLBACK_COLOR;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PLAYER_PALETTE[hash % PLAYER_PALETTE.length];
}

/** Short, human-readable slice of a lobby/user id for `#id` labels. */
export function shortId(id: string, length = 8): string {
  const trimmed = id.replace(/^(invite|discord)-/, "");
  return trimmed.length > length ? trimmed.slice(-length) : trimmed;
}
