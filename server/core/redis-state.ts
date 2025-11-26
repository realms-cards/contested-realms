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
  PLAYER_SOCKET_TTL_SEC,
  PLAYER_STATE_TTL_SEC,
  MATCH_LEADER_TTL_SEC,
  MATCH_STATE_TTL_SEC,
  LOBBY_LEADER_TTL_SEC,
  LOBBY_STATE_TTL_SEC,
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
      await redis.expire(key, MATCH_LEADER_TTL_SEC);
      return true;
    }

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
      lobbyKeys.ready(lobbyId)
    );
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

    // Lobby Leader
    claimLobbyLeader,
    refreshLobbyLeader,

    // Pub/Sub
    publishPlayerConnect,
    publishPlayerDisconnect,

    // Cleanup
    scanOrphanedMatches,
  };
}

export type RedisStateManager = ReturnType<typeof createRedisStateManager>;
