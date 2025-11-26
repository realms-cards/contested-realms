import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { Server, Socket } from "socket.io";

type AnyRecord = Record<string, unknown>;

declare module "./modules/draft" {
  import type { createMatchDraftService as CreateMatchDraftService } from "./modules/draft/match";
  export const config: {
    getDraftConfig(
      prisma: PrismaClient,
      matchId: string,
      match: AnyRecord
    ): Promise<AnyRecord>;
    loadCubeConfiguration(
      prisma: PrismaClient,
      cubeId: string
    ): Promise<AnyRecord>;
    ensureConfigLoaded(
      prisma: PrismaClient,
      matchId: string,
      match: AnyRecord,
      hydrateMatchFromDatabase: (
        matchId: string,
        match: AnyRecord
      ) => Promise<void>
    ): Promise<void>;
  };
  export const createMatchDraftService: typeof CreateMatchDraftService;
}

declare module "./modules/draft/match" {
  export interface DraftPresenceEntry {
    playerId: string;
    playerName: string | null;
    isConnected: boolean;
    lastActivity: number;
  }

  export function createMatchDraftService(deps: {
    io: Server;
    storeRedis: Redis | null;
    prisma: PrismaClient;
    draftConfig: {
      getDraftConfig(...args: unknown[]): Promise<unknown>;
      loadCubeConfiguration(...args: unknown[]): Promise<unknown>;
      ensureConfigLoaded(...args: unknown[]): Promise<void>;
    };
    hydrateMatchFromDatabase(matchId: string, match: AnyRecord): Promise<void>;
    persistMatchUpdate(
      match: AnyRecord,
      patch: AnyRecord | null,
      playerId: string,
      timestamp: number
    ): Promise<void>;
    getOrLoadMatch(matchId: string): Promise<AnyRecord | null>;
    getMatchInfo(match: AnyRecord): AnyRecord;
    createRngFromString(seed: string): () => number;
    generateBoosterDeterministic(...args: unknown[]): Promise<unknown>;
    generateCubeBoosterDeterministic?(...args: unknown[]): Promise<unknown>;
  }): {
    registerSocketHandlers(context: {
      socket: Socket;
      isAuthed(): boolean;
      getPlayerBySocket(socket: Socket): AnyRecord | null;
    }): void;
    updateDraftPresence(
      sessionId: string,
      playerId: string,
      playerName: string | null,
      isConnected: boolean
    ): Promise<DraftPresenceEntry[]>;
    getDraftPresenceList(sessionId: string): DraftPresenceEntry[];
    leaderDraftPlayerReady(
      matchId: string,
      playerId: string,
      ready: boolean
    ): Promise<void>;
    leaderStartDraft(
      matchId: string,
      requestingPlayerId?: string | null,
      overrideConfig?: AnyRecord | null,
      requestingSocketId?: string | null
    ): Promise<void>;
    leaderMakeDraftPick(
      matchId: string,
      playerId: string,
      payload: AnyRecord
    ): Promise<void>;
    leaderChooseDraftPack(
      matchId: string,
      playerId: string,
      payload: AnyRecord
    ): Promise<void>;
    clearDraftWatchdog(matchId: string): void;
    repairDraftInvariants(match: AnyRecord): void;
  };
}

declare module "./modules/tournament" {
  export const broadcast: typeof import("./modules/tournament/broadcast");
  export const standings: typeof import("./modules/tournament/standings");
  export function loadEngine(): Promise<AnyRecord>;
}

