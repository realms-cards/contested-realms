/**
 * Lobby Registry Module for Horizontal Scaling
 *
 * Manages lobby state with Redis as authoritative source and local Map as cache.
 * Ensures lobbies are visible and joinable from any server instance.
 */

import type { Server as SocketServer } from "socket.io";
import type {
  RedisStateManager,
  RedisFullLobbyState,
  SoatcLeagueMatchInfo,
} from "../core/redis-state";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal lobby record with Sets for playerIds and ready
 * (matches the shape used in lobby/index.js)
 */
export interface LobbyRecord {
  id: string;
  name: string | null;
  hostId: string | null;
  playerIds: Set<string>;
  status: string;
  maxPlayers: number;
  ready: Set<string>;
  visibility: "open" | "private" | "tournament";
  plannedMatchType: string | null;
  isMatchmakingLobby: boolean;
  soatcLeagueMatch: SoatcLeagueMatchInfo | null;
  matchId: string | null;
  lastActive: number;
  createdAt: number;
  allowSpectators: boolean;
  hostReady: boolean;
}

export interface LobbyRegistryConfig {
  io: SocketServer;
  redisState: RedisStateManager;
  instanceId: string;
  lobbies: Map<string, LobbyRecord>;
  lobbyInvites: Map<string, Set<string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby Registry
// ─────────────────────────────────────────────────────────────────────────────

export function createLobbyRegistry(config: LobbyRegistryConfig) {
  const { redisState, instanceId, lobbies, lobbyInvites } = config;

  // Local cache TTL tracking (30 seconds for lobbies - shorter than players)
  const LOCAL_CACHE_TTL_MS = 30 * 1000;
  const cacheTimestamps = new Map<string, number>();

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert internal LobbyRecord to Redis format
   */
  function toRedisFormat(lobby: LobbyRecord): RedisFullLobbyState {
    return {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.hostId,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      visibility: lobby.visibility,
      plannedMatchType: lobby.plannedMatchType,
      isMatchmakingLobby: lobby.isMatchmakingLobby,
      soatcLeagueMatch: lobby.soatcLeagueMatch,
      matchId: lobby.matchId ?? null,
      lastActive: lobby.lastActive,
      createdAt: lobby.createdAt,
      allowSpectators: lobby.allowSpectators,
      hostReady: lobby.hostReady,
      playerIds: Array.from(lobby.playerIds),
      ready: Array.from(lobby.ready),
    };
  }

  /**
   * Convert Redis format to internal LobbyRecord
   */
  function fromRedisFormat(redisLobby: RedisFullLobbyState): LobbyRecord {
    return {
      id: redisLobby.id,
      name: redisLobby.name,
      hostId: redisLobby.hostId,
      playerIds: new Set(redisLobby.playerIds),
      status: redisLobby.status,
      maxPlayers: redisLobby.maxPlayers,
      ready: new Set(redisLobby.ready),
      visibility: redisLobby.visibility,
      plannedMatchType: redisLobby.plannedMatchType,
      isMatchmakingLobby: redisLobby.isMatchmakingLobby,
      soatcLeagueMatch: redisLobby.soatcLeagueMatch,
      matchId: redisLobby.matchId,
      lastActive: redisLobby.lastActive,
      createdAt: redisLobby.createdAt,
      allowSpectators: redisLobby.allowSpectators,
      hostReady: redisLobby.hostReady,
    };
  }

  /**
   * Check if local cache is fresh
   */
  function isCacheFresh(lobbyId: string): boolean {
    const cacheTime = cacheTimestamps.get(lobbyId) || 0;
    return Date.now() - cacheTime < LOCAL_CACHE_TTL_MS;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new lobby (write-through to Redis)
   */
  async function createLobby(lobby: LobbyRecord): Promise<void> {
    const now = Date.now();
    lobby.createdAt = lobby.createdAt || now;
    lobby.lastActive = now;

    // Update local cache
    lobbies.set(lobby.id, lobby);
    cacheTimestamps.set(lobby.id, now);

    // Write to Redis
    await redisState.setFullLobbyState(lobby.id, toRedisFormat(lobby));

    console.log(
      `[LobbyRegistry] Created lobby ${lobby.id} on instance ${instanceId}`,
    );
  }

  /**
   * Get a lobby by ID - checks local cache first, then Redis
   */
  async function getLobby(lobbyId: string): Promise<LobbyRecord | null> {
    // Check local cache first
    const cached = lobbies.get(lobbyId);
    if (cached && isCacheFresh(lobbyId)) {
      return cached;
    }

    // Try Redis
    const redisLobby = await redisState.getFullLobbyState(lobbyId);
    if (!redisLobby) {
      // Not found in Redis either - return stale cache if available
      return cached || null;
    }

    // Update local cache from Redis
    const lobby = fromRedisFormat(redisLobby);
    lobbies.set(lobbyId, lobby);
    cacheTimestamps.set(lobbyId, Date.now());

    // Also sync invites from Redis
    const invites = await redisState.getLobbyInvites(lobbyId);
    if (invites.length > 0) {
      lobbyInvites.set(lobbyId, new Set(invites));
    }

    return lobby;
  }

  /**
   * Update a lobby (write-through to Redis)
   */
  async function updateLobby(lobbyId: string): Promise<void> {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.lastActive = Date.now();
    cacheTimestamps.set(lobbyId, Date.now());

    // Write to Redis
    await redisState.setFullLobbyState(lobbyId, toRedisFormat(lobby));
  }

  /**
   * Delete a lobby
   */
  async function deleteLobby(lobbyId: string): Promise<void> {
    // Remove from local cache
    lobbies.delete(lobbyId);
    cacheTimestamps.delete(lobbyId);
    lobbyInvites.delete(lobbyId);

    // Remove from Redis
    await redisState.deleteLobbyState(lobbyId);

    console.log(
      `[LobbyRegistry] Deleted lobby ${lobbyId} on instance ${instanceId}`,
    );
  }

  /**
   * Add a player to a lobby
   */
  async function addPlayer(lobbyId: string, playerId: string): Promise<void> {
    const lobby = await getLobby(lobbyId);
    if (!lobby) return;

    lobby.playerIds.add(playerId);
    lobby.lastActive = Date.now();
    cacheTimestamps.set(lobbyId, Date.now());

    // Write to Redis
    await redisState.addLobbyMember(lobbyId, playerId);
    await redisState.updateLobbyActivity(lobbyId);
  }

  /**
   * Remove a player from a lobby
   */
  async function removePlayer(
    lobbyId: string,
    playerId: string,
  ): Promise<void> {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.playerIds.delete(playerId);
    lobby.ready.delete(playerId);
    lobby.lastActive = Date.now();
    cacheTimestamps.set(lobbyId, Date.now());

    // Write to Redis
    await redisState.removeLobbyMember(lobbyId, playerId);
    await redisState.updateLobbyActivity(lobbyId);
  }

  /**
   * Set player ready status
   */
  async function setPlayerReady(
    lobbyId: string,
    playerId: string,
    ready: boolean,
  ): Promise<void> {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    if (ready) {
      lobby.ready.add(playerId);
    } else {
      lobby.ready.delete(playerId);
    }
    lobby.lastActive = Date.now();
    cacheTimestamps.set(lobbyId, Date.now());

    // Write to Redis
    await redisState.setLobbyReady(lobbyId, playerId, ready);
    await redisState.updateLobbyActivity(lobbyId);
  }

  /**
   * Mark lobby as active (updates lastActive timestamp)
   */
  async function markActive(lobbyId: string): Promise<void> {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.lastActive = Date.now();
    cacheTimestamps.set(lobbyId, Date.now());

    await redisState.updateLobbyActivity(lobbyId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Invite Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add an invite for a player
   */
  async function addInvite(lobbyId: string, playerId: string): Promise<void> {
    if (!lobbyInvites.has(lobbyId)) {
      lobbyInvites.set(lobbyId, new Set());
    }
    const invites = lobbyInvites.get(lobbyId);
    if (!invites) return;
    invites.add(playerId);

    await redisState.addLobbyInvite(lobbyId, playerId);
  }

  /**
   * Remove an invite for a player
   */
  async function removeInvite(
    lobbyId: string,
    playerId: string,
  ): Promise<void> {
    const invites = lobbyInvites.get(lobbyId);
    if (invites) {
      invites.delete(playerId);
    }

    await redisState.removeLobbyInvite(lobbyId, playerId);
  }

  /**
   * Check if a player is invited to a lobby
   */
  async function isInvited(
    lobbyId: string,
    playerId: string,
  ): Promise<boolean> {
    // Check local cache first
    const localInvites = lobbyInvites.get(lobbyId);
    if (localInvites?.has(playerId)) {
      return true;
    }

    // Check Redis
    return redisState.isPlayerInvited(lobbyId, playerId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // List Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all active lobbies (from Redis for cross-instance visibility)
   * Falls back to local cache if Redis is disabled
   */
  async function getAllLobbies(): Promise<LobbyRecord[]> {
    if (!redisState.isEnabled()) {
      // Fallback to local-only
      return Array.from(lobbies.values()).filter((l) => l.status !== "closed");
    }

    // Get from Redis (includes all instances)
    const redisLobbies = await redisState.getActiveLobbies();

    // Update local cache with Redis data
    for (const redisLobby of redisLobbies) {
      const lobby = fromRedisFormat(redisLobby);
      lobbies.set(lobby.id, lobby);
      cacheTimestamps.set(lobby.id, Date.now());
    }

    // Return all lobbies (sorted by lastActive, newest first)
    return redisLobbies.map(fromRedisFormat);
  }

  /**
   * Find an open lobby for matchmaking
   */
  async function findOpenLobby(): Promise<LobbyRecord | null> {
    const allLobbies = await getAllLobbies();
    return (
      allLobbies.find(
        (lobby) =>
          lobby.status === "open" &&
          lobby.visibility === "open" &&
          lobby.playerIds.size < lobby.maxPlayers,
      ) || null
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cache Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Invalidate local cache for a lobby (force Redis fetch on next access)
   */
  function invalidateCache(lobbyId: string): void {
    cacheTimestamps.delete(lobbyId);
  }

  /**
   * Upsert a lobby from serialized data (used for pub/sub updates)
   */
  function upsertFromSerialized(serialized: {
    id: string;
    name: string | null;
    hostId: string | null;
    status: string;
    maxPlayers: number;
    visibility: "open" | "private" | "tournament";
    plannedMatchType: string | null;
    isMatchmakingLobby?: boolean;
    soatcLeagueMatch?: SoatcLeagueMatchInfo | null;
    lastActive?: number;
    playerIds: string[];
    ready: string[];
  }): void {
    const existing = lobbies.get(serialized.id);
    const lobby: LobbyRecord = existing || {
      id: serialized.id,
      name: null,
      soatcLeagueMatch: null,
      hostId: null,
      playerIds: new Set(),
      status: "open",
      maxPlayers: 2,
      ready: new Set(),
      visibility: "open",
      plannedMatchType: "constructed",
      isMatchmakingLobby: false,
      matchId: null,
      lastActive: Date.now(),
      createdAt: Date.now(),
      allowSpectators: false,
      hostReady: false,
    };

    lobby.name = serialized.name;
    lobby.hostId = serialized.hostId;
    lobby.status = serialized.status;
    lobby.maxPlayers = serialized.maxPlayers;
    lobby.visibility = serialized.visibility;
    lobby.plannedMatchType = serialized.plannedMatchType;
    lobby.isMatchmakingLobby = serialized.isMatchmakingLobby || false;
    lobby.soatcLeagueMatch = serialized.soatcLeagueMatch || null;
    lobby.lastActive = serialized.lastActive || Date.now();
    lobby.playerIds = new Set(serialized.playerIds);
    lobby.ready = new Set(serialized.ready);

    lobbies.set(lobby.id, lobby);
    cacheTimestamps.set(lobby.id, Date.now());
  }

  /**
   * Handle lobby update from another instance
   */
  function handleRemoteLobbyUpdate(lobbyId: string): void {
    // Invalidate cache to force Redis fetch
    invalidateCache(lobbyId);
  }

  /**
   * Handle lobby deletion from another instance
   */
  function handleRemoteLobbyDelete(lobbyId: string): void {
    lobbies.delete(lobbyId);
    cacheTimestamps.delete(lobbyId);
    lobbyInvites.delete(lobbyId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get count of locally cached lobbies
   */
  function getLocalCount(): number {
    return lobbies.size;
  }

  /**
   * Check if we own a lobby (created on this instance)
   */
  function isLocalLobby(lobbyId: string): boolean {
    return lobbies.has(lobbyId) && isCacheFresh(lobbyId);
  }

  return {
    // Core operations
    createLobby,
    getLobby,
    updateLobby,
    deleteLobby,
    addPlayer,
    removePlayer,
    setPlayerReady,
    markActive,

    // Invites
    addInvite,
    removeInvite,
    isInvited,

    // Lists
    getAllLobbies,
    findOpenLobby,

    // Cache management
    invalidateCache,
    upsertFromSerialized,
    handleRemoteLobbyUpdate,
    handleRemoteLobbyDelete,

    // Utility
    getLocalCount,
    isLocalLobby,
  };
}

export type LobbyRegistry = ReturnType<typeof createLobbyRegistry>;
