import { z } from "zod";

// Player location for presence tracking
export const PlayerLocationSchema = z.enum([
  "lobby",
  "match",
  "collection",
  "decks",
  "browsing",
  "offline",
]);
export type PlayerLocation = z.infer<typeof PlayerLocationSchema>;

// Basic shared types
const LeagueInfoSchema = z.object({
  slug: z.string(),
  name: z.string(),
  badgeColor: z.string().optional(),
});
export type LeagueInfoProtocol = z.infer<typeof LeagueInfoSchema>;

const PlayerInfoInputSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  avatarUrl: z.string().optional(),
  image: z.string().optional(),
  seat: z.enum(["p1", "p2"]).optional(),
  location: PlayerLocationSchema.optional(),
  inLobby: z.boolean().optional(),
  inMatch: z.boolean().optional(),
  leagues: z.array(LeagueInfoSchema).optional(),
});

type PlayerInfoInput = z.infer<typeof PlayerInfoInputSchema>;

function normalizePlayerInfo(raw: PlayerInfoInput) {
  const fallbackId = raw.id || "player";
  const trimmedNameCandidates = [raw.displayName, raw.name]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const displayName =
    trimmedNameCandidates[0] ||
    (fallbackId.length >= 4
      ? `Player ${fallbackId.slice(-4)}`
      : fallbackId || "Player");

  const avatarCandidate = [raw.avatar, raw.avatarUrl, raw.image]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);
  const seat =
    raw.seat === "p1" || raw.seat === "p2" ? (raw.seat as "p1" | "p2") : null;

  return {
    id: raw.id,
    displayName,
    avatarUrl: avatarCandidate ?? null,
    seat,
    location: raw.location ?? null,
    inLobby: raw.inLobby ?? false,
    inMatch: raw.inMatch ?? false,
    leagues: raw.leagues ?? [],
  };
}

export const PlayerInfoSchema =
  PlayerInfoInputSchema.transform(normalizePlayerInfo);
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

const TournamentPlayerInfoInputSchema = PlayerInfoInputSchema.extend({
  ready: z.boolean().optional(),
  seatStatus: z.enum(["active", "vacant"]).optional(),
});

export const TournamentPlayerInfoSchema =
  TournamentPlayerInfoInputSchema.transform((raw) => ({
    ...normalizePlayerInfo(raw),
    ready: raw.ready ?? false,
    seatStatus: raw.seatStatus ?? "active",
  }));
export type TournamentPlayerInfo = z.infer<typeof TournamentPlayerInfoSchema>;

export const LobbyStatusSchema = z.enum(["open", "started", "closed"]);
export type LobbyStatus = z.infer<typeof LobbyStatusSchema>;

export const LobbyVisibilitySchema = z.enum(["open", "private", "tournament"]);
export type LobbyVisibility = z.infer<typeof LobbyVisibilitySchema>;

export const LobbyInfoSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  hostId: z.string(),
  players: z.array(PlayerInfoSchema),
  status: LobbyStatusSchema,
  maxPlayers: z.number().int().min(2).max(8),
  visibility: LobbyVisibilitySchema,
  // New: readiness information per lobby
  readyPlayerIds: z.array(z.string()).default([]),
  // New: planned match type visible to all clients (host-controlled)
  plannedMatchType: z
    .enum(["constructed", "sealed", "draft", "precon"])
    .optional(),
  // Quick Play lobby: game mode is locked, host configures and starts
  isMatchmakingLobby: z.boolean().optional(),
  // Match ID when lobby status is "started" - allows spectating
  matchId: z.string().nullable().optional(),
  // Match status - 'waiting' | 'in_progress' | 'ended' | null (for spectate visibility)
  matchStatus: z.string().nullable().optional(),
  // Timestamp when lobby was created or match started
  startedAt: z.number().nullable().optional(),
  // SOATC league match info when both players are in same tournament
  soatcLeagueMatch: z
    .object({
      isLeagueMatch: z.boolean(),
      tournamentId: z.string(),
      tournamentName: z.string(),
    })
    .nullable()
    .optional(),
  // Tournament lobbies: host must "open" lobby before others can join
  hostReady: z.boolean().optional(),
});
export type LobbyInfo = z.infer<typeof LobbyInfoSchema>;

