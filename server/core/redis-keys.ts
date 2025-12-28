/**
 * Redis Key Schema for Horizontal Scaling
 *
 * All keys follow the pattern: {entity}:{subtype}:{id}
 * TTLs are defined as constants and should be used consistently.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TTL Constants (in seconds)
// ─────────────────────────────────────────────────────────────────────────────

/** Player socket reverse lookup TTL (1 hour) */
export const PLAYER_SOCKET_TTL_SEC = 3600;

/** Player state TTL (24 hours) - extended on activity */
export const PLAYER_STATE_TTL_SEC = 86400;

/** Match leader lock TTL (15 seconds) - refreshed by heartbeat */
export const MATCH_LEADER_TTL_SEC = 15;

/** Match state cache TTL (24 hours) */
export const MATCH_STATE_TTL_SEC = 86400;

/** Lobby leader lock TTL (15 seconds) */
export const LOBBY_LEADER_TTL_SEC = 15;

/** Lobby state TTL (1 hour) */
export const LOBBY_STATE_TTL_SEC = 3600;

/** Heartbeat interval (5 seconds) */
export const LEADER_HEARTBEAT_INTERVAL_MS = 5000;

/** Disconnect grace period (30 seconds) */
export const DISCONNECT_GRACE_PERIOD_MS = 30000;

/** Match recording TTL (24 hours) */
export const RECORDING_TTL_SEC = 86400;

// ─────────────────────────────────────────────────────────────────────────────
// Key Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Player State Keys
 *
 * player:{playerId} - HASH containing player data:
 *   - displayName: string
 *   - instanceId: string (which server instance owns the socket)
 *   - matchId: string | null
 *   - lobbyId: string | null
 *   - lastSeen: number (timestamp)
 *
 * player:socket:{socketId} - STRING containing playerId (reverse lookup)
 */
export const playerKeys = {
  /** Player state hash: player:{playerId} */
  state: (playerId: string) => `player:${playerId}` as const,

  /** Socket to player reverse lookup: player:socket:{socketId} */
  socket: (socketId: string) => `player:socket:${socketId}` as const,

  /** Pattern for scanning all player states */
  statePattern: "player:*" as const,

  /** Pattern for scanning all socket mappings (excludes player:* states) */
  socketPattern: "player:socket:*" as const,
};

/**
 * Match State Keys
 *
 * match:state:{matchId} - HASH containing full match state
 * match:game:{matchId} - STRING containing JSON game state (high-frequency updates)
 * match:leader:{matchId} - STRING containing instanceId of leader
 * match:session:{matchId} - STRING containing cached session data (legacy, kept for compatibility)
 */
export const matchKeys = {
  /** Full match state hash: match:state:{matchId} */
  state: (matchId: string) => `match:state:${matchId}` as const,

  /** Game state JSON (high-frequency): match:game:{matchId} */
  game: (matchId: string) => `match:game:${matchId}` as const,

  /** Leader lock: match:leader:{matchId} */
  leader: (matchId: string) => `match:leader:${matchId}` as const,

  /** Session cache (legacy): match:session:{matchId} */
  session: (matchId: string) => `match:session:${matchId}` as const,

  /** Pattern for scanning all match states */
  statePattern: "match:state:*" as const,

  /** Pattern for scanning all leader locks */
  leaderPattern: "match:leader:*" as const,
};

/**
 * Match Recording Keys (for horizontal scaling)
 *
 * recording:stream:{matchId} - STREAM containing action log entries
 * recording:meta:{matchId} - HASH containing recording metadata
 *
 * Each stream entry contains:
 *   - patch: JSON string of the action patch
 *   - playerId: string
 *   - timestamp: number
 */
export const recordingKeys = {
  /** Recording action stream: recording:stream:{matchId} */
  stream: (matchId: string) => `recording:stream:${matchId}` as const,

  /** Recording metadata hash: recording:meta:{matchId} */
  meta: (matchId: string) => `recording:meta:${matchId}` as const,

  /** Pattern for scanning all recording streams */
  streamPattern: "recording:stream:*" as const,

  /** Pattern for scanning all recording metadata */
  metaPattern: "recording:meta:*" as const,
};

