import type {
  LobbyUpdatedPayloadT,
  MatchStartedPayloadT,
  ResyncResponsePayloadT,
  ServerChatPayloadT,
  StatePatchPayloadT,
  ErrorPayloadT,
  WelcomePayloadT,
} from "@/lib/net/protocol";

export type TransportEventMap = {
  welcome: WelcomePayloadT;
  statePatch: StatePatchPayloadT;
  chat: ServerChatPayloadT;
  matchStarted: MatchStartedPayloadT;
  resync: ResyncResponsePayloadT;
  lobbyUpdated: LobbyUpdatedPayloadT;
  error: ErrorPayloadT;
};

export type TransportEvent = keyof TransportEventMap;
export type TransportHandler<E extends TransportEvent> = (payload: TransportEventMap[E]) => void;

export interface GameTransport {
  connect(opts: { displayName: string }): Promise<void>;
  disconnect(): void;

  joinLobby(lobbyId?: string): Promise<{ lobbyId: string }>; // if omitted, auto-join/create
  joinMatch(matchId: string): Promise<void>;
  leaveLobby(): void;
  ready(ready: boolean): void;
  startMatch(): void;

  sendAction(action: unknown): void;
  sendChat(content: string): void;

  resync(): void;

  on<E extends TransportEvent>(event: E, handler: TransportHandler<E>): () => void;
}
