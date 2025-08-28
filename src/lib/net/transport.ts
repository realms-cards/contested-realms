import type {
  LobbyUpdatedPayloadT,
  MatchStartedPayloadT,
  ResyncResponsePayloadT,
  ServerChatPayloadT,
  StatePatchPayloadT,
  ErrorPayloadT,
  WelcomePayloadT,
  LobbiesUpdatedPayloadT,
  PlayerListPayloadT,
  LobbyInvitePayloadT,
  LobbyVisibility,
  ChatScope,
} from "@/lib/net/protocol";

export type TransportEventMap = {
  welcome: WelcomePayloadT;
  statePatch: StatePatchPayloadT;
  chat: ServerChatPayloadT;
  matchStarted: MatchStartedPayloadT;
  resync: ResyncResponsePayloadT;
  lobbyUpdated: LobbyUpdatedPayloadT;
  error: ErrorPayloadT;
  lobbiesUpdated: LobbiesUpdatedPayloadT;
  playerList: PlayerListPayloadT;
  lobbyInvite: LobbyInvitePayloadT;
};

export type TransportEvent = keyof TransportEventMap;
export type TransportHandler<E extends TransportEvent> = (payload: TransportEventMap[E]) => void;

export interface GameTransport {
  connect(opts: { displayName: string; playerId?: string }): Promise<void>;
  disconnect(): void;

  createLobby(options?: { visibility?: LobbyVisibility; maxPlayers?: number }): Promise<{ lobbyId: string }>;
  joinLobby(lobbyId?: string): Promise<{ lobbyId: string }>; // if omitted, auto-join/create
  joinMatch(matchId: string): Promise<void>;
  leaveMatch(): void;
  leaveLobby(): void;
  ready(ready: boolean): void;
  startMatch(): void;

  sendAction(action: unknown): void;
  // Explicit mulligan completion signal (per-player)
  mulliganDone(): void;
  sendChat(content: string, scope?: ChatScope): void;

  resync(): void;

  requestLobbies(): void;
  requestPlayers(): void;
  setLobbyVisibility(visibility: LobbyVisibility): void;
  inviteToLobby(targetPlayerId: string, lobbyId?: string): void;

  on<E extends TransportEvent>(event: E, handler: TransportHandler<E>): () => void;
}
