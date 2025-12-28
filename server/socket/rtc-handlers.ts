"use strict";

import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  LobbyState,
  PendingVoiceRequest,
  PlayerState,
  ServerMatchState,
  VoiceParticipant,
} from "../types";
import type { RedisStateManager } from "../core/redis-state";

interface RtcHandlersDeps {
  io: SocketIOServer;
  socket: Socket;
  isAuthed: () => boolean;
  getPlayerBySocket: (socket: Socket | null | undefined) => PlayerState | null;
  getPlayerInfo: (playerId: string) => { id: string; displayName: string; seat?: string } | null;
  getVoiceRoomIdForPlayer: (player: PlayerState | null | undefined) => string | null;
  players: Map<string, PlayerState>;
  lobbies: Map<string, LobbyState>;
  matches: Map<string, ServerMatchState>;
  pendingVoiceRequests: Map<string, PendingVoiceRequest>;
  rtcParticipants: Map<string, Set<string>>;
  participantDetails: Map<string, VoiceParticipant>;
  rid: (prefix: string) => string;
  /** Redis state manager for cross-instance RTC state (optional) */
  redisState?: RedisStateManager | null;
}

interface RtcHandlers {
  handleDisconnect(player: PlayerState | null): void;
}

type RtcSignalPayload = {
  targetId?: string;
  signal?: unknown;
  timestamp?: number;
};

type RtcVoicePayload = {
  targetId?: string;
  action?: string;
  ts?: number;
};