export const MatchStatusSchema = z.enum([
  "waiting",
  "deck_construction",
  "in_progress",
  "ended",
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const SealedConfigSchema = z.object({
  packCount: z.number().int().min(3).max(8),
  setMix: z.array(z.string()),
  timeLimit: z.number().int().min(15).max(90),
  constructionStartTime: z.number().optional(),
  // Optional extended fields used by lobby UI and clients
  packCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  replaceAvatars: z.boolean().optional(),
  // Free Avatars mode: removes avatars from packs, offers all avatars via deck editor extras
  freeAvatars: z.boolean().optional(),
  // Enable second player seer ability (scry 1 before game starts)
  enableSeer: z.boolean().optional(),
});
export type SealedConfig = z.infer<typeof SealedConfigSchema>;

export const DraftConfigSchema = z.object({
  setMix: z.array(z.string()),
  packCount: z.number().int().min(3).max(4),
  packSize: z.number().int().min(12).max(18),
  // Optional exact per-set pack counts (must sum to packCount if provided)
  packCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  cubeId: z.string().optional().nullable(),
  cubeName: z.string().optional().nullable(),
  // Optional: when true for cube drafts, offer cube sideboard cards in the standard card pool
  includeCubeSideboardInStandard: z.boolean().optional(),
  // Free Avatars mode: removes avatars from packs, offers all avatars via deck editor extras
  freeAvatars: z.boolean().optional(),
  // Enable second player seer ability (scry 1 before game starts)
  enableSeer: z.boolean().optional(),
});
export type DraftConfig = z.infer<typeof DraftConfigSchema>;

// Server-provided sealed packs per player (deterministic)
export const PackCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  set: z.string(),
  slug: z.string(),
  type: z.string().optional().nullable(),
  cost: z.number().int().min(0).optional().nullable(),
  rarity: z.string(),
  // Optional identifiers/metadata included by the server to avoid per-card lookups on the client
  cardId: z.number().int().optional(),
  variantId: z.number().int().optional(),
  finish: z.enum(["Standard", "Foil"]).optional(),
  product: z.string().optional(),
});
export type PackCard = z.infer<typeof PackCardSchema>;

export const SealedPackSchema = z.object({
  id: z.string(),
  set: z.string(),
  cards: z.array(PackCardSchema),
});
export type SealedPack = z.infer<typeof SealedPackSchema>;

export const DraftStateSchema = z.object({
  phase: z.enum([
    "waiting",
    "pack_selection",
    "picking",
    "passing",
    "complete",
  ]),
  packIndex: z.number(),
  pickNumber: z.number(),
  currentPacks: z.array(z.array(z.unknown())).nullable(),
  picks: z.array(z.array(z.unknown())),
  packDirection: z.enum(["left", "right"]),
  packChoice: z.array(z.string().nullable()),
  waitingFor: z.array(z.string()),
  playerReady: z.object({ p1: z.boolean(), p2: z.boolean() }).optional(),
});
export type DraftStateType = z.infer<typeof DraftStateSchema>;

