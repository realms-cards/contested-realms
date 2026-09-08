export const LOBBY_INVITE_QUERY_PARAM = "invite";
export const LEGACY_LOBBY_JOIN_QUERY_PARAM = "join";

/**
 * Lobby ids with this prefix are created by the socket server the moment the
 * first player opens the link (see `isOnDemandLobbyId` in the lobby feature),
 * so an invite link can be minted and shared before any lobby exists and keeps
 * working across server restarts. Whoever arrives first becomes host.
 */
export const INVITE_LOBBY_ID_PREFIX = "invite-";

export type InviteMatchFormat = "constructed" | "sealed" | "draft";

export function createInviteLobbyId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${INVITE_LOBBY_ID_PREFIX}${hex}`;
}

export function parseInviteFormat(
  raw: string | null | undefined,
): InviteMatchFormat | null {
  const value = (raw ?? "").toLowerCase();
  return value === "constructed" || value === "sealed" || value === "draft"
    ? value
    : null;
}

type SearchParamReader = {
  get(name: string): string | null;
};

type LobbyLinkOptions = {
  tournamentId?: string | null;
  format?: string | null;
};

export function getLobbyJoinId(
  searchParams?: SearchParamReader | null,
): string | null {
  return (
    searchParams?.get(LOBBY_INVITE_QUERY_PARAM) ??
    searchParams?.get(LEGACY_LOBBY_JOIN_QUERY_PARAM) ??
    null
  );
}

export function buildLobbyInvitePath(
  lobbyId: string,
  options: LobbyLinkOptions = {},
): string {
  const params = new URLSearchParams();
  params.set(LOBBY_INVITE_QUERY_PARAM, lobbyId);
  if (options.tournamentId) {
    params.set("tournament", options.tournamentId);
  }
  if (options.format) {
    params.set("format", options.format);
  }
  return `/online/lobby?${params.toString()}`;
}

export function buildLobbyInviteUrl(
  origin: string,
  lobbyId: string,
  options: LobbyLinkOptions = {},
): string {
  return new URL(buildLobbyInvitePath(lobbyId, options), origin).toString();
}
