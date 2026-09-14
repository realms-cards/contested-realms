/**
 * Pure lobby-list rules shared by the lobby feature's local and Redis-backed
 * list builders.
 *
 * CPU practice games (vs-CPU precons and goldfish testing) belong to the one
 * player in them: they never enter the list every client receives. They are
 * only sent to that player's own `player:<id>` room (joined by every socket on
 * hello), so the participant's client keeps seeing its lobby (the client drops
 * its joined lobby when a list omits it).
 */

/** Started matches idle for longer than this are hidden from the list. */
export const STALE_MATCH_DISPLAY_MS = 60 * 60 * 1000;

export type CpuPlayerIdPredicate = (id: string) => boolean;

export interface ListableLobby {
  id: string;
  status: string;
  playerIds?: Iterable<string> | null;
  matchId?: string | null;
  lastActive?: number | null;
  createdAt?: number | null;
  /** Marked by startCpuMatch, before the bot has joined the lobby. */
  cpuPractice?: boolean;
}

export interface ListableMatch {
  status?: unknown;
  lastTs?: unknown;
  _finalized?: unknown;
}

export type MatchLookup = (
  matchId: string,
) => ListableMatch | null | undefined;

/** A practice game: flagged at creation, or any seat held by a CPU bot. */
export function isPracticeLobby(
  lobby: Pick<ListableLobby, "playerIds" | "cpuPractice">,
  isCpuPlayerId: CpuPlayerIdPredicate,
): boolean {
  if (lobby.cpuPractice === true) return true;
  for (const pid of lobby.playerIds ?? []) {
    if (typeof pid === "string" && isCpuPlayerId(pid)) return true;
  }
  return false;
}

/**
 * Whether a lobby belongs in a list at all: closed lobbies, lobbies whose
 * match has ended and started matches idle past `staleMs` are left out.
 */
export function isLobbyListable(
  lobby: ListableLobby,
  getMatch: MatchLookup,
  now: number,
  staleMs: number = STALE_MATCH_DISPLAY_MS,
): boolean {
  if (lobby.status === "closed") return false;
  if (lobby.status !== "started") return true;
  let lastActivity = lobby.lastActive || 0;
  if (lobby.matchId) {
    const match = getMatch(lobby.matchId);
    if (
      match &&
      (match.status === "ended" ||
        match.status === "completed" ||
        Boolean(match._finalized))
    ) {
      return false;
    }
    if (match && typeof match.lastTs === "number") {
      lastActivity = Math.max(lastActivity, match.lastTs);
    }
  }
  return now - lastActivity <= staleMs;
}

export interface LobbyListPartition<L> {
  /** Lobbies every client may see, most recent activity first. */
  listed: L[];
  /** Practice games, only for the players inside them. Most recent first. */
  practice: L[];
}

export interface PartitionLobbyListOptions {
  getMatch: MatchLookup;
  isCpuPlayerId: CpuPlayerIdPredicate;
  now: number;
  staleMs?: number;
}

function activityTs(lobby: ListableLobby): number {
  return lobby.lastActive || lobby.createdAt || 0;
}

export function partitionLobbyList<L extends ListableLobby>(
  lobbies: Iterable<L>,
  options: PartitionLobbyListOptions,
): LobbyListPartition<L> {
  const listed: L[] = [];
  const practice: L[] = [];
  for (const lobby of lobbies) {
    if (!isLobbyListable(lobby, options.getMatch, options.now, options.staleMs))
      continue;
    if (isPracticeLobby(lobby, options.isCpuPlayerId)) practice.push(lobby);
    else listed.push(lobby);
  }
  const newestFirst = (a: L, b: L): number => activityTs(b) - activityTs(a);
  listed.sort(newestFirst);
  practice.sort(newestFirst);
  return { listed, practice };
}

/** A practice lobby's list entry, with the player ids allowed to see it. */
export interface PracticeListEntry<I> {
  id: string;
  playerIds: string[];
  info: I;
}

export interface LobbyListEmit<I> {
  /** Room to send to, or null for a broadcast to every socket. */
  room: string | null;
  /** Rooms a broadcast must skip (they get their own emit). */
  exceptRooms: string[];
  lobbies: I[];
}

/** Per-player room every authenticated socket joins on hello. */
export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
}

/** Each player's practice entries, keeping the given (newest first) order. */
function practiceByViewer<I>(
  practice: ReadonlyArray<PracticeListEntry<I>>,
): Map<string, I[]> {
  const byViewer = new Map<string, I[]>();
  for (const entry of practice) {
    for (const playerId of new Set(entry.playerIds)) {
      const own = byViewer.get(playerId);
      if (own) own.push(entry.info);
      else byViewer.set(playerId, [entry.info]);
    }
  }
  return byViewer;
}

/**
 * The `lobbiesUpdated` emits for one list: the public list to everyone except
 * the players in a practice game, and each of those players (by player room)
 * one list with all of their practice lobbies ahead of the public ones.
 * Addressing by player rather than by lobby room means every socket receives
 * exactly one list, however many lobby rooms it is still in, and a socket that
 * reconnected without rejoining its lobby room gets the same list that
 * `lobbyListForViewer` returns on request.
 */
export function planLobbyListEmits<I>(
  listed: I[],
  practice: ReadonlyArray<PracticeListEntry<I>>,
): LobbyListEmit<I>[] {
  const byViewer = practiceByViewer(practice);
  const emits: LobbyListEmit<I>[] = [
    {
      room: null,
      exceptRooms: Array.from(byViewer.keys(), playerRoom),
      lobbies: listed,
    },
  ];
  for (const [playerId, own] of byViewer) {
    emits.push({
      room: playerRoom(playerId),
      exceptRooms: [],
      lobbies: [...own, ...listed],
    });
  }
  return emits;
}

/** The list one socket asked for: public lobbies plus its own practice games. */
export function lobbyListForViewer<I>(
  listed: I[],
  practice: ReadonlyArray<PracticeListEntry<I>>,
  viewerId: string | null | undefined,
): I[] {
  if (!viewerId) return listed;
  const own = practiceByViewer(practice).get(viewerId);
  return own ? [...own, ...listed] : listed;
}
