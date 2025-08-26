import { z } from "zod";

// Basic shared types
export const PlayerInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

export const LobbyStatusSchema = z.enum(["open", "started", "closed"]);
export type LobbyStatus = z.infer<typeof LobbyStatusSchema>;

export const LobbyInfoSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  players: z.array(PlayerInfoSchema),
  status: LobbyStatusSchema,
  maxPlayers: z.number().int().min(2).max(8),
});
export type LobbyInfo = z.infer<typeof LobbyInfoSchema>;

export const MatchStatusSchema = z.enum(["waiting", "in_progress", "ended"]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const MatchInfoSchema = z.object({
  id: z.string(),
  lobbyId: z.string().optional(),
  players: z.array(PlayerInfoSchema),
  status: MatchStatusSchema,
  seed: z.string(),
  turn: z.string().optional(),
  winnerId: z.string().nullable().optional(),
});
export type MatchInfo = z.infer<typeof MatchInfoSchema>;

// Client -> Server payloads
export const HelloPayload = z.object({ displayName: z.string() });
export const CreateLobbyPayload = z.object({});
export const JoinLobbyPayload = z.object({ lobbyId: z.string().optional() });
export const LeaveLobbyPayload = z.object({});
export const ReadyPayload = z.object({ ready: z.boolean() });
export const StartMatchPayload = z.object({});
export const JoinMatchPayload = z.object({ matchId: z.string() });
export const ActionPayload = z.object({ action: z.any() });
export const ChatPayload = z.object({ content: z.string().min(1) });
export const ResyncRequestPayload = z.object({});
export const PingPayload = z.object({ t: z.number() });

export type HelloPayloadT = z.infer<typeof HelloPayload>;
export type CreateLobbyPayloadT = z.infer<typeof CreateLobbyPayload>;
export type JoinLobbyPayloadT = z.infer<typeof JoinLobbyPayload>;
export type LeaveLobbyPayloadT = z.infer<typeof LeaveLobbyPayload>;
export type ReadyPayloadT = z.infer<typeof ReadyPayload>;
export type StartMatchPayloadT = z.infer<typeof StartMatchPayload>;
export type JoinMatchPayloadT = z.infer<typeof JoinMatchPayload>;
export type ActionPayloadT = z.infer<typeof ActionPayload>;
export type ChatPayloadT = z.infer<typeof ChatPayload>;
export type ResyncRequestPayloadT = z.infer<typeof ResyncRequestPayload>;
export type PingPayloadT = z.infer<typeof PingPayload>;

export type ClientEventMap = {
  hello: HelloPayloadT;
  createLobby: CreateLobbyPayloadT;
  joinLobby: JoinLobbyPayloadT;
  leaveLobby: LeaveLobbyPayloadT;
  ready: ReadyPayloadT;
  startMatch: StartMatchPayloadT;
  joinMatch: JoinMatchPayloadT;
  action: ActionPayloadT;
  chat: ChatPayloadT;
  resyncRequest: ResyncRequestPayloadT;
  ping: PingPayloadT;
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
  scope: z.enum(["lobby", "match"]),
});
export const ResyncSnapshotSchema = z.object({
  lobby: LobbyInfoSchema.optional(),
  match: MatchInfoSchema.optional(),
});
export type ResyncSnapshot = z.infer<typeof ResyncSnapshotSchema>;
export const ResyncResponsePayload = z.object({ snapshot: ResyncSnapshotSchema });
export const PongPayload = z.object({ t: z.number() });
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
};

export const Protocol = {
  // Client -> Server
  HelloPayload,
  CreateLobbyPayload,
  JoinLobbyPayload,
  LeaveLobbyPayload,
  ReadyPayload,
  StartMatchPayload,
  JoinMatchPayload,
  ActionPayload,
  ChatPayload,
  ResyncRequestPayload,
  PingPayload,
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
};
