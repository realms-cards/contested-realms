/**
 * Player Registry Module for Horizontal Scaling
 *
 * Manages player state with Redis as authoritative source and local Map as cache.
 * Implements player room pattern for cross-instance messaging.
 */

import type { Redis } from "ioredis";
import type { Server as SocketServer, Socket } from "socket.io";
import { DISCONNECT_GRACE_PERIOD_MS } from "../core/redis-keys";
import type { RedisStateManager } from "../core/redis-state";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerRecord {
  id: string;
  displayName: string;
  socketId: string | null;
  lobbyId: string | null;
  matchId: string | null;
}

export interface PlayerRegistryConfig {
  io: SocketServer;
  storeRedis: Redis | null;
  redisState: RedisStateManager;
  instanceId: string;
  players: Map<string, PlayerRecord>;
  playerIdBySocket: Map<string, string>;
}

interface DisconnectTimer {
  playerId: string;
  timer: ReturnType<typeof setTimeout>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Registry
// ─────────────────────────────────────────────────────────────────────────────

export function createPlayerRegistry(config: PlayerRegistryConfig) {
  const { io, redisState, instanceId, players, playerIdBySocket } = config;

  // Track pending disconnect timers
  const disconnectTimers = new Map<string, DisconnectTimer>();

  // Local cache TTL tracking (5 minutes)
  const LOCAL_CACHE_TTL_MS = 5 * 60 * 1000;
  const cacheTimestamps = new Map<string, number>();

  // ─────────────────────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a player on hello.
   * - Creates/updates local cache
   * - Stores state in Redis
   * - Sets up socket-to-player mapping
   * - Joins player room
   */
  async function registerPlayer(
    playerId: string,
    displayName: string,
    socket: Socket
  ): Promise<PlayerRecord> {
    const socketId = socket.id;
    const now = Date.now();

    // Cancel any pending disconnect timer
    cancelDisconnectTimer(playerId);

    // Update or create local record
    let player = players.get(playerId);
    if (!player) {
      player = {
        id: playerId,
        displayName,
        socketId,
        lobbyId: null,
        matchId: null,
      };
      players.set(playerId, player);
    } else {
      player.displayName = displayName;
      player.socketId = socketId;
    }

    // Update local cache timestamp
    cacheTimestamps.set(playerId, now);

    // Update socket-to-player mapping
    playerIdBySocket.set(socketId, playerId);

    // Store in Redis
    await redisState.setPlayerState(playerId, {
      displayName,
      instanceId,
      matchId: player.matchId,
      lobbyId: player.lobbyId,
      lastSeen: now,
    });

    // Store socket reverse lookup
    await redisState.setPlayerSocket(socketId, playerId);

    // Join player-specific room for cross-instance messaging
    await socket.join(`player:${playerId}`);

    // Publish connect event for other instances
    await redisState.publishPlayerConnect(playerId);

    return player;
  }

  /**
   * Get player by ID - checks local cache first, then Redis
   */
  async function getPlayer(playerId: string): Promise<PlayerRecord | null> {
    // Check local cache first
    const cached = players.get(playerId);
    if (cached) {
      // Check if cache is fresh
      const cacheTime = cacheTimestamps.get(playerId) || 0;
      if (Date.now() - cacheTime < LOCAL_CACHE_TTL_MS) {
        return cached;
      }
    }

    // Try Redis
    const redisPlayer = await redisState.getPlayerState(playerId);
    if (!redisPlayer) return cached || null;

    // Update local cache from Redis
    const player: PlayerRecord = cached || {
      id: playerId,
      displayName: redisPlayer.displayName,
      socketId: null, // Socket is local to the instance that owns it
      lobbyId: redisPlayer.lobbyId,
      matchId: redisPlayer.matchId,
    };

    // Only update if we have newer data from Redis
    player.displayName = redisPlayer.displayName;
    player.lobbyId = redisPlayer.lobbyId;
    player.matchId = redisPlayer.matchId;

    players.set(playerId, player);
    cacheTimestamps.set(playerId, Date.now());

    return player;
  }

  /**
   * Get player by socket ID - checks local map first, then Redis
   */
  async function getPlayerBySocket(
    socketId: string
  ): Promise<PlayerRecord | null> {
    // Check local mapping first
    const playerId = playerIdBySocket.get(socketId);
    if (playerId) {
      return getPlayer(playerId);
    }

    // Try Redis reverse lookup
    const redisPlayerId = await redisState.getPlayerBySocket(socketId);
    if (!redisPlayerId) return null;

    return getPlayer(redisPlayerId);
  }

  /**
   * Update player's match association
   */
  async function updatePlayerMatch(
    playerId: string,
    matchId: string | null
  ): Promise<void> {
    const player = await getPlayer(playerId);
    if (player) {
      player.matchId = matchId;
    }

    await redisState.setPlayerState(playerId, {
      matchId,
      lastSeen: Date.now(),
    });
  }

  /**
   * Update player's lobby association
   */
  async function updatePlayerLobby(
    playerId: string,
    lobbyId: string | null
  ): Promise<void> {
    const player = await getPlayer(playerId);
    if (player) {
      player.lobbyId = lobbyId;
    }

    await redisState.setPlayerState(playerId, {
      lobbyId,
      lastSeen: Date.now(),
    });
  }

  /**
   * Handle player disconnect with grace period
   */
  function handleDisconnect(socket: Socket): void {
    const socketId = socket.id;
    const playerId = playerIdBySocket.get(socketId);

    if (!playerId) return;

    // Clear socket mapping immediately
    playerIdBySocket.delete(socketId);
    void redisState.clearPlayerSocket(socketId);

    // Update local record
    const player = players.get(playerId);
    if (player) {
      player.socketId = null;
    }

    // Publish disconnect event
    void redisState.publishPlayerDisconnect(playerId);

    // Set up grace period timer
    startDisconnectTimer(playerId);
  }

  /**
   * Start disconnect grace period timer
   */
  function startDisconnectTimer(playerId: string): void {
    // Cancel existing timer if any
    cancelDisconnectTimer(playerId);

    const timer = setTimeout(() => {
      // After grace period, check if player reconnected
      const player = players.get(playerId);
      if (player && !player.socketId) {
        // Player didn't reconnect, can perform cleanup
        // Note: Match/lobby cleanup is handled by their respective modules
        console.log(
          `[PlayerRegistry] Player ${playerId} disconnect grace period expired`
        );
      }
      disconnectTimers.delete(playerId);
    }, DISCONNECT_GRACE_PERIOD_MS);

    disconnectTimers.set(playerId, { playerId, timer });
  }

  /**
   * Cancel disconnect grace period timer
   */
  function cancelDisconnectTimer(playerId: string): void {
    const pending = disconnectTimers.get(playerId);
    if (pending) {
      clearTimeout(pending.timer);
      disconnectTimers.delete(playerId);
    }
  }

  /**
   * Check if player is currently connected (has active socket)
   */
  function isPlayerConnected(playerId: string): boolean {
    const player = players.get(playerId);
    return player?.socketId !== null;
  }

  /**
   * Emit to player via their player room (works across instances)
   */
  function emitToPlayer<T>(playerId: string, event: string, data: T): void {
    io.to(`player:${playerId}`).emit(event, data);
  }

  /**
   * Get all connected players on this instance
   */
  function getConnectedPlayers(): PlayerRecord[] {
    return Array.from(players.values()).filter((p) => p.socketId !== null);
  }

  /**
   * Invalidate local cache for a player (force Redis fetch on next access)
   */
  function invalidateCache(playerId: string): void {
    cacheTimestamps.delete(playerId);
  }

  /**
   * Handle player connect event from another instance
   */
  function handleRemoteConnect(
    playerId: string,
    remoteInstanceId: string
  ): void {
    if (remoteInstanceId === instanceId) return;

    // Cancel any pending disconnect timer for this player
    cancelDisconnectTimer(playerId);

    // Invalidate local cache to force Redis fetch
    invalidateCache(playerId);

    // Clear local socket mapping if we thought they were here
    const player = players.get(playerId);
    if (player?.socketId) {
      playerIdBySocket.delete(player.socketId);
      player.socketId = null;
    }
  }

  /**
   * Cleanup all timers on shutdown
   */
  function shutdown(): void {
    for (const { timer } of disconnectTimers.values()) {
      clearTimeout(timer);
    }
    disconnectTimers.clear();
  }

  return {
    registerPlayer,
    getPlayer,
    getPlayerBySocket,
    updatePlayerMatch,
    updatePlayerLobby,
    handleDisconnect,
    isPlayerConnected,
    emitToPlayer,
    getConnectedPlayers,
    invalidateCache,
    handleRemoteConnect,
    shutdown,
    cancelDisconnectTimer,
  };
}

export type PlayerRegistry = ReturnType<typeof createPlayerRegistry>;
