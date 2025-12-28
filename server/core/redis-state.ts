/**
 * Redis State Accessors for Horizontal Scaling
 *
 * Provides typed read/write operations for player, match, and lobby state.
 * Uses Redis as the authoritative source with local Map caching.
 */

import type { Redis } from "ioredis";
import {
  playerKeys,
  matchKeys,
  lobbyKeys,
  recordingKeys,
  rtcKeys,
  PLAYER_SOCKET_TTL_SEC,
  PLAYER_STATE_TTL_SEC,
  MATCH_LEADER_TTL_SEC,
  MATCH_STATE_TTL_SEC,
  LOBBY_LEADER_TTL_SEC,
  LOBBY_STATE_TTL_SEC,
  RECORDING_TTL_SEC,
  RTC_STATE_TTL_SEC,
  RTC_REQUEST_TTL_SEC,
} from "./redis-keys";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RedisPlayerState {
  displayName: string;
  instanceId: string;
  matchId: string | null;
  lobbyId: string | null;
  lastSeen: number;
}

export interface RedisMatchState {
  id: string;
  status: string;
  playerIds: string[];
  matchType: string;
  tournamentId: string | null;
  lobbyId: string | null;
  lobbyName: string | null;
  seed: string;
  turn: string | null;
  winnerId: string | null;
  lastTs: number;
  instanceId: string;
  // Game state is stored separately for high-frequency updates
}

export interface RedisLobbyState {
  id: string;
  name: string;
  hostId: string;
  status: string;
  matchType: string;
  createdAt: number;
  instanceId: string;
}

/**
 * SOATC league match info stored with lobby
 */
export interface SoatcLeagueMatchInfo {
  isLeagueMatch: boolean;
  tournamentId: string;
  tournamentName: string;
}

/**
 * Full lobby state for cross-instance storage
 * Matches the shape used in lobby/index.js
 */
export interface RedisFullLobbyState {
  id: string;
  name: string | null;
  hostId: string | null;
  status: string;
  maxPlayers: number;
  visibility: "open" | "private" | "tournament";
  plannedMatchType: string | null;
  isMatchmakingLobby: boolean;
  soatcLeagueMatch: SoatcLeagueMatchInfo | null;
  matchId: string | null;
  lastActive: number;
  createdAt: number;
  allowSpectators: boolean;
  hostReady: boolean;
  playerIds: string[];
  ready: string[];
}

