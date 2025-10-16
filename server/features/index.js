"use strict";

const { createLobbyFeature } = require("./lobby");
const { createTournamentFeature } = require("./tournament");

/**
 * Register all server feature modules with the shared container.
 *
 * @param {import("../core/container").ServerContainer} container
 * @param {object} deps
 */
function registerFeatures(container, deps) {
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
      cpuBotsEnabled: deps.cpuBotsEnabled,
      loadBotClientCtor: deps.loadBotClientCtor,
      port: deps.port,
      isCpuPlayerId: deps.isCpuPlayerId,
    })
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
    })
  );

  return { lobby, tournament };
}

module.exports = { registerFeatures };