export function registerRtcHandlers(deps: RtcHandlersDeps): RtcHandlers {
  const {
    io,
    socket,
    isAuthed,
    getPlayerBySocket,
    getPlayerInfo,
    getVoiceRoomIdForPlayer,
    players,
    lobbies,
    matches,
    pendingVoiceRequests,
    rtcParticipants,
    participantDetails,
    rid,
    redisState,
  } = deps;

  const ensureRoomParticipants = (roomId: string): Set<string> => {
    let participants = rtcParticipants.get(roomId);
    if (!participants) {
      participants = new Set<string>();
      rtcParticipants.set(roomId, participants);
    }
    return participants;
  };

  const serializeParticipants = (participantIds: Iterable<string>) => {
    const serialized = [];
    for (const pid of participantIds) {
      const details = participantDetails.get(pid);
      if (details) {
        serialized.push({
          id: details.id,
          displayName: details.displayName,
          lobbyId: details.lobbyId,
          matchId: details.matchId,
          roomId: details.roomId,
          joinedAt: details.joinedAt,
        });
      }
    }
    return serialized;
  };

  const _emitParticipantsToRoom = (roomId: string) => {
    const participants = rtcParticipants.get(roomId);
    if (!participants) return;
    const serialized = serializeParticipants(participants);
    participants.forEach((pid) => {
      const participantPlayer = players.get(pid);
      if (participantPlayer?.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:participants", {
          participants: serialized,
        });
      }
    });
  };

  const removeParticipantFromRoom = (roomId: string, playerId: string) => {
    const roomParticipants = rtcParticipants.get(roomId);
    if (!roomParticipants) return;

    if (!roomParticipants.has(playerId)) return;
    roomParticipants.delete(playerId);

    if (roomParticipants.size === 0) {
      rtcParticipants.delete(roomId);
    }

    const remainingParticipants = serializeParticipants(roomParticipants);
    roomParticipants.forEach((pid) => {
      const participantPlayer = players.get(pid);
      if (participantPlayer?.socketId) {
        io.to(participantPlayer.socketId).emit("rtc:peer-left", {
          from: playerId,
          participants: remainingParticipants,
        });
      }
    });
  };

  socket.on("rtc:join", () => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;

    console.log("[RTC][join] join request", {
      playerId,
      socket: socket.id,
      roomId,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
    });

    const roomParticipants = ensureRoomParticipants(roomId);
    roomParticipants.add(playerId);

    const participantData = {
      id: playerId,
      displayName: player.displayName,
      lobbyId: player.lobbyId || null,
      matchId: player.matchId || null,
      roomId,
      joinedAt: Date.now(),
    };

    participantDetails.set(playerId, participantData);

    // Persist to Redis for cross-instance visibility (fire and forget)
    if (redisState?.isEnabled()) {
      redisState.addRtcParticipant(roomId, participantData).catch(() => {
        // Silently fail - local state is primary
      });
    }

    const serialized = serializeParticipants(roomParticipants);

    roomParticipants.forEach((pid) => {
      if (pid === playerId) return;
      const participantPlayer = players.get(pid);
      if (participantPlayer?.socketId) {
        const info = getPlayerInfo(playerId) ?? {
          id: playerId,
          displayName: `Player ${playerId.slice(-4)}`,
        };
        io.to(participantPlayer.socketId).emit("rtc:peer-joined", {
          from: info,
          participants: serialized,
        });
      }
    });

    socket.emit("rtc:participants", { participants: serialized });
  });

  socket.on("rtc:signal", (payload: RtcSignalPayload = {}) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const roomParticipants = rtcParticipants.get(roomId);
    if (!roomParticipants || !roomParticipants.has(player.id)) return;

    const targetId =
      typeof payload.targetId === "string" ? payload.targetId : null;
    if (!targetId || targetId === player.id) return;

    const targetPlayer = players.get(targetId);
    if (!targetPlayer?.socketId) return;

    io.to(targetPlayer.socketId).emit("rtc:signal", {
      from: player.id,
      signal: payload.signal,
      timestamp: payload.timestamp || Date.now(),
    });
  });

  socket.on("rtc:leave", () => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    removeParticipantFromRoom(roomId, player.id);
    participantDetails.delete(player.id);

    // Remove from Redis (fire and forget)
    if (redisState?.isEnabled()) {
      redisState.removeRtcParticipant(roomId, player.id).catch(() => {
        // Silently fail - local state is primary
      });
    }
  });

  socket.on("rtc:connection-failed", (payload: Record<string, unknown> = {}) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const playerId = player.id;
    const reason =
      typeof payload.reason === "string" ? payload.reason : "unknown";
    const code = typeof payload.code === "string" ? payload.code : "CONNECTION_ERROR";

    console.warn(
      `WebRTC connection failed for player ${playerId} in ${roomId}: ${reason} (${code})`
    );

    const roomParticipants = rtcParticipants.get(roomId);
    if (roomParticipants && roomParticipants.has(playerId)) {
      roomParticipants.forEach((pid) => {
        if (pid === playerId) return;
        const participantPlayer = players.get(pid);
        if (participantPlayer?.socketId) {
          io.to(participantPlayer.socketId).emit("rtc:peer-connection-failed", {
            from: playerId,
            reason,
            code,
            timestamp: Date.now(),
          });
        }
      });
    }

    socket.emit("rtc:connection-failed-ack", {
      playerId,
      matchId: player.matchId || null,
      roomId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request", (payload: Record<string, unknown> = {}) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const targetId =
      typeof payload.targetId === "string" ? payload.targetId : null;
    const requestedLobbyId =
      typeof payload.lobbyId === "string" ? payload.lobbyId : null;
    const requestedMatchId =
      typeof payload.matchId === "string" ? payload.matchId : null;
    if (!targetId || targetId === player.id) {
      console.warn("[RTC][request] invalid target", {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
      });
      return;
    }

    const targetPlayer = players.get(targetId);
    if (!targetPlayer?.socketId) {
      console.warn("[RTC][request] target not connected", {
        from: player.id,
        targetId,
      });
      return;
    }

    const shareLobby =
      player.lobbyId &&
      targetPlayer.lobbyId &&
      player.lobbyId === targetPlayer.lobbyId;
    const shareMatch =
      player.matchId &&
      targetPlayer.matchId &&
      player.matchId === targetPlayer.matchId;

    let lobbyId: string | null = null;
    if (requestedLobbyId) {
      const lobby = lobbies.get(requestedLobbyId);
      if (
        lobby &&
        lobby.playerIds.has(player.id) &&
        lobby.playerIds.has(targetId)
      ) {
        lobbyId = requestedLobbyId;
      }
    }
    if (!lobbyId && shareLobby) {
      lobbyId = player.lobbyId ?? null;
    }

    let matchId: string | null = null;
    if (requestedMatchId) {
      const match = matches.get(requestedMatchId);
      if (
        match &&
        Array.isArray(match.playerIds) &&
        match.playerIds.includes(player.id) &&
        match.playerIds.includes(targetId)
      ) {
        matchId = requestedMatchId;
      }
    }
    if (!matchId && shareMatch) {
      matchId = player.matchId ?? null;
    }

    if (!lobbyId && !matchId) {
      console.warn("[RTC][request] rejected - no shared scope", {
        from: player.id,
        targetId,
        requestedLobbyId,
        requestedMatchId,
        shareLobby,
        shareMatch,
      });
      return;
    }

    const requestId = rid("rtc_req");
    const createdAt = Date.now();

    pendingVoiceRequests.set(requestId, {
      id: requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
      createdAt,
    });

    // Persist to Redis for cross-instance lookup (fire and forget)
    if (redisState?.isEnabled()) {
      redisState
        .createVoiceRequest({
          requestId,
          senderId: player.id,
          targetId,
          roomId: lobbyId || matchId || "",
          createdAt,
        })
        .catch(() => {
          // Silently fail - local state is primary
        });
    }

    console.log("[RTC][request] forwarding request", {
      requestId,
      from: player.id,
      to: targetId,
      lobbyId,
      matchId,
    });

    const requesterInfo =
      getPlayerInfo(player.id) ?? {
        id: player.id,
        displayName: `Player ${player.id.slice(-4)}`,
      };

    io.to(targetPlayer.socketId).emit("rtc:request", {
      requestId,
      from: requesterInfo,
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });

    socket.emit("rtc:request:sent", {
      requestId,
      targetId,
      lobbyId,
      matchId,
      timestamp: Date.now(),
    });
  });

  socket.on("rtc:request:respond", (payload: Record<string, unknown> = {}) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const requestId =
      typeof payload.requestId === "string" ? payload.requestId : null;
    const requesterId =
      typeof payload.requesterId === "string" ? payload.requesterId : null;
    const accepted =
      typeof payload.accepted === "boolean" ? payload.accepted : false;

    if (!requestId || !requesterId) {
      console.warn("[RTC][request:respond] missing identifiers", {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }

    const request = pendingVoiceRequests.get(requestId);
    if (!request) {
      console.warn("[RTC][request:respond] unknown request", {
        player: player.id,
        requestId,
        requesterId,
        accepted,
      });
      return;
    }

    pendingVoiceRequests.delete(requestId);

    // Delete from Redis (fire and forget)
    if (redisState?.isEnabled()) {
      redisState.deleteVoiceRequest(requestId).catch(() => {
        // Silently fail - local state is primary
      });
    }

    const requesterPlayer = players.get(requesterId);
    if (!requesterPlayer?.socketId) {
      console.warn("[RTC][request:respond] requester offline", {
        requestId,
        requesterId,
      });
      return;
    }

    const sameLobby =
      request.lobbyId &&
      player.lobbyId === request.lobbyId &&
      requesterPlayer.lobbyId === request.lobbyId;
    const sameMatch =
      request.matchId &&
      player.matchId === request.matchId &&
      requesterPlayer.matchId === request.matchId;
    if (!sameLobby && !sameMatch) {
      return;
    }

    const responsePayload = {
      requestId,
      from:
        getPlayerInfo(player.id) ?? {
          id: player.id,
          displayName: `Player ${player.id.slice(-4)}`,
        },
      lobbyId: request.lobbyId,
      matchId: request.matchId,
      accepted,
      timestamp: Date.now(),
    };

    io.to(requesterPlayer.socketId).emit(
      accepted ? "rtc:request:accepted" : "rtc:request:declined",
      responsePayload
    );

    socket.emit("rtc:request:ack", responsePayload);
    if (accepted) {
      socket.emit("rtc:request:accepted", responsePayload);
    }
  });

  socket.on("rtc:voice", (payload: RtcVoicePayload = {}) => {
    if (!isAuthed()) return;
    const player = getPlayerBySocket(socket);
    if (!player) return;

    const roomId = getVoiceRoomIdForPlayer(player);
    if (!roomId) return;

    const roomParticipants = rtcParticipants.get(roomId);
    if (!roomParticipants || !roomParticipants.has(player.id)) return;

    const targetId =
      typeof payload.targetId === "string" ? payload.targetId : null;
    if (!targetId) return;

    const targetPlayer = players.get(targetId);
    if (!targetPlayer?.socketId) return;

    io.to(targetPlayer.socketId).emit("rtc:voice", {
      from: player.id,
      action: payload.action,
      ts: payload.ts || Date.now(),
    });
  });

  const handleDisconnect = (player: PlayerState | null) => {
    if (!player) return;
    const playerId = player.id;

    for (const [requestId, request] of Array.from(pendingVoiceRequests.entries())) {
      if (request.from === playerId || request.to === playerId) {
        pendingVoiceRequests.delete(requestId);

        // Delete from Redis (fire and forget)
        if (redisState?.isEnabled()) {
          redisState.deleteVoiceRequest(requestId).catch(() => {
            // Silently fail
          });
        }

        const otherId = request.from === playerId ? request.to : request.from;
        const otherPlayer = players.get(otherId);
        if (otherPlayer?.socketId) {
          console.log("[RTC][request:cancelled] disconnect cleanup", {
            requestId,
            cancelledBy: playerId,
            other: otherId,
          });
          io.to(otherPlayer.socketId).emit("rtc:request:cancelled", {
            requestId,
            cancelledBy: playerId,
            lobbyId: request.lobbyId,
            matchId: request.matchId,
            timestamp: Date.now(),
          });
        }
      }
    }

    const roomId = getVoiceRoomIdForPlayer(player);
    if (roomId) {
      removeParticipantFromRoom(roomId, playerId);

      // Remove from Redis (fire and forget)
      if (redisState?.isEnabled()) {
        redisState.removeRtcParticipant(roomId, playerId).catch(() => {
          // Silently fail - local state is primary
        });
      }
    }

    participantDetails.delete(playerId);
  };

  return { handleDisconnect };
}