declare module "./modules/tournament/broadcast" {
  export function setPrismaClient(prisma: PrismaClient): void;
  export function emitPhaseChanged(
    io: Server,
    tournamentId: string,
    newPhase: string,
    additionalData?: AnyRecord
  ): void;
  export function emitTournamentUpdate(
    io: Server,
    tournamentId: string,
    data: AnyRecord
  ): void;
  export function emitRoundStarted(
    io: Server,
    tournamentId: string,
    roundNumber: number,
    matches: AnyRecord[]
  ): void;
  export function emitMatchesReady(
    io: Server,
    tournamentId: string,
    matches: AnyRecord[]
  ): void;
  export function emitDraftReady(
    io: Server,
    tournamentId: string,
    payload: AnyRecord
  ): void;
  export function emitPlayerJoined(
    io: Server,
    tournamentId: string,
    playerId: string,
    playerName: string,
    currentPlayerCount: number
  ): void;
  export function emitPlayerLeft(
    io: Server,
    tournamentId: string,
    playerId: string,
    playerName: string,
    currentPlayerCount: number
  ): void;
  export function emitPreparationUpdate(
    io: Server,
    tournamentId: string,
    playerId: string,
    preparationStatus: string,
    readyPlayerCount: number,
    totalPlayerCount: number,
    deckSubmitted?: boolean
  ): void;
  export function emitStatisticsUpdate(
    io: Server,
    tournamentId: string,
    statistics: AnyRecord
  ): void;
}

declare module "./modules/replay" {
  export function listRecordings(
    prisma: PrismaClient,
    opts?: AnyRecord
  ): Promise<AnyRecord[]>;
  export function loadRecording(
    prisma: PrismaClient,
    matchId: string
  ): Promise<AnyRecord | null>;
  export function setupReplayRetentionPruner(
    prisma: PrismaClient,
    options?: AnyRecord
  ): void;
}

declare module "./features" {
  import type { ServerContainer } from "./core/container";
  export function registerFeatures(
    container: ServerContainer,
    deps: AnyRecord
  ): {
    lobby: ReturnType<typeof import("./features/lobby").createLobbyFeature>;
    tournament: ReturnType<
      typeof import("./features/tournament").createTournamentFeature
    >;
  };
}

declare module "./features/lobby" {
  export function createLobbyFeature(deps: AnyRecord): {
    registerSocketHandlers(context: AnyRecord): void;
    onInit?(): Promise<void> | void;
    onShutdown?(): Promise<void> | void;
    normalizeSealedConfig(config: unknown): unknown;
    normalizeDraftConfig(config: unknown): unknown;
  };
}

declare module "./features/tournament" {
  export function createTournamentFeature(deps: AnyRecord): {
    registerSocketHandlers(context: AnyRecord): void;
    onInit?(): Promise<void> | void;
    onShutdown?(): Promise<void> | void;
  };
}

declare module "./booster" {
  export function createRngFromString(seed: string): () => number;
  export function generateBoosterDeterministic(
    setName: string,
    rng: () => number,
    replaceAvatars?: boolean
  ): Promise<AnyRecord>;
  export function generateCubeBoosterDeterministic(
    cubeConfig: AnyRecord,
    rng: () => number,
    replaceAvatars?: boolean
  ): Promise<AnyRecord>;
}

declare module "./botManager" {
  import type { Server } from "socket.io";
  export class BotManager {
    constructor(
      io: Server,
      players: Map<string, AnyRecord>,
      lobbies: Map<string, AnyRecord>,
      matches: Map<string, AnyRecord>,
      getLobbyInfo: (lobby: AnyRecord) => AnyRecord,
      getMatchInfo: (match: AnyRecord) => AnyRecord,
      isCpuPlayerId?: (id: string) => boolean
    );
    registerBot(botId: string, botInstance: AnyRecord): void;
    getBot(botId: string): AnyRecord | null;
    stopAndRemoveBot(botId: string, reason?: string): void;
    cleanupBotsForLobby(lobbyId: string): void;
    cleanupBotsAfterMatch(match: AnyRecord): void;
  }
}

// NOTE: ./rules/index.js is deprecated. Use TypeScript modules:
// - ./modules/rules-turn-start.ts for applyTurnStart
// - ./modules/rules-movement.ts for applyMovementAndCombat
// - ./modules/rules-validation.ts for validateAction
// - ./modules/rules-costs.ts for ensureCosts