export interface RedisStateConfig {
  redis: Redis | null;
  instanceId: string;
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Manager
// ─────────────────────────────────────────────────────────────────────────────

export function createRedisStateManager(config: RedisStateConfig) {
  const { redis, instanceId, enabled } = config;

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function isEnabled(): boolean {
    return enabled && redis !== null;
  }

  function safeJsonParse<T>(json: string | null): T | null {
    if (!json) return null;
    try {
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  function safeJsonStringify(value: unknown): string {
    return JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? Number(v) : v
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Player State Operations
  // ─────────────────────────────────────────────────────────────────────────

  async function setPlayerState(
    playerId: string,
    state: Partial<RedisPlayerState>
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = playerKeys.state(playerId);
    const data: Record<string, string> = {};

    if (state.displayName !== undefined) data.displayName = state.displayName;
    if (state.instanceId !== undefined) data.instanceId = state.instanceId;
    if (state.matchId !== undefined) data.matchId = state.matchId ?? "";
    if (state.lobbyId !== undefined) data.lobbyId = state.lobbyId ?? "";
    if (state.lastSeen !== undefined) data.lastSeen = String(state.lastSeen);

    if (Object.keys(data).length > 0) {
      await redis.hset(key, data);
      await redis.expire(key, PLAYER_STATE_TTL_SEC);
    }
  }

  async function getPlayerState(
    playerId: string
  ): Promise<RedisPlayerState | null> {
    if (!isEnabled() || !redis) return null;

    const key = playerKeys.state(playerId);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      displayName: data.displayName || "",
      instanceId: data.instanceId || "",
      matchId: data.matchId || null,
      lobbyId: data.lobbyId || null,
      lastSeen: data.lastSeen ? parseInt(data.lastSeen, 10) : 0,
    };
  }

  async function setPlayerSocket(
    socketId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = playerKeys.socket(socketId);
    await redis.set(key, playerId, "EX", PLAYER_SOCKET_TTL_SEC);
  }

  async function getPlayerBySocket(socketId: string): Promise<string | null> {
    if (!isEnabled() || !redis) return null;

    const key = playerKeys.socket(socketId);
    return redis.get(key);
  }

  async function clearPlayerSocket(socketId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = playerKeys.socket(socketId);
    await redis.del(key);
  }

  async function updatePlayerActivity(playerId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = playerKeys.state(playerId);
    await redis.hset(key, { lastSeen: String(Date.now()), instanceId });
    await redis.expire(key, PLAYER_STATE_TTL_SEC);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match State Operations
  // ─────────────────────────────────────────────────────────────────────────

  async function setMatchState(
    matchId: string,
    state: Partial<RedisMatchState>
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = matchKeys.state(matchId);
    const data: Record<string, string> = {};

    if (state.id !== undefined) data.id = state.id;
    if (state.status !== undefined) data.status = state.status;
    if (state.playerIds !== undefined)
      data.playerIds = JSON.stringify(state.playerIds);
    if (state.matchType !== undefined) data.matchType = state.matchType;
    if (state.tournamentId !== undefined)
      data.tournamentId = state.tournamentId ?? "";
    if (state.lobbyId !== undefined) data.lobbyId = state.lobbyId ?? "";
    if (state.lobbyName !== undefined) data.lobbyName = state.lobbyName ?? "";
    if (state.seed !== undefined) data.seed = state.seed;
    if (state.turn !== undefined) data.turn = state.turn ?? "";
    if (state.winnerId !== undefined) data.winnerId = state.winnerId ?? "";
    if (state.lastTs !== undefined) data.lastTs = String(state.lastTs);
    if (state.instanceId !== undefined) data.instanceId = state.instanceId;

    if (Object.keys(data).length > 0) {
      await redis.hset(key, data);
      await redis.expire(key, MATCH_STATE_TTL_SEC);
    }
  }

  async function getMatchState(
    matchId: string
  ): Promise<RedisMatchState | null> {
    if (!isEnabled() || !redis) return null;

    const key = matchKeys.state(matchId);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      id: data.id || matchId,
      status: data.status || "unknown",
      playerIds: data.playerIds ? JSON.parse(data.playerIds) : [],
      matchType: data.matchType || "constructed",
      tournamentId: data.tournamentId || null,
      lobbyId: data.lobbyId || null,
      lobbyName: data.lobbyName || null,
      seed: data.seed || "",
      turn: data.turn || null,
      winnerId: data.winnerId || null,
      lastTs: data.lastTs ? parseInt(data.lastTs, 10) : 0,
      instanceId: data.instanceId || "",
    };
  }

  async function setMatchGame(matchId: string, game: unknown): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = matchKeys.game(matchId);
    await redis.set(key, safeJsonStringify(game), "EX", MATCH_STATE_TTL_SEC);
  }

  async function getMatchGame<T = unknown>(matchId: string): Promise<T | null> {
    if (!isEnabled() || !redis) return null;

    const key = matchKeys.game(matchId);
    const raw = await redis.get(key);
    return safeJsonParse<T>(raw);
  }

  async function deleteMatchState(matchId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.del(
      matchKeys.state(matchId),
      matchKeys.game(matchId),
      matchKeys.leader(matchId),
      matchKeys.session(matchId)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match Leader Operations
  // ─────────────────────────────────────────────────────────────────────────

  async function claimMatchLeader(matchId: string): Promise<string | null> {
    if (!isEnabled() || !redis) return instanceId;

    const key = matchKeys.leader(matchId);

    // Check current leader
    const current = await redis.get(key);
    if (current) {
      // Refresh TTL if we're the leader
      if (current === instanceId) {
        await redis.expire(key, MATCH_LEADER_TTL_SEC);
      }
      return current;
    }

    // Try to claim leadership
    const result = await redis.set(
      key,
      instanceId,
      "EX",
      MATCH_LEADER_TTL_SEC,
      "NX"
    );
    if (result) return instanceId;

    // Someone else won, get their ID
    return redis.get(key);
  }

  async function refreshMatchLeader(matchId: string): Promise<boolean> {
    if (!isEnabled() || !redis) return true;

    const key = matchKeys.leader(matchId);
    const current = await redis.get(key);

    if (current === instanceId) {
      // We're still the leader, refresh TTL
      await redis.expire(key, MATCH_LEADER_TTL_SEC);
      return true;
    }

    if (!current) {
      // No leader exists (key expired), try to reclaim
      const result = await redis.set(
        key,
        instanceId,
        "EX",
        MATCH_LEADER_TTL_SEC,
        "NX"
      );
      if (result) {
        return true; // Successfully reclaimed
      }
      // Someone else claimed it between our GET and SET
      return false;
    }

    // Another instance is the leader
    return false;
  }

  async function releaseMatchLeader(matchId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = matchKeys.leader(matchId);
    const current = await redis.get(key);

    if (current === instanceId) {
      await redis.del(key);
    }
  }

  async function getMatchLeader(matchId: string): Promise<string | null> {
    if (!isEnabled() || !redis) return instanceId;

    const key = matchKeys.leader(matchId);
    return redis.get(key);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lobby State Operations
  // ─────────────────────────────────────────────────────────────────────────

  async function setLobbyState(
    lobbyId: string,
    state: Partial<RedisLobbyState>
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = lobbyKeys.state(lobbyId);
    const data: Record<string, string> = {};

    if (state.id !== undefined) data.id = state.id;
    if (state.name !== undefined) data.name = state.name;
    if (state.hostId !== undefined) data.hostId = state.hostId;
    if (state.status !== undefined) data.status = state.status;
    if (state.matchType !== undefined) data.matchType = state.matchType;
    if (state.createdAt !== undefined) data.createdAt = String(state.createdAt);
    if (state.instanceId !== undefined) data.instanceId = state.instanceId;

    if (Object.keys(data).length > 0) {
      await redis.hset(key, data);
      await redis.expire(key, LOBBY_STATE_TTL_SEC);
    }
  }

  async function getLobbyState(
    lobbyId: string
  ): Promise<RedisLobbyState | null> {
    if (!isEnabled() || !redis) return null;

    const key = lobbyKeys.state(lobbyId);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      id: data.id || lobbyId,
      name: data.name || "",
      hostId: data.hostId || "",
      status: data.status || "unknown",
      matchType: data.matchType || "constructed",
      createdAt: data.createdAt ? parseInt(data.createdAt, 10) : 0,
      instanceId: data.instanceId || "",
    };
  }

  async function addLobbyMember(
    lobbyId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.sadd(lobbyKeys.members(lobbyId), playerId);
  }

  async function removeLobbyMember(
    lobbyId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.srem(lobbyKeys.members(lobbyId), playerId);
    await redis.srem(lobbyKeys.ready(lobbyId), playerId);
  }

  async function getLobbyMembers(lobbyId: string): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    return redis.smembers(lobbyKeys.members(lobbyId));
  }

  async function setLobbyReady(
    lobbyId: string,
    playerId: string,
    ready: boolean
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    if (ready) {
      await redis.sadd(lobbyKeys.ready(lobbyId), playerId);
    } else {
      await redis.srem(lobbyKeys.ready(lobbyId), playerId);
    }
  }

  async function getLobbyReady(lobbyId: string): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    return redis.smembers(lobbyKeys.ready(lobbyId));
  }

  async function deleteLobbyState(lobbyId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.del(
      lobbyKeys.state(lobbyId),
      lobbyKeys.members(lobbyId),
      lobbyKeys.ready(lobbyId),
      lobbyKeys.invites(lobbyId)
    );
    // Remove from active set
    await redis.zrem(lobbyKeys.active, lobbyId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Full Lobby State Operations (for cross-instance consistency)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store full lobby state in Redis (used by lobby registry)
   */
  async function setFullLobbyState(
    lobbyId: string,
    lobby: RedisFullLobbyState
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = lobbyKeys.state(lobbyId);
    const data: Record<string, string> = {
      id: lobby.id,
      name: lobby.name ?? "",
      hostId: lobby.hostId ?? "",
      status: lobby.status,
      maxPlayers: String(lobby.maxPlayers),
      visibility: lobby.visibility,
      plannedMatchType: lobby.plannedMatchType ?? "",
      isMatchmakingLobby: lobby.isMatchmakingLobby ? "1" : "0",
      // JSON stringify soatcLeagueMatch object for Redis storage
      soatcLeagueMatch: lobby.soatcLeagueMatch
        ? JSON.stringify(lobby.soatcLeagueMatch)
        : "",
      matchId: lobby.matchId ?? "",
      lastActive: String(lobby.lastActive),
      createdAt: String(lobby.createdAt),
      allowSpectators: lobby.allowSpectators ? "1" : "0",
      hostReady: lobby.hostReady ? "1" : "0",
    };

    // Use pipeline for atomicity
    const pipeline = redis.pipeline();
    pipeline.hset(key, data);
    pipeline.expire(key, LOBBY_STATE_TTL_SEC);

    // Update members and ready sets
    const membersKey = lobbyKeys.members(lobbyId);
    const readyKey = lobbyKeys.ready(lobbyId);

    // Clear and re-add members
    pipeline.del(membersKey);
    if (lobby.playerIds.length > 0) {
      pipeline.sadd(membersKey, ...lobby.playerIds);
      pipeline.expire(membersKey, LOBBY_STATE_TTL_SEC);
    }

    // Clear and re-add ready
    pipeline.del(readyKey);
    if (lobby.ready.length > 0) {
      pipeline.sadd(readyKey, ...lobby.ready);
      pipeline.expire(readyKey, LOBBY_STATE_TTL_SEC);
    }

    // Add to active lobbies sorted set
    pipeline.zadd(lobbyKeys.active, lobby.lastActive, lobbyId);

    await pipeline.exec();
  }

  /**
   * Get full lobby state from Redis
   */
  async function getFullLobbyState(
    lobbyId: string
  ): Promise<RedisFullLobbyState | null> {
    if (!isEnabled() || !redis) return null;

    const key = lobbyKeys.state(lobbyId);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    // Get members and ready sets
    const [playerIds, ready] = await Promise.all([
      redis.smembers(lobbyKeys.members(lobbyId)),
      redis.smembers(lobbyKeys.ready(lobbyId)),
    ]);

    // Parse soatcLeagueMatch JSON if present
    let soatcLeagueMatch: SoatcLeagueMatchInfo | null = null;
    if (data.soatcLeagueMatch && data.soatcLeagueMatch !== "") {
      try {
        soatcLeagueMatch = JSON.parse(
          data.soatcLeagueMatch
        ) as SoatcLeagueMatchInfo;
      } catch {
        // Invalid JSON, leave as null
      }
    }

    return {
      id: data.id || lobbyId,
      name: data.name || null,
      hostId: data.hostId || null,
      status: data.status || "open",
      maxPlayers: data.maxPlayers ? parseInt(data.maxPlayers, 10) : 2,
      visibility:
        (data.visibility as "open" | "private" | "tournament") || "open",
      plannedMatchType: data.plannedMatchType || null,
      isMatchmakingLobby: data.isMatchmakingLobby === "1",
      soatcLeagueMatch,
      matchId: data.matchId || null,
      lastActive: data.lastActive ? parseInt(data.lastActive, 10) : 0,
      createdAt: data.createdAt ? parseInt(data.createdAt, 10) : 0,
      allowSpectators: data.allowSpectators === "1",
      hostReady: data.hostReady !== "0", // Default to true for backward compat
      playerIds,
      ready,
    };
  }

  /**
   * Get all active lobbies from Redis sorted set
   * Returns lobbies that have been active within the specified cutoff time
   */
  async function getActiveLobbies(
    cutoffMs: number = 60 * 60 * 1000 // Default 1 hour
  ): Promise<RedisFullLobbyState[]> {
    if (!isEnabled() || !redis) return [];

    const now = Date.now();
    const minScore = now - cutoffMs;

    // Get lobby IDs from sorted set (sorted by lastActive descending)
    const lobbyIds = await redis.zrangebyscore(
      lobbyKeys.active,
      minScore,
      "+inf"
    );

    if (lobbyIds.length === 0) return [];

    // Batch fetch all lobby states
    const lobbies: RedisFullLobbyState[] = [];
    for (const lobbyId of lobbyIds) {
      const lobby = await getFullLobbyState(lobbyId);
      if (lobby && lobby.status !== "closed") {
        lobbies.push(lobby);
      }
    }

    // Sort by lastActive descending (newest first)
    lobbies.sort((a, b) => b.lastActive - a.lastActive);

    return lobbies;
  }

  /**
   * Update lobby lastActive timestamp in sorted set
   */
  async function updateLobbyActivity(lobbyId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    const now = Date.now();
    await redis.zadd(lobbyKeys.active, now, lobbyId);
    await redis.hset(lobbyKeys.state(lobbyId), { lastActive: String(now) });
  }

  /**
   * Remove lobby from active set (on close/delete)
   */
  async function removeLobbyFromActive(lobbyId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.zrem(lobbyKeys.active, lobbyId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lobby Invite Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a player to lobby invites set
   */
  async function addLobbyInvite(
    lobbyId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.sadd(lobbyKeys.invites(lobbyId), playerId);
    await redis.expire(lobbyKeys.invites(lobbyId), LOBBY_STATE_TTL_SEC);
  }

  /**
   * Remove a player from lobby invites set
   */
  async function removeLobbyInvite(
    lobbyId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.srem(lobbyKeys.invites(lobbyId), playerId);
  }

  /**
   * Check if a player is invited to a lobby
   */
  async function isPlayerInvited(
    lobbyId: string,
    playerId: string
  ): Promise<boolean> {
    if (!isEnabled() || !redis) return false;

    return (await redis.sismember(lobbyKeys.invites(lobbyId), playerId)) === 1;
  }

  /**
   * Get all invited players for a lobby
   */
  async function getLobbyInvites(lobbyId: string): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    return redis.smembers(lobbyKeys.invites(lobbyId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lobby Leader Operations
  // ─────────────────────────────────────────────────────────────────────────

  async function claimLobbyLeader(): Promise<string | null> {
    if (!isEnabled() || !redis) return instanceId;

    const key = lobbyKeys.leader;

    const current = await redis.get(key);
    if (current) {
      if (current === instanceId) {
        await redis.expire(key, LOBBY_LEADER_TTL_SEC);
      }
      return current;
    }

    const result = await redis.set(
      key,
      instanceId,
      "EX",
      LOBBY_LEADER_TTL_SEC,
      "NX"
    );
    if (result) return instanceId;

    return redis.get(key);
  }

  async function refreshLobbyLeader(): Promise<boolean> {
    if (!isEnabled() || !redis) return true;

    const key = lobbyKeys.leader;
    const current = await redis.get(key);

    if (current === instanceId) {
      await redis.expire(key, LOBBY_LEADER_TTL_SEC);
      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match Recording Operations (for horizontal scaling)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recording metadata stored in Redis hash
   */
  interface RecordingMeta {
    matchId: string;
    playerNames: string;
    startTime: number;
    endTime?: number;
    initialState?: string;
    instanceId: string;
  }

  /**
   * Recording action stored in Redis stream
   */
  interface RecordingAction {
    patch: string;
    playerId: string;
    timestamp: number;
  }

  /**
   * Start a recording - stores metadata in Redis hash
   */
  async function startRecording(
    matchId: string,
    meta: {
      playerNames: string[];
      startTime: number;
      initialState?: unknown;
    }
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = recordingKeys.meta(matchId);
    const data: Record<string, string> = {
      matchId,
      playerNames: JSON.stringify(meta.playerNames),
      startTime: String(meta.startTime),
      instanceId,
    };
    if (meta.initialState !== undefined) {
      data.initialState = JSON.stringify(meta.initialState);
    }

    await redis.hset(key, data);
    await redis.expire(key, RECORDING_TTL_SEC);
  }

  /**
   * Record an action - appends to Redis stream
   */
  async function recordAction(
    matchId: string,
    action: {
      patch: unknown;
      playerId: string;
      timestamp: number;
    }
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const streamKey = recordingKeys.stream(matchId);
    const metaKey = recordingKeys.meta(matchId);

    // Add to stream with auto-generated ID
    await redis.xadd(
      streamKey,
      "*",
      "patch",
      JSON.stringify(action.patch),
      "playerId",
      action.playerId,
      "timestamp",
      String(action.timestamp)
    );

    // Refresh TTL on stream
    await redis.expire(streamKey, RECORDING_TTL_SEC);
    await redis.expire(metaKey, RECORDING_TTL_SEC);
  }

  /**
   * Finish a recording - sets endTime in metadata
   */
  async function finishRecording(matchId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = recordingKeys.meta(matchId);
    await redis.hset(key, { endTime: String(Date.now()) });
  }

  /**
   * Get recording metadata from Redis
   */
  async function getRecordingMeta(
    matchId: string
  ): Promise<RecordingMeta | null> {
    if (!isEnabled() || !redis) return null;

    const key = recordingKeys.meta(matchId);
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      matchId: data.matchId || matchId,
      playerNames: data.playerNames || "[]",
      startTime: data.startTime ? parseInt(data.startTime, 10) : 0,
      endTime: data.endTime ? parseInt(data.endTime, 10) : undefined,
      initialState: data.initialState,
      instanceId: data.instanceId || "",
    };
  }

  /**
   * Get all recording actions from Redis stream
   */
  async function getRecordingActions(
    matchId: string
  ): Promise<RecordingAction[]> {
    if (!isEnabled() || !redis) return [];

    const streamKey = recordingKeys.stream(matchId);

    // Read all entries from stream (from beginning to end)
    const entries = await redis.xrange(streamKey, "-", "+");

    const actions: RecordingAction[] = [];
    for (const [_id, fields] of entries) {
      // fields is an array of [key, value, key, value, ...]
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      actions.push({
        patch: data.patch || "null",
        playerId: data.playerId || "",
        timestamp: data.timestamp ? parseInt(data.timestamp, 10) : 0,
      });
    }

    return actions;
  }

  /**
   * Delete recording data from Redis
   */
  async function deleteRecording(matchId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.del(recordingKeys.meta(matchId), recordingKeys.stream(matchId));
  }

  /**
   * Scan for orphaned recordings (no metadata but has stream, or vice versa)
   */
  async function scanOrphanedRecordings(): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    const orphaned: string[] = [];
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        recordingKeys.streamPattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      for (const streamKey of keys) {
        const matchId = streamKey.replace("recording:stream:", "");
        const metaKey = recordingKeys.meta(matchId);
        const hasMeta = await redis.exists(metaKey);

        // Check if recording is finished (has endTime)
        if (hasMeta) {
          const endTime = await redis.hget(metaKey, "endTime");
          if (endTime) {
            // Recording is finished but still in Redis - potential orphan
            orphaned.push(matchId);
          }
        } else {
          // Stream exists without metadata - definitely orphan
          orphaned.push(matchId);
        }
      }
    } while (cursor !== "0");

    return orphaned;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RTC/Voice State Operations (for horizontal scaling)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * RTC participant details stored in Redis
   */
  interface RtcParticipantDetails {
    id: string;
    displayName: string;
    lobbyId: string | null;
    matchId: string | null;
    roomId: string;
    joinedAt: number;
  }

  /**
   * Pending voice request stored in Redis
   */
  interface RtcPendingRequest {
    requestId: string;
    senderId: string;
    targetId: string;
    roomId: string;
    createdAt: number;
  }

  /**
   * Add a participant to an RTC room
   */
  async function addRtcParticipant(
    roomId: string,
    participant: RtcParticipantDetails
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const pipeline = redis.pipeline();

    // Add to room members set
    pipeline.sadd(rtcKeys.roomMembers(roomId), participant.id);
    pipeline.expire(rtcKeys.roomMembers(roomId), RTC_STATE_TTL_SEC);

    // Store participant details
    const participantKey = rtcKeys.participant(participant.id);
    pipeline.hset(participantKey, {
      id: participant.id,
      displayName: participant.displayName,
      lobbyId: participant.lobbyId ?? "",
      matchId: participant.matchId ?? "",
      roomId: participant.roomId,
      joinedAt: String(participant.joinedAt),
    });
    pipeline.expire(participantKey, RTC_STATE_TTL_SEC);

    await pipeline.exec();
  }

  /**
   * Remove a participant from an RTC room
   */
  async function removeRtcParticipant(
    roomId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const pipeline = redis.pipeline();
    pipeline.srem(rtcKeys.roomMembers(roomId), playerId);
    pipeline.del(rtcKeys.participant(playerId));
    await pipeline.exec();
  }

  /**
   * Get all participants in an RTC room
   */
  async function getRtcRoomMembers(roomId: string): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    return redis.smembers(rtcKeys.roomMembers(roomId));
  }

  /**
   * Get participant details
   */
  async function getRtcParticipant(
    playerId: string
  ): Promise<RtcParticipantDetails | null> {
    if (!isEnabled() || !redis) return null;

    const data = await redis.hgetall(rtcKeys.participant(playerId));
    if (!data || Object.keys(data).length === 0) return null;

    return {
      id: data.id || playerId,
      displayName: data.displayName || "",
      lobbyId: data.lobbyId || null,
      matchId: data.matchId || null,
      roomId: data.roomId || "",
      joinedAt: data.joinedAt ? parseInt(data.joinedAt, 10) : 0,
    };
  }

  /**
   * Get all participant details for a room
   */
  async function getRtcRoomParticipants(
    roomId: string
  ): Promise<RtcParticipantDetails[]> {
    if (!isEnabled() || !redis) return [];

    const memberIds = await redis.smembers(rtcKeys.roomMembers(roomId));
    if (memberIds.length === 0) return [];

    const participants: RtcParticipantDetails[] = [];
    for (const playerId of memberIds) {
      const details = await getRtcParticipant(playerId);
      if (details) {
        participants.push(details);
      }
    }

    return participants;
  }

  /**
   * Refresh TTL on room and participant (keep alive)
   */
  async function refreshRtcParticipant(
    roomId: string,
    playerId: string
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const pipeline = redis.pipeline();
    pipeline.expire(rtcKeys.roomMembers(roomId), RTC_STATE_TTL_SEC);
    pipeline.expire(rtcKeys.participant(playerId), RTC_STATE_TTL_SEC);
    await pipeline.exec();
  }

  /**
   * Create a pending voice request
   */
  async function createVoiceRequest(
    request: RtcPendingRequest
  ): Promise<void> {
    if (!isEnabled() || !redis) return;

    const key = rtcKeys.request(request.requestId);
    await redis.hset(key, {
      requestId: request.requestId,
      senderId: request.senderId,
      targetId: request.targetId,
      roomId: request.roomId,
      createdAt: String(request.createdAt),
    });
    await redis.expire(key, RTC_REQUEST_TTL_SEC);
  }

  /**
   * Get a pending voice request
   */
  async function getVoiceRequest(
    requestId: string
  ): Promise<RtcPendingRequest | null> {
    if (!isEnabled() || !redis) return null;

    const data = await redis.hgetall(rtcKeys.request(requestId));
    if (!data || Object.keys(data).length === 0) return null;

    return {
      requestId: data.requestId || requestId,
      senderId: data.senderId || "",
      targetId: data.targetId || "",
      roomId: data.roomId || "",
      createdAt: data.createdAt ? parseInt(data.createdAt, 10) : 0,
    };
  }

  /**
   * Delete a pending voice request
   */
  async function deleteVoiceRequest(requestId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.del(rtcKeys.request(requestId));
  }

  /**
   * Clean up all RTC state for a room (when room closes)
   */
  async function cleanupRtcRoom(roomId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    // Get all members first
    const memberIds = await redis.smembers(rtcKeys.roomMembers(roomId));

    const pipeline = redis.pipeline();
    // Delete room members set
    pipeline.del(rtcKeys.roomMembers(roomId));
    // Delete all participant details
    for (const playerId of memberIds) {
      pipeline.del(rtcKeys.participant(playerId));
    }
    await pipeline.exec();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pub/Sub Helpers
  // ─────────────────────────────────────────────────────────────────────────

  async function publishPlayerConnect(playerId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.publish(
      "player:connect",
      JSON.stringify({ playerId, instanceId, ts: Date.now() })
    );
  }

  async function publishPlayerDisconnect(playerId: string): Promise<void> {
    if (!isEnabled() || !redis) return;

    await redis.publish(
      "player:disconnect",
      JSON.stringify({ playerId, instanceId, ts: Date.now() })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup Utilities
  // ─────────────────────────────────────────────────────────────────────────

  async function scanOrphanedMatches(): Promise<string[]> {
    if (!isEnabled() || !redis) return [];

    const orphaned: string[] = [];
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        matchKeys.statePattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      for (const stateKey of keys) {
        const matchId = stateKey.replace("match:state:", "");
        const leaderKey = matchKeys.leader(matchId);
        const leader = await redis.get(leaderKey);

        if (!leader) {
          orphaned.push(matchId);
        }
      }
    } while (cursor !== "0");

    return orphaned;
  }

  return {
    isEnabled,
    instanceId,

    // Player
    setPlayerState,
    getPlayerState,
    setPlayerSocket,
    getPlayerBySocket,
    clearPlayerSocket,
    updatePlayerActivity,

    // Match
    setMatchState,
    getMatchState,
    setMatchGame,
    getMatchGame,
    deleteMatchState,

    // Match Leader
    claimMatchLeader,
    refreshMatchLeader,
    releaseMatchLeader,
    getMatchLeader,

    // Lobby
    setLobbyState,
    getLobbyState,
    addLobbyMember,
    removeLobbyMember,
    getLobbyMembers,
    setLobbyReady,
    getLobbyReady,
    deleteLobbyState,

    // Full Lobby (cross-instance)
    setFullLobbyState,
    getFullLobbyState,
    getActiveLobbies,
    updateLobbyActivity,
    removeLobbyFromActive,

    // Lobby Invites
    addLobbyInvite,
    removeLobbyInvite,
    isPlayerInvited,
    getLobbyInvites,

    // Lobby Leader
    claimLobbyLeader,
    refreshLobbyLeader,

    // Recording (cross-instance)
    startRecording,
    recordAction,
    finishRecording,
    getRecordingMeta,
    getRecordingActions,
    deleteRecording,
    scanOrphanedRecordings,

    // RTC (cross-instance)
    addRtcParticipant,
    removeRtcParticipant,
    getRtcRoomMembers,
    getRtcParticipant,
    getRtcRoomParticipants,
    refreshRtcParticipant,
    createVoiceRequest,
    getVoiceRequest,
    deleteVoiceRequest,
    cleanupRtcRoom,

    // Pub/Sub
    publishPlayerConnect,
    publishPlayerDisconnect,

    // Cleanup
    scanOrphanedMatches,
  };
}

export type RedisStateManager = ReturnType<typeof createRedisStateManager>;
