"use strict";

const { createLobbyFeature } = require("./lobby");
const { createMatchmakingFeature } = require("./matchmaking/constructed-queue");
const { createTournamentFeature } = require("./tournament");
const { createRtcMigrationHelper } = require("../socket/rtc-migration");

/**
 * Register all server feature modules with the shared container.
 *
 * @param {import("../core/container").ServerContainer} container
 * @param {object} deps
 */
function registerFeatures(container, deps) {
  // matchmaking is built after lobby (it needs lobby's helpers), so both other
  // features reach it through this late-bound ref rather than a direct dep.
  /** @type {{ handlePlayerEnteredGame: Function } | null} */
  let matchmakingRef = null;
  const onPlayerEnteredGame = (playerId, info) =>
    matchmakingRef
      ? matchmakingRef.handlePlayerEnteredGame(playerId, info)
      : Promise.resolve(false);

  // Create RTC migration helper for lobby-to-match voice persistence
  const rtcMigration = deps.rtcParticipants
    ? createRtcMigrationHelper({
        io: container.resolve("io"),
        players: deps.players,
        rtcParticipants: deps.rtcParticipants,
        participantDetails: deps.participantDetails,
        redisState: deps.redisState,
      })
    : null;

  const lobby = container.registerFeature("lobby", () =>
    createLobbyFeature({
      io: container.resolve("io"),
      storeRedis: container.resolve("storeRedis"),
      instanceId: container.resolve("instanceId"),
      rid: deps.rid,
      ensurePlayerCached: deps.ensurePlayerCached,
      players: deps.players,
      matches: deps.matches,
      getPlayerInfo: deps.getPlayerInfo,
      getMatchInfo: deps.getMatchInfo,
      lobbyHasHumanPlayers: deps.lobbyHasHumanPlayers,
      createRngFromString: deps.createRngFromString,
      generateBoosterDeterministic: deps.generateBoosterDeterministic,
      startMatchRecording: deps.startMatchRecording,
      persistMatchCreated: deps.persistMatchCreated,
      hydrateMatchFromDatabase: deps.hydrateMatchFromDatabase,
      lobbyControlChannel: deps.lobbyControlChannel,
      lobbyStateChannel: deps.lobbyStateChannel,
      discordNotifyChannel: deps.discordNotifyChannel,
      cpuBotsEnabled: deps.cpuBotsEnabled,
      loadBotClientCtor: deps.loadBotClientCtor,
      loadBotCardIdMapFn: deps.loadBotCardIdMapFn,
      prisma: container.resolve("prisma"),
      port: deps.port,
      isCpuPlayerId: deps.isCpuPlayerId,
      botInternalSecret: deps.botInternalSecret,
      redisState: deps.redisState, // For horizontal scaling - cross-instance lobby visibility
      rtcMigration, // For preserving voice connections from lobby to match
      onPlayerEnteredGame, // Drop a player's matchmaking queue slot when they enter a lobby/match
    }),
  );

  const tournament = container.registerFeature("tournament", () =>
    createTournamentFeature({
      io: container.resolve("io"),
      storeRedis: container.resolve("storeRedis"),
      instanceId: container.resolve("instanceId"),
      players: deps.players,
      matches: deps.matches,
      playerIdBySocket: deps.playerIdBySocket,
      prisma: container.resolve("prisma"),
      rid: deps.rid,
      normalizeSealedConfig: lobby.normalizeSealedConfig,
      createRngFromString: deps.createRngFromString,
      generateBoosterDeterministic: deps.generateBoosterDeterministic,
      persistMatchCreated: deps.persistMatchCreated,
      hydrateMatchFromDatabase: deps.hydrateMatchFromDatabase,
      startMatchRecording: deps.startMatchRecording,
      getMatchInfo: deps.getMatchInfo,
      tournamentBroadcast: deps.tournamentBroadcast,
      onPlayerEnteredGame,
    }),
  );

  const matchmaking = container.registerFeature("matchmaking", () =>
    createMatchmakingFeature({
      io: container.resolve("io"),
      storeRedis: container.resolve("storeRedis"),
      instanceId: container.resolve("instanceId"),
      getOrClaimLobbyLeader: lobby.getOrClaimLobbyLeader,
      handleLobbyControlAsLeader: lobby.handleLobbyControlAsLeader,
      ensurePlayerCached: deps.ensurePlayerCached,
      players: deps.players,
      matchmakingChannel: deps.matchmakingChannel || "matchmaking:control",
      discordNotifyChannel: deps.discordNotifyChannel,
      lobbies: lobby.lobbies,
      reservePrivateLobby: lobby.reservePrivateLobby,
      setMatchmakingLobbyConfirmationRequired:
        lobby.setMatchmakingLobbyConfirmationRequired,
      cancelReservedLobby: lobby.cancelReservedLobby,
      addLobbyInvite: lobby.addLobbyInvite,
    }),
  );

  matchmakingRef = matchmaking;

  return { lobby, tournament, matchmaking };
}

module.exports = { registerFeatures };
