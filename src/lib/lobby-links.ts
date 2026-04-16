export const LOBBY_INVITE_QUERY_PARAM = "invite";
export const LEGACY_LOBBY_JOIN_QUERY_PARAM = "join";

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