export const MatchInfoSchema = z.object({
  id: z.string(),
  lobbyId: z.string().optional(),
  lobbyName: z.string().optional(),
  tournamentId: z.string().optional(),
  round: z.number().int().min(1).optional(),
  players: z.array(PlayerInfoSchema),
  status: MatchStatusSchema,
  seed: z.string(),
  turn: z.string().optional(),
  winnerId: z.string().nullable().optional(),
  endReason: z.string().optional(),
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  matchType: z.enum(["constructed", "sealed", "draft", "precon"]).optional(),
  sealedConfig: SealedConfigSchema.nullable().optional(),
  draftConfig: DraftConfigSchema.nullable().optional(),
  deckSubmissions: z.array(z.string()).optional(),
  playerDecks: z.record(z.string(), z.unknown()).optional(),
  sealedPacks: z.record(z.string(), z.array(SealedPackSchema)).optional(),
  draftState: DraftStateSchema.optional(),
  // Multi-player support
  playerIds: z.array(z.string()).optional(),
  maxPlayers: z.number().int().min(2).max(8).default(2),
  isMultiplayer: z.boolean().default(false),
  // SOATC league match info (when match is part of a Sorcerers at the Core tournament)
  soatcLeagueMatch: z
    .object({
      isLeagueMatch: z.boolean(),
      tournamentId: z.string(),
      tournamentName: z.string(),
    })
    .nullable()
    .optional(),
  // Shared leagues between match players (for badge display and match reporting)
  sharedLeagues: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
  // Match start timestamp
  startedAt: z.number().nullable().optional(),
});
export type MatchInfo = z.infer<typeof MatchInfoSchema>;

// Tournament system types
export const TournamentFormatSchema = z.enum([
  "swiss",
  "elimination",
  "round_robin",
]);
export type TournamentFormat = z.infer<typeof TournamentFormatSchema>;

export const TournamentStatusSchema = z.enum([
  "registering",
  "draft_phase",
  "sealed_phase",
  "playing",
  "completed",
]);
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>;

export const TournamentRoundSchema = z.object({
  roundNumber: z.number().int().min(1),
  matches: z.array(z.string()), // Match IDs
  status: z.enum(["pending", "in_progress", "completed"]),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
});
export type TournamentRound = z.infer<typeof TournamentRoundSchema>;

export const PlayerStandingSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  wins: z.number().int().min(0).default(0),
  losses: z.number().int().min(0).default(0),
  draws: z.number().int().min(0).default(0),
  matchPoints: z.number().int().min(0).default(0),
  gameWinPercentage: z.number().min(0).max(1).default(0),
  opponentMatchWinPercentage: z.number().min(0).max(1).default(0),
  currentMatchId: z.string().nullable().optional(),
  isEliminated: z.boolean().default(false),
});
export type PlayerStanding = z.infer<typeof PlayerStandingSchema>;

export const TournamentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  creatorId: z.string(),
  format: TournamentFormatSchema,
  status: TournamentStatusSchema,
  maxPlayers: z.number().int().min(2).max(128),
  registeredPlayers: z.array(TournamentPlayerInfoSchema),
  standings: z.array(PlayerStandingSchema),
  currentRound: z.number().int().min(0).default(0),
  totalRounds: z.number().int().min(1),
  rounds: z.array(TournamentRoundSchema),
  matchType: z.enum(["constructed", "sealed", "draft"]),
  sealedConfig: SealedConfigSchema.nullable().optional(),
  draftConfig: DraftConfigSchema.nullable().optional(),
  registrationDeadline: z.number().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});
export type TournamentInfo = z.infer<typeof TournamentInfoSchema>;

// Chat scope shared enum
export const ChatScopeSchema = z.enum(["lobby", "match", "global"]);
export type ChatScope = z.infer<typeof ChatScopeSchema>;

// Client -> Server payloads
export const HelloPayload = z.object({
  displayName: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(40)),
  playerId: z.string().optional(), // Persistent player ID for reconnection
});
export const CreateLobbyPayload = z.object({
  name: z.string().optional(),
  visibility: LobbyVisibilitySchema.optional(),
  maxPlayers: z.number().int().min(2).max(8).optional(),
});
export const JoinLobbyPayload = z.object({ lobbyId: z.string().optional() });
export const LeaveLobbyPayload = z.object({});
export const LeaveMatchPayload = z.object({});
export const ReadyPayload = z.object({ ready: z.boolean() });
export const StartMatchPayload = z.object({});
export const JoinMatchPayload = z.object({ matchId: z.string() });
export const WatchMatchPayload = z.object({
  matchId: z.string(),
  token: z.string().optional(),
});
export const ActionPayload = z.object({ action: z.any() });
export const ChatPayload = z.object({
  content: z.string().min(1),
  scope: ChatScopeSchema.optional(),
});
export const ResyncRequestPayload = z.object({});
export const PingPayload = z.object({ t: z.number() });
// Mulligan sync: explicit per-player completion signal
export const MulliganDonePayload = z.object({});

