import { z } from "zod";

// Basic shared types
export const PlayerInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

export const TournamentPlayerInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  ready: z.boolean().default(false),
});
export type TournamentPlayerInfo = z.infer<typeof TournamentPlayerInfoSchema>;

export const LobbyStatusSchema = z.enum(["open", "started", "closed"]);
export type LobbyStatus = z.infer<typeof LobbyStatusSchema>;

export const LobbyVisibilitySchema = z.enum(["open", "private"]);
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
  plannedMatchType: z.enum(["constructed", "sealed", "draft"]).optional(),
});
export type LobbyInfo = z.infer<typeof LobbyInfoSchema>;

export const MatchStatusSchema = z.enum(["waiting", "deck_construction", "in_progress", "ended"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const SealedConfigSchema = z.object({
  packCount: z.number().int().min(3).max(8),
  setMix: z.array(z.string()),
  timeLimit: z.number().int().min(15).max(90),
  constructionStartTime: z.number().optional(),
  // Optional extended fields used by lobby UI and clients
  packCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  replaceAvatars: z.boolean().optional(),
});
export type SealedConfig = z.infer<typeof SealedConfigSchema>;

export const DraftConfigSchema = z.object({
  setMix: z.array(z.string()),
  packCount: z.number().int().min(3).max(4),
  packSize: z.number().int().min(12).max(18),
  // Optional exact per-set pack counts (must sum to packCount if provided)
  packCounts: z.record(z.string(), z.number().int().min(0)).optional(),
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
});
export type PackCard = z.infer<typeof PackCardSchema>;

export const SealedPackSchema = z.object({
  id: z.string(),
  set: z.string(),
  cards: z.array(PackCardSchema),
});
export type SealedPack = z.infer<typeof SealedPackSchema>;

export const DraftStateSchema = z.object({
  phase: z.enum(["waiting", "pack_selection", "picking", "passing", "complete"]),
  packIndex: z.number(),
  pickNumber: z.number(),
  currentPacks: z.array(z.array(z.unknown())).nullable(),
  picks: z.array(z.array(z.unknown())),
  packDirection: z.enum(["left", "right"]),
  packChoice: z.array(z.string().nullable()),
  waitingFor: z.array(z.string()),
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
  result: z.enum(["win", "loss", "draw"]).nullable().optional(),
  matchType: z.enum(["constructed", "sealed", "draft"]).optional(),
  sealedConfig: SealedConfigSchema.nullable().optional(),
  draftConfig: DraftConfigSchema.nullable().optional(),
  deckSubmissions: z.array(z.string()).optional(),
  playerDecks: z.record(z.string(), z.unknown()).optional(),
  sealedPacks: z.record(z.string(), z.array(SealedPackSchema)).optional(),
  draftState: DraftStateSchema.optional(),
  // Multi-player support
  maxPlayers: z.number().int().min(2).max(8).default(2),
  isMultiplayer: z.boolean().default(false),
});
export type MatchInfo = z.infer<typeof MatchInfoSchema>;

// Tournament system types
export const TournamentFormatSchema = z.enum(["swiss", "elimination", "round_robin"]);
export type TournamentFormat = z.infer<typeof TournamentFormatSchema>;

export const TournamentStatusSchema = z.enum(["registering", "draft_phase", "sealed_phase", "playing", "completed"]);
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
  maxPlayers: z.number().int().min(2).max(32),
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
  playerId: z.string().optional() // Persistent player ID for reconnection
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
export const ActionPayload = z.object({ action: z.any() });
export const ChatPayload = z.object({ content: z.string().min(1), scope: ChatScopeSchema.optional() });
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
  plannedMatchType: z.enum(["constructed", "sealed", "draft"]),
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
export type ActionPayloadT = z.infer<typeof ActionPayload>;
export type ChatPayloadT = z.infer<typeof ChatPayload>;
export type ResyncRequestPayloadT = z.infer<typeof ResyncRequestPayload>;
export type PingPayloadT = z.infer<typeof PingPayload>;
export type MulliganDonePayloadT = z.infer<typeof MulliganDonePayload>;
export type SetLobbyVisibilityPayloadT = z.infer<typeof SetLobbyVisibilityPayload>;
export type InviteToLobbyPayloadT = z.infer<typeof InviteToLobbyPayload>;
export type RequestLobbiesPayloadT = z.infer<typeof RequestLobbiesPayload>;
export type RequestPlayersPayloadT = z.infer<typeof RequestPlayersPayload>;
export type SetLobbyPlanPayloadT = z.infer<typeof SetLobbyPlanPayload>;

export type ClientEventMap = {
  hello: HelloPayloadT;
  createLobby: CreateLobbyPayloadT;
  joinLobby: JoinLobbyPayloadT;
  leaveLobby: LeaveLobbyPayloadT;
  leaveMatch: LeaveMatchPayloadT;
  ready: ReadyPayloadT;
  startMatch: StartMatchPayloadT;
  joinMatch: JoinMatchPayloadT;
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
};

// Server -> Client payloads
export const WelcomePayload = z.object({ you: PlayerInfoSchema });
export const JoinedLobbyPayload = z.object({ lobby: LobbyInfoSchema });
export const LobbyUpdatedPayload = z.object({ lobby: LobbyInfoSchema });
export const LeftLobbyPayload = z.object({});
export const MatchStartedPayload = z.object({ match: MatchInfoSchema });
export const StatePatchPayload = z.object({ patch: z.any(), t: z.number().optional() });
export const ServerChatPayload = z.object({
  from: PlayerInfoSchema.nullable(),
  content: z.string(),
  scope: ChatScopeSchema,
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
export const ResyncResponsePayload = z.object({ snapshot: ResyncSnapshotSchema });
export const PongPayload = z.object({ t: z.number() });
export const LobbiesUpdatedPayload = z.object({ lobbies: z.array(LobbyInfoSchema) });
export const PlayerListPayload = z.object({ players: z.array(PlayerInfoSchema) });
export const LobbyInvitePayload = z.object({
  lobbyId: z.string(),
  from: PlayerInfoSchema,
  visibility: LobbyVisibilitySchema,
  message: z.string().optional(),
});
export const ErrorPayload = z.object({ message: z.string(), code: z.string().optional() });

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
export type ErrorPayloadT = z.infer<typeof ErrorPayload>;

export type ServerEventMap = {
  welcome: WelcomePayloadT;
  joinedLobby: JoinedLobbyPayloadT;
  lobbyUpdated: LobbyUpdatedPayloadT;
  leftLobby: LeftLobbyPayloadT;
  matchStarted: MatchStartedPayloadT;
  statePatch: StatePatchPayloadT;
  chat: ServerChatPayloadT;
  resyncResponse: ResyncResponsePayloadT;
  pong: PongPayloadT;
  error: ErrorPayloadT;
  lobbiesUpdated: LobbiesUpdatedPayloadT;
  playerList: PlayerListPayloadT;
  lobbyInvite: LobbyInvitePayloadT;
};

export const Protocol = {
  // Client -> Server
  HelloPayload,
  CreateLobbyPayload,
  JoinLobbyPayload,
  LeaveLobbyPayload,
  LeaveMatchPayload,
  ReadyPayload,
  StartMatchPayload,
  JoinMatchPayload,
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
};
