"use strict";

import type { Server as SocketIOServer } from "socket.io";
import type { RedisStateManager } from "../core/redis-state";
import type { PlayerState, VoiceParticipant } from "../types";

interface RtcMigrationDeps {
  io: SocketIOServer;
  players: Map<string, PlayerState>;
  rtcParticipants: Map<string, Set<string>>;
  participantDetails: Map<string, VoiceParticipant>;
  redisState?: RedisStateManager | null;
}

/**
 * Migrate RTC participants from a lobby room to a match room.
 * This preserves active voice connections when transitioning from lobby to match.
 *
 * @param lobbyId - The lobby ID to migrate from
 * @param matchId - The match ID to migrate to
 * @param playerIds - The player IDs involved in the match
 */
export function migrateRtcRoomToMatch(
  deps: RtcMigrationDeps,
  lobbyId: string,
  matchId: string,
  playerIds: string[]
): void {
  const { io, players, rtcParticipants, participantDetails, redisState } = deps;

  const oldRoomId = `lobby:${lobbyId}`;
  const newRoomId = `match:${matchId}`;

  const oldRoomParticipants = rtcParticipants.get(oldRoomId);
  if (!oldRoomParticipants || oldRoomParticipants.size === 0) {
    console.log("[RTC][migrate] No participants in lobby room to migrate", {
      lobbyId,
      matchId,
    });
    return;
  }

  // Filter to only players in this match
  const matchPlayerSet = new Set(playerIds);
  const participantsToMigrate = Array.from(oldRoomParticipants).filter((pid) =>
    matchPlayerSet.has(pid)
  );

  if (participantsToMigrate.length === 0) {
    console.log("[RTC][migrate] No matching participants to migrate", {
      lobbyId,
      matchId,
      lobbyParticipants: Array.from(oldRoomParticipants),
      matchPlayers: playerIds,
    });
    return;
  }

  console.log("[RTC][migrate] Migrating RTC participants from lobby to match", {
    lobbyId,
    matchId,
    participants: participantsToMigrate,
  });

  // Create or get the new room's participant set
  let newRoomParticipants = rtcParticipants.get(newRoomId);
  if (!newRoomParticipants) {
    newRoomParticipants = new Set<string>();
    rtcParticipants.set(newRoomId, newRoomParticipants);
  }

  // Migrate each participant
  for (const playerId of participantsToMigrate) {
    // Remove from old room
    oldRoomParticipants.delete(playerId);

    // Add to new room
    newRoomParticipants.add(playerId);

    // Update participant details with new room ID
    const details = participantDetails.get(playerId);
    if (details) {
      details.roomId = newRoomId;
      details.matchId = matchId;
      // Keep lobbyId for reference
    }

    // Update Redis if enabled (fire and forget)
    if (redisState?.isEnabled()) {
      const player = players.get(playerId);
      if (player && details) {
        redisState
          .addRtcParticipant(newRoomId, {
            id: playerId,
            displayName: player.displayName,
            lobbyId: details.lobbyId,
            matchId,
            roomId: newRoomId,
            joinedAt: details.joinedAt,
          })
          .catch(() => {
            // Silently fail - local state is primary
          });
        redisState.removeRtcParticipant(oldRoomId, playerId).catch(() => {
          // Silently fail
        });
      }
    }
  }

  // Clean up old room if empty
  if (oldRoomParticipants.size === 0) {
    rtcParticipants.delete(oldRoomId);
  }

  // Notify all migrated participants about the room change
  // This allows clients to update their internal state without reconnecting
  const serializedParticipants = participantsToMigrate.map((pid) => {
    const details = participantDetails.get(pid);
    return {
      id: pid,
      displayName: details?.displayName || null,
      lobbyId: details?.lobbyId || null,
      matchId,
      roomId: newRoomId,
      joinedAt: details?.joinedAt || Date.now(),
    };
  });

  for (const playerId of participantsToMigrate) {
    const player = players.get(playerId);
    if (player?.socketId) {
      io.to(player.socketId).emit("rtc:room-migrated", {
        from: oldRoomId,
        to: newRoomId,
        lobbyId,
        matchId,
        participants: serializedParticipants,
        timestamp: Date.now(),
      });
    }
  }

  console.log("[RTC][migrate] Migration complete", {
    from: oldRoomId,
    to: newRoomId,
    migratedCount: participantsToMigrate.length,
  });
}

/**
 * Create a migration helper bound to the provided dependencies.
 * This allows the lobby feature to call migration without direct access to RTC state.
 */
export function createRtcMigrationHelper(deps: RtcMigrationDeps) {
  return {
    migrateToMatch: (lobbyId: string, matchId: string, playerIds: string[]) =>
      migrateRtcRoomToMatch(deps, lobbyId, matchId, playerIds),
  };
}