// New Client -> Server payloads
export const SetLobbyVisibilityPayload = z.object({
  visibility: LobbyVisibilitySchema,
});
export const InviteToLobbyPayload = z.object({
  targetPlayerId: z.string(),
  lobbyId: z.string().optional(),
});
export const RequestLobbiesPayload = z.object({});
export const RequestPlayersPayload = z.object({});

// New Client -> Server payload: host sets planned match type for lobby
export const SetLobbyPlanPayload = z.object({
  plannedMatchType: z.enum(["constructed", "sealed", "draft", "precon"]),
});

// Tournament payloads
export const CreateTournamentPayload = z.object({
  name: z.string().min(1).max(100),
  format: TournamentFormatSchema,
  matchType: z.enum(["constructed", "sealed", "draft"]),
  maxPlayers: z.number().int().min(2).max(32),
  sealedConfig: SealedConfigSchema.optional(),
  draftConfig: DraftConfigSchema.optional(),
});
export const JoinTournamentPayload = z.object({ tournamentId: z.string() });
export const LeaveTournamentPayload = z.object({ tournamentId: z.string() });
export const StartTournamentPayload = z.object({ tournamentId: z.string() });
export const RequestTournamentsPayload = z.object({});

export type HelloPayloadT = z.infer<typeof HelloPayload>;
export type CreateLobbyPayloadT = z.infer<typeof CreateLobbyPayload>;
export type JoinLobbyPayloadT = z.infer<typeof JoinLobbyPayload>;
export type LeaveLobbyPayloadT = z.infer<typeof LeaveLobbyPayload>;
export type LeaveMatchPayloadT = z.infer<typeof LeaveMatchPayload>;
export type ReadyPayloadT = z.infer<typeof ReadyPayload>;
export type StartMatchPayloadT = z.infer<typeof StartMatchPayload>;
export type JoinMatchPayloadT = z.infer<typeof JoinMatchPayload>;
export type WatchMatchPayloadT = z.infer<typeof WatchMatchPayload>;
export type ActionPayloadT = z.infer<typeof ActionPayload>;
export type ChatPayloadT = z.infer<typeof ChatPayload>;
export type ResyncRequestPayloadT = z.infer<typeof ResyncRequestPayload>;
export type PingPayloadT = z.infer<typeof PingPayload>;
export type MulliganDonePayloadT = z.infer<typeof MulliganDonePayload>;
export type SetLobbyVisibilityPayloadT = z.infer<
  typeof SetLobbyVisibilityPayload
>;
export type InviteToLobbyPayloadT = z.infer<typeof InviteToLobbyPayload>;
export type RequestLobbiesPayloadT = z.infer<typeof RequestLobbiesPayload>;
export type RequestPlayersPayloadT = z.infer<typeof RequestPlayersPayload>;
export type SetLobbyPlanPayloadT = z.infer<typeof SetLobbyPlanPayload>;

// Matchmaking payloads
export const MatchmakingPreferencesSchema = z.object({
  matchTypes: z
    .array(z.enum(["constructed", "sealed", "draft", "precon"]))
    .min(1)
    .max(4),
});
export type MatchmakingPreferences = z.infer<
  typeof MatchmakingPreferencesSchema
>;

export const JoinMatchmakingPayload = z.object({
  preferences: MatchmakingPreferencesSchema,
});
export const LeaveMatchmakingPayload = z.object({});
export const RespondMatchmakingPayload = z.object({
  decision: z.enum(["accept", "decline"]),
});

export type JoinMatchmakingPayloadT = z.infer<typeof JoinMatchmakingPayload>;
export type LeaveMatchmakingPayloadT = z.infer<typeof LeaveMatchmakingPayload>;
export type RespondMatchmakingPayloadT = z.infer<
  typeof RespondMatchmakingPayload