/**
 * RTC/Voice State Keys (for horizontal scaling)
 *
 * rtc:room:{roomId}:members - SET of participant playerIds
 * rtc:participant:{playerId} - HASH containing participant details
 * rtc:request:{requestId} - HASH containing pending voice request
 */
export const rtcKeys = {
  /** Room members set: rtc:room:{roomId}:members */
  roomMembers: (roomId: string) => `rtc:room:${roomId}:members` as const,

  /** Participant details hash: rtc:participant:{playerId} */
  participant: (playerId: string) => `rtc:participant:${playerId}` as const,

  /** Pending voice request hash: rtc:request:{requestId} */
  request: (requestId: string) => `rtc:request:${requestId}` as const,

  /** Pattern for scanning all room members */
  roomPattern: "rtc:room:*:members" as const,

  /** Pattern for scanning all participants */
  participantPattern: "rtc:participant:*" as const,
};

/** RTC state TTL: 5 minutes (short-lived, session-bound) */
export const RTC_STATE_TTL_SEC = 5 * 60;

/** Pending voice request TTL: 30 seconds */
export const RTC_REQUEST_TTL_SEC = 30;

/**
 * Lobby State Keys
 *
 * lobby:state:{lobbyId} - HASH containing lobby state
 * lobby:members:{lobbyId} - SET of playerIds in lobby
 * lobby:ready:{lobbyId} - SET of playerIds who are ready
 * lobby:leader - STRING containing instanceId of lobby leader
 * lobby:active - SORTED SET of active lobby IDs (score = lastActive timestamp)
 * lobby:invites:{lobbyId} - SET of invited playerIds
 */
export const lobbyKeys = {
  /** Lobby state hash: lobby:state:{lobbyId} */
  state: (lobbyId: string) => `lobby:state:${lobbyId}` as const,

  /** Lobby members set: lobby:members:{lobbyId} */
  members: (lobbyId: string) => `lobby:members:${lobbyId}` as const,

  /** Lobby ready set: lobby:ready:{lobbyId} */
  ready: (lobbyId: string) => `lobby:ready:${lobbyId}` as const,

  /** Lobby invites set: lobby:invites:{lobbyId} */
  invites: (lobbyId: string) => `lobby:invites:${lobbyId}` as const,

  /** Global lobby leader lock */
  leader: "lobby:leader" as const,

  /** Active lobbies sorted set (score = lastActive timestamp) */
  active: "lobby:active" as const,

  /** Pattern for scanning all lobby states */
  statePattern: "lobby:state:*" as const,
};

/**
 * Chat Keys
 *
 * chat:global - LIST containing last N global chat messages (JSON)
 */
export const chatKeys = {
  /** Global chat history list: chat:global */
  global: "chat:global" as const,

  /** Max messages to keep in global chat history */
  maxMessages: 500 as const,

  /** TTL for global chat history (7 days) */
  ttlSec: 604800 as const,
};

/**
 * Pub/Sub Channels
 */
export const channels = {
  /** Match control commands */
  matchControl: "match:control" as const,

  /** Lobby control commands */
  lobbyControl: "lobby:control" as const,

  /** Lobby state sync */
  lobbyState: "lobby:state" as const,

  /** Draft state sync */
  draftState: "draft:session:update" as const,

  /** Player connect events */
  playerConnect: "player:connect" as const,

  /** Player disconnect events */
  playerDisconnect: "player:disconnect" as const,

  /** Leader expiry notifications */
  leaderExpired: "match:leader:expired" as const,
};

/**
 * Extract entity ID from a Redis key
 */
export function parseKey(
  key: string
): { entity: string; subtype?: string; id?: string } | null {
  const parts = key.split(":");
  if (parts.length < 2) return null;

  if (parts.length === 2) {
    return { entity: parts[0], id: parts[1] };
  }

  return {
    entity: parts[0],
    subtype: parts[1],
    id: parts.slice(2).join(":"),
  };
}
