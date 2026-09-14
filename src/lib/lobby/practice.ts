import type { LobbyInfo, MatchInfo } from "@/lib/net/protocol";

/**
 * CPU practice games: vs-CPU precon matches and goldfish deck testing. The
 * server seats a bot whose player id is minted as `cpu_<random>`; these games
 * are private to the player in them and never listed for anyone else.
 */
export const CPU_PLAYER_ID_PREFIX = "cpu_";

export type PracticeMode = "vs_cpu" | "goldfish";

export function isCpuPlayerId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(CPU_PLAYER_ID_PREFIX);
}

/** A lobby with a CPU bot in one of its seats. */
export function isPracticeLobby(lobby: Pick<LobbyInfo, "players">): boolean {
  return lobby.players.some((player) => isCpuPlayerId(player.id));
}

/** A match against a CPU bot (roster ids, or the player list as fallback). */
export function isPracticeMatch(
  match: Pick<MatchInfo, "players" | "playerIds">,
): boolean {
  if (
    Array.isArray(match.playerIds) &&
    match.playerIds.some((id) => isCpuPlayerId(id))
  ) {
    return true;
  }
  return (
    Array.isArray(match.players) &&
    match.players.some((player) => isCpuPlayerId(player.id))
  );
}

/** Goldfish testing runs as a constructed match; vs CPU plays precons. */
export function practiceModeForMatchType(
  matchType: string | null | undefined,
): PracticeMode {
  return matchType === "constructed" ? "goldfish" : "vs_cpu";
}

export function practiceLabel(mode: PracticeMode): string {
  return mode === "goldfish" ? "Goldfish practice" : "Practice vs CPU";
}

/** Game Icons glyph for a practice mode (rendered with @iconify/react). */
export function practiceIcon(mode: PracticeMode): string {
  return mode === "goldfish"
    ? "game-icons:target-dummy"
    : "game-icons:robot-golem";
}

function hasPlayer(
  lobby: Pick<LobbyInfo, "players">,
  playerId: string | null | undefined,
): boolean {
  return !!playerId && lobby.players.some((player) => player.id === playerId);
}

/** Drops practice games the viewer is not playing in. */
export function withoutForeignPracticeLobbies(
  lobbies: LobbyInfo[],
  meId: string | null | undefined,
): LobbyInfo[] {
  return lobbies.filter(
    (lobby) => !isPracticeLobby(lobby) || hasPlayer(lobby, meId),
  );
}

/**
 * The lobby list to render: other players' practice games removed, and the
 * viewer's own practice lobby kept even when the list omits it, so it can be
 * pinned and dismissed from the list.
 */
export function visibleLobbies(
  lobbies: LobbyInfo[],
  meId: string | null | undefined,
  joinedLobby?: LobbyInfo | null,
): LobbyInfo[] {
  const list = withoutForeignPracticeLobbies(lobbies, meId);
  if (
    joinedLobby &&
    isPracticeLobby(joinedLobby) &&
    !list.some((lobby) => lobby.id === joinedLobby.id)
  ) {
    return [joinedLobby, ...list];
  }
  return list;
}