>;

// Matchmaking status for server -> client
export const MatchmakingStatusSchema = z.enum([
  "idle", // Not in queue
  "searching", // In queue, looking for match
  "confirming", // Match found, waiting for confirmation
  "found", // Match found, transitioning to lobby
]);
export type MatchmakingStatus = z.infer<typeof MatchmakingStatusSchema>;

export const MatchmakingUpdatePayload = z.object({
  status: MatchmakingStatusSchema,
  preferences: MatchmakingPreferencesSchema.nullable(),
  queuePosition: z.number().int().min(0).optional(),
  estimatedWait: z.number().int().min(0).optional(), // seconds
  matchedPlayerId: z.string().optional(),
  matchedPlayerName: z.string().optional(),
  youAccepted: z.boolean().optional(),
  lobbyId: z.string().optional(),
  matchType: z.enum(["constructed", "sealed", "draft", "precon"]).optional(),
  isHost: z.boolean().optional(), // true if this player is the host (for sealed/draft config)
  queueSize: z.number().int().min(0).optional(), // total players in matchmaking queue
  confirmExpiresAt: z.number().int().min(0).optional(),
  queueBySource: z
    .object({
      web: z.number().int().min(0),
      discord: z.number().int().min(0),
    })
    .optional(),
});
export type MatchmakingUpdatePayloadT = z.infer<
  typeof MatchmakingUpdatePayload
>;

export type ClientEventMap = {
  hello: HelloPayloadT;
  createLobby: CreateLobbyPayloadT;
  joinLobby: JoinLobbyPayloadT;
  leaveLobby: LeaveLobbyPayloadT;
  leaveMatch: LeaveMatchPayloadT;
  ready: ReadyPayloadT;
  startMatch: StartMatchPayloadT;
  joinMatch: JoinMatchPayloadT;
  watchMatch: WatchMatchPayloadT;
  action: ActionPayloadT;
  chat: ChatPayloadT;
  resyncRequest: ResyncRequestPayloadT;
  ping: PingPayloadT;
  setLobbyVisibility: SetLobbyVisibilityPayloadT;
  inviteToLobby: InviteToLobbyPayloadT;
  requestLobbies: RequestLobbiesPayloadT;
  requestPlayers: RequestPlayersPayloadT;
  mulliganDone: MulliganDonePayloadT;
  setLobbyPlan: SetLobbyPlanPayloadT;
  // Matchmaking
  joinMatchmaking: JoinMatchmakingPayloadT;
  leaveMatchmaking: LeaveMatchmakingPayloadT;
  respondMatchmaking: RespondMatchmakingPayloadT;
};

// Server -> Client payloads
export const WelcomePayload = z.object({ you: PlayerInfoSchema });
export const JoinedLobbyPayload = z.object({ lobby: LobbyInfoSchema });
export const LobbyUpdatedPayload = z.object({ lobby: LobbyInfoSchema });
export const LeftLobbyPayload = z.object({});
export const MatchStartedPayload = z.object({ match: MatchInfoSchema });
export const StatePatchPayload = z.object({
  patch: z.any(),
  t: z.number().optional(),
});
export const ServerChatPayload = z.object({
  from: PlayerInfoSchema.nullable(),
  content: z.string(),
  scope: ChatScopeSchema,
  ts: z.number().optional(),
});
export const ResyncSnapshotSchema = z.object({
  lobby: LobbyInfoSchema.optional(),
  match: MatchInfoSchema.optional(),
  // Full game snapshot (server-aggregated), schema-less for now
  game: z.any().optional(),
  // Server timestamp of the snapshot (monotonic per match on this server)
  t: z.number().optional(),
});
export type ResyncSnapshot = z.infer<typeof ResyncSnapshotSchema>;
export const ResyncResponsePayload = z.object({
  snapshot: ResyncSnapshotSchema,
});
export const PongPayload = z.object({ t: z.number() });
export const LobbiesUpdatedPayload = z.object({
  lobbies: z.array(LobbyInfoSchema),
});
export const PlayerListPayload = z.object({
  players: z.array(PlayerInfoSchema),
});
export const LobbyInvitePayload = z.object({
  lobbyId: z.string(),
  from: PlayerInfoSchema,
  visibility: LobbyVisibilitySchema,
  message: z.string().optional(),
});
export const InviteResponsePayload = z.object({
  from: PlayerInfoSchema,
  lobbyId: z.string(),
  response: z.enum(["declined", "postponed"]),
  message: z.string().optional(),
});
export const ErrorPayload = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export type WelcomePayloadT = z.infer<typeof WelcomePayload>;
export type JoinedLobbyPayloadT = z.infer<typeof JoinedLobbyPayload>;
export type LobbyUpdatedPayloadT = z.infer<typeof LobbyUpdatedPayload>;
export type LeftLobbyPayloadT = z.infer<typeof LeftLobbyPayload>;
export type MatchStartedPayloadT = z.infer<typeof MatchStartedPayload>;
export type StatePatchPayloadT = z.infer<typeof StatePatchPayload>;
export type ServerChatPayloadT = z.infer<typeof ServerChatPayload>;
export type ResyncResponsePayloadT = z.infer<typeof ResyncResponsePayload>;
export type PongPayloadT = z.infer<typeof PongPayload>;
export type LobbiesUpdatedPayloadT = z.infer<typeof LobbiesUpdatedPayload>;
export type PlayerListPayloadT = z.infer<typeof PlayerListPayload>;
export type LobbyInvitePayloadT = z.infer<typeof LobbyInvitePayload>;
export type InviteResponsePayloadT = z.infer<typeof InviteResponsePayload>;
export type ErrorPayloadT = z.infer<typeof ErrorPayload>;

export type ServerEventMap = {
  welcome: WelcomePayloadT;
  joinedLobby: JoinedLobbyPayloadT;
  lobbyUpdated: LobbyUpdatedPayloadT;
  leftLobby: LeftLobbyPayloadT;
  matchStarted: MatchStartedPayloadT;
  matchEnded: { matchId: string; tournamentId?: string; reason?: string };
  statePatch: StatePatchPayloadT;
  chat: ServerChatPayloadT;
  resyncResponse: ResyncResponsePayloadT;
  pong: PongPayloadT;
  error: ErrorPayloadT;
  lobbiesUpdated: LobbiesUpdatedPayloadT;
  playerList: PlayerListPayloadT;
  lobbyInvite: LobbyInvitePayloadT;
  inviteResponseReceived: InviteResponsePayloadT;
  // Matchmaking
  matchmakingUpdate: MatchmakingUpdatePayloadT;
};

export const Protocol = {
  // Schemas
  SealedConfigSchema,
  MatchInfoSchema,
  // Client -> Server
  HelloPayload,
  CreateLobbyPayload,
  JoinLobbyPayload,
  LeaveLobbyPayload,
  LeaveMatchPayload,
  ReadyPayload,
  StartMatchPayload,
  JoinMatchPayload,
  WatchMatchPayload,
  ActionPayload,
  ChatPayload,
  ResyncRequestPayload,
  PingPayload,
  SetLobbyVisibilityPayload,
  InviteToLobbyPayload,
  RequestLobbiesPayload,
  RequestPlayersPayload,
  SetLobbyPlanPayload,
  MulliganDonePayload,
  JoinMatchmakingPayload,
  LeaveMatchmakingPayload,
  RespondMatchmakingPayload,
  // Server -> Client
  WelcomePayload,
  JoinedLobbyPayload,
  LobbyUpdatedPayload,
  LeftLobbyPayload,
  MatchStartedPayload,
  StatePatchPayload,
  ServerChatPayload,
  ResyncResponsePayload,
  PongPayload,
  ErrorPayload,
  LobbiesUpdatedPayload,
  PlayerListPayload,
  LobbyInvitePayload,
  InviteResponsePayload,
  MatchmakingUpdatePayload,
};
